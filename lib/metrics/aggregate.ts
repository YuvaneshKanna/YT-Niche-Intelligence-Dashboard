import { profileForNiche } from "./niche-profiles"
import type {
  ChannelRollup,
  ChannelSnapshot,
  CompositeScore,
  Confidence,
  FormatMetrics,
  NicheGroupSummary,
  ScoreComponent,
  TrendPoint,
  VideoRollup,
  VideoSnapshot,
  VideoType,
} from "./types"

export const VIDEO_TYPES: VideoType[] = ["LONG_FORM", "SHORTS"]

export const UNGROUPED = "Overall"

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v))

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b)

const round = (v: number, dp = 2) => {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

function emptyFormatMetrics(videoType: VideoType): FormatMetrics {
  return {
    videoType,
    totalViews: 0,
    viewsPerDay: 0,
    velocityChangePct: null,
    videoCount: 0,
    outlierCount: 0,
    outlierRatePct: 0,
    engagementRatePct: 0,
    hitRatePct: 0,
    uploadsPerWeek: 0,
  }
}

function blankFormatRecord(): Record<VideoType, FormatMetrics> {
  return {
    LONG_FORM: emptyFormatMetrics("LONG_FORM"),
    SHORTS: emptyFormatMetrics("SHORTS"),
  }
}

/** A per-video, per-day view gain derived from consecutive snapshots. */
interface ViewDelta {
  videoId: string
  handle: string
  nicheGroup: string
  videoType: VideoType
  date: string
  gain: number
}

/**
 * Turns cumulative per-video view counts into day-over-day gains.
 *
 * Two realities are handled here:
 *  - A video's first snapshot has no predecessor, so it contributes no gain.
 *    Counting its lifetime views as a single-day gain would produce a huge
 *    false spike on whatever day tracking happened to start.
 *  - YouTube periodically corrects view counts downward, producing genuine
 *    negative deltas. Those are clamped to zero and counted as a warning
 *    rather than allowed to subtract from a group's daily total.
 */
export function computeViewDeltas(videos: VideoSnapshot[]): {
  deltas: ViewDelta[]
  negativeCorrections: number
} {
  const byVideo = new Map<string, VideoSnapshot[]>()
  for (const v of videos) {
    const list = byVideo.get(v.videoId)
    if (list) list.push(v)
    else byVideo.set(v.videoId, [v])
  }

  const deltas: ViewDelta[] = []
  let negativeCorrections = 0

  for (const snaps of byVideo.values()) {
    snaps.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
    for (let i = 1; i < snaps.length; i++) {
      const prev = snaps[i - 1]
      const cur = snaps[i]
      const raw = cur.views - prev.views
      if (raw < 0) negativeCorrections++
      deltas.push({
        videoId: cur.videoId,
        handle: cur.handle,
        nicheGroup: cur.nicheGroup,
        videoType: cur.videoType,
        date: cur.snapshotDate,
        gain: Math.max(0, raw),
      })
    }
  }

  return { deltas, negativeCorrections }
}

/**
 * Builds the trend series for one set of deltas, split by video type.
 *
 * `rosterChanged` flags days where the contributing channel set differs from
 * the previous day — on those days the delta is not a like-for-like comparison,
 * and the chart marks them so a roster change is never misread as a view spike.
 */
export function buildTrend(
  deltas: ViewDelta[],
  channelTotalsByDate: Map<string, number>,
  channelsByDate: Map<string, Set<string>>,
  /** Dates on or after this keep full per-video coverage; earlier ones are thinned. */
  fullCoverageFrom: string
): TrendPoint[] {
  const byDate = new Map<string, { shorts: number; long: number }>()

  for (const d of deltas) {
    let bucket = byDate.get(d.date)
    if (!bucket) {
      bucket = { shorts: 0, long: 0 }
      byDate.set(d.date, bucket)
    }
    if (d.videoType === "SHORTS") bucket.shorts += d.gain
    else bucket.long += d.gain
  }

  const dates = [...new Set([...byDate.keys(), ...channelTotalsByDate.keys()])].sort()
  let prevRoster: Set<string> | null = null

  return dates.map((date) => {
    const bucket = byDate.get(date) ?? { shorts: 0, long: 0 }
    const roster = channelsByDate.get(date) ?? new Set<string>()
    const changed =
      prevRoster !== null &&
      (roster.size !== prevRoster.size || [...roster].some((h) => !prevRoster!.has(h)))
    prevRoster = roster

    return {
      date,
      totalViews: Math.round(channelTotalsByDate.get(date) ?? 0),
      shortsViews: Math.round(bucket.shorts),
      longFormViews: Math.round(bucket.long),
      splitIsPartial: date < fullCoverageFrom,
      channelCount: roster.size,
      rosterChanged: changed,
    }
  })
}

/**
 * Daily total-view gains per channel, derived from Sheet4's cumulative counts.
 * This is the complete view signal — every video on the channel, not just the
 * ones Stage 2 fetched — so it drives the trend chart's headline line.
 */
export function channelTotalDeltasByDate(
  snapshots: ChannelSnapshot[]
): { byDate: Map<string, number>; negativeCorrections: number } {
  const byHandle = new Map<string, ChannelSnapshot[]>()
  for (const c of snapshots) {
    const list = byHandle.get(c.handle)
    if (list) list.push(c)
    else byHandle.set(c.handle, [c])
  }

  const byDate = new Map<string, number>()
  let negativeCorrections = 0

  for (const snaps of byHandle.values()) {
    snaps.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
    for (let i = 1; i < snaps.length; i++) {
      const raw = snaps[i].totalViews - snaps[i - 1].totalViews
      if (raw < 0) negativeCorrections++
      const date = snaps[i].snapshotDate
      byDate.set(date, (byDate.get(date) ?? 0) + Math.max(0, raw))
    }
  }

  return { byDate, negativeCorrections }
}

/** Percent change between the first and second half of a series. */
function halfOverHalfChange(values: number[]): number | null {
  if (values.length < 4) return null
  const mid = Math.floor(values.length / 2)
  const first = values.slice(0, mid)
  const second = values.slice(mid)
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const a = avg(first)
  const b = avg(second)
  if (a === 0) return b > 0 ? 100 : null
  return round(((b - a) / a) * 100, 1)
}

interface FormatInput {
  deltas: ViewDelta[]
  videos: VideoSnapshot[]
  days: number
  /** Mean views per video for the owning channel, used for hit rate. */
  channelMeanViews: Map<string, number>
}

function computeFormatMetrics(videoType: VideoType, input: FormatInput): FormatMetrics {
  const { deltas, videos, days, channelMeanViews } = input

  const typeDeltas = deltas.filter((d) => d.videoType === videoType)
  const typeVideos = videos.filter((v) => v.videoType === videoType)

  const totalViews = typeDeltas.reduce((s, d) => s + d.gain, 0)

  // Latest snapshot per video — the current state of each distinct video.
  const latest = new Map<string, VideoSnapshot>()
  for (const v of typeVideos) {
    const prev = latest.get(v.videoId)
    if (!prev || v.snapshotDate > prev.snapshotDate) latest.set(v.videoId, v)
  }
  const distinct = [...latest.values()]

  const byDate = new Map<string, number>()
  for (const d of typeDeltas) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.gain)
  const series = [...byDate.keys()].sort().map((k) => byDate.get(k)!)

  const outlierCount = distinct.filter((v) => v.recordType === "OUTLIER").length

  const totalEngagements = distinct.reduce((s, v) => s + v.likes + v.comments, 0)
  const totalDistinctViews = distinct.reduce((s, v) => s + v.views, 0)

  const hits = distinct.filter((v) => {
    const mean = channelMeanViews.get(`${v.handle}::${videoType}`)
    return mean !== undefined && mean > 0 && v.views > mean
  }).length

  // Uploads published inside the window, annualised to a weekly rate.
  const windowStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const publishedInWindow = distinct.filter((v) => v.publishedAt && v.publishedAt >= windowStart)

  return {
    videoType,
    totalViews: Math.round(totalViews),
    viewsPerDay: Math.round(safeDiv(totalViews, Math.max(1, days))),
    velocityChangePct: halfOverHalfChange(series),
    videoCount: distinct.length,
    outlierCount,
    outlierRatePct: round(safeDiv(outlierCount, distinct.length) * 100, 1),
    engagementRatePct: round(safeDiv(totalEngagements, totalDistinctViews) * 100, 2),
    hitRatePct: round(safeDiv(hits, distinct.length) * 100, 1),
    uploadsPerWeek: round(safeDiv(publishedInWindow.length, Math.max(1, days)) * 7, 2),
  }
}

