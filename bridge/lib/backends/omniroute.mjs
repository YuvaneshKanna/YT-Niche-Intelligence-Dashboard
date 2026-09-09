/**
 * OmniRoute, the local gateway that fans out to whatever API keys are configured
 * in it.
 *
 * This is the tier that does not run out. The subscriptions above it are capped
 * by a plan and go quiet when the cap is reached; this one is billed per token
 * against keys, so it can answer when nothing else will.
 *
 * OmniRoute already speaks the OpenAI dialect, so almost nothing happens here —
 * the request is forwarded and the response is passed back. That is the point of
 * the bridge speaking that dialect too: a backend that already talks it needs no
 * adapter, and neither will the next one.
 *
 * Required on the host:
 *   OMNIROUTE_URL      default http://omniroute:20128
 *   OMNIROUTE_API_KEY  optional, if the gateway is configured to require one
 */

const BASE_URL = (process.env.OMNIROUTE_URL || "http://omniroute:20128").replace(/\/$/, "")
const API_KEY = process.env.OMNIROUTE_API_KEY || ""
const HEALTH_TTL_MS = 30_000

let healthCache = null

function headers() {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
  }
}

export const omnirouteBackend = {
  id: "omniroute",
  label: "OmniRoute gateway",

  async health() {
    if (healthCache && healthCache.expiresAt > Date.now()) return healthCache.value

    let value
    try {
      const res = await fetch(`${BASE_URL}/api/monitoring/health`, {
        signal: AbortSignal.timeout(4000),
      })
      value = {
        ready: res.ok,
        baseUrl: BASE_URL,
        detail: res.ok
          ? "Gateway reachable."
          : `Gateway answered ${res.status}. It is running but not healthy.`,
      }
    } catch (err) {
      value = {
        ready: false,
        baseUrl: BASE_URL,
        detail:
          `Cannot reach the gateway at ${BASE_URL} (${err.name === "TimeoutError" ? "timed out" : err.message}). ` +
          "Check that the omniroute service is running.",
      }
    }

    // Cached briefly: the dashboard polls health, and an unreachable gateway
    // should not make every poll wait out its own timeout.
    healthCache = { value, expiresAt: Date.now() + HEALTH_TTL_MS }
    return value
  },

  /**
   * The models the picker should offer for this gateway.
   *
   * OMNIROUTE_MODELS is the answer when it is set: the gateway can reach
   * hundreds of models, and a dropdown of hundreds is not a dropdown. Naming the
   * handful worth choosing between keeps the list short and deliberate.
   *
   * Without it, the gateway is asked what it can reach. That is the honest
   * default — whoever configured it decided the list — but it is only pleasant
   * to use when the gateway itself exposes a small set.
   */
  async listModels() {
    const pinned = (process.env.OMNIROUTE_MODELS || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
    if (pinned.length) return pinned

    try {
      const res = await fetch(`${BASE_URL}/v1/models`, {
        headers: headers(),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return []
      const body = await res.json()
      return (body?.data ?? [])
        .map((m) => (typeof m === "string" ? m : m?.id))
        .filter((id) => typeof id === "string" && id.length > 0)
    } catch {
      // A gateway that is down has no models to report. The health endpoint is
      // where that is diagnosed; this one just returns nothing.
      return []
    }
  },

  async run({ model, messages, reasoningEffort, signal, onDelta }) {
    let res
    try {
      res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: headers(),
        signal,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        }),
      })
    } catch (err) {
      // A connection that never opens throws rather than returning a status, and
      // the raw message for that is "fetch failed" — true, and useless. Say which
      // service could not be reached and what to do about it.
      if (signal?.aborted) throw err
      const error = new Error(
        `Cannot reach the OmniRoute gateway at ${BASE_URL} (${err.cause?.code || err.message}). ` +
          "Check that the omniroute service is running: docker compose ps"
      )
      error.statusCode = 502
      throw error
    }

    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => "")).slice(0, 400)
      const err = new Error(
        `OmniRoute returned ${res.status}. ${detail || "No detail was given."} ` +
          (res.status === 401 || res.status === 403
            ? "Check the gateway's API key."
            : "Check that a provider with working credentials is configured in the OmniRoute dashboard.")
      )
      err.statusCode = res.status === 401 || res.status === 403 ? 401 : 502
      throw err
    }

    let content = ""
    let usage = null
    let finishReason = "stop"
    let buffer = ""

    const decoder = new TextDecoder()
    for await (const bytes of res.body) {
      buffer += decoder.decode(bytes, { stream: true })

      // SSE frames are separated by a blank line; anything after the last one is
      // an incomplete frame and has to wait for more bytes.
      const frames = buffer.split("\n\n")
      buffer = frames.pop() ?? ""

      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === "[DONE]") continue

          let event
          try {
            event = JSON.parse(payload)
          } catch {
            continue
          }

          if (event.usage) usage = event.usage
          const choice = event.choices?.[0]
          if (!choice) continue
          if (choice.finish_reason) finishReason = choice.finish_reason
          const piece = choice.delta?.content
          if (piece) {
            content += piece
            if (onDelta) onDelta(piece)
          }
        }
      }
    }

    return { content, usage, finishReason }
  },
}
