import type { Channel } from "@/lib/constants"
import { needsAudit } from "@/lib/auditHash"
import type { RankedEntry } from "@/lib/useRankings"

/**
 * Chat context for the "/" audit page — the Manual Sheet roster plus each
 * channel's Neon-derived rank, built entirely from data already in the
 * browser (the same `channelsState` / `rankingByChannelId` the page itself
 * renders from).
 *
 * Deliberately client-built rather than server-fetched: the metrics page's
 * context is expensive Neon aggregation worth caching server-side, but this
 * page's data is already loaded and cheap to serialise, and building it here
 * means Claude sees exactly what's on screen — including a filter the human
 * has applied but not yet reflected anywhere the server could read.
 */

const MAX_ROWS = 200

function counts<T extends string>(values: T[]): [string, number][] {
  const m = new Map<string, number>()
  for (const v of values) {
    const key = v?.trim() || "(blank)"
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function fmtCounts(pairs: [string, number][], max = 12): string {
  return pairs
    .slice(0, max)
    .map(([k, n]) => `${k}=${n}`)
    .join(", ")
}

export interface RosterContextArgs {
  /** The full roster, unfiltered — for totals and breakdowns. */
  allChannels: Channel[]
  /** What the top-bar filters currently narrow the sidebar to. */
  filteredChannels: Channel[]
  /** Human-readable description of the active filters, or null if none. */
  activeFilters: string | null
  /** The channel open in the audit panel, if any. */
  selected: Channel | null
  /** Ranking placement, keyed by channel.id — same map the sidebar sorts by. */
  rankingByChannelId: Map<string, RankedEntry>
}

export function buildRosterContext(args: RosterContextArgs): string {
  const { allChannels, filteredChannels, activeFilters, selected, rankingByChannelId } = args
  const lines: string[] = []

  lines.push(`# Channel roster (Manual Sheet audit page)`)
  lines.push(
    `${allChannels.length} channels total, ${rankingByChannelId.size} have a Neon score, ` +
      `${allChannels.filter(needsAudit).length} need audit (missing Niche/Category/Produced By, ` +
      `or a classification field changed since it was last verified).`
  )
  lines.push(
    `A channel with no Neon score is not "scored badly" — it means Stage 2 has not synced that ` +
      `handle into Neon yet, or the handle changed and no longer matches. Say so plainly rather than ` +
      `treating the absence as a low score.`
  )

  lines.push(`\n## Roster breakdown (all ${allChannels.length} channels)`)
  lines.push(`Niche: ${fmtCounts(counts(allChannels.map((c) => c.niche)))}`)
  lines.push(`Category: ${fmtCounts(counts(allChannels.map((c) => c.category)))}`)
  lines.push(`Produced by: ${fmtCounts(counts(allChannels.map((c) => c.producedBy)))}`)
  lines.push(`Niche group: ${fmtCounts(counts(allChannels.map((c) => c.nicheGroup)))}`)
  lines.push(`Type: ${fmtCounts(counts(allChannels.map((c) => c.type)))}`)
  lines.push(`Tracking: ${fmtCounts(counts(allChannels.map((c) => c.tracking)))}`)
  lines.push(
    `Handle Diff flagged: ${allChannels.filter((c) => c.hasHandleDiff).length}, ` +
      `Unavailable handle: ${allChannels.filter((c) => c.isUnavailable).length}`
  )

  if (selected) {
    const entry = rankingByChannelId.get(selected.id)
    lines.push(`\n## Currently open in the audit panel`)
    lines.push(
      `${selected.handle} | type=${selected.type} | niche=${selected.niche} | category=${selected.category} | ` +
        `format=${selected.format} | producedBy=${selected.producedBy} | nicheGroup=${selected.nicheGroup || "(none)"} | ` +
        `tracking=${selected.tracking} | sharedOn=${selected.sharedOn} | needsAudit=${needsAudit(selected)}`
    )
    if (selected.verified) lines.push(`Verified/remarks note: "${selected.verified}"`)
    if (selected.auditedBy) lines.push(`Last verified by ${selected.auditedBy} at ${selected.auditedAt}`)
    lines.push(
      entry
        ? `Neon rank: #${entry.rank} of ${entry.poolSize} in its pool (${entry.pool}), ` +
          `combined score ${entry.cohort.combinedScore}/100, confidence ${entry.score.confidence}.`
        : `Not tracked in Neon — no score.`
    )
  }

  lines.push(
    `\n## Channels currently in view${activeFilters ? ` (filtered: ${activeFilters})` : " (no filter applied)"}`
  )
  const shown = filteredChannels.slice(0, MAX_ROWS)
  for (const c of shown) {
    const entry = rankingByChannelId.get(c.id)
    lines.push(
      `${c.handle} | ${c.type} | niche=${c.niche || "—"} | category=${c.category || "—"} | ` +
        `producedBy=${c.producedBy || "—"} | nicheGroup=${c.nicheGroup || "—"} | tracking=${c.tracking} | ` +
        `needsAudit=${needsAudit(c)} | ` +
        (entry ? `rank=#${entry.rank}/${entry.poolSize} score=${entry.cohort.combinedScore}` : `score=not tracked`)
    )
  }
  if (filteredChannels.length > MAX_ROWS) {
    lines.push(`… ${filteredChannels.length - MAX_ROWS} more channels in view, not listed individually.`)
  }

  return lines.join("\n")
}