/** Mean views per video, keyed `handle::videoType`, used as the hit-rate baseline. */
function channelMeanViewsByFormat(videos: VideoSnapshot[]): Map<string, number> {
  const latest = new Map<string, VideoSnapshot>()
  for (const v of videos) {
    const prev = latest.get(v.videoId)
    if (!prev || v.snapshotDate > prev.snapshotDate) latest.set(v.videoId, v)
  }

  const sums = new Map<string, { total: number; count: number }>()
  for (const v of latest.values()) {
    const key = `${v.handle}::${v.videoType}`
    const entry = sums.get(key) ?? { total: 0, count: 0 }
    entry.total += v.views
    entry.count += 1
    sums.set(key, entry)
  }

  const means = new Map<string, number>()
  for (const [key, { total, count }] of sums) means.set(key, safeDiv(total, count))
  return means
}

/**
 * Herfindahl-Hirschman Index over channel view share, 0-10000.
 * 10000 = a single channel owns the entire niche group.
 * Below ~1500 the niche is fragmented, which usually means it is enterable.
 */
export function computeHhi(shares: number[]): number {
  const total = shares.reduce((s, v) => s + v, 0)
  if (total <= 0) return 0
  return Math.round(shares.reduce((s, v) => s + (safeDiv(v, total) * 100) ** 2, 0))
}

