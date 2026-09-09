import { NextRequest, NextResponse } from "next/server"
import { MetricsConfigError } from "@/lib/metrics/db"
import { readNicheCorpus } from "@/lib/metrics/neon"
import { buildIdeation, scoreCorpus } from "@/lib/niche/ideation"
import {
  buildChain,
  readChatMode,
  readProviderInit,
  selectOnceProvider,
} from "@/lib/chat/router"
import type { VideoType } from "@/lib/metrics/types"

// The semantic half of the ideation layer.
//
// /api/niche-ideation does the arithmetic: which title framings beat their own
// channel's baseline, which terms are saturated, who copies whom. What it
// cannot do is read meaning — it does not know that "Messi" and "Ronaldo" are
// the same kind of subject, or what a topic cluster should be called, or which
// unused angle is plausible rather than merely absent.
//
// So this route hands the model the arithmetic AND the evidence it was
// computed from, and asks only for the semantic step. Every number in the
// answer comes from the deterministic layer; the model names clusters and
// proposes angles, it does not invent statistics. The prompt says so, and the
// UI labels the output as generated.
//
// POST, never GET, and never on page load: this is the only part of the page
// that costs money, so it runs when the user asks for it.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface AnglesPayload {
  clusters: Array<{ name: string; whatItIs: string; examples: string[]; verdict: string }>
  angles: Array<{ title: string; why: string; groundedIn: string; risk: string }>
  readOfTheNiche: string
}

const cache = new Map<string, { payload: AnglesPayload; expiresAt: number; generatedAt: string }>()

const isVideoType = (v: unknown): v is VideoType => v === "LONG_FORM" || v === "SHORTS"

const SYSTEM_RULES = `You are a YouTube content strategist analysing one niche for an operator who
already has the numbers. You will be given a deterministic analysis of a niche's published titles —
every figure in it was computed from real view data, normalised as a percentile against each
channel's own other uploads so that channel size and video age cannot distort it.

Your job is the semantic step only:
1. Group the niche's titles into named topic clusters a human would recognise.
2. Say what the niche's shared ideation formula actually is, in one paragraph.
3. Propose specific new video angles that are plausible for this niche and not already saturated.

Hard rules:
- NEVER invent a statistic. Quote only numbers present in the data you were given.
- Ground every proposed angle in something in the data: a whitespace term, an under-used framing,
  or a gap between what performs and what gets made. Name that grounding explicitly.
- If the evidence is thin, say so in the angle's risk field rather than padding the list.
- Propose at most 6 angles. Fewer, better-grounded angles beat a long list.
- Reply with a single JSON object and nothing else. No markdown fence, no preamble.

JSON shape:
{
  "readOfTheNiche": "one paragraph on the shared ideation formula",
  "clusters": [{"name": "...", "whatItIs": "...", "examples": ["title", "title"], "verdict": "over-served | working | thin"}],
  "angles": [{"title": "a concrete video title", "why": "...", "groundedIn": "...", "risk": "..."}]
}`

/** Compact, evidence-first prompt. Titles carry their percentile so the model can see the gradient. */
function buildPrompt(
  group: string,
  videoType: VideoType,
  ideation: ReturnType<typeof buildIdeation>,
  topTitles: string[],
  bottomTitles: string[]
): string {
  const arch = ideation.archetypes
    .map(
      (a) =>
        `  ${a.label}: median percentile ${a.medianPercentile}, ${a.videoCount} videos ` +
        `(${a.sharePct}% of the niche), used by ${a.channelCount} channels, confidence ${a.confidence}`
    )
    .join("\n")

  const saturated = ideation.topics
    .filter((t) => t.isSaturated)
    .slice(0, 15)
    .map((t) => `  "${t.term}" — ${t.videoCount} videos across ${t.channelCount} channels, median percentile ${t.medianPercentile}`)
    .join("\n")

  const whitespace = ideation.topics
    .filter((t) => t.isWhitespace)
    .slice(0, 15)
    .map((t) => `  "${t.term}" — ${t.videoCount} videos, only ${t.channelCount} channel(s), median percentile ${t.medianPercentile}`)
    .join("\n")

  const overlap = ideation.overlap.pairs
    .slice(0, 6)
    .map((p) => `  ${p.a} and ${p.b}: ${p.similarity}% shared vocabulary (${p.shared.join(", ")})`)
    .join("\n")

  const repetition = ideation.repetition
    .slice(0, 5)
    .map(
      (r) =>
        `  ${r.handle}: recycles a subject in ${r.recycleRatePct}% of uploads, median ${r.medianDaysBetweenRepeats}d apart; ` +
        `repeats sit at percentile ${r.repeatPercentile} vs ${r.freshPercentile} for first uses`
    )
    .join("\n")

  return `NICHE: ${group}
FORMAT: ${videoType === "SHORTS" ? "Shorts" : "long-form"}
CORPUS: ${ideation.coverage.corpusSize} videos from ${ideation.coverage.channelCount} channels, ${ideation.coverage.oldestPublished} to ${ideation.coverage.newestPublished}
Percentile 50 = par for the channel that published it. Above 50 beat its own average.

TITLE FRAMINGS, best to worst:
${arch || "  (none cleared the sample-size floor)"}

SATURATED TERMS (most of the niche already uses these):
${saturated || "  (none)"}

UNDER-USED TERMS THAT PERFORM (few channels, above-par percentile):
${whitespace || "  (none)"}

IDEATION OVERLAP (shared title vocabulary between channels; median across the niche ${ideation.overlap.medianSimilarity}%):
${overlap || "  (too few channels to compare)"}

TOPIC RECYCLING:
${repetition || "  (not enough history)"}

HIGHEST-PERFORMING TITLES IN THE NICHE:
${topTitles.map((t) => `  ${t}`).join("\n")}

LOWEST-PERFORMING TITLES IN THE NICHE:
${bottomTitles.map((t) => `  ${t}`).join("\n")}`
}

