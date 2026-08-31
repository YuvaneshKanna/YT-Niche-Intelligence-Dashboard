import Anthropic from "@anthropic-ai/sdk"
import { NextRequest } from "next/server"
import { aggregate } from "@/lib/metrics/aggregate"
import { MetricsConfigError } from "@/lib/metrics/db"
import {
  MetricsConfigError as SheetsConfigError,
  readChannelSnapshots as readChannelSheets,
  readVideoSnapshots as readVideoSheets,
} from "@/lib/metrics/sheets"
import {
  readChannelSnapshots as readChannelNeon,
  readVideoSnapshots as readVideoNeon,
} from "@/lib/metrics/neon"
import { RANGE_DAYS, type MetricsPayload, type RangeKey } from "@/lib/metrics/types"
import { streamFromSubscription, subscriptionChatReady } from "@/lib/chat/claude-subscription"

// Chat over the niche metrics.
//
// Subscription mode runs the Claude Code harness inside this function via the
// Claude Agent SDK (lib/chat/claude-subscription.ts), authenticated by
// CLAUDE_CODE_OAUTH_TOKEN. Nothing has to be running anywhere else — no bridge,
// no tunnel, no always-on machine.
//
// Required env for subscription mode:
//   CLAUDE_CODE_OAUTH_TOKEN   from `claude setup-token`
// Optional:
//   SANDBOX_CHAT_URL          legacy self-hosted bridge (sandbox/), used only
//   SANDBOX_SHARED_SECRET     when no OAuth token is set here
//   CHAT_ACCESS_TOKEN         gate — see the access check below
//   METRICS_SOURCE            "sheets" to read metrics from Google Sheets
//                             instead of Neon

export const maxDuration = 300

// Source of the Stage 2 data, kept in step with /api/metrics: Neon is the
// default and METRICS_SOURCE=sheets falls back to the Google Sheets reader.
// The two readers are interface-identical, so chat and the dashboard answer
// from the same rows instead of drifting apart.
const SOURCE: "neon" | "sheets" =
  (process.env.METRICS_SOURCE ?? "neon").toLowerCase() === "sheets" ? "sheets" : "neon"

const readChannelSnapshots = SOURCE === "sheets" ? readChannelSheets : readChannelNeon
const readVideoSnapshots = SOURCE === "sheets" ? readVideoSheets : readVideoNeon

const VIDEOS_PER_FORMAT = 60
const CONTEXT_TTL_MS = 30 * 60 * 1000

let contextCache: { range: RangeKey; source: string; text: string; expiresAt: number } | null = null

function buildContext(data: MetricsPayload): string {
  const lines: string[] = []

  lines.push(`# Niche metrics (${data.range})`)
  lines.push(
    `Coverage: ${data.coverageDays} of ${data.requestedDays} days ` +
      `(${data.coverageStart} to ${data.coverageEnd}).`
  )
  if (data.warnings.length) {
    lines.push("\nData caveats — respect these when answering:")
    for (const w of data.warnings) lines.push(`- ${w}`)
  }

  lines.push("\n## Niche groups")
  for (const g of data.groups) {
    lines.push(
      `\n### ${g.nicheGroup} (${g.channelCount} channels, primary niche: ${
        g.primaryNiche || "unclassified"
      })`
    )
    lines.push(
      `views gained ${g.totalViewsDelta}, subscribers gained ${g.subscriberDelta}, ` +
        `HHI ${g.concentrationHhi}, momentum ${g.momentum.score}/100 (${g.momentum.confidence}), ` +
        `opportunity ${g.opportunity.score}/100`
    )
    for (const t of ["LONG_FORM", "SHORTS"] as const) {
      const m = g.byFormat[t]
      lines.push(
        `${t}: ${m.viewsPerDay}/day, accel ${m.velocityChangePct ?? "n/a"}%, ` +
          `${m.videoCount} videos, outlier rate ${m.outlierRatePct}%, ` +
          `hit rate ${m.hitRatePct}%, engagement ${m.engagementRatePct}%, ` +
          `uploads/wk ${m.uploadsPerWeek}`
      )
    }
    lines.push(
      `daily trend (date total shorts longform): ` +
        g.trend.map((p) => `${p.date} ${p.totalViews} ${p.shortsViews} ${p.longFormViews}`).join(" | ")
    )
  }

  lines.push("\n## Channels")
  for (const c of data.channels) {
    lines.push(
      `${c.handle} | group=${c.nicheGroup} | niche=${c.niche} | subs=${c.subscribers} ` +
        `| viewsGained=${c.totalViewsDelta} | subsGained=${c.subscriberDelta} ` +
        `| dominance=${c.dominancePct}% | country=${c.country}`
    )
  }

  for (const t of ["LONG_FORM", "SHORTS"] as const) {
    const top = data.videos.filter((v) => v.videoType === t).slice(0, VIDEOS_PER_FORMAT)
    lines.push(`\n## Top ${t} videos by views/day (${top.length} shown)`)
    for (const v of top) {
      lines.push(
        `${v.handle} | "${v.title}" | published=${v.publishedAt} | dur=${v.durationHms} ` +
          `| views=${v.views} | vpd=${v.viewsPerDay ?? "n/a"} | score=${v.outlierScore} ` +
          `| ${v.outlierReason}/${v.outlierAgeTag} | dominance=${v.dominancePct}% ` +
          `| engagement=${v.engagementRatePct}%`
      )
    }
  }

  return lines.join("\n")
}