// ── Scoring ────────────────────────────────────────────────────────────────
//
// Components are normalised against fixed absolute anchors rather than
// percentiles across groups. With only a handful of niche groups, percentile
// ranking is unstable — adding one group would move every other group's score
// without anything about them having changed. Absolute anchors keep a score
// comparable to itself over time, which is what a trend view needs.

const logScore = (value: number, ceiling: number) =>
  clamp((Math.log10(Math.max(0, value) + 1) / Math.log10(ceiling)) * 100)

const linScore = (value: number, ceiling: number) => clamp(safeDiv(value, ceiling) * 100)

const fmtNum = (n: number): string => {
  if (n >= 1_000_000_000) return `${round(n / 1_000_000_000, 1)}B`
  if (n >= 1_000_000) return `${round(n / 1_000_000, 1)}M`
  if (n >= 1_000) return `${round(n / 1_000, 1)}K`
  return String(Math.round(n))
}

function weighted(components: ScoreComponent[], weights: Record<string, number>): number {
  let total = 0
  let weightSum = 0
  for (const c of components) {
    const w = weights[c.key] ?? 0
    total += c.score * w
    weightSum += w
  }
  return Math.round(safeDiv(total, weightSum))
}

const MOMENTUM_WEIGHTS: Record<string, number> = {
  velocity: 30,
  acceleration: 25,
  outlierRate: 20,
  hitRate: 15,
  engagement: 10,
}

const OPPORTUNITY_WEIGHTS: Record<string, number> = {
  rpm: 30,
  audience: 20,
  openness: 20,
  aiRisk: 20,
  authenticity: 10,
}

