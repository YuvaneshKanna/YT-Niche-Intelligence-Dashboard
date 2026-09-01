import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk"

/**
 * Subscription chat, run inside the Vercel function itself.
 *
 * The Claude Agent SDK ships the Claude Code harness as plain JavaScript — no
 * native binary, no install-time download — so it runs in a serverless function
 * the same way it runs on a laptop. It reads CLAUDE_CODE_OAUTH_TOKEN, which
 * means answers are billed against the Claude subscription rather than an
 * Anthropic API key.
 *
 * This replaces the self-hosted bridge in sandbox/: no second process to keep
 * alive, no tunnel whose URL changes on every restart, no shared secret. The
 * only thing to configure is the token.
 *
 * Required env:
 *   CLAUDE_CODE_OAUTH_TOKEN   from `claude setup-token`
 * Optional:
 *   CLAUDE_TIMEOUT_MS         default 120000
 */

const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 120_000)

// Only /tmp is writable in a Vercel function, and it is also the only place the
// CLI ever needs to write: session transcripts and its own config live here.
// os.tmpdir() keeps `next dev` on Windows working without a special case.
const RUNTIME_DIR = path.join(os.tmpdir(), "niche-chat")
const CONFIG_DIR = path.join(RUNTIME_DIR, "claude-config")

/** Sessions we have seen, so follow-ups can resume rather than resend context. */
const sessions = new Map<string, { sessionId: string; lastUsed: number }>()
const SESSION_TTL_MS = 60 * 60 * 1000

function pruneSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, s] of sessions) if (s.lastUsed < cutoff) sessions.delete(id)
}

export function subscriptionChatReady(): boolean {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN)
}

export interface SubscriptionChatArgs {
  question: string
  context: string
  /** Persona + ground rules for this page's data. Caller picks — see app/api/chat/route.ts. */
  systemRules: string
  chatId: string
  model?: string
  effort?: string
  /** Aborted when the browser disconnects, so we stop paying for a dead request. */
  signal?: AbortSignal
}

/**
 * Runs one turn and streams it back as Server-Sent Events, using the same event
 * shape the sandbox bridge emitted so the chat panel needs no changes.
 */
export function streamFromSubscription(args: SubscriptionChatArgs): Response {
  const { question, context, systemRules, chatId, model, effort, signal } = args

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let settled = false
      const send = (o: unknown) => {
        if (settled) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`))
      }
      const finish = (payload: unknown) => {
        if (settled) return
        send(payload)
        settled = true
        controller.close()
      }

      pruneSessions()

      let lastRateLimit: unknown = null
      let sawText = false

      /**
       * One attempt. Returns false when a resume was rejected before any text
       * reached the browser, which is recoverable — see the retry below.
       */
      const attempt = async (resumeId: string | null): Promise<boolean> => {
        // The first turn carries the metrics; a resumed turn already has them in
        // context, so resending ~100KB every message would be pure waste.
        const prompt = resumeId
          ? `QUESTION: ${question}`
          : `DATA:\n${context}\n\nQUESTION: ${question}`

        const abort = new AbortController()
        const onAbort = () => abort.abort()
        signal?.addEventListener("abort", onAbort, { once: true })
        const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)

        const options: Options = {
          // Analysis over text we already supply — no tools are needed, and
          // dontAsk denies anything not explicitly allowed, so an unattended run
          // cannot be talked into touching the filesystem or the network.
          allowedTools: [],
          permissionMode: "dontAsk",
          // Nothing on the deployed filesystem is ours to read: no CLAUDE.md, no
          // project settings, no user settings. Start from a clean slate.
          settingSources: [],
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: systemRules,
            // Git status, directory listings and the like describe the Vercel
            // build image, not anything the analyst should reason about.
            excludeDynamicSections: true,
          },
          includePartialMessages: true,
          cwd: RUNTIME_DIR,
          executable: "node",
          abortController: abort,
          // A serverless function inherits the deployment's whole environment.
          // Hand the child only what it needs, so an unrelated variable (a
          // proxy base URL, a stray API key) cannot silently redirect billing
          // away from the subscription token.
          env: {
            PATH: process.env.PATH ?? "",
            HOME: RUNTIME_DIR,
            CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "",
            CLAUDE_CONFIG_DIR: CONFIG_DIR,
          },
        }
        if (resumeId) options.resume = resumeId
        if (model) options.model = model
        if (effort) options.effort = effort as NonNullable<Options["effort"]>

        try {
          for await (const message of query({ prompt, options }) as AsyncIterable<SDKMessage>) {
            if (message.type === "system" && message.subtype === "init") {
              sessions.set(chatId, { sessionId: message.session_id, lastUsed: Date.now() })
            }

            if (message.type === "stream_event") {
              const delta = message.event as { delta?: { type?: string; text?: string } }
              if (delta.delta?.type === "text_delta" && delta.delta.text) {
                sawText = true
                send({ type: "text", text: delta.delta.text })
              }
            }

            if (message.type === "system" && message.subtype === "api_retry") {
              send({ type: "status", text: "retrying…" })
            }

            // Plan usage against the Claude subscription's rate limits — the
            // same numbers `/usage` shows interactively, forwarded live so the
            // chat panel can show its meter.
            if (message.type === "rate_limit_event") {
              lastRateLimit = message.rate_limit_info
              send({ type: "usage", rateLimit: message.rate_limit_info })
            }

            if (message.type === "result") {
              sessions.set(chatId, { sessionId: message.session_id, lastUsed: Date.now() })

              if (message.is_error) {
                const detail =
                  message.subtype === "success" ? message.result : `run failed (${message.subtype})`
                if (resumeId && !sawText) return false
                finish({ type: "error", error: authHint(String(detail)) })
                return true
              }

              finish({
                type: "done",
                chatId,
                sessionId: message.session_id,
                costUsd: message.total_cost_usd,
                rateLimit: lastRateLimit,
              })
              return true
            }
          }

          // The stream ended without a result — treat it the same as a failure
          // rather than leaving the browser waiting on a reply that never comes.
          if (resumeId && !sawText) return false
          finish({ type: "error", error: "Claude ended the turn without a reply." })
          return true
        } catch (err: unknown) {
          if (abort.signal.aborted && signal?.aborted) {
            // The browser hung up; nothing left to report to.
            settled = true
            controller.close()
            return true
          }
          const raw = err instanceof Error ? err.message : "chat failed"
          if (resumeId && !sawText) return false
          finish({
            type: "error",
            error: abort.signal.aborted
              ? `Timed out after ${TIMEOUT_MS}ms`
              : authHint(raw),
          })
          return true
        } finally {
          clearTimeout(timer)
          signal?.removeEventListener("abort", onAbort)
        }
      }

      try {
        mkdirSync(CONFIG_DIR, { recursive: true })
      } catch {
        // The SDK creates what it needs on demand; a failure here is not fatal.
      }

      const known = sessions.get(chatId)
      const resumed = await attempt(known?.sessionId ?? null)
      if (!resumed) {
        // Transcripts live in /tmp, which belongs to one function instance. A
        // follow-up routed to a different instance finds no session to resume,
        // so fall back to a fresh turn carrying the metrics again. The user
        // loses the earlier conversation, not the answer.
        sessions.delete(chatId)
        await attempt(null)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

/** A rejected token is the one failure worth naming precisely — it has a fix. */
function authHint(message: string): string {
  return /oauth|401|authenticat/i.test(message)
    ? `${message} — regenerate CLAUDE_CODE_OAUTH_TOKEN with \`claude setup-token\` and update it in Vercel.`
    : message
}
