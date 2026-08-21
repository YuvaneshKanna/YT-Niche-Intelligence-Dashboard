// Shared types for the Niche Breakdown page (Stage 2 data).
//
// Column names mirror the n8n Stage 2 writers exactly — see
// `Sheet4_Daily_Channel_Snapshot` and `All_Video_Snapshots` in the
// YT Channel Metrics spreadsheet. Do not rename without changing the readers.

export type VideoType = "SHORTS" | "LONG_FORM"

export type RecordType = "OUTLIER" | "RECENT_UPLOAD" | "HISTORICAL"

export type RangeKey = "7d" | "14d" | "30d" | "90d" | "180d"

export const RANGE_DAYS: Record<RangeKey, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
  "180d": 180,
}

/** One row of `Sheet4_Daily_Channel_Snapshot` — one channel, one day. */
export interface ChannelSnapshot {
  rowKey: string
  snapshotDate: string
  handle: string
  channelId: string
  subscribers: number
  totalViews: number
  totalVideos: number
  country: string
  fetchedAt: string
  producedBy: string
  niche: string
  category: string
  format: string
  nicheGroup: string
}

/** One row of `All_Video_Snapshots` — one video, one day. */
export interface VideoSnapshot {
  rowKey: string
  snapshotDate: string
  recordType: RecordType
  handle: string
  channelId: string
  videoId: string
  videoUrl: string
  title: string
  publishedAt: string
  durationHms: string
  thumbnailUrl: string
  videoType: VideoType
  views: number
  likes: number
  comments: number
  outlierScore: number
  outlierReason: string
  outlierAgeTag: string
  producedBy: string
  niche: string
  category: string
  format: string
  nicheGroup: string
}

/**
 * A single point on the views trend chart. Shorts and long-form never merge.
 *
 * Two sources feed this, deliberately:
 *  - `totalViews` comes from Sheet4 channel-level cumulative counts. Complete
 *    and unbiased for the full 90-day retention, but cannot be split by format.
 *  - `shortsViews` / `longFormViews` come from per-video snapshots, which CAN
 *    be split by format but thin out with age: `HISTORICAL` video rows are
 *    deleted after 7 days, so beyond that only outliers and recent uploads
 *    survive. The split is therefore complete for the last ~7 days and a
 *    partial (outlier-weighted) sample before that.
 *
 * The UI must not present the split as the whole picture beyond 7 days.
 */
export interface TrendPoint {
  date: string
  /** Complete daily view delta from Sheet4, all formats. */
  totalViews: number
  /** Daily view delta attributable to SHORTS, tracked videos only. */
  shortsViews: number
  /** Daily view delta attributable to LONG_FORM, tracked videos only. */
  longFormViews: number
  /** True when video-level coverage for this date is thinned by retention. */
  splitIsPartial: boolean
  /** Channels contributing on this date — lets the UI flag roster changes. */
  channelCount: number
  /** True when the roster changed vs the previous day (delta is not like-for-like). */
  rosterChanged: boolean
}

/** Per-format metrics. Every aggregate carries one of these per video type. */
export interface FormatMetrics {
  videoType: VideoType
  totalViews: number
  /** Mean views added per day across the window. */
  viewsPerDay: number
  /** Percent change of viewsPerDay, first half of window vs second half. */
  velocityChangePct: number | null
  videoCount: number
  outlierCount: number
  /** Share of videos scored as OUTLIER. */
  outlierRatePct: number
  /** (likes + comments) / views, as a percentage. */
  engagementRatePct: number
  /** Share of videos beating their channel's own mean views. */
  hitRatePct: number
  uploadsPerWeek: number
}

export interface ChannelRollup {
  handle: string
  channelId: string
  nicheGroup: string
  niche: string
  category: string
  format: string
  producedBy: string
  country: string
  subscribers: number
  /** Subscribers gained across the window. */
  subscriberDelta: number
  totalViewsDelta: number
  /** This channel's share of its niche group's view delta, as a percentage. */
  dominancePct: number
  byFormat: Record<VideoType, FormatMetrics>
  /** Days of snapshot coverage actually present for this channel. */
  coverageDays: number
  /** This channel's own daily views trend, for the channel-comparison chart. */
  trend: TrendPoint[]
}

export interface VideoRollup {
  videoId: string
  videoUrl: string
  title: string
  handle: string
  thumbnailUrl: string
  videoType: VideoType
  publishedAt: string
  durationHms: string
  views: number
  likes: number
  comments: number
  outlierScore: number
  outlierReason: string
  outlierAgeTag: string
  /** Mean views added per day while observed. Null when only one snapshot exists. */
  viewsPerDay: number | null
  /** Change in viewsPerDay across the observed window — catches acceleration. */
  vpdAccelerationPct: number | null
  /** This video's share of its niche group's views in-window, as a percentage. */
  dominancePct: number
  engagementRatePct: number
  daysObserved: number
}

/** One component of a composite score, with its provenance. */
export interface ScoreComponent {
  key: string
  label: string
  /** 0-100 normalised contribution. */
  score: number
  /** Human-readable raw value, e.g. "$13.00" or "1.2M/day". */
  displayValue: string
  source: "measured" | "nexlev" | "estimate"
  /** Why this value is what it is — shown in the hover card. */
  note?: string
}

export type Confidence = "high" | "medium" | "low"

export interface CompositeScore {
  /** 0-100. */
  score: number
  components: ScoreComponent[]
  confidence: Confidence
  confidenceReason: string
}

export interface NicheGroupSummary {
  nicheGroup: string
  channelCount: number
  /** Dominant niche label across the group's channels, for scoring lookup. */
  primaryNiche: string
  totalViewsDelta: number
  subscriberDelta: number
  byFormat: Record<VideoType, FormatMetrics>
  /** Herfindahl-Hirschman Index of channel view share, 0-10000. */
  concentrationHhi: number
  trend: TrendPoint[]
  momentum: CompositeScore
  opportunity: CompositeScore
}

export interface MetricsPayload {
  range: RangeKey
  /** Earliest snapshot date present in the data for this range. */
  coverageStart: string | null
  coverageEnd: string | null
  /** Days of data actually available — may be fewer than the range asks for. */
  coverageDays: number
  requestedDays: number
  groups: NicheGroupSummary[]
  channels: ChannelRollup[]
  videos: VideoRollup[]
  generatedAt: string
  warnings: string[]
}
