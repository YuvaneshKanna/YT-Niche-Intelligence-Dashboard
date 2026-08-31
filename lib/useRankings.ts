import { useEffect, useMemo, useState } from "react"
import type { Channel, ChannelType } from "./constants"
import type { ChannelScore, CohortScore, FormatClass, RankingPayload } from "./scoring/types"

/**
 * Channel ranking for the Page 1 sidebar.
 *
 * The two data planes join on handle, which is the only key the Manual Sheet
 * and Neon share — the sheet has no channel_id. Handles change (the dashboard
 * already surfaces a "Handle Diff" for exactly that reason), so a renamed
 * channel loses its score until the sheet catches up. Lookups are normalised
 * to lowercase without the leading '@' to at least remove casing and prefix
 * mismatches as a source of misses.
 */
export function normaliseHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, "")
}

/** The sheet's Type column is the authority on which pool a channel is ranked in. */
export function poolOf(type: ChannelType): FormatClass {
  return type === "Shorts" ? "SHORTS" : "LONG_FORM"
}

/** One channel's placement: which pool, its score in that pool, and its position. */
export interface RankedEntry {
  score: ChannelScore
  pool: FormatClass
  /** The cohort result matching `pool`. */
  cohort: CohortScore
  /** 1-based position within `pool`, over every channel of that Type in the sheet. */
  rank: number
  /** How many channels share this pool — the "of N". */
  poolSize: number
}

export interface RankingsState {
  payload: RankingPayload | null
  loading: boolean
  error: string | null
}

export function useRankings(days = 90): RankingsState {
  const [payload, setPayload] = useState<RankingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch(`/api/rankings?days=${days}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) throw new Error(data.error || "Ranking request failed")
        setPayload(data.data as RankingPayload)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // A failed ranking must not take the audit page down with it — the
        // sidebar falls back to its unranked order and the page stays usable.
        setError(err instanceof Error ? err.message : "Ranking request failed")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [days])

  return { payload, loading, error }
}

/**
 * Place every channel into exactly one of two pools and number it within that
 * pool. There is no third pool: a channel that publishes both formats still
 * competes in the one its sheet Type names.
 *
 * The pool comes from the sheet's Type column rather than from measured video
 * counts, so that ranking and the sidebar's Type filter read the same field.
 * That is what guarantees a contiguous 1, 2, 3 when the list is filtered to one
 * Type — measured counts can and do disagree with the sheet's label, and any
 * disagreement would put a gap in the filtered sequence.
 *
 * Ranks are computed over ALL channels of that Type, not just the visible ones,
 * so a channel's number does not change as filters are applied.
 */
export function buildRanking(
  channels: Channel[],
  payload: RankingPayload | null
): Map<string, RankedEntry> {
  const result = new Map<string, RankedEntry>()
  if (!payload) return result

  const scoreByHandle = new Map<string, ChannelScore>()
  for (const s of payload.channels) scoreByHandle.set(normaliseHandle(s.handle), s)

  const pools: Record<FormatClass, { channel: Channel; entry: Omit<RankedEntry, "rank" | "poolSize"> }[]> = {
    LONG_FORM: [],
    SHORTS: [],
  }

  for (const channel of channels) {
    const score = scoreByHandle.get(normaliseHandle(channel.handle))
    if (!score) continue
    const pool = poolOf(channel.type)
    const cohort = pool === "SHORTS" ? score.asShorts : score.asLongForm
    pools[pool].push({ channel, entry: { score, pool, cohort } })
  }

  for (const pool of ["LONG_FORM", "SHORTS"] as FormatClass[]) {
    const members = pools[pool]
    members.sort(
      (a, b) =>
        b.entry.cohort.combinedScore - a.entry.cohort.combinedScore ||
        a.channel.handle.localeCompare(b.channel.handle)
    )
    members.forEach((m, i) => {
      result.set(m.channel.id, { ...m.entry, rank: i + 1, poolSize: members.length })
    })
  }

  return result
}
