import { NextRequest } from "next/server"

// Reports which server-side pieces of chat are configured, so Settings can
// show a live checklist instead of the user discovering gaps by failing.
//
// Deliberately returns booleans only — never the secrets themselves.

export async function GET(_request: NextRequest) {
  const sandboxUrl = process.env.SANDBOX_CHAT_URL || ""
  const sandboxSecret = Boolean(process.env.SANDBOX_SHARED_SECRET)

  let bridgeReachable: boolean | null = null
  if (sandboxUrl && sandboxSecret) {
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
    sandboxUrlSet: Boolean(sandboxUrl),
    sandboxSecretSet: sandboxSecret,
    bridgeReachable,
    serverApiKeySet: Boolean(process.env.ANTHROPIC_API_KEY),
    accessTokenRequired: Boolean(process.env.CHAT_ACCESS_TOKEN),
  })
}