function buildMomentum(
  byFormat: Record<VideoType, FormatMetrics>,
  confidence: Confidence,
  confidenceReason: string
): CompositeScore {
  // Momentum blends both formats: a group strong in either is in motion.
  const combinedVpd = byFormat.LONG_FORM.viewsPerDay + byFormat.SHORTS.viewsPerDay

  const accelValues = VIDEO_TYPES.map((t) => byFormat[t].velocityChangePct).filter(
    (v): v is number => v !== null
  )
  const accel = accelValues.length
    ? accelValues.reduce((s, v) => s + v, 0) / accelValues.length
    : null

  const weightedByViews = (pick: (m: FormatMetrics) => number) => {
    const lw = byFormat.LONG_FORM.totalViews
    const sw = byFormat.SHORTS.totalViews
    const total = lw + sw
    if (total === 0) return 0
    return (pick(byFormat.LONG_FORM) * lw + pick(byFormat.SHORTS) * sw) / total
  }

  const outlierRate = weightedByViews((m) => m.outlierRatePct)
  const hitRate = weightedByViews((m) => m.hitRatePct)
  const engagement = weightedByViews((m) => m.engagementRatePct)

  const components: ScoreComponent[] = [
    {
      key: "velocity",
      label: "View velocity",
      score: logScore(combinedVpd, 10_000_000),
      displayValue: `${fmtNum(combinedVpd)}/day`,
      source: "measured",
      note: "Mean daily views gained across the window, both formats.",
    },
    {
      key: "acceleration",
      label: "Acceleration",
      score: accel === null ? 50 : clamp(50 + accel, 0, 100),
      displayValue: accel === null ? "not enough history" : `${accel > 0 ? "+" : ""}${round(accel, 1)}%`,
      source: "measured",
      note: "Change in daily views, second half of window vs first. 50 = flat.",
    },
    {
      key: "outlierRate",
      label: "Outlier rate",
      score: linScore(outlierRate, 25),
      displayValue: `${round(outlierRate, 1)}%`,
      source: "measured",
      note: "Share of tracked videos scoring as outliers. 25%+ is exceptional.",
    },
    {
      key: "hitRate",
      label: "Hit rate",
      score: linScore(hitRate, 60),
      displayValue: `${round(hitRate, 1)}%`,
      source: "measured",
      note: "Videos beating their own channel's mean. Separates consistency from one lucky viral.",
    },
    {
      key: "engagement",
      label: "Engagement",
      score: linScore(engagement, 8),
      displayValue: `${round(engagement, 2)}%`,
      source: "measured",
      note: "(likes + comments) / views.",
    },
  ]

  return {
    score: weighted(components, MOMENTUM_WEIGHTS),
    components,
    confidence,
    confidenceReason,
  }
}

function buildOpportunity(
  niche: string,
  hhi: number,
  nexlevRpm: number | null,
  confidence: Confidence,
  confidenceReason: string
): CompositeScore {
  const { profile, matched } = profileForNiche(niche)

  const rpm = nexlevRpm ?? profile.rpmUsd
  const rpmSource: ScoreComponent["source"] = nexlevRpm !== null ? "nexlev" : "estimate"

  const aiRiskScore = profile.aiRisk === "low" ? 90 : profile.aiRisk === "medium" ? 55 : 20

  const components: ScoreComponent[] = [
    {
      key: "rpm",
      label: "RPM",
      score: linScore(rpm, 20),
      displayValue: `$${round(rpm, 2)}`,
      source: rpmSource,
      note:
        rpmSource === "nexlev"
          ? "Category RPM from NexLev."
          : "Estimated niche RPM — edit in lib/metrics/niche-profiles.ts.",
    },
    {
      key: "audience",
      label: "Addressable audience",
      score: profile.addressableAudience,
      displayValue: `${profile.addressableAudience}/100`,
      source: "estimate",
      note: `Relative audience size. Skews ${profile.ageBand}, ${profile.maleSkewPct}% male${
        profile.geoSkew.length ? `, strongest in ${profile.geoSkew.join(", ")}` : ""
      }. Not measurable from the YouTube API.`,
    },
    {
      key: "openness",
      label: "Openness",
      score: clamp(100 - linScore(hhi, 10_000)),
      displayValue: `HHI ${hhi}`,
      source: "measured",
      note: "Inverse of channel concentration. High = fragmented and enterable; low = one channel dominates.",
    },
    {
      key: "aiRisk",
      label: "AI resilience",
      score: aiRiskScore,
      displayValue: `${profile.aiRisk} risk`,
      source: "estimate",
      note: `How easily generative AI replicates this format. ${profile.notes}`,
    },
    {
      key: "authenticity",
      label: "Authenticity",
      score: clamp(100 - profile.inauthenticityPct),
      displayValue: `${100 - profile.inauthenticityPct}/100`,
      source: "estimate",
      note: "Inverse of estimated content-farm prevalence in this niche.",
    },
  ]

  const reason = matched
    ? confidenceReason
    : `${confidenceReason} No niche profile matched "${niche}" — platform-median assumptions used.`

  return {
    score: weighted(components, OPPORTUNITY_WEIGHTS),
    components,
    confidence: matched ? confidence : "low",
    confidenceReason: reason,
  }
}

