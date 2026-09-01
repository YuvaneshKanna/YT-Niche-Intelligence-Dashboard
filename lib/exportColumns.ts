// Column catalogue for the Dashboard's master Excel export.
//
// One row = one roster channel. Four groups of columns, each pulling from a
// different data plane already loaded (or lazily loadable) on the page:
//   - roster/score: the sheet + the ranking already on screen, zero extra cost
//   - channelMetrics/groupSummary: the Niche Breakdown page's data, joined in
//     by handle / nicheGroup, fetched on demand — see ExportModal
//
// Video-level rows (VideoRollup) don't fit this one-row-per-channel shape, so
// they stay on the Metrics page's own export (see outlier-table.tsx) instead
// of being folded in here.

import type { Channel } from "@/lib/constants"
import type { RankedEntry } from "@/lib/useRankings"
import type { ChannelRollup, NicheGroupSummary, VideoType } from "@/lib/metrics/types"

export type ExportGroupKey = "roster" | "score" | "channelMetrics" | "groupSummary"

export interface ExportRowContext {
  channel: Channel
  ranked: RankedEntry | undefined
  rollup: ChannelRollup | undefined
  groupSummary: NicheGroupSummary | undefined
}

export interface ExportColumn {
  key: string
  label: string
  get: (ctx: ExportRowContext) => string | number | null
}

export interface ExportGroup {
  key: ExportGroupKey
  label: string
  hint: string
  /** True when this group's columns need the /api/metrics fetch to resolve. */
  needsMetrics: boolean
  /** Checked by default when the export modal opens. */
  defaultOn: boolean
  columns: ExportColumn[]
}

const byFormat = (rollup: ChannelRollup | undefined, type: VideoType) => rollup?.byFormat[type]

