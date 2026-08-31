import { NextRequest, NextResponse } from "next/server"
import { MetricsConfigError } from "@/lib/metrics/db"
import { readCoverage, readRankingRows } from "@/lib/metrics/neon"
import { rankChannels } from "@/lib/scoring/rank"
import { YouTubeConfigError, readChannelCreatedDates } from "@/lib/scoring/youtube"
import type { ChannelMetricInput, RankingPayload } from "@/lib/scoring/types"

// Channel ranking for the Page 1 sidebar order.
//
// The window is a trailing cap, not a promise: Neon currently holds ~33 days of
// channel snapshots, so a 90-day request returns 90 days' worth of *available*
// data and grows toward the full window as history accumulates. `coverageDays`
// in the payload reports what was actually there, and the UI must show it.

const DEFAULT_WINDOW_DAYS = 90
const MAX_WINDOW_DAYS = 365

// Ranking moves at most twice a day (Stage 2 refresh cadence) and costs a
// multi-CTE Neon query plus four YouTube calls, so serving a cached payload is
// the difference between an instant sidebar and a two-second stall on a page
// the user reloads constantly.
const CACHE_TTL_MS = 30 * 60 * 1000

interface CacheEntry {
  payload: RankingPayload
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

// Creation dates never change, so they outlive the ranking cache by a long way.
// Keeping them in their own map means a ranking refresh does not re-spend
// YouTube quota.
const createdAtCache = new Map<string, string>()
let createdAtMissEnabled = true

async function resolveCreatedDates(channelIds: string[]): Promise<{
  byChannelId: Map<string, string>
  warning: string | null
}> {
  const missing = channelIds.filter((id) => !createdAtCache.has(id))

  if (missing.length > 0 && createdAtMissEnabled) {
    try {
      const fetched = await readChannelCreatedDates(missing)
      for (const [id, date] of fetched) createdAtCache.set(id, date)
    } catch (err) {
      if (err instanceof YouTubeConfigError) {
        // Do not retry on every request once the key is known to be absent.
        createdAtMissEnabled = false
        return { byChannelId: new Map(createdAtCache), warning: err.message }
      }
      return {
        byChannelId: new Map(createdAtCache),
        warning: `Channel creation dates unavailable: ${
          err instanceof Error ? err.message : "unknown error"
        }. The freshness component is omitted from the Channel Score.`,
      }
    }
  }

  const unresolved = channelIds.filter((id) => !createdAtCache.has(id)).length
  return {
    byChannelId: new Map(createdAtCache),
    warning: createdAtMissEnabled
      ? unresolved > 0
        ? `${unresolved} channel(s) returned no creation date from the YouTube API; ` +
          "their Channel Score is computed from the remaining components."
        : null
      : "YOUTUBE_API_KEY is not set, so no channel has a creation date and the " +
        "freshness component is omitted from every Channel Score.",
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const daysParam = Number(searchParams.get("days"))
  const days =
    Number.isFinite(daysParam) && daysParam > 0
      ? Math.min(MAX_WINDOW_DAYS, Math.floor(daysParam))
      : DEFAULT_WINDOW_DAYS
  const force = searchParams.get("refresh") === "1"

  const cacheKey = `rank:${days}`
  const cached = cache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, cached: true, data: cached.payload })
  }

  // One extra day so the first in-window day has a predecessor to diff against.
  const since = new Date(Date.now() - (days + 1) * 86400000).toISOString().slice(0, 10)

  try {
    const [rows, coverage] = await Promise.all([readRankingRows(since), readCoverage(since)])
    const warnings: string[] = []

    if (rows.length === 0) {
      const payload: RankingPayload = {
        requestedDays: days,
        coverageDays: 0,
        coverageStart: null,
        coverageEnd: null,
        channels: [],
        niches: [],
        generatedAt: new Date().toISOString(),
        warnings: [
          "No channel snapshots found in the requested window. Stage 2 may not have " +
            "run yet, or DATABASE_URL points at the wrong Neon project.",
        ],
      }
      return NextResponse.json({ success: true, cached: false, data: payload })
    }

    if (coverage.days < days) {
      warnings.push(
        `Ranking covers ${coverage.days} day(s), not the ${days} requested — that is all ` +
          "the history Neon holds so far. The window widens on its own as daily " +
          "snapshots accumulate."
      )
    }

    const { byChannelId: createdDates, warning: createdWarning } = await resolveCreatedDates(
      rows.map((r) => r.channelId)
    )
    if (createdWarning) warnings.push(createdWarning)

    const channels: ChannelMetricInput[] = rows.map((r) => ({
      ...r,
      createdAt: createdDates.get(r.channelId) ?? null,
    }))

    const result = rankChannels({ channels, todayMs: Date.now() })

    const payload: RankingPayload = {
      requestedDays: days,
      coverageDays: coverage.days,
      coverageStart: coverage.start,
      coverageEnd: coverage.end,
      channels: result.channels,
      niches: result.niches,
      generatedAt: new Date().toISOString(),
      warnings,
    }

    cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ success: true, cached: false, data: payload })
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError) {
      return NextResponse.json(
        { success: false, error: err.message, code: "CONFIG" },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
