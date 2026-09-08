// Turns one niche group's measured metrics into ranked, actionable moves.
//
// Everything here is deterministic arithmetic over the /api/metrics payload —
// no model call, no judgement encoded as a magic constant without a comment.
// The page shows these as "Next moves" above the evidence, so each move must
// be able to point at the number that produced it and say how much that
// number can be trusted.
//
// The trust part is not decoration. Video-level rows are pruned after 7 days
// for everything except outliers and recent uploads (see the retention note
// on TrendPoint in lib/metrics/types.ts), so a 90-day window does NOT give a
// 90-day sample of ordinary videos. Every move therefore carries the `n` it
// was computed from and a confidence derived from it, and a move whose `n` is
// too small to mean anything is not emitted at all.

import type {
  ChannelRollup,
  Confidence,
  FormatMetrics,
  NicheGroupSummary,
  VideoRollup,
  VideoType,
} from "@/lib/metrics/types"
import type { NexlevChannelDetail } from "@/lib/metrics/neon"

/** Which evidence panel a move was derived from — drives the "why" jump. */
export type EvidenceAnchor = "trend" | "peers" | "channels" | "outliers"

export interface Move {
  id: string
  /** Imperative one-liner: what to do. */
  headline: string
  /** The single number that carries the claim. */
  metric: string
  /** Why the claim holds, in one sentence, naming the sample it came from. */
  detail: string
  confidence: Confidence
  confidenceReason: string
  /** 0-100 effect size; ranking multiplies this by a confidence weight. */
  effect: number
  anchor: EvidenceAnchor
}

// ── Sample-size policy ───────────────────────────────────────────────────
//
// One shared ladder, so "medium confidence" means the same thing on every
// card. The floor is 2: below that there is no comparison, only an anecdote,
// and the move is suppressed rather than shown weakly.
const MIN_SAMPLE = 2
const MEDIUM_SAMPLE = 5
const HIGH_SAMPLE = 12

function confidenceFrom(n: number, what: string): { confidence: Confidence; reason: string } {
  if (n >= HIGH_SAMPLE) return { confidence: "high", reason: `${n} ${what} in range` }
  if (n >= MEDIUM_SAMPLE) return { confidence: "medium", reason: `only ${n} ${what} in range` }
  return { confidence: "low", reason: `just ${n} ${what} in range — treat as a hint, not a finding` }
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.75, low: 0.45 }

// ── Small numeric helpers ────────────────────────────────────────────────

function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (clean.length === 0) return null
  const mid = Math.floor(clean.length / 2)
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid]
}