export const EXPORT_GROUPS: ExportGroup[] = [
  {
    key: "roster",
    label: "Roster / Audit",
    hint: "The sheet fields shown in the audit panel.",
    needsMetrics: false,
    defaultOn: true,
    columns: [
      { key: "handle", label: "Handle", get: (c) => c.channel.handle },
      { key: "fullName", label: "Channel Name", get: (c) => c.channel.fullName || "" },
      { key: "niche", label: "Niche", get: (c) => c.channel.niche },
      { key: "category", label: "Category", get: (c) => c.channel.category },
      { key: "format", label: "Format", get: (c) => c.channel.format },
      { key: "producedBy", label: "Produced By", get: (c) => c.channel.producedBy },
      { key: "nicheGroup", label: "Niche Group", get: (c) => c.channel.nicheGroup },
      { key: "type", label: "Type", get: (c) => c.channel.type },
      { key: "tracking", label: "Tracking", get: (c) => c.channel.tracking },
      { key: "verified", label: "Verified / Remarks", get: (c) => c.channel.verified || "" },
      { key: "sharedOn", label: "Shared On", get: (c) => c.channel.sharedOn },
      { key: "ytUrl", label: "YouTube URL", get: (c) => c.channel.ytUrl || "" },
      { key: "auditedBy", label: "Audited By", get: (c) => c.channel.auditedBy || "" },
      { key: "auditedAt", label: "Audited At", get: (c) => c.channel.auditedAt || "" },
    ],
  },
  {
    key: "score",
    label: "Score & Rank",
    hint: "The sidebar's ranking — same pool, cohort and confidence shown there.",
    needsMetrics: false,
    defaultOn: true,
    columns: [
      { key: "rank", label: "Rank", get: (c) => c.ranked?.rank ?? null },
      { key: "poolSize", label: "Pool Size", get: (c) => c.ranked?.poolSize ?? null },
      { key: "pool", label: "Pool", get: (c) => c.ranked?.pool ?? null },
      { key: "combinedScore", label: "Combined Score", get: (c) => c.ranked?.cohort.combinedScore ?? null },
      { key: "channelScore", label: "Channel Score", get: (c) => c.ranked?.cohort.channelScore ?? null },
      { key: "channelScoreRaw", label: "Channel Score (Raw)", get: (c) => c.ranked?.cohort.channelScoreRaw ?? null },
      { key: "nicheScore", label: "Niche Score", get: (c) => c.ranked?.cohort.nicheScore ?? null },
      { key: "confidence", label: "Confidence", get: (c) => c.ranked?.score.confidence ?? null },
      { key: "confidenceReason", label: "Confidence Reason", get: (c) => c.ranked?.score.confidenceReason ?? null },
      { key: "longFormVideosTracked", label: "Long-Form Videos (Tracked)", get: (c) => c.ranked?.score.formatSplit.longFormVideos ?? null },
      { key: "shortsVideosTracked", label: "Shorts Videos (Tracked)", get: (c) => c.ranked?.score.formatSplit.shortsVideos ?? null },
      { key: "videoShare", label: "Long-Form Video Share", get: (c) => c.ranked?.score.formatSplit.videoShare ?? null },
      { key: "viewShare", label: "Long-Form View Share", get: (c) => c.ranked?.score.formatSplit.viewShare ?? null },
      { key: "measuredClass", label: "Measured Format", get: (c) => c.ranked?.score.formatSplit.measuredClass ?? null },
      { key: "totalVideosLifetime", label: "Total Videos (Lifetime)", get: (c) => c.ranked?.score.totalVideos ?? null },
      { key: "channelAgeDaysScore", label: "Channel Age (Days)", get: (c) => c.ranked?.score.channelAgeDays ?? null },
      { key: "createdAt", label: "Channel Created", get: (c) => c.ranked?.score.createdAt ?? null },
      { key: "scoreCoverageDays", label: "Score Coverage (Days)", get: (c) => c.ranked?.score.coverageDays ?? null },
    ],
  },
  {
    key: "channelMetrics",
    label: "Niche Breakdown — channel metrics (30d)",
    hint: "From the Metrics page, joined by handle. Only channels tracked in Neon have a match.",
    needsMetrics: true,
    defaultOn: false,
    columns: [
      { key: "subscribers", label: "Subscribers", get: (c) => c.rollup?.subscribers ?? null },
      { key: "subscriberDelta", label: "Subscribers Gained (30d)", get: (c) => c.rollup?.subscriberDelta ?? null },
      { key: "totalViewsDelta", label: "Views Gained (30d)", get: (c) => c.rollup?.totalViewsDelta ?? null },
      { key: "rollupDominancePct", label: "Niche Group Dominance %", get: (c) => c.rollup?.dominancePct ?? null },
      { key: "rollupCoverageDays", label: "Snapshot Coverage (Days)", get: (c) => c.rollup?.coverageDays ?? null },
      { key: "firstVideoAt", label: "First Tracked Upload", get: (c) => c.rollup?.firstVideoAt ?? null },
      { key: "rollupChannelAgeDays", label: "Tracked Channel Age (Days)", get: (c) => c.rollup?.channelAgeDays ?? null },
      { key: "shortsViews30d", label: "Shorts Views (30d)", get: (c) => byFormat(c.rollup, "SHORTS")?.totalViews ?? null },
      { key: "shortsViewsPerDay", label: "Shorts Views/Day", get: (c) => byFormat(c.rollup, "SHORTS")?.viewsPerDay ?? null },
      { key: "shortsVelocityChangePct", label: "Shorts Velocity Change %", get: (c) => byFormat(c.rollup, "SHORTS")?.velocityChangePct ?? null },
      { key: "shortsVideoCount30d", label: "Shorts Videos (30d)", get: (c) => byFormat(c.rollup, "SHORTS")?.videoCount ?? null },
      { key: "shortsOutlierCount30d", label: "Shorts Outliers (30d)", get: (c) => byFormat(c.rollup, "SHORTS")?.outlierCount ?? null },
      { key: "shortsOutlierRatePct", label: "Shorts Outlier Rate %", get: (c) => byFormat(c.rollup, "SHORTS")?.outlierRatePct ?? null },
      { key: "shortsEngagementRatePct", label: "Shorts Engagement %", get: (c) => byFormat(c.rollup, "SHORTS")?.engagementRatePct ?? null },
      { key: "shortsHitRatePct", label: "Shorts Hit Rate %", get: (c) => byFormat(c.rollup, "SHORTS")?.hitRatePct ?? null },
      { key: "shortsUploadsPerWeek", label: "Shorts Uploads/Week", get: (c) => byFormat(c.rollup, "SHORTS")?.uploadsPerWeek ?? null },
      { key: "longFormViews30d", label: "Long-Form Views (30d)", get: (c) => byFormat(c.rollup, "LONG_FORM")?.totalViews ?? null },
      { key: "longFormViewsPerDay", label: "Long-Form Views/Day", get: (c) => byFormat(c.rollup, "LONG_FORM")?.viewsPerDay ?? null },
      { key: "longFormVelocityChangePct", label: "Long-Form Velocity Change %", get: (c) => byFormat(c.rollup, "LONG_FORM")?.velocityChangePct ?? null },
      { key: "longFormVideoCount30d", label: "Long-Form Videos (30d)", get: (c) => byFormat(c.rollup, "LONG_FORM")?.videoCount ?? null },
      { key: "longFormOutlierCount30d", label: "Long-Form Outliers (30d)", get: (c) => byFormat(c.rollup, "LONG_FORM")?.outlierCount ?? null },
      { key: "longFormOutlierRatePct", label: "Long-Form Outlier Rate %", get: (c) => byFormat(c.rollup, "LONG_FORM")?.outlierRatePct ?? null },
      { key: "longFormEngagementRatePct", label: "Long-Form Engagement %", get: (c) => byFormat(c.rollup, "LONG_FORM")?.engagementRatePct ?? null },
      { key: "longFormHitRatePct", label: "Long-Form Hit Rate %", get: (c) => byFormat(c.rollup, "LONG_FORM")?.hitRatePct ?? null },
      { key: "longFormUploadsPerWeek", label: "Long-Form Uploads/Week", get: (c) => byFormat(c.rollup, "LONG_FORM")?.uploadsPerWeek ?? null },
    ],
  },
  {
    key: "groupSummary",
    label: "Niche Breakdown — group summary (30d)",
    hint: "One value per niche group, joined by Niche Group — the same channel repeated for every member.",
    needsMetrics: true,
    defaultOn: false,
    columns: [
      { key: "groupChannelCount", label: "Niche Group Channel Count", get: (c) => c.groupSummary?.channelCount ?? null },
      { key: "groupMedianChannelAgeDays", label: "Niche Group Median Channel Age (Days)", get: (c) => c.groupSummary?.medianChannelAgeDays ?? null },
      { key: "groupPrimaryNiche", label: "Niche Group Primary Niche", get: (c) => c.groupSummary?.primaryNiche ?? null },
      { key: "groupTotalViewsDelta", label: "Niche Group Views Gained (30d)", get: (c) => c.groupSummary?.totalViewsDelta ?? null },
      { key: "groupSubscriberDelta", label: "Niche Group Subscribers Gained (30d)", get: (c) => c.groupSummary?.subscriberDelta ?? null },
      { key: "groupConcentrationHhi", label: "Niche Group Concentration (HHI)", get: (c) => c.groupSummary?.concentrationHhi ?? null },
      { key: "groupMomentumScore", label: "Niche Group Momentum", get: (c) => c.groupSummary?.momentum.score ?? null },
      { key: "groupMomentumConfidence", label: "Niche Group Momentum Confidence", get: (c) => c.groupSummary?.momentum.confidence ?? null },
      { key: "groupOpportunityScore", label: "Niche Group Opportunity", get: (c) => c.groupSummary?.opportunity.score ?? null },
      { key: "groupOpportunityConfidence", label: "Niche Group Opportunity Confidence", get: (c) => c.groupSummary?.opportunity.confidence ?? null },
    ],
  },
]
