import { NextRequest } from "next/server"

// Reports which server-side pieces of chat are configured, so Settings can
// show a live checklist instead of the user discovering gaps by failing.
//
// Deliberately returns booleans only — never the secrets themselves.

/** One backend on the bridge, reduced to what Settings needs to draw a row. */
interface BackendStatus {
  id: string
  label: string
  ready: boolean
  detail: string
  /** Days since the stored login last refreshed, when the backend tracks one. */
  refreshAgeDays?: number
}

/**
 * Asks the bridge how its backends are doing.
 *
 * Deliberately a whitelist rather than a passthrough: the bridge reports
 * filesystem paths and other host detail that is useful in a server log and has
 * no business on a page anyone with the URL can open.
 */
async function probeAiBridge() {
  const url = (process.env.BRIDGE_URL || "").replace(/\/$/, "")
  const token = process.env.BRIDGE_TOKEN || ""
  const configured = Boolean(url && token)

  if (!configured) {
    return { configured: false, reachable: null, backends: [] as BackendStatus[], error: null }
  }

  try {
    const res = await fetch(`${url}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    })

    if (!res.ok) {
      return {
        configured: true,
        reachable: false,
        backends: [] as BackendStatus[],
        error:
          res.status === 401
            ? "The bridge rejected the token. BRIDGE_TOKEN here and in the bridge's .env must match."
            : `The bridge answered ${res.status}.`,
      }
    }

    const body = (await res.json()) as {
      backends?: Record<string, { label?: string; ready?: boolean; detail?: string; refreshAgeDays?: number | null }>
    }

    const backends: BackendStatus[] = Object.entries(body.backends ?? {}).map(([id, b]) => ({
      id,
      label: b.label ?? id,
      ready: Boolean(b.ready),
      detail: b.detail ?? "",
      ...(typeof b.refreshAgeDays === "number" ? { refreshAgeDays: b.refreshAgeDays } : {}),
    }))

    return { configured: true, reachable: true, backends, error: null }
  } catch (err: unknown) {
    const timedOut = err instanceof Error && err.name === "TimeoutError"
    return {
      configured: true,
      reachable: false,
      backends: [] as BackendStatus[],
      error: timedOut
        ? "The bridge did not answer within 6 seconds. It may be starting up or stopped."
        : "Could not reach the bridge. Check that it is running and that BRIDGE_URL is correct.",
    }
  }
}

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
    aiBridge: await probeAiBridge(),
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