export function formatCount(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${Math.round(n)}`
}

const round = (n: number, dp = 1): number => Number(n.toFixed(dp))

/** Views/day of a video, ignoring the ones observed too briefly to have one. */
const vpd = (videos: VideoRollup[]): number[] =>
  videos.map((v) => v.viewsPerDay).filter((n): n is number => n !== null)

// ── Move 1: which format actually carries this niche ─────────────────────

function formatMove(videos: VideoRollup[]): Move | null {
  const long = videos.filter((v) => v.videoType === "LONG_FORM")
  const shorts = videos.filter((v) => v.videoType === "SHORTS")
  const longVpd = median(vpd(long))
  const shortVpd = median(vpd(shorts))

  // Both sides need a sample; a format with no tracked videos is a coverage
  // gap, not evidence that the format fails.
  if (long.length < MIN_SAMPLE || shorts.length < MIN_SAMPLE) return null
  if (longVpd === null || shortVpd === null || longVpd <= 0 || shortVpd <= 0) return null

  const longWins = longVpd >= shortVpd
  const ratio = longWins ? longVpd / shortVpd : shortVpd / longVpd
  // A ratio under 1.5x is not a strategy, it is noise between two medians.
  if (ratio < 1.5) return null

  const winner: VideoType = longWins ? "LONG_FORM" : "SHORTS"
  const winnerLabel = longWins ? "long-form" : "Shorts"
  const loserLabel = longWins ? "Shorts" : "long-form"
  const n = Math.min(long.length, shorts.length)
  const { confidence, reason } = confidenceFrom(n, `tracked ${loserLabel} videos`)

  const winnerVideos = videos.filter((v) => v.videoType === winner)
  const winnerOutlierRate =
    winnerVideos.filter((v) => v.outlierScore >= 1).length / Math.max(1, winnerVideos.length)

  return {
    id: "format",
    headline: `Make ${winnerLabel}, not ${loserLabel}`,
    metric: `${round(ratio)}×`,
    detail:
      `Median ${winnerLabel} video pulls ${formatCount(longWins ? longVpd : shortVpd)} views/day ` +
      `against ${formatCount(longWins ? shortVpd : longVpd)} for ${loserLabel} ` +
      `(${long.length} long-form, ${shorts.length} Shorts tracked). ` +
      `${Math.round(winnerOutlierRate * 100)}% of ${winnerLabel} videos here scored as outliers.`,
    confidence,
    confidenceReason: reason,
    // 2x -> 33, 4x -> 100. Beyond 4x the extra multiple changes no decision.
    effect: Math.min(100, ((ratio - 1) / 3) * 100),
    anchor: "outliers",
  }
}

// ── Move 2: the length band that wins ────────────────────────────────────

/** Long-form duration bands, in minutes. Shorts are excluded — no meaningful spread. */
const DURATION_BANDS: Array<{ label: string; minMin: number; maxMin: number }> = [
  { label: "under 4 min", minMin: 0, maxMin: 4 },
  { label: "4-8 min", minMin: 4, maxMin: 8 },
  { label: "8-12 min", minMin: 8, maxMin: 12 },
  { label: "12-16 min", minMin: 12, maxMin: 16 },
  { label: "16-25 min", minMin: 16, maxMin: 25 },
  { label: "25 min+", minMin: 25, maxMin: Infinity },
]

/** "H:MM:SS" or "M:SS" to minutes. Returns null for the blank/garbage case. */
export function hmsToMinutes(hms: string): number | null {
  if (!hms) return null
  const parts = hms.split(":").map((p) => parseInt(p, 10))
  if (parts.some((p) => !Number.isFinite(p))) return null
  const seconds =
    parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts.length === 2
        ? parts[0] * 60 + parts[1]
        : parts[0]
  return seconds > 0 ? seconds / 60 : null
}

export interface DurationBand {
  label: string
  videoCount: number
  medianVpd: number | null
}

/** Median views/day per long-form duration band. Also feeds the phase-2 chart. */
export function durationBands(videos: VideoRollup[]): DurationBand[] {
  const long = videos.filter((v) => v.videoType === "LONG_FORM")
  return DURATION_BANDS.map((band) => {
    const inBand = long.filter((v) => {
      const mins = hmsToMinutes(v.durationHms)
      return mins !== null && mins >= band.minMin && mins < band.maxMin
    })
    return { label: band.label, videoCount: inBand.length, medianVpd: median(vpd(inBand)) }
  })
}

function lengthMove(videos: VideoRollup[]): Move | null {
  const bands = durationBands(videos).filter(
    (b) => b.videoCount >= MIN_SAMPLE && b.medianVpd !== null && b.medianVpd > 0
  )
  // One band that clears the bar describes the niche's habits; it is not a
  // choice between lengths.
  if (bands.length < 2) return null

  const sorted = [...bands].sort((a, b) => (b.medianVpd ?? 0) - (a.medianVpd ?? 0))
  const best = sorted[0]
  const restMedian = median(sorted.slice(1).map((b) => b.medianVpd ?? 0))
  if (restMedian === null || restMedian <= 0) return null

  const lift = (best.medianVpd ?? 0) / restMedian
  if (lift < 1.3) return null

  const { confidence, reason } = confidenceFrom(best.videoCount, "long-form videos in that band")

  return {
    id: "length",
    headline: `Target the ${best.label} band`,
    metric: `+${Math.round((lift - 1) * 100)}%`,
    detail:
      `Long-form at ${best.label} runs ${formatCount(best.medianVpd ?? 0)} views/day against ` +
      `${formatCount(restMedian)} for every other length in this niche, across ` +
      `${bands.reduce((s, b) => s + b.videoCount, 0)} tracked videos.`,
    confidence,
    confidenceReason: reason,
    effect: Math.min(100, (lift - 1) * 100),
    anchor: "outliers",
  }
}

// ── Move 3: the cadence the winners keep ─────────────────────────────────

/** A channel's total weekly uploads across both formats. */
const uploadsPerWeek = (c: ChannelRollup): number =>
  c.byFormat.LONG_FORM.uploadsPerWeek + c.byFormat.SHORTS.uploadsPerWeek

function paceMove(channels: ChannelRollup[]): Move | null {
  if (channels.length < 4) return null

  const ranked = [...channels].sort((a, b) => b.totalViewsDelta - a.totalViewsDelta)
  const cut = Math.max(1, Math.floor(ranked.length / 4))
  const winners = ranked.slice(0, cut)
  const rest = ranked.slice(cut)
  if (rest.length === 0) return null

  const winnerPace = median(winners.map(uploadsPerWeek))
  const restPace = median(rest.map(uploadsPerWeek))
  if (winnerPace === null || restPace === null || winnerPace <= 0 || restPace <= 0) return null
  // Publishing less than the field and winning is a real finding, but it is a
  // finding about content quality, not a cadence instruction — skip it.
  if (winnerPace <= restPace * 1.2) return null

  const { confidence, reason } = confidenceFrom(channels.length, "channels in this niche")

  return {
    id: "pace",
    headline: `Publish ${round(winnerPace)}× a week`,
    metric: `${round(winnerPace)}/wk`,
    detail:
      `The top ${cut} channel${cut === 1 ? "" : "s"} by views gained publish ${round(winnerPace)} ` +
      `videos a week; the other ${rest.length} average ${round(restPace)}. Cadence is the clearest ` +
      `separator between them.`,
    confidence,
    confidenceReason: reason,
    effect: Math.min(100, (winnerPace / restPace - 1) * 60),
    anchor: "channels",
  }
}

// ── Move 4: is there room to enter at all ────────────────────────────────

/** Below this a niche is fragmented enough that no single channel owns it. */
const HHI_CONCENTRATED = 2500
/** A channel this young breaking out is the strongest possible entry signal. */
const YOUNG_CHANNEL_DAYS = 365

function entryMove(
  group: NicheGroupSummary,
  channels: ChannelRollup[],
  videos: VideoRollup[]
): Move {
  const concentrated = group.concentrationHhi >= HHI_CONCENTRATED
  const topShare = channels.reduce((max, c) => Math.max(max, c.dominancePct), 0)

  // The channel that already owns the niche cannot also be evidence that the
  // niche is enterable. In a one-channel group it IS the niche, and in a
  // concentrated one its breakout says nothing about a newcomer's odds — so
  // the incumbent's own videos are excluded from the entry signal.
  const incumbent = channels.reduce<ChannelRollup | null>(
    (top, c) => (top === null || c.dominancePct > top.dominancePct ? c : top),
    null
  )
  const incumbentHandle = incumbent && incumbent.dominancePct >= 50 ? incumbent.handle : null

  const youngWinners = videos.filter(
    (v) =>
      v.channelAgeDays !== null &&
      v.channelAgeDays <= YOUNG_CHANNEL_DAYS &&
      v.outlierScore >= 1 &&
      v.handle !== incumbentHandle
  )
  const youngest = youngWinners.reduce<VideoRollup | null>(
    (best, v) =>
      best === null || (v.channelAgeDays ?? Infinity) < (best.channelAgeDays ?? Infinity) ? v : best,
    null
  )

  // A single-channel group has no field to enter — it is one channel being
  // watched, and calling that "open" or "crowded" would both be wrong.
  if (group.channelCount < 2) {
    const tracked = channels[0]
    const age = tracked?.channelAgeDays ?? null
    return {
      id: "entry",
      headline: "One channel tracked — no field to read yet",
      metric: `${group.channelCount} ch`,
      detail:
        `${tracked?.handle ?? "This niche"} is the only channel tracked in this group` +
        (age === null ? "" : `, ${age} days old on tracked uploads`) +
        `. Add competitors to the roster before reading saturation or entry difficulty here.`,
      confidence: "low",
      confidenceReason: "A single channel cannot describe a niche",
      effect: 15,
      anchor: "channels",
    }
  }

  if (youngest) {
    const days = youngest.channelAgeDays ?? 0
    const { confidence, reason } = confidenceFrom(youngWinners.length, "young-channel outliers")
    return {
      id: "entry",
      headline: "Entry is open — a young channel already broke through",
      metric: `${days}d`,
      detail:
        `${youngest.handle} is ${days} days old on tracked uploads and landed an outlier at ` +
        `${round(youngest.outlierScore, 2)}× its own baseline. ` +
        (concentrated
          ? `The niche is concentrated (HHI ${group.concentrationHhi}, top channel takes ` +
            `${round(topShare)}% of views), but that has not blocked a new entrant.`
          : `The niche is fragmented (HHI ${group.concentrationHhi}) — no channel owns it.`),
      confidence,
      confidenceReason: reason,
      effect: concentrated ? 70 : 85,
      anchor: "channels",
    }
  }

  return {
    id: "entry",
    headline: concentrated
      ? "Crowded — no new channel has broken in yet"
      : "Open field, but nobody has broken out",
    metric: `HHI ${group.concentrationHhi}`,
    detail: concentrated
      ? `The top channel takes ${round(topShare)}% of this niche's views and no challenger under ` +
        `${YOUNG_CHANNEL_DAYS} days old has produced an outlier in range. Expect to fight incumbents.`
      : `Views are spread across ${group.channelCount} channels (HHI ${group.concentrationHhi}), ` +
        `but no challenger under ${YOUNG_CHANNEL_DAYS} days old has produced an outlier in range ` +
        `either — the ceiling here may simply be low.`,
    confidence: "medium",
    confidenceReason: `Based on ${group.channelCount} channels and outlier coverage only`,
    effect: concentrated ? 30 : 45,
    anchor: "channels",
  }
}

