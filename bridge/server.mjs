import http from "node:http"
import { createBearerAuth } from "./lib/auth.mjs"
import { backends, healthReport, resolveModel } from "./lib/backends/registry.mjs"
import {
  chunk,
  completion,
  completionId,
  openStream,
  readJson,
  sendError,
  sendJson,
} from "./lib/http.mjs"

/**
 * An OpenAI-compatible front door for backends that cannot run in a serverless
 * function.
 *
 * The dashboard runs on Vercel, and Claude answers from inside the function
 * itself because its SDK is plain JavaScript. The other two backends cannot:
 * Codex is a native binary whose credentials rotate on disk, and OmniRoute is a
 * long-lived local gateway. Both need a machine. This is that machine's API.
 *
 * It speaks `POST /v1/chat/completions` rather than anything bespoke, so that
 * the dashboard needs exactly one client for every backend behind here, now and
 * later. Adding a model becomes configuration instead of code.
 *
 * Environment:
 *   BRIDGE_TOKEN       required, the shared bearer token (see lib/auth.mjs)
 *   PORT               default 8787
 *   DEFAULT_BACKEND    default "codex"
 *   TURN_TIMEOUT_MS    default 300000
 * Backend variables are documented in lib/backends/*.mjs.
 */

const PORT = Number(process.env.PORT || 8787)
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS || 300_000)

const authorize = createBearerAuth(process.env.BRIDGE_TOKEN)

/** Logged without prompts or answers: what was asked of the service, never its contents. */
function log(fields) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`)
}

function normaliseMessages(body) {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    const err = new Error("`messages` must be a non-empty array.")
    err.statusCode = 400
    throw err
  }
  return body.messages
}

async function handleChatCompletions(req, res, body) {
  const messages = normaliseMessages(body)
  const { backend, model, name } = resolveModel(body.model)

  if (!backend) {
    return sendError(res, 400, `Unknown backend in model "${body.model}".`, "unknown_backend")
  }

  const wantsStream = body.stream !== false
  const id = completionId()
  const started = Date.now()

  // Two reasons to give up on a turn: the caller hung up, or it ran too long.
  // Either way the backend should stop working and stop spending.
  const abort = new AbortController()
  const onClose = () => abort.abort()
  req.on("close", onClose)
  const timer = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS)

  const finishLog = (outcome, extra = {}) =>
    log({ event: "turn", backend: backend.id, model: name, outcome, ms: Date.now() - started, ...extra })

  try {
    if (!wantsStream) {
      const result = await backend.run({
        model,
        messages,
        chatId: req.headers["x-chat-id"] || null,
        reasoningEffort: body.reasoning_effort,
        signal: abort.signal,
      })
      finishLog("ok", { streamed: false })
      return sendJson(res, 200, completion(id, name, result.content, result.usage, result.finishReason))
    }

    const stream = openStream(res)
    stream.send(chunk(id, name, { role: "assistant", content: "" }))

    const result = await backend.run({
      model,
      messages,
      chatId: req.headers["x-chat-id"] || null,
      reasoningEffort: body.reasoning_effort,
      signal: abort.signal,
      onDelta: (text) => stream.send(chunk(id, name, { content: text })),
      // Not part of the OpenAI schema, but the de-facto field for it, and the
      // only progress a backend that answers in one piece can offer. A client
      // that does not know the field ignores it.
      onReasoning: (text) => stream.send(chunk(id, name, { reasoning_content: text })),
    })

    const final = chunk(id, name, {}, result.finishReason ?? "stop")
    if (result.usage) final.usage = result.usage
    stream.send(final)
    stream.done()
    finishLog("ok", { streamed: true })
  } catch (err) {
    const aborted = abort.signal.aborted
    const status = err.statusCode ?? (aborted ? 504 : 502)
    const message = aborted
      ? req.destroyed
        ? "The caller disconnected."
        : `The turn exceeded ${TURN_TIMEOUT_MS}ms.`
      : err.message || "The turn failed."

    finishLog("error", { status, message })

    if (res.headersSent) {
      // The stream is already open, so the failure has to travel inside it. A
      // caller mid-answer gets a reason rather than a truncated response.
      res.write(`data: ${JSON.stringify({ error: { message, type: "bridge_error" } })}\n\n`)
      res.write("data: [DONE]\n\n")
      res.end()
    } else {
      sendError(res, status, message)
    }
  } finally {
    clearTimeout(timer)
    req.off("close", onClose)
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  const route = `${req.method} ${url.pathname}`

  try {
    // Unauthenticated on purpose, and says nothing: this is what a container
    // health check and a load balancer poll, neither of which holds a token.
    if (route === "GET /livez") return sendJson(res, 200, { ok: true })

    const auth = authorize(req)
    if (!auth.ok) {
      log({ event: "denied", route, reason: auth.reason })
      return sendError(res, 401, auth.reason, "unauthorized")
    }

    if (route === "GET /health") {
      return sendJson(res, 200, { ok: true, backends: await healthReport() })
    }

    if (route === "GET /v1/models") {
      return sendJson(res, 200, {
        object: "list",
        data: [...backends.values()].map((b) => ({
          id: b.id,
          object: "model",
          owned_by: "ai-bridge",
        })),
      })
    }

    if (route === "POST /v1/chat/completions") {
      const body = await readJson(req)
      return await handleChatCompletions(req, res, body)
    }

    return sendError(res, 404, `No route for ${route}.`, "not_found")
  } catch (err) {
    log({ event: "unhandled", route, message: err.message })
    if (!res.headersSent) sendError(res, err.statusCode ?? 500, err.message || "Internal error.")
    else res.end()
  }
})

server.headersTimeout = TURN_TIMEOUT_MS + 30_000
server.requestTimeout = TURN_TIMEOUT_MS + 30_000

server.listen(PORT, () => {
  log({ event: "listening", port: PORT, backends: [...backends.keys()] })
})

// Docker sends SIGTERM on stop. Finish what is in flight rather than cutting
// someone's answer off mid-sentence.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    log({ event: "shutdown", signal })
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 10_000).unref()
  })
}
