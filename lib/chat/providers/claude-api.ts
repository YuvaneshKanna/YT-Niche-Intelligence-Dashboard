import Anthropic from "@anthropic-ai/sdk"
import type { ChatProvider, OnceArgs, ProviderInit, StreamArgs, Unavailable } from "./types"

/**
 * Claude on an API key — the caller's own, or the server's fallback.
 *
 * Unlike the subscription path this is stateless: there is no session to
 * resume, so the rules and the metrics are resent every turn and held at the
 * cached rate by a prompt-cache breakpoint.
 */

const NO_KEY: Unavailable = {
  error: "No Anthropic API key. Add one in Settings, or switch to subscription mode.",
  code: "NO_KEY",
  status: 503,
}

/** Streams a reply from the Anthropic API using a caller-supplied key. */
function streamFromApi(client: Anthropic, model: string, args: StreamArgs): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (o: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`))

      try {
        // The rules and metrics are stable across turns, so they sit before the
        // cache breakpoint and are billed at the cached rate after turn one.
        const claude = client.messages.stream({
          model,
          max_tokens: 8000,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [
            { type: "text", text: args.systemRules },
            { type: "text", text: args.context, cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: args.question }],
        })

        claude.on("text", (delta) => send({ type: "text", text: delta }))

        const final = await claude.finalMessage()
        if (final.stop_reason === "refusal") {
          send({ type: "error", error: "The model declined to answer this request." })
        }
        send({
          type: "done",
          usage: {
            input: final.usage.input_tokens,
            output: final.usage.output_tokens,
            cacheRead: final.usage.cache_read_input_tokens ?? 0,
          },
        })
      } catch (err: unknown) {
        let message = err instanceof Error ? err.message : "Chat failed"
        if (err instanceof Anthropic.AuthenticationError) {
          message = "That API key was rejected. Check it in Settings."
        } else if (err instanceof Anthropic.RateLimitError) {
          message = "Rate limited — try again shortly."
        }
        send({ type: "error", error: message })
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
}

async function runApiOnce(client: Anthropic, model: string, args: OnceArgs): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: args.systemRules,
    messages: [{ role: "user", content: args.prompt }],
    // args.signal is deliberately not forwarded. The only caller caches the
    // answer, so hanging up the browser mid-run would throw away a turn that
    // has already been paid for.
  })
  return response.content.map((b) => (b.type === "text" ? b.text : "")).join("")
}

export function createClaudeApi(init: ProviderInit): ChatProvider {
  // Constructed lazily: the SDK reads ANTHROPIC_API_KEY from the ambient
  // environment when handed an empty one, which would quietly bill a key the
  // caller never chose.
  const client = () => new Anthropic({ apiKey: init.apiKey })

  return {
    id: "claude-api",
    label: "Anthropic API key",
    ready: () => Boolean(init.apiKey),
    unavailable: () => NO_KEY,

    // The model comes from Settings, not from the turn: an API key is the
    // caller's own money, so the client picks the model once and explicitly.
    async stream(args: StreamArgs) {
      return streamFromApi(client(), init.apiModel, args)
    },
    once(args: OnceArgs) {
      return runApiOnce(client(), init.apiModel, args)
    },
  }
}