// ── Move 5: where the money actually is ──────────────────────────────────

export interface MoneyReading {
  longRpm: number | null
  shortRpm: number | null
  monthRevenue: number | null
  enrichedCount: number
}

/** Median measured RPM and revenue across a group's NexLev-enriched channels. */
export function readMoney(nexlev: NexlevChannelDetail[]): MoneyReading {
  return {
    longRpm: median(nexlev.map((n) => n.longRpm).filter((n): n is number => n !== null)),
    shortRpm: median(nexlev.map((n) => n.shortRpm).filter((n): n is number => n !== null)),
    monthRevenue: median(nexlev.map((n) => n.monthRevenue).filter((n): n is number => n !== null)),
    enrichedCount: nexlev.length,
  }
}

function moneyMove(money: MoneyReading, channelCount: number): Move | null {
  const { longRpm, shortRpm, enrichedCount } = money
  if (enrichedCount === 0) return null
  if (longRpm === null && shortRpm === null) return null

  const { confidence, reason } = confidenceFrom(enrichedCount, "channels with measured NexLev RPM")
  const coverage = `${enrichedCount} of ${channelCount} channels enriched`

  if (longRpm !== null && shortRpm !== null && shortRpm > 0) {
    const ratio = longRpm / shortRpm
    return {
      id: "money",
      headline: ratio >= 1.5 ? "Long-form is where the money is" : "RPM barely differs by format",
      metric: `$${round(longRpm, 2)}`,
      detail:
        `Measured median RPM is $${round(longRpm, 2)} on long-form against $${round(shortRpm, 2)} ` +
        `on Shorts — ${round(ratio)}× the revenue per thousand views. ${coverage}.`,
      confidence,
      confidenceReason: reason,
      effect: Math.min(100, Math.max(20, (ratio - 1) * 40)),
      anchor: "channels",
    }
  }

  const only = longRpm ?? shortRpm ?? 0
  const label = longRpm !== null ? "long-form" : "Shorts"
  const missing = longRpm !== null ? "Shorts" : "long-form"
  return {
    id: "money",
    headline: `Measured ${label} RPM is $${round(only, 2)}`,
    metric: `$${round(only, 2)}`,
    detail:
      `NexLev measures $${round(only, 2)} per thousand ${label} views here. ${coverage}. ` +
      `No ${missing} RPM has been measured for this niche yet, so the split is unknown.`,
    confidence,
    confidenceReason: reason,
    effect: Math.min(100, only * 5),
    anchor: "channels",
  }
}