/** Models wrap JSON in prose or a fence often enough that this is not optional. */
function parseJson(raw: string): AnglesPayload {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("Model did not return JSON")
  const parsed = JSON.parse(candidate.slice(start, end + 1)) as Partial<AnglesPayload>
  return {
    readOfTheNiche: String(parsed.readOfTheNiche ?? ""),
    clusters: Array.isArray(parsed.clusters) ? parsed.clusters.slice(0, 10) : [],
    angles: Array.isArray(parsed.angles) ? parsed.angles.slice(0, 6) : [],
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    group?: string
    format?: string
    refresh?: boolean
  }
  const group = (body.group ?? "").trim()
  const videoType: VideoType = isVideoType(body.format) ? body.format : "LONG_FORM"

  if (!group) {
    return NextResponse.json({ success: false, error: "Missing group", code: "BAD_REQUEST" }, { status: 400 })
  }

  const cacheKey = `${group}::${videoType}`
  const cached = cache.get(cacheKey)
  if (!body.refresh && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      success: true,
      cached: true,
      generatedAt: cached.generatedAt,
      data: cached.payload,
    })
  }

  // Same bring-your-own-key contract as /api/chat, so Settings configures both.
  // The bridge has no single-answer surface, so it is left out of the chain here.
  const chain = buildChain(readChatMode(request.headers.get("x-chat-mode")), {
    apiKey: request.headers.get("x-anthropic-key")?.trim() || process.env.ANTHROPIC_API_KEY || "",
    apiModel:
      request.headers.get("x-anthropic-model")?.trim() ||
      process.env.ANTHROPIC_MODEL ||
      "claude-opus-5",
  })

  const selected = selectOnceProvider(chain)
  if (!selected.ok) {
    return NextResponse.json(
      { success: false, error: selected.unavailable.error, code: selected.unavailable.code },
      { status: selected.unavailable.status }
    )
  }

  try {
    const corpus = await readNicheCorpus(group)
    const ideation = buildIdeation(corpus, group, videoType)
    if (ideation.emptyReason) {
      return NextResponse.json({ success: false, error: ideation.emptyReason, code: "THIN" }, { status: 422 })
    }

    const scored = scoreCorpus(corpus)
      .filter((v) => v.videoType === videoType && v.percentile !== null)
      .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))
    const label = (v: (typeof scored)[number]) => `[p${v.percentile} ${v.handle}] ${v.title}`
    const topTitles = scored.slice(0, 40).map(label)
    const bottomTitles = scored.slice(-20).map(label)

    const prompt = buildPrompt(group, videoType, ideation, topTitles, bottomTitles)

    const raw = await selected.provider.once({
      prompt,
      systemRules: SYSTEM_RULES,
      model: request.headers.get("x-anthropic-model")?.trim() || undefined,
      signal: request.signal,
    })

    const payload = parseJson(raw)
    const generatedAt = new Date().toISOString()
    cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS, generatedAt })
    return NextResponse.json({ success: true, cached: false, generatedAt, data: payload })
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError) {
      return NextResponse.json({ success: false, error: err.message, code: "CONFIG" }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