async function getContext(range: RangeKey): Promise<string> {
  if (
    contextCache &&
    contextCache.range === range &&
    contextCache.source === SOURCE &&
    contextCache.expiresAt > Date.now()
  ) {
    return contextCache.text
  }

  const days = RANGE_DAYS[range]
  const since = new Date(Date.now() - (days + 1) * 86400000).toISOString().slice(0, 10)

  const [channelSnapshots, videoSnapshots] = await Promise.all([
    readChannelSnapshots(since),
    readVideoSnapshots(since),
  ])

  const result = aggregate({ channelSnapshots, videoSnapshots, requestedDays: days })
  const text = buildContext({
    range,
    requestedDays: days,
    generatedAt: new Date().toISOString(),
    ...result,
  })

  contextCache = { range, source: SOURCE, text, expiresAt: Date.now() + CONTEXT_TTL_MS }
  return text
}

const json = (body: unknown, status: number) =>
  Response.json(body as Record<string, unknown>, { status })

const SYSTEM_RULES = `You are a YouTube strategy analyst embedded in the user's own niche-tracking dashboard. You answer questions about the metrics you are given.

Rules:
- Cite the actual numbers. Never invent a metric. If the data does not support an answer, say so plainly.
- Keep Shorts and long-form separate — different baselines, different behaviour. Never merge them into one figure.
- Check dominance before calling something a trend. One video or channel carrying a group is a fact to state, not a trend.
- HHI: above ~2500 one channel dominates and entry is hard; below ~1500 the niche is fragmented and open.
- The Shorts/long-form split thins beyond 7 days because the pipeline deletes HISTORICAL video rows after a week. Total views are unaffected. Say so when a claim rests on older split data.
- "Overall" is every channel with no Niche_Group set. It is a baseline, not a real cohort.
- Score components marked "estimate" are authored assumptions, not measurements.
- Be concise. Lead with the answer, then the numbers. No preamble.`

/** Streams a reply from the Anthropic API using a caller-supplied key. */
function streamFromApi(
  apiKey: string,
  model: string,
  context: string,
  question: string
): Response {
  const client = new Anthropic({ apiKey })

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
            { type: "text", text: SYSTEM_RULES },
            { type: "text", text: context, cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: question }],
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

export async function POST(request: NextRequest) {
  // Bring-your-own-key: a key supplied by the caller is used for that request
  // only and never stored. Falls back to a server key if one is configured.
  const mode = request.headers.get("x-chat-mode") === "api" ? "api" : "subscription"
  const clientKey = request.headers.get("x-anthropic-key")?.trim() || ""
  const apiKey = clientKey || process.env.ANTHROPIC_API_KEY || ""
  const model =
    request.headers.get("x-anthropic-model")?.trim() ||
    process.env.ANTHROPIC_MODEL ||
    "claude-opus-5"

  const sandboxUrl = process.env.SANDBOX_CHAT_URL
  const secret = process.env.SANDBOX_SHARED_SECRET

  // In-function is the default: it needs one env var and nothing else running.
  // The bridge stays available for anyone already on it, but only when no
  // token is set here — otherwise a leftover SANDBOX_CHAT_URL would silently
  // keep routing chat at a machine the user thought they had retired.
  const inFunction = subscriptionChatReady()

  if (mode === "api" && !apiKey) {
    return json(
      {
        error: "No Anthropic API key. Add one in Settings, or switch to subscription mode.",
        code: "NO_KEY",
      },
      503
    )
  }

  if (mode === "subscription" && !inFunction && (!sandboxUrl || !secret)) {
    return json(
      {
        error:
          "Subscription chat is not configured. Run `claude setup-token`, then set the token " +
          "as CLAUDE_CODE_OAUTH_TOKEN in Vercel (Settings has the exact command) and redeploy. " +
          "Or switch to API-key mode in Settings.",
        code: "NO_TOKEN",
      },
      503
    )
  }

  // This dashboard is publicly reachable and has no login. Without a gate,
  // anyone who finds the URL can spend your Claude subscription limits. When
  // CHAT_ACCESS_TOKEN is set the client must present it.
  const gate = process.env.CHAT_ACCESS_TOKEN
  if (gate && request.headers.get("x-chat-access") !== gate) {
    return json({ error: "Chat access token required or incorrect.", code: "LOCKED" }, 401)
  }

  let body: { question?: string; chatId?: string; range?: string; model?: string; effort?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const question = String(body.question ?? "").trim()
  if (!question) return json({ error: "question is required" }, 400)
  if (question.length > 4000) return json({ error: "question is too long" }, 400)

  const range: RangeKey =
    body.range === "7d" ||
    body.range === "14d" ||
    body.range === "30d" ||
    body.range === "90d" ||
    body.range === "180d"
      ? body.range
      : "30d"

  let context: string
  try {
    context = await getContext(range)
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError || err instanceof SheetsConfigError) {
      return json({ error: err.message, code: "CONFIG" }, 503)
    }
    return json({ error: err instanceof Error ? err.message : "Failed to load metrics" }, 500)
  }

  if (mode === "api") {
    return streamFromApi(apiKey, model, context, question)
  }

  if (inFunction) {
    return streamFromSubscription({
      question,
      context,
      chatId: body.chatId || crypto.randomUUID(),
      model: body.model,
      effort: body.effort,
      signal: request.signal,
    })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${(sandboxUrl as string).replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sandbox-secret": secret as string },
      body: JSON.stringify({
        question,
        context,
        chatId: body.chatId,
        model: body.model,
        effort: body.effort,
      }),
    })
  } catch (err: unknown) {
    return json(
      {
        error: `Could not reach the sandbox bridge at ${sandboxUrl}: ${
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
      { error: `Sandbox bridge returned ${upstream.status}. ${detail}`.trim(), code: "SANDBOX_ERROR" },
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
}
