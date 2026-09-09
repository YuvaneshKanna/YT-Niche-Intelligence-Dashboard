import { NextRequest, NextResponse } from "next/server"
import { MetricsConfigError } from "@/lib/metrics/db"
import { readNexlevChannels, type NexlevChannelDetail } from "@/lib/metrics/neon"

// Supplement to /api/metrics for the Niche Performance page.
//
// The metrics payload deliberately collapses NexLev enrichment down to one
// effective RPM per channel — that is all the opportunity score needs. This
// route returns the parts that collapse discards (the long/short RPM split,
// the revenue figures, the audience JSONB) for the channels of a single
// niche group, so the drill-down can show measured money and audience data
// without a second aggregation of the whole roster.
//
// Neon-only. With METRICS_SOURCE=sheets there is no channel_nexlev table, and
// the page degrades to the authored estimates in lib/metrics/niche-profiles.ts
// exactly as the rest of the dashboard already does.

const SOURCE: "neon" | "sheets" =
  (process.env.METRICS_SOURCE ?? "neon").toLowerCase() === "sheets" ? "sheets" : "neon"

// The enrichment pipeline refreshes a channel at most every 14 days, so this
// can cache far harder than the twice-daily metrics aggregate.
const CACHE_TTL_MS = 60 * 60 * 1000

interface CacheEntry {
  channels: NexlevChannelDetail[]
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export async function GET(request: NextRequest) {
  const group = (new URL(request.url).searchParams.get("group") ?? "").trim()
  const force = new URL(request.url).searchParams.get("refresh") === "1"

  if (!group) {
    return NextResponse.json(
      { success: false, error: "Missing required ?group= parameter", code: "BAD_REQUEST" },
      { status: 400 }
    )
  }

  if (SOURCE === "sheets") {
    return NextResponse.json({
      success: true,
      group,
      channels: [],
      warning: "NexLev enrichment is unavailable on the Sheets source; showing estimates only.",
    })
  }

  const cached = cache.get(group)
  if (!force && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, cached: true, group, channels: cached.channels })
  }

  try {
    const channels = await readNexlevChannels(group)
    cache.set(group, { channels, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ success: true, cached: false, group, channels })
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError) {
      return NextResponse.json({ success: false, error: err.message, code: "CONFIG" }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
