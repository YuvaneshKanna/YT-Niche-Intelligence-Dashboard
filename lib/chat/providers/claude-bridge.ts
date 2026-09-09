import type { ChatProvider, ProviderInit, StreamArgs, Unavailable } from "./types"

/**
 * The legacy self-hosted bridge in sandbox/.
 *
 * It predates the Agent SDK running in-function and stays available for anyone
 * still on it — but only as the second link in the subscription chain, so a
 * leftover SANDBOX_CHAT_URL cannot silently keep routing chat at a machine the
 * user thought they had retired.
 *
 * The bridge owns its own system rules, so args.systemRules is not forwarded.
 * There is no `once` surface: nothing on the bridge ever implemented it.
 */

const NOT_CONFIGURED: Unavailable = {
  error:
    "The self-hosted bridge is not configured. Set SANDBOX_CHAT_URL and SANDBOX_SHARED_SECRET, " +
    "or use subscription mode with CLAUDE_CODE_OAUTH_TOKEN instead.",
  code: "NO_SANDBOX",
  status: 503,
}

const json = (body: unknown, status: number) =>
  Response.json(body as Record<string, unknown>, { status })

export function createClaudeBridge(init: ProviderInit): ChatProvider {
  const url = init.bridgeUrl ?? ""
  const secret = init.bridgeSecret ?? ""

  return {
    id: "claude-bridge",
    label: "Self-hosted bridge",
    ready: (surface) => surface === "stream" && Boolean(url && secret),
    unavailable: () => NOT_CONFIGURED,

    async stream(args: StreamArgs) {
      let upstream: Response
      try {
        upstream = await fetch(`${url.replace(/\/$/, "")}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sandbox-secret": secret },
          body: JSON.stringify({
            question: args.question,
            context: args.context,
            chatId: args.chatId,
            model: args.model,
            effort: args.effort,
          }),
        })
      } catch (err: unknown) {
        return json(
          {
            error: `Could not reach the sandbox bridge at ${url}: ${
              err instanceof Error ? err.message : "network error"
            }`,
            code: "SANDBOX_UNREACHABLE",
          },
          502
        )
      }

      if (!upstream.ok || !upstream.body) {
        const raw = await upstream.text().catch(() => "")

        // A Cloudflare Quick Tunnel returns its own HTML error page (not the
        // bridge's) when the tunnel is up but nothing is listening on the other
        // end — dumping that page verbatim just buries the one useful fact.
        // Recognise it and say what actually broke instead.
        const isTunnelErrorPage = raw.trimStart().startsWith("<") && /cloudflare|cf-error/i.test(raw)
        const detail = isTunnelErrorPage
          ? "The Cloudflare tunnel answered, but nothing is listening behind it — " +
            "the bridge (`node server.mjs`) on your machine isn't running right now. " +
            "Start it again and keep that terminal window open; the tunnel alone " +
            "being up is not enough."
          : raw.slice(0, 500)

        return json(
          {
            error: `Sandbox bridge returned ${upstream.status}. ${detail}`.trim(),
            code: "SANDBOX_ERROR",
          },
          502
        )
      }

      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      })
    },
  }
}