function assessConfidence(
  coverageDays: number,
  requestedDays: number,
  channelCount: number
): { confidence: Confidence; reason: string } {
  const reasons: string[] = []
  let confidence: Confidence = "high"

  if (coverageDays < requestedDays) {
    reasons.push(`only ${coverageDays} of ${requestedDays} days have data`)
    confidence = coverageDays < requestedDays / 2 ? "low" : "medium"
  }
  if (channelCount < 3) {
    reasons.push(`${channelCount} channel${channelCount === 1 ? "" : "s"} in group`)
    confidence = "low"
  } else if (channelCount < 6 && confidence === "high") {
    confidence = "medium"
    reasons.push(`${channelCount} channels in group`)
  }

  return {
    confidence,
    reason: reasons.length ? `Based on ${reasons.join("; ")}.` : "Full window, healthy sample.",
  }
}

// ── Top-level aggregation ──────────────────────────────────────────────────

export interface AggregateInput {
  channelSnapshots: ChannelSnapshot[]
  videoSnapshots: VideoSnapshot[]
  requestedDays: number
  /** Optional NexLev RPM per niche, keyed lowercase. */
  nexlevRpmByNiche?: Map<string, number>
}

export interface AggregateResult {
  groups: NicheGroupSummary[]
  channels: ChannelRollup[]
  videos: VideoRollup[]
  coverageStart: string | null
  coverageEnd: string | null
  coverageDays: number
  warnings: string[]
}

