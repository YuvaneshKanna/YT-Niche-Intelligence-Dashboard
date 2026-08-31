import { useEffect, useMemo, useState } from "react"
import type { ChannelScore, RankingPayload } from "./scoring/types"

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

export interface RankingsState {
  /** Score per normalised handle. Channels absent from Neon are simply not in the map. */
  byHandle: Map<string, ChannelScore>
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

  const byHandle = useMemo(() => {
    const map = new Map<string, ChannelScore>()
    for (const c of payload?.channels ?? []) map.set(normaliseHandle(c.handle), c)
    return map
  }, [payload])

  return { byHandle, payload, loading, error }
}
