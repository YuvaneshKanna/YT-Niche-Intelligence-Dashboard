import { NextRequest } from "next/server"

// Reports which server-side pieces of chat are configured, so Settings can
// show a live checklist instead of the user discovering gaps by failing.
//
// Deliberately returns booleans only — never the secrets themselves.

export async function GET(_request: NextRequest) {
  const rawToken = process.env.CLAUDE_CODE_OAUTH_TOKEN ?? ""
  const oauthTokenSet = Boolean(rawToken)

  // A stored token that Anthropic rejects gives no clue whether the paste was
  // corrupted or the token itself is dead — Vercel marks it sensitive, so the
  // value cannot be read back. Report its shape instead: never the value, and
  // nothing an attacker could reconstruct it from. Remove once chat works.
  const tokenShape = oauthTokenSet
    ? {
        length: rawToken.length,
        wellFormedPrefix: rawToken.startsWith("sk-ant-oat01-"),
        hasQuotes: /["']/.test(rawToken),
        hasWhitespace: /\s/.test(rawToken),
      }
    : null

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
    tokenShape,
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