export function aggregate(input: AggregateInput): AggregateResult {
  const { channelSnapshots, videoSnapshots, requestedDays, nexlevRpmByNiche } = input
  const warnings: string[] = []

  const allDates = [
    ...new Set([
      ...channelSnapshots.map((c) => c.snapshotDate),
      ...videoSnapshots.map((v) => v.snapshotDate),
    ]),
  ]
    .filter(Boolean)
    .sort()

  const coverageStart = allDates[0] ?? null
  const coverageEnd = allDates[allDates.length - 1] ?? null
  const coverageDays = allDates.length

  if (coverageDays === 0) {
    return {
      groups: [],
      channels: [],
      videos: [],
      coverageStart: null,
      coverageEnd: null,
      coverageDays: 0,
      warnings: ["No snapshot rows found in the requested window."],
    }
  }
  if (coverageDays < requestedDays) {
    warnings.push(
      `Only ${coverageDays} day${coverageDays === 1 ? "" : "s"} of data available; ` +
        `requested ${requestedDays}. Charts show the real coverage, not the requested range.`
    )
  }

  const { deltas, negativeCorrections } = computeViewDeltas(videoSnapshots)
  if (negativeCorrections > 0) {
    warnings.push(
      `${negativeCorrections} negative view delta${negativeCorrections === 1 ? "" : "s"} ` +
        "clamped to zero (YouTube view-count corrections)."
    )
  }

  // Per-video HISTORICAL rows are deleted after 7 days by Stage 2 maintenance,
  // so the Shorts/long-form split is only complete for the recent tail. Dates
  // before this cutoff are flagged partial rather than silently under-reported.
  const HISTORICAL_RETENTION_DAYS = 7
  const fullCoverageFrom = new Date(Date.now() - HISTORICAL_RETENTION_DAYS * 86400000)
    .toISOString()
    .slice(0, 10)

  if (requestedDays > HISTORICAL_RETENTION_DAYS) {
    warnings.push(
      `Shorts/long-form split is complete only for the last ${HISTORICAL_RETENTION_DAYS} days. ` +
        "Earlier dates retain outlier and recent-upload videos only, because Stage 2 " +
        "maintenance deletes HISTORICAL video rows after 7 days. The total-views line " +
        "is unaffected and complete for the full window."
    )
  }

  // Channels present on each date, so the trend can flag roster changes.
  const channelsByDate = new Map<string, Set<string>>()
  for (const c of channelSnapshots) {
    const set = channelsByDate.get(c.snapshotDate) ?? new Set<string>()
    set.add(c.handle)
    channelsByDate.set(c.snapshotDate, set)
  }

  const meanViews = channelMeanViewsByFormat(videoSnapshots)

  // ── Channel rollups from Sheet4 (complete cumulative counts) ──
  const byHandle = new Map<string, ChannelSnapshot[]>()
  for (const c of channelSnapshots) {
    const list = byHandle.get(c.handle)
    if (list) list.push(c)
    else byHandle.set(c.handle, [c])
  }

  const channelDeltaByHandle = new Map<string, number>()
  const channels: ChannelRollup[] = []

  for (const [handle, snaps] of byHandle) {
    snaps.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
    const first = snaps[0]
    const last = snaps[snaps.length - 1]

    // A single snapshot yields no delta — treat as zero rather than inventing
    // a gain equal to the channel's lifetime views.
    const viewsDelta = snaps.length > 1 ? Math.max(0, last.totalViews - first.totalViews) : 0
    const subsDelta = snaps.length > 1 ? last.subscribers - first.subscribers : 0

    channelDeltaByHandle.set(handle, viewsDelta)

    const chanVideos = videoSnapshots.filter((v) => v.handle === handle)
    const chanDeltas = deltas.filter((d) => d.handle === handle)

    const byFormat = blankFormatRecord()
    for (const t of VIDEO_TYPES) {
      byFormat[t] = computeFormatMetrics(t, {
        deltas: chanDeltas,
        videos: chanVideos,
        days: Math.max(1, snaps.length - 1),
        channelMeanViews: meanViews,
      })
    }

    // This channel's own daily trend, for the group→channel comparison chart.
    // Reuses buildTrend with a single-channel roster map, so "roster changed"
    // never fires here — that flag only means something when several
    // channels are being summed together.
    const chanDatesMap = new Map<string, Set<string>>()
    for (const s of snaps) chanDatesMap.set(s.snapshotDate, new Set([handle]))
    const { byDate: chanTotalsByDate } = channelTotalDeltasByDate(snaps)

    channels.push({
      handle,
      channelId: last.channelId,
      nicheGroup: last.nicheGroup || UNGROUPED,
      niche: last.niche,
      category: last.category,
      format: last.format,
      producedBy: last.producedBy,
      country: last.country,
      subscribers: last.subscribers,
      subscriberDelta: subsDelta,
      totalViewsDelta: viewsDelta,
      dominancePct: 0, // filled once group totals are known
      byFormat,
      coverageDays: snaps.length,
      trend: buildTrend(chanDeltas, chanTotalsByDate, chanDatesMap, fullCoverageFrom),
    })
  }

  // ── Group rollups ──
  const groupNames = [...new Set(channels.map((c) => c.nicheGroup))].sort()
  const groups: NicheGroupSummary[] = []

  for (const name of groupNames) {
    const groupChannels = channels.filter((c) => c.nicheGroup === name)
    const handles = new Set(groupChannels.map((c) => c.handle))

    const groupDeltas = deltas.filter((d) => handles.has(d.handle))
    const groupVideos = videoSnapshots.filter((v) => handles.has(v.handle))

    const totalViewsDelta = groupChannels.reduce((s, c) => s + c.totalViewsDelta, 0)

    // Channel dominance uses Sheet4 deltas — the complete view count, not just
    // the subset of videos Stage 2 happened to fetch.
    for (const c of groupChannels) {
      c.dominancePct = round(safeDiv(c.totalViewsDelta, totalViewsDelta) * 100, 2)
    }

    const byFormat = blankFormatRecord()
    for (const t of VIDEO_TYPES) {
      byFormat[t] = computeFormatMetrics(t, {
        deltas: groupDeltas,
        videos: groupVideos,
        days: coverageDays,
        channelMeanViews: meanViews,
      })
    }

    const hhi = computeHhi(groupChannels.map((c) => c.totalViewsDelta))

    const groupDates = new Map<string, Set<string>>()
    for (const [date, set] of channelsByDate) {
      groupDates.set(date, new Set([...set].filter((h) => handles.has(h))))
    }

    const groupSnapshots = channelSnapshots.filter((c) => handles.has(c.handle))
    const { byDate: groupTotalsByDate } = channelTotalDeltasByDate(groupSnapshots)

    // Most common niche in the group drives the opportunity-score lookup.
    const nicheCounts = new Map<string, number>()
    for (const c of groupChannels) {
      if (c.niche) nicheCounts.set(c.niche, (nicheCounts.get(c.niche) ?? 0) + 1)
    }
    const primaryNiche =
      [...nicheCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""

    const { confidence, reason } = assessConfidence(
      coverageDays,
      requestedDays,
      groupChannels.length
    )

    const nexlevRpm = nexlevRpmByNiche?.get(primaryNiche.toLowerCase()) ?? null

    groups.push({
      nicheGroup: name,
      channelCount: groupChannels.length,
      primaryNiche,
      totalViewsDelta,
      subscriberDelta: groupChannels.reduce((s, c) => s + c.subscriberDelta, 0),
      byFormat,
      concentrationHhi: hhi,
      trend: buildTrend(groupDeltas, groupTotalsByDate, groupDates, fullCoverageFrom),
      momentum: buildMomentum(byFormat, confidence, reason),
      opportunity: buildOpportunity(primaryNiche, hhi, nexlevRpm, confidence, reason),
    })
  }

  // ── Video rollups ──
  const latestByVideo = new Map<string, VideoSnapshot>()
  const firstByVideo = new Map<string, VideoSnapshot>()
  for (const v of videoSnapshots) {
    const prevLatest = latestByVideo.get(v.videoId)
    if (!prevLatest || v.snapshotDate > prevLatest.snapshotDate) latestByVideo.set(v.videoId, v)
    const prevFirst = firstByVideo.get(v.videoId)
    if (!prevFirst || v.snapshotDate < prevFirst.snapshotDate) firstByVideo.set(v.videoId, v)
  }

  // In-window gain per video, and per group, for video-level dominance.
  const gainByVideo = new Map<string, number>()
  for (const d of deltas) gainByVideo.set(d.videoId, (gainByVideo.get(d.videoId) ?? 0) + d.gain)

  const groupGain = new Map<string, number>()
  for (const d of deltas) {
    const g = d.nicheGroup || UNGROUPED
    groupGain.set(g, (groupGain.get(g) ?? 0) + d.gain)
  }

  const videos: VideoRollup[] = []
  for (const [videoId, last] of latestByVideo) {
    const first = firstByVideo.get(videoId)!
    const observedDays = Math.max(
      0,
      Math.round(
        (new Date(last.snapshotDate).getTime() - new Date(first.snapshotDate).getTime()) / 86400000
      )
    )
    const gain = gainByVideo.get(videoId) ?? 0
    const vpd = observedDays > 0 ? Math.round(gain / observedDays) : null

    // Acceleration: compare the video's own daily gains, early vs late.
    const vidDeltas = deltas
      .filter((d) => d.videoId === videoId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => d.gain)
    const accel = halfOverHalfChange(vidDeltas)

    const groupKey = last.nicheGroup || UNGROUPED
    const groupTotal = groupGain.get(groupKey) ?? 0

    videos.push({
      videoId,
      videoUrl: last.videoUrl,
      title: last.title,
      handle: last.handle,
      thumbnailUrl: last.thumbnailUrl,
      videoType: last.videoType,
      publishedAt: last.publishedAt,
      durationHms: last.durationHms,
      views: last.views,
      likes: last.likes,
      comments: last.comments,
      outlierScore: last.outlierScore,
      outlierReason: last.outlierReason,
      outlierAgeTag: last.outlierAgeTag,
      viewsPerDay: vpd,
      vpdAccelerationPct: accel,
      dominancePct: round(safeDiv(gain, groupTotal) * 100, 2),
      engagementRatePct: round(safeDiv(last.likes + last.comments, last.views) * 100, 2),
      daysObserved: observedDays,
    })
  }

  videos.sort((a, b) => (b.viewsPerDay ?? 0) - (a.viewsPerDay ?? 0))

  return { groups, channels, videos, coverageStart, coverageEnd, coverageDays, warnings }
}
