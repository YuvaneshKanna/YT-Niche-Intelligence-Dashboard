// Types for the channel ranking that drives the Page 1 sidebar order.
//
// There are exactly TWO pools: long-form and Shorts. A channel is ranked only
// against others of its own kind, never across the two. There is deliberately
// no third "publishes both" pool — a channel that posts both still competes in
// one list, the one its Type field says it belongs to.
//
// Everything is percentile-based rather than absolute, because Shorts and
// long-form are not comparable on raw numbers: the median Shorts video in this
// roster has ~139K views against ~22K for the median long-form video, a 6.4x
// structural gap that says nothing about channel quality.
//
// ── Why the server scores every channel BOTH ways ──────────────────────────
//
// The pool a channel belongs to is decided by the `type` column of the Manual
// Sheet — the human's own call, and the same field the sidebar's Type filter
// reads. The ranking API has no access to that column: it reads Neon, which
// carries no `type`.
//
// Rather than guess the pool from measured video counts and risk disagreeing
// with the sheet, the server scores every channel against BOTH cohorts and
// returns both results. The client then picks the one matching that channel's
// sheet Type and ranks within it. Because ranking and filtering then read the
// exact same field, filtering the sidebar to one Type always yields a
// contiguous 1, 2, 3 — which guessing from measured counts could not promise.

/** The two pools. */
export type FormatClass = "LONG_FORM" | "SHORTS"

/**
 * The measured long-form/Shorts mix of a channel's tracked uploads.
 *
 * Reported for transparency — it is what the hover card shows, and it is how
 * the two scoring cohorts are built — but it does NOT decide which pool a
 * channel is ranked in. The sheet's Type field decides that.
 */
export interface FormatSplit {
  longFormVideos: number
  shortsVideos: number
  /** Long-form share of tracked videos, 0-1. */
  videoShare: number | null
  /** Long-form share of tracked views, 0-1. Structurally biased between formats; shown, not used. */
  viewShare: number | null
  /** Which cohort the measurements put this channel in, for the "measured vs labelled" hint. */
  measuredClass: FormatClass
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
  /** 0-100 percentile within the cohort. Null when the input was missing. */
  score: number | null
  weight: number
  /** Human-readable raw value behind the percentile. */
  displayValue: string
  note: string
}

export type ConfidenceLevel = "high" | "medium" | "low"

/** One channel's result against ONE cohort. Every channel gets one of these per pool. */
export interface CohortScore {
  formatClass: FormatClass
  /** 0-100 percentile within this cohort, after the confidence damp. */
  channelScore: number
  /** Before damping — explains why a thin channel sits near 50. */
  channelScoreRaw: number
  components: ScoreComponent[]
  /** This channel's niche, scored within this same cohort. */
  nicheScore: number | null
  /** COMBINED_WEIGHTS applied. What the pool sorts on. */
  combinedScore: number
}

export interface ChannelScore {
  channelId: string
  handle: string
  niche: string

  formatSplit: FormatSplit
  /** Result if this channel is ranked as long-form. */
  asLongForm: CohortScore
  /** Result if this channel is ranked as Shorts. */
  asShorts: CohortScore

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
   * Niche scores are per-pool for the same reason channel scores are: 9 of the
   * 23 niches contain both kinds of channel, and several are lopsided — Sports
   * is 25 Shorts to 3 long-form. A single blended Sports score would be set
   * almost entirely by Shorts velocity and then handed to the long-form Sports
   * channels as if it described their market.
   */
  formatClass: FormatClass
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
 * identical for every channel in that niche and pool, so it cannot separate
 * channels within a niche — it can only move whole niches as blocks. Push it
 * much above 0.25 and the sidebar stops being a channel ranking and becomes a
 * niche ranking with channels nested inside it.
 */
export const COMBINED_WEIGHTS = { channel: 0.75, niche: 0.25 } as const

/**
 * Long-form share of tracked videos above which a channel's MEASUREMENTS are
 * counted into the long-form cohort. This shapes the two percentile
 * distributions only — it never decides which pool a channel is ranked in.
 */
export const MEASURED_LONG_FORM_MIN_SHARE = 0.5

/** Below this many lifetime videos a channel's score is shrunk toward neutral. */
export const MIN_VIDEOS_FOR_FULL_CONFIDENCE = 10

/** Below this many snapshot days a channel's score is shrunk toward neutral. */
export const MIN_DAYS_FOR_FULL_CONFIDENCE = 7

/** Neutral score that low-confidence channels are shrunk toward. */
export const NEUTRAL_SCORE = 50
