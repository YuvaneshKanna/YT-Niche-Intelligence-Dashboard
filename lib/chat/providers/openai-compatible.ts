import type { ChatProvider, OnceArgs, ProviderId, StreamArgs, Unavailable } from "./types"

/**
 * Any backend that speaks the OpenAI chat-completions dialect.
 *
 * This is the reason the bridge was built to that dialect rather than a private
 * one. ChatGPT (through Codex) and the OmniRoute gateway are two configurations
 * of this single file, and so is the next backend after them — a local model, a
 * different gateway, a hosted provider. Adding one is a few lines in the router,
 * not a new client.
 *
 * The grounding data is sent on every turn. The bridge, not this file, decides
 * whether to use it: when it can resume an existing conversation it takes only
 * the newest question and ignores the rest. That keeps session state on the one
 * machine that can actually hold it, and leaves this side stateless, which
 * matters because consecutive requests from one person do not necessarily reach
 * the same serverless instance.
 */

export interface OpenAiCompatibleConfig {
  id: ProviderId
  label: string
  /** Root of the service, without a trailing slash or the /v1 suffix. */
  baseUrl: string
  apiKey: string
  /** Model name in the far side's own vocabulary. */
  model: string
  /** What to tell the user when it is not configured. */
  unavailable: Unavailable
}

interface OpenAiChunk {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
  error?: { message?: string }
}

interface OpenAiCompletion {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

function messagesFor(systemRules: string, body: string) {
  return [
    { role: "system", content: systemRules },
    { role: "user", content: body },
  ]
}

/** A rejected token is the one failure worth naming precisely — it has a fix. */
function explain(label: string, status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return `${label} rejected the dashboard's credentials. Check that BRIDGE_TOKEN in Vercel matches the value in the bridge's .env file.`
  }
  if (status === 502 || status === 503 || status === 504) {
    return `${label} could not answer (${status}). ${detail || "The service may be restarting."}`
  }
  return detail || `${label} returned ${status}.`
}

export function createOpenAiCompatible(config: OpenAiCompatibleConfig): ChatProvider {
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`
  const ready = Boolean(config.baseUrl && config.apiKey)

  async function post(payload: unknown, signal?: AbortSignal, chatId?: string) {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(chatId ? { "x-chat-id": chatId } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    })
  }

  return {
    id: config.id,
    label: config.label,
    ready: () => ready,
    unavailable: () => config.unavailable,

    async stream(args: StreamArgs): Promise<Response> {
      const upstream = await post(
        {
          model: config.model,
          messages: messagesFor(args.systemRules, `DATA:\n${args.context}\n\nQUESTION: ${args.question}`),
          stream: true,
          stream_options: { include_usage: true },
          ...(args.effort ? { reasoning_effort: args.effort } : {}),
        },
        args.signal,
        args.chatId
      ).catch((err: unknown) => err instanceof Error ? err : new Error("network error"))

      if (upstream instanceof Error) {
        return Response.json(
          {
            error: `Could not reach ${config.label} at ${config.baseUrl}: ${upstream.message}`,
            code: "BRIDGE_UNREACHABLE",
          },
          { status: 502 }
        )
      }

      if (!upstream.ok || !upstream.body) {
        const raw = await upstream.text().catch(() => "")
        let detail = raw.slice(0, 400)
        try {
          detail = (JSON.parse(raw) as OpenAiChunk).error?.message ?? detail
        } catch {
          // Not JSON — a proxy error page, most likely. The raw text is the best clue.
        }
        return Response.json(
          { error: explain(config.label, upstream.status, detail), code: "BRIDGE_ERROR" },
          { status: 502 }
        )
      }

      // Translate the OpenAI event stream into the one the chat panel already
      // understands, so no client-side code has to know a second format.
      const source = upstream.body
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          const decoder = new TextDecoder()
          const send = (o: unknown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`))

          let buffer = ""
          let sawError = false
          let usage: OpenAiChunk["usage"] = undefined

          try {
            for await (const bytes of source as unknown as AsyncIterable<Uint8Array>) {
              buffer += decoder.decode(bytes, { stream: true })

              // Frames are separated by a blank line; whatever follows the last
              // separator is incomplete and waits for the next read.
              const frames = buffer.split("\n\n")
              buffer = frames.pop() ?? ""

              for (const frame of frames) {
                for (const line of frame.split("\n")) {
                  if (!line.startsWith("data:")) continue
                  const payload = line.slice(5).trim()
                  if (!payload || payload === "[DONE]") continue

                  let event: OpenAiChunk
                  try {
                    event = JSON.parse(payload) as OpenAiChunk
                  } catch {
                    continue
                  }

                  if (event.error?.message) {
                    sawError = true
                    send({ type: "error", error: event.error.message })
                    continue
                  }

                  if (event.usage) usage = event.usage

                  const delta = event.choices?.[0]?.delta
                  if (delta?.content) send({ type: "text", text: delta.content })
                  // Some backends answer in one piece and can only report that
                  // they are thinking. Shown as a status line, not as an answer.
                  else if (delta?.reasoning_content) send({ type: "status", text: "thinking…" })
                }
              }
            }

            if (!sawError) {
              send({
                type: "done",
                usage: usage
                  ? {
                      input: usage.prompt_tokens ?? 0,
                      output: usage.completion_tokens ?? 0,
                      cacheRead: usage.prompt_tokens_details?.cached_tokens ?? 0,
                    }
                  : undefined,
              })
            }
          } catch (err: unknown) {
            if (!args.signal?.aborted) {
              send({
                type: "error",
                error: err instanceof Error ? err.message : `${config.label} stopped responding.`,
              })
            }
          } finally {
            controller.close()
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
    },

    async once(args: OnceArgs): Promise<string> {
      const upstream = await post(
        {
          model: config.model,
          messages: messagesFor(args.systemRules, args.prompt),
          stream: false,
        },
        args.signal
      )

      const raw = await upstream.text()
      let parsed: OpenAiCompletion
      try {
        parsed = JSON.parse(raw) as OpenAiCompletion
      } catch {
        throw new Error(explain(config.label, upstream.status, raw.slice(0, 300)))
      }

      if (!upstream.ok) {
        throw new Error(explain(config.label, upstream.status, parsed.error?.message ?? ""))
      }

      const text = parsed.choices?.[0]?.message?.content ?? ""
      if (!text.trim()) throw new Error(`${config.label} returned an empty answer.`)
      return text
    },
  }
}
