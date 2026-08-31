// Types for the channel ranking that drives the Page 1 sidebar order.
//
// Two scores per channel, both 0-100:
//   Channel Score — how this channel performs against its OWN format cohort.
//   Niche Score   — how this channel's niche performs against other niches.
// Combined = COMBINED_WEIGHTS.channel * channel + COMBINED_WEIGHTS.niche * niche.
//
// Everything is percentile-based rather than absolute, because Shorts and
// long-form are not comparable on raw numbers: the median Shorts video in this
// roster has ~139K views against ~22K for the median long-form video, a 6.4x
// structural gap that says nothing about channel quality. Scoring each channel
// against its own cohort and reporting the percentile puts all three classes
// back on one comparable 0-100 scale, so a single sorted list is still valid.

/** Which cohort a channel is scored against. */
export type FormatClass = "LONG_FORM" | "SHORTS" | "BOTH"

/**
 * How a channel was placed into its format class.
 *
 * Classification uses the share of the channel's videos that are long-form,
 * NOT the share of views. View share is structurally biased between the two
 * formats (see above) and the two disagree for 15 of 189 channels in this
 * roster — one channel is 9% long-form by video count but 89% by views.
 * Video count reflects what the channel actually publishes; view share only
 * reflects which format YouTube's surfaces happened to reward.
 *
 * View share is still used, but only inside a BOTH channel, to weight its two
 * cohort scores against each other. That is a within-channel comparison, where
 * the cross-format bias cancels out.
 */
export interface FormatSplit {
  formatClass: FormatClass
  longFormVideos: number
  shortsVideos: number
  /** Long-form share of tracked videos, 0-1. Drives the classification. */
  videoShare: number | null
  /** Long-form share of tracked views, 0-1. Reported for transparency; only used to blend BOTH. */
  viewShare: number | null
}

/** Raw per-channel measurements the scorer consumes. All nullable — data is incomplete by design. */
export interface ChannelMetricInput {
  channelId: string
  handle: string
  niche: string
  category: string
  nicheGroup: string
  producedBy: string

  /** Distinct snapshot days present for this channel inside the window. */
  coverageDays: number
  /** Views gained across the window, from channel-level snapshots. */
  viewsDelta: number
  /** Subscribers gained across the window. */
  subscriberDelta: number
  /** Subscribers at the start of the window — the base for relative growth. */
  subscribersAtStart: number
  subscribers: number
  /** Real lifetime video count from the channel snapshot, not the tracked sample. */
  totalVideos: number
  totalViews: number

  longFormVideos: number
  shortsVideos: number
  longFormViews: number
  shortsViews: number
  /** Videos of this channel with a snapshot inside the window. */
  trackedVideos: number
  /** Of those, how many carried a non-NORMAL outlier reason. */
  outlierVideos: number

  /** True channel creation date (YYYY-MM-DD) from the YouTube API. Null when unavailable. */
  createdAt: string | null
}

/** One weighted ingredient of the Channel Score, kept for the hover breakdown. */
export interface ScoreComponent {
  key: string
  label: string
  /** 0-100 percentile within the channel's cohort. Null when the input was missing. */
  score: number | null
  weight: number
  /** Human-readable raw value behind the percentile. */
  displayValue: string
  note: string
}

export type ConfidenceLevel = "high" | "medium" | "low"

export interface ChannelScore {
  channelId: string
  handle: string
  niche: string

  formatSplit: FormatSplit
  /** 0-100, percentile within cohort, after the confidence damp. */
  channelScore: number
  /** Before damping — useful for explaining why a thin channel scores near 50. */
  channelScoreRaw: number
  components: ScoreComponent[]

  nicheScore: number | null
  /** COMBINED_WEIGHTS applied. This is what the list sorts on. */
  combinedScore: number
  /**
   * 1-based position **within this channel's own format cohort**, not across
   * the whole roster. Long-form and Shorts each have their own #1; filtering
   * the sidebar to one format therefore yields a contiguous 1, 2, 3 sequence.
   */
  rank: number
  /** How many channels are in this channel's cohort — the "of N" for the rank. */
  cohortSize: number

  confidence: ConfidenceLevel
  confidenceReason: string

  createdAt: string | null
  channelAgeDays: number | null
  totalVideos: number
  coverageDays: number
}

export interface NicheScore {
  niche: string
  /**
   * Which cohort this niche score was computed within.
   *
   * Niche scores are per-format for the same reason channel scores are: 9 of
   * the 23 niches contain both long-form and Shorts channels, and some are
   * lopsided — Sports is 25 Shorts to 3 long-form. A single blended Sports
   * score would be set almost entirely by Shorts velocity and then handed to
   * the three long-form Sports channels as if it described their market.
   */
  formatClass: Exclude<FormatClass, "BOTH">
  channelCount: number
  score: number
  components: ScoreComponent[]
  confidence: ConfidenceLevel
}

export interface RankingPayload {
  /** Days requested — the window is a cap, not a promise. */
  requestedDays: number
  /** Distinct snapshot days actually present. Fewer than requested until history builds up. */
  coverageDays: number
  coverageStart: string | null
  coverageEnd: string | null
  channels: ChannelScore[]
  niches: NicheScore[]
  generatedAt: string
  warnings: string[]
}

/**
 * Channel vs Niche weighting for the sort key.
 *
 * The niche weight is deliberately the minority share. A Niche Score is
 * identical for every channel in that niche, so it cannot separate channels
 * within a niche — it can only move whole niches as blocks. Push it much above
 * 0.25 and the sidebar stops being a channel ranking and becomes a niche
 * ranking with channels nested inside it.
 */
export const COMBINED_WEIGHTS = { channel: 0.75, niche: 0.25 } as const

/**
 * Long-form video-share thresholds for the format class. Inside the band the
 * channel genuinely publishes both and is scored as BOTH.
 */
export const FORMAT_BANDS = { longFormMin: 0.65, shortsMax: 0.35 } as const

/** Below this many lifetime videos a channel's score is shrunk toward neutral. */
export const MIN_VIDEOS_FOR_FULL_CONFIDENCE = 10

/** Below this many snapshot days a channel's score is shrunk toward neutral. */
export const MIN_DAYS_FOR_FULL_CONFIDENCE = 7

/** Neutral score that low-confidence channels are shrunk toward. */
export const NEUTRAL_SCORE = 50
