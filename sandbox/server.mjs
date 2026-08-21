#!/usr/bin/env node
/**
 * Claude chat bridge — runs INSIDE your sandbox, never on Vercel.
 *
 * Spawns `claude -p` (which reads CLAUDE_CODE_OAUTH_TOKEN, so it runs on your
 * Claude subscription rather than an API key) and streams the reply back as
 * Server-Sent Events. The dashboard's /api/chat route proxies to this.
 *
 * The OAuth token never leaves this container: the browser talks to Vercel,
 * Vercel talks to this service with a shared secret, and only this service
 * sees the token.
 *
 * Required env:
 *   CLAUDE_CODE_OAUTH_TOKEN   from `claude setup-token` on your machine
 *   SANDBOX_SHARED_SECRET     must match the same var on Vercel
 * Optional:
 *   PORT                      default 8787
 *   CLAUDE_BIN                default "claude"
 *   CLAUDE_TIMEOUT_MS         default 120000
 */

import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"

const PORT = Number(process.env.PORT || 8787)
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude"
const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 120_000)
const SECRET = process.env.SANDBOX_SHARED_SECRET
const MAX_BODY_BYTES = 2 * 1024 * 1024

if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.error(
    "CLAUDE_CODE_OAUTH_TOKEN is not set.\n" +
      "Run `claude setup-token` on a machine where you are logged in, then pass\n" +
      "the token into this container."
  )
  process.exit(1)
}
if (!SECRET) {
  console.error("SANDBOX_SHARED_SECRET is not set. Refusing to start an unauthenticated bridge.")
  process.exit(1)
}

const SYSTEM_RULES = `You are a YouTube strategy analyst embedded in the user's own niche-tracking dashboard.

The user's message contains a DATA block with their live metrics followed by their QUESTION. Answer only from that data.

Rules:
- Cite the actual numbers. Never invent a metric. If the data does not support an answer, say so plainly.
- Keep Shorts and long-form separate — different baselines, different behaviour. Never merge them into one figure.
- Check dominance before calling something a trend. One video or channel carrying a group is a fact to state, not a trend.
- HHI: above ~2500 one channel dominates and entry is hard; below ~1500 the niche is fragmented and open.
- The Shorts/long-form split thins beyond 7 days because the pipeline deletes HISTORICAL video rows after a week. Total views are unaffected. Say so when a claim rests on older split data.
- "Overall" is every channel with no Niche_Group set. It is a baseline, not a real cohort.
- Score components marked "estimate" are authored assumptions, not measurements. Never present them as measured.
- Be concise. Lead with the answer, then the numbers. No preamble.`

/** Sessions we have seen, so follow-ups can resume rather than resend context. */
const sessions = new Map() // chatId -> { sessionId, lastUsed }
const SESSION_TTL_MS = 60 * 60 * 1000

function pruneSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, s] of sessions) if (s.lastUsed < cutoff) sessions.delete(id)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

/** Constant-time-ish comparison so the secret is not learnable by timing. */
function secretMatches(provided) {
  if (typeof provided !== "string" || provided.length !== SECRET.length) return false
  let diff = 0
  for (let i = 0; i < SECRET.length; i++) diff |= provided.charCodeAt(i) ^ SECRET.charCodeAt(i)
  return diff === 0
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true, sessions: sessions.size }))
    return
  }

  if (req.method !== "POST" || !req.url.startsWith("/chat")) {
    res.writeHead(404).end("not found")
    return
  }

  if (!secretMatches(req.headers["x-sandbox-secret"])) {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "unauthorized" }))
    return
  }

  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: err.message || "invalid body" }))
    return
  }

  const question = String(body.question || "").trim()
  const context = String(body.context || "")
  const chatId = String(body.chatId || randomUUID())

  if (!question) {
    res.writeHead(400, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "question is required" }))
    return
  }

  pruneSessions()
  const known = sessions.get(chatId)

  // First turn carries the data; follow-ups resume the session, which already
  // has it in context. Resending 100KB of metrics every turn would be waste.
  const prompt = known
    ? `QUESTION: ${question}`
    : `DATA:\n${context}\n\nQUESTION: ${question}`

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    // No tools are needed — this is analysis over text we already supply.
    // dontAsk denies anything not explicitly allowed, so an unattended run
    // cannot be talked into touching the filesystem or the network.
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    "",
    "--append-system-prompt",
    SYSTEM_RULES,
  ]
  if (known) args.push("--resume", known.sessionId)

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  })
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  // NOTE: --bare is deliberately NOT passed. Bare mode never reads OAuth
  // credentials and would force an API key, defeating the whole point.
  const child = spawn(CLAUDE_BIN, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })

  let settled = false
  const finish = (payload) => {
    if (settled) return
    settled = true
    send(payload)
    res.end()
  }

  const timer = setTimeout(() => {
    child.kill("SIGINT")
    finish({ type: "error", error: `Timed out after ${TIMEOUT_MS}ms` })
  }, TIMEOUT_MS)

  let stdoutBuf = ""
  let stderrBuf = ""

  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString("utf8")
    const lines = stdoutBuf.split("\n")
    stdoutBuf = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      let evt
      try {
        evt = JSON.parse(line)
      } catch {
        continue
      }

      if (evt.type === "system" && evt.subtype === "init" && evt.session_id) {
        sessions.set(chatId, { sessionId: evt.session_id, lastUsed: Date.now() })
      }

      if (evt.type === "stream_event" && evt.event?.delta?.type === "text_delta") {
        send({ type: "text", text: evt.event.delta.text })
      }

      if (evt.type === "system" && evt.subtype === "api_retry") {
        send({ type: "status", text: `retrying (${evt.error})…` })
      }

      if (evt.type === "result") {
        if (evt.session_id) {
          sessions.set(chatId, { sessionId: evt.session_id, lastUsed: Date.now() })
        }
        if (evt.is_error) {
          finish({ type: "error", error: String(evt.result || "run failed") })
          return
        }
        finish({
          type: "done",
          chatId,
          sessionId: evt.session_id,
          costUsd: evt.total_cost_usd,
        })
        return
      }
    }
  })

  child.stderr.on("data", (c) => {
    stderrBuf += c.toString("utf8")
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000)
  })

  child.on("error", (err) => {
    clearTimeout(timer)
    finish({ type: "error", error: `could not start ${CLAUDE_BIN}: ${err.message}` })
  })

  child.on("close", (code) => {
    clearTimeout(timer)
    if (settled) return
    const hint = /oauth|token|authent/i.test(stderrBuf)
      ? " (check CLAUDE_CODE_OAUTH_TOKEN — regenerate with `claude setup-token`)"
      : ""
    finish({
      type: "error",
      error: `claude exited with code ${code}${hint}${stderrBuf ? `: ${stderrBuf.trim()}` : ""}`,
    })
  })

  req.on("close", () => {
    if (!settled) {
      clearTimeout(timer)
      child.kill("SIGINT")
      settled = true
    }
  })
})

server.listen(PORT, () => {
  console.log(`claude chat bridge listening on :${PORT}`)
})
