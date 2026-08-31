import {
  COMBINED_WEIGHTS,
  FORMAT_BANDS,
  MIN_DAYS_FOR_FULL_CONFIDENCE,
  MIN_VIDEOS_FOR_FULL_CONFIDENCE,
  NEUTRAL_SCORE,
  type ChannelMetricInput,
  type ChannelScore,
  type ConfidenceLevel,
  type FormatClass,
  type FormatSplit,
  type NicheScore,
  type ScoreComponent,
} from "./types"

// The ranking engine. Pure: no I/O, no clock reads except the one `todayMs`
// passed in, so it is deterministic for a given input set.

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v))
const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b)
const round1 = (v: number) => Math.round(v * 10) / 10

const fmtNum = (n: number): string => {
  if (!Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function daysSince(date: string | null, todayMs: number): number | null {
  if (!date) return null
  const t = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((todayMs - t) / 86400000))
}

/**
 * Percentile of `value` within an ascending cohort, 0-100.
 *
 * Uses the midpoint of the strictly-below and at-or-below counts, so tied
 * values all land on the same percentile instead of being ordered arbitrarily
 * by their position in the array.
 */
export function percentileOf(value: number, ascending: number[]): number {
  const n = ascending.length
  if (n === 0) return NEUTRAL_SCORE
  if (n === 1) return NEUTRAL_SCORE

  let below = 0
  let atOrBelow = 0
  for (const v of ascending) {
    if (v < value) below++
    if (v <= value) atOrBelow++
  }
  return clamp(((below + atOrBelow) / 2 / n) * 100)
}

const ascending = (values: number[]): number[] => [...values].sort((a, b) => a - b)

// ── The five Channel Score ingredients ────────────────────────────────────
//
// "Fewer videos is better" is deliberately NOT one of them. Video count and
// channel age measure much the same thing, so scoring both double-counts youth;
// and the rule has no floor, which would let a 2-video channel with one fluke
// hit sit permanently at the top. `efficiency` (views per video) captures the
// same intent — do more with less — while staying bounded and meaningful.
// Thin channels are then handled by the confidence damp, not by the score.

interface RawMetrics {
  velocity: number
  efficiency: number
  growth: number
  freshness: number | null
  outlierRate: number
}

const COMPONENT_WEIGHTS: Record<keyof RawMetrics, number> = {
  velocity: 0.3,
  efficiency: 0.2,
  growth: 0.2,
  freshness: 0.2,
  outlierRate: 0.1,
}

const COMPONENT_LABELS: Record<keyof RawMetrics, string> = {
  velocity: "View velocity",
  efficiency: "Views per video",
  growth: "Subscriber growth",
  freshness: "Channel freshness",
  outlierRate: "Outlier rate",
}

function rawMetrics(c: ChannelMetricInput, todayMs: number): RawMetrics {
  const days = Math.max(1, c.coverageDays - 1)
  const ageDays = daysSince(c.createdAt, todayMs)
  return {
    velocity: safeDiv(c.viewsDelta, days),
    efficiency: safeDiv(c.totalViews, c.totalVideos),
    // Relative, not absolute: a 500-sub gain means something very different on
    // a 5K channel than on a 5M one.
    growth: safeDiv(c.subscriberDelta, Math.max(1, c.subscribersAtStart)),
    // Negated so that "younger" sorts as "higher" once percentiled.
    freshness: ageDays === null ? null : -ageDays,
    outlierRate: safeDiv(c.outlierVideos, Math.max(1, c.trackedVideos)),
  }
}

/**
 * Format class from the share of the channel's videos that are long-form.
 * See the FormatSplit docs in ./types for why view share is not used here.
 */
export function classifyFormat(c: ChannelMetricInput): FormatSplit {
  const videoTotal = c.longFormVideos + c.shortsVideos
  const viewTotal = c.longFormViews + c.shortsViews
  const videoShare = videoTotal === 0 ? null : c.longFormVideos / videoTotal
  const viewShare = viewTotal === 0 ? null : c.longFormViews / viewTotal

  let formatClass: FormatClass
  if (videoShare === null) {
    // No tracked videos at all — fall back to whichever way the views lean,
    // and to long-form when there is nothing to go on.
    formatClass = viewShare !== null && viewShare <= FORMAT_BANDS.shortsMax ? "SHORTS" : "LONG_FORM"
  } else if (videoShare >= FORMAT_BANDS.longFormMin) {
    formatClass = "LONG_FORM"
  } else if (videoShare <= FORMAT_BANDS.shortsMax) {
    formatClass = "SHORTS"
  } else {
    formatClass = "BOTH"
  }

  return {
    formatClass,
    longFormVideos: c.longFormVideos,
    shortsVideos: c.shortsVideos,
    videoShare,
    viewShare,
  }
}

/** Cohort distributions, one ascending array per metric. */
type Cohort = Record<keyof RawMetrics, number[]>

function buildCohort(rows: RawMetrics[]): Cohort {
  return {
    velocity: ascending(rows.map((r) => r.velocity)),
    efficiency: ascending(rows.map((r) => r.efficiency)),
    growth: ascending(rows.map((r) => r.growth)),
    freshness: ascending(rows.map((r) => r.freshness).filter((v): v is number => v !== null)),
    outlierRate: ascending(rows.map((r) => r.outlierRate)),
  }
}

/** Percentile every metric of one channel against one cohort. */
function scoreAgainst(raw: RawMetrics, cohort: Cohort): Record<keyof RawMetrics, number | null> {
  return {
    velocity: percentileOf(raw.velocity, cohort.velocity),
    efficiency: percentileOf(raw.efficiency, cohort.efficiency),
    growth: percentileOf(raw.growth, cohort.growth),
    freshness: raw.freshness === null ? null : percentileOf(raw.freshness, cohort.freshness),
    outlierRate: percentileOf(raw.outlierRate, cohort.outlierRate),
  }
}

/**
 * Weighted mean over the components that have a value, with the weights
 * renormalised across those present. A channel missing its created date is
 * therefore scored on the remaining four rather than penalised to zero.
 */
function weightedMean(scores: Record<string, number | null>, weights: Record<string, number>): number {
  let sum = 0
  let weight = 0
  for (const key of Object.keys(weights)) {
    const s = scores[key]
    if (s === null || s === undefined) continue
    sum += s * weights[key]
    weight += weights[key]
  }
  return weight === 0 ? NEUTRAL_SCORE : sum / weight
}

/**
 * How much of the raw score to keep. A channel with very few videos, or only a
 * day or two of snapshots, has not shown enough to earn an extreme score in
 * either direction, so it is shrunk toward neutral rather than trusted or
 * discarded.
 */
function confidenceWeight(c: ChannelMetricInput): number {
  const byVideos = Math.min(1, safeDiv(c.totalVideos, MIN_VIDEOS_FOR_FULL_CONFIDENCE))
  const byDays = Math.min(1, safeDiv(c.coverageDays, MIN_DAYS_FOR_FULL_CONFIDENCE))
  return Math.min(byVideos, byDays)
}

function confidenceOf(c: ChannelMetricInput, w: number): { level: ConfidenceLevel; reason: string } {
  const bits: string[] = []
  if (c.totalVideos < MIN_VIDEOS_FOR_FULL_CONFIDENCE) bits.push(`only ${c.totalVideos} video(s) published`)
  if (c.coverageDays < MIN_DAYS_FOR_FULL_CONFIDENCE) bits.push(`only ${c.coverageDays} day(s) of snapshots`)
  if (c.createdAt === null) bits.push("no channel creation date")
  if (c.trackedVideos === 0) bits.push("no videos tracked in this window")

  const level: ConfidenceLevel = w >= 1 && bits.length === 0 ? "high" : w >= 0.5 ? "medium" : "low"
  const reason =
    bits.length === 0
      ? `Full coverage: ${c.totalVideos} videos, ${c.coverageDays} days of snapshots.`
      : `Score pulled toward ${NEUTRAL_SCORE} because ${bits.join("; ")}.`
  return { level, reason }
}

export interface RankInput {
  channels: ChannelMetricInput[]
  /** Milliseconds since epoch used for every age calculation in this run. */
  todayMs: number
}

export interface RankResult {
  channels: ChannelScore[]
  niches: NicheScore[]
}

export function rankChannels({ channels, todayMs }: RankInput): RankResult {
  if (channels.length === 0) return { channels: [], niches: [] }

  const raws = new Map<string, RawMetrics>()
  const splits = new Map<string, FormatSplit>()
  for (const c of channels) {
    raws.set(c.channelId, rawMetrics(c, todayMs))
    splits.set(c.channelId, classifyFormat(c))
  }

  const inClass = (fc: FormatClass) =>
    channels.filter((c) => splits.get(c.channelId)!.formatClass === fc)

  // Cohorts stay pure: BOTH channels are scored against the two single-format
  // cohorts rather than forming a third, which would be only a handful of
  // members and give percentiles in coarse 12% steps.
  const lfRows = inClass("LONG_FORM").map((c) => raws.get(c.channelId)!)
  const shRows = inClass("SHORTS").map((c) => raws.get(c.channelId)!)
  const allRows = channels.map((c) => raws.get(c.channelId)!)

  const lfCohort = buildCohort(lfRows.length > 0 ? lfRows : allRows)
  const shCohort = buildCohort(shRows.length > 0 ? shRows : allRows)

  // ── Niche scores ────────────────────────────────────────────────────────
  // Keyed on `niche`, not `niche_group`: the group is blank for 158 of the 189
  // tracked channels, so a group-based score would be null for most of the list.
  const byNiche = new Map<string, ChannelMetricInput[]>()
  for (const c of channels) {
    const key = c.niche.trim() || "Unclassified"
    const list = byNiche.get(key)
    if (list) list.push(c)
    else byNiche.set(key, [c])
  }

  const nicheRaw = [...byNiche.entries()].map(([niche, members]) => {
    const rows = members.map((m) => raws.get(m.channelId)!)
    const mean = (pick: (r: RawMetrics) => number) =>
      rows.reduce((s, r) => s + pick(r), 0) / rows.length
    return {
      niche,
      members,
      velocity: mean((r) => r.velocity),
      growth: mean((r) => r.growth),
      outlierRate: mean((r) => r.outlierRate),
    }
  })

  const nicheVelocities = ascending(nicheRaw.map((n) => n.velocity))
  const nicheGrowths = ascending(nicheRaw.map((n) => n.growth))
  const nicheOutliers = ascending(nicheRaw.map((n) => n.outlierRate))

  const niches: NicheScore[] = nicheRaw.map((n) => {
    const components: ScoreComponent[] = [
      {
        key: "velocity",
        label: "Mean view velocity",
        score: percentileOf(n.velocity, nicheVelocities),
        weight: 0.5,
        displayValue: `${fmtNum(n.velocity)}/day`,
        note: "Average daily view gain per channel in this niche.",
      },
      {
        key: "growth",
        label: "Mean subscriber growth",
        score: percentileOf(n.growth, nicheGrowths),
        weight: 0.3,
        displayValue: `${(n.growth * 100).toFixed(2)}%`,
        note: "Average relative subscriber gain per channel across the window.",
      },
      {
        key: "outlierRate",
        label: "Mean outlier rate",
        score: percentileOf(n.outlierRate, nicheOutliers),
        weight: 0.2,
        displayValue: `${(n.outlierRate * 100).toFixed(1)}%`,
        note: "Share of tracked videos flagged as outliers, averaged per channel.",
      },
    ]

    const rawScore = weightedMean(
      Object.fromEntries(components.map((c) => [c.key, c.score])),
      Object.fromEntries(components.map((c) => [c.key, c.weight]))
    )

    // A one- or two-channel niche is a sample, not a trend — shrink it toward
    // neutral the same way a thin channel is shrunk.
    const w = Math.min(1, n.members.length / 3)
    return {
      niche: n.niche,
      channelCount: n.members.length,
      score: round1(clamp(NEUTRAL_SCORE + (rawScore - NEUTRAL_SCORE) * w)),
      components,
      confidence: (n.members.length >= 5 ? "high" : n.members.length >= 3 ? "medium" : "low") as ConfidenceLevel,
    }
  })

  const nicheScoreByName = new Map(niches.map((n) => [n.niche, n.score]))

  // ── Channel scores ──────────────────────────────────────────────────────
  const scored: ChannelScore[] = channels.map((c) => {
    const raw = raws.get(c.channelId)!
    const split = splits.get(c.channelId)!

    const lfScores = scoreAgainst(raw, lfCohort)
    const shScores = scoreAgainst(raw, shCohort)

    // A BOTH channel is scored twice — once against each single-format cohort —
    // and the two are blended by its own long-form/Shorts view share. This is
    // the one place view share is valid: it is comparing a channel against
    // itself, so the structural view gap between formats cancels out.
    const lfWeight =
      split.formatClass === "LONG_FORM" ? 1 : split.formatClass === "SHORTS" ? 0 : (split.viewShare ?? 0.5)

    const blended: Record<string, number | null> = {}
    for (const key of Object.keys(COMPONENT_WEIGHTS) as (keyof RawMetrics)[]) {
      const a = lfScores[key]
      const b = shScores[key]
      blended[key] = a === null || b === null ? null : a * lfWeight + b * (1 - lfWeight)
    }

    const components: ScoreComponent[] = (Object.keys(COMPONENT_WEIGHTS) as (keyof RawMetrics)[]).map(
      (key) => {
        const value = raw[key]
        let displayValue: string
        switch (key) {
          case "velocity":
            displayValue = `${fmtNum(raw.velocity)}/day`
            break
          case "efficiency":
            displayValue = `${fmtNum(raw.efficiency)}/video`
            break
          case "growth":
            displayValue = `${(raw.growth * 100).toFixed(2)}%`
            break
          case "freshness":
            displayValue =
              value === null ? "unknown" : `${Math.abs(value as number)}d old`
            break
          default:
            displayValue = `${(raw.outlierRate * 100).toFixed(1)}%`
        }
        return {
          key,
          label: COMPONENT_LABELS[key],
          score: blended[key] === null ? null : round1(blended[key] as number),
          weight: COMPONENT_WEIGHTS[key],
          displayValue,
          note:
            key === "freshness"
              ? "Days since the channel was created, from the YouTube API. Younger scores higher."
              : `Percentile against the ${split.formatClass.toLowerCase().replace("_", "-")} cohort.`,
        }
      }
    )

    const rawScore = weightedMean(blended, COMPONENT_WEIGHTS as Record<string, number>)
    const w = confidenceWeight(c)
    const damped = clamp(NEUTRAL_SCORE + (rawScore - NEUTRAL_SCORE) * w)
    const { level, reason } = confidenceOf(c, w)

    const nicheScore = nicheScoreByName.get(c.niche.trim() || "Unclassified") ?? null
    const combined =
      nicheScore === null
        ? damped
        : COMBINED_WEIGHTS.channel * damped + COMBINED_WEIGHTS.niche * nicheScore

    return {
      channelId: c.channelId,
      handle: c.handle,
      niche: c.niche,
      formatSplit: split,
      channelScore: round1(damped),
      channelScoreRaw: round1(rawScore),
      components,
      nicheScore,
      combinedScore: round1(clamp(combined)),
      rank: 0, // assigned below
      confidence: level,
      confidenceReason: reason,
      createdAt: c.createdAt,
      channelAgeDays: daysSince(c.createdAt, todayMs),
      totalVideos: c.totalVideos,
      coverageDays: c.coverageDays,
    }
  })

  scored.sort((a, b) => b.combinedScore - a.combinedScore || a.handle.localeCompare(b.handle))
  scored.forEach((s, i) => {
    s.rank = i + 1
  })

  niches.sort((a, b) => b.score - a.score)

  return { channels: scored, niches }
}