// ── Assembly ─────────────────────────────────────────────────────────────

export interface RecommendInput {
  group: NicheGroupSummary
  channels: ChannelRollup[]
  videos: VideoRollup[]
  nexlev: NexlevChannelDetail[]
}

export interface RecommendResult {
  moves: Move[]
  /** Set when nothing cleared its gate — the UI explains rather than showing an empty box. */
  emptyReason: string | null
}

export function recommend({ group, channels, videos, nexlev }: RecommendInput): RecommendResult {
  const money = readMoney(nexlev)

  const candidates = [
    formatMove(videos),
    lengthMove(videos),
    paceMove(channels),
    entryMove(group, channels, videos),
    moneyMove(money, group.channelCount),
  ].filter((m): m is Move => m !== null)

  // Rank by effect discounted for how much the sample can be trusted, so a
  // huge multiple measured on two videos never outranks a solid finding.
  const moves = candidates.sort(
    (a, b) => b.effect * CONFIDENCE_WEIGHT[b.confidence] - a.effect * CONFIDENCE_WEIGHT[a.confidence]
  )

  const emptyReason =
    moves.length === 0
      ? `Only ${videos.length} tracked video${videos.length === 1 ? "" : "s"} and ` +
        `${channels.length} channel${channels.length === 1 ? "" : "s"} in this window — not enough ` +
        `to separate a pattern from noise. Widen the range, or check this niche's tracking coverage.`
      : null

  return { moves, emptyReason }
}

