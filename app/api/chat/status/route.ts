import { NextRequest } from "next/server"

// Reports which server-side pieces of chat are configured, so Settings can
// show a live checklist instead of the user discovering gaps by failing.
//
// Deliberately returns booleans only — never the secrets themselves.

export async function GET(_request: NextRequest) {
  const oauthTokenSet = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN)
  const sandboxUrl = process.env.SANDBOX_CHAT_URL || ""
  const sandboxSecret = Boolean(process.env.SANDBOX_SHARED_SECRET)

  // Only probe the legacy bridge when it is actually the active backend —
  // otherwise every Settings open pays for a network round trip to a machine
  // the token has already made irrelevant.
  let bridgeReachable: boolean | null = null
  if (!oauthTokenSet && sandboxUrl && sandboxSecret) {
    try {
      const res = await fetch(`${sandboxUrl.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      bridgeReachable = res.ok
    } catch {
      bridgeReachable = false
    }
  }

  return Response.json({
    oauthTokenSet,
    // Which backend a subscription-mode message will actually take.
    subscriptionBackend: oauthTokenSet
      ? "in-function"
      : sandboxUrl && sandboxSecret
        ? "bridge"
        : "none",
    sandboxUrlSet: Boolean(sandboxUrl),
    sandboxSecretSet: sandboxSecret,
    bridgeReachable,
    serverApiKeySet: Boolean(process.env.ANTHROPIC_API_KEY),
    accessTokenRequired: Boolean(process.env.CHAT_ACCESS_TOKEN),
  })
}