// ── Peer ranking: where this niche sits against the others ───────────────

export interface PeerMeasure {
  key: string
  label: string
  /** This group's value. */
  value: number
  /** Best value across all groups, for the bar's full width. */
  best: number
  median: number
  /** 1 = best of `outOf`. */
  rank: number
  outOf: number
  format: "views" | "pct" | "rate"
  /** What the number means, for the tooltip. */
  note: string
}

/** Weighted mean of a per-format field, weighted by that format's video count. */
function byVideoCount(g: NicheGroupSummary, pick: (f: FormatMetrics) => number): number {
  const long = g.byFormat.LONG_FORM
  const shorts = g.byFormat.SHORTS
  const total = long.videoCount + shorts.videoCount
  if (total === 0) return 0
  return (pick(long) * long.videoCount + pick(shorts) * shorts.videoCount) / total
}

const perChannel = (g: NicheGroupSummary, total: number): number =>
  g.channelCount === 0 ? 0 : total / g.channelCount

/**
 * Six measures, each normalised per channel where the raw figure is a group
 * total — otherwise a 159-channel group wins every bar on size alone and the
 * comparison says nothing.
 */
export function peerRanks(group: NicheGroupSummary, allGroups: NicheGroupSummary[]): PeerMeasure[] {
  const specs: Array<{
    key: string
    label: string
    format: PeerMeasure["format"]
    note: string
    of: (g: NicheGroupSummary) => number
  }> = [
    {
      key: "vpd",
      label: "Views/day per channel",
      format: "views",
      note: "The group's daily view gain divided by its channel count.",
      of: (g) => perChannel(g, g.byFormat.LONG_FORM.viewsPerDay + g.byFormat.SHORTS.viewsPerDay),
    },
    {
      key: "subs",
      label: "Subs gained per channel",
      format: "views",
      note: "Subscribers gained in range, divided by channel count.",
      of: (g) => perChannel(g, g.subscriberDelta),
    },
    {
      key: "engagement",
      label: "Engagement rate",
      format: "pct",
      note: "(likes + comments) / views across tracked videos, weighted by video count.",
      of: (g) => byVideoCount(g, (f) => f.engagementRatePct),
    },
    {
      key: "outlier",
      label: "Outlier rate",
      format: "pct",
      note: "Share of tracked videos that scored as outliers.",
      of: (g) => byVideoCount(g, (f) => f.outlierRatePct),
    },
    {
      key: "hit",
      label: "Hit rate",
      format: "pct",
      note: "Share of videos beating their own channel's mean views.",
      of: (g) => byVideoCount(g, (f) => f.hitRatePct),
    },
    {
      key: "cadence",
      label: "Uploads/week per channel",
      format: "rate",
      note: "Videos published in range per week, divided by channel count.",
      of: (g) =>
        perChannel(g, g.byFormat.LONG_FORM.uploadsPerWeek + g.byFormat.SHORTS.uploadsPerWeek),
    },
  ]

  return specs.map((spec) => {
    const values = allGroups.map(spec.of)
    const value = spec.of(group)
    const sorted = [...values].sort((a, b) => b - a)
    const found = sorted.findIndex((v) => v <= value)
    return {
      key: spec.key,
      label: spec.label,
      value,
      best: sorted[0] ?? 0,
      median: median(values) ?? 0,
      rank: found === -1 ? sorted.length : found + 1,
      outOf: allGroups.length,
      format: spec.format,
      note: spec.note,
    }
  })
}
