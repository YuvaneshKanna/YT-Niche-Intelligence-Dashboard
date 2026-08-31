import { NextRequest, NextResponse } from "next/server"
import { aggregate } from "@/lib/metrics/aggregate"
import { MetricsConfigError } from "@/lib/metrics/db"
import {
  MetricsConfigError as SheetsConfigError,
  diagnose as diagnoseSheets,
  readChannelSnapshots as readChannelSheets,
  readVideoSnapshots as readVideoSheets,
} from "@/lib/metrics/sheets"
import {
  diagnose as diagnoseNeon,
  readChannelFirstVideoDates,
  readChannelSnapshots as readChannelNeon,
  readVideoSnapshots as readVideoNeon,
} from "@/lib/metrics/neon"
import { RANGE_DAYS, type MetricsPayload, type RangeKey } from "@/lib/metrics/types"

// Source of the Stage 2 data. Neon is the default; set METRICS_SOURCE=sheets
// to fall back to the Google Sheets reader (unchanged, still present) with no
// redeploy of code — the two readers are interface-identical and the
// aggregator cannot tell them apart. See .agents/neon-migration-spec.md.
const SOURCE: "neon" | "sheets" =
  (process.env.METRICS_SOURCE ?? "neon").toLowerCase() === "sheets" ? "sheets" : "neon"

const readChannelSnapshots = SOURCE === "sheets" ? readChannelSheets : readChannelNeon
const readVideoSnapshots = SOURCE === "sheets" ? readVideoSheets : readVideoNeon

// Stage 2 refreshes twice a day (9AM / 3PM IST) plus hourly top-ups for new
// channels, so re-reading the source on every page load is pure waste. At
// ~185 tracked channels the video query alone runs to tens of thousands of
// rows; serving a cached aggregate keeps the page fast.
const CACHE_TTL_MS = 30 * 60 * 1000

interface CacheEntry {
  payload: MetricsPayload
  expiresAt: number
}

// Keyed by range *and* source, so toggling METRICS_SOURCE at runtime never
// serves a stale cross-source aggregate.
const cache = new Map<string, CacheEntry>()

function isRangeKey(v: string | null): v is RangeKey {
  return v === "7d" || v === "14d" || v === "30d" || v === "90d" || v === "180d"
}

/** Turn either diagnostics shape into flat human-readable warning lines. */
async function describeEmptySource(since: string): Promise<string[]> {
  const lines: string[] = []
  try {
    if (SOURCE === "sheets") {
      for (const t of await diagnoseSheets(since)) {
        const parts: string[] = [
          `${t.tab}: ${t.totalRows} data row(s), headers on row ${
            t.headerRowNumber === -1 ? "NOT FOUND" : t.headerRowNumber
          }`,
        ]
        if (t.totalRows === 0) {
          parts.push("tab is empty — check GOOGLE_METRICS_SHEET_ID points at the YT Channel Metrics spreadsheet")
        }
        if (t.missingHeaders.length > 0) {
          parts.push(`MISSING HEADERS: ${t.missingHeaders.join(", ")}`)
          parts.push(`headers seen: ${t.detectedHeaders.slice(0, 8).join(" | ") || "(none)"}`)
        }
        if (t.rawDateSamples.length > 0) {
          const s = t.rawDateSamples[0]
          parts.push(
            `first Snapshot_Date: raw=${JSON.stringify(s.raw)} (${s.type}) -> parsed=${s.parsed || "PARSE FAILED"}`
          )
        }
        if (t.parsedDatesFound.length > 0) {
          parts.push(`newest dates in tab: ${t.parsedDatesFound.slice(0, 3).join(", ")}`)
        }
        parts.push(`rows on/after ${since}: ${t.rowsInWindow}`)
        lines.push(parts.join(" · "))
      }
    } else {
      for (const t of await diagnoseNeon(since)) {
        const parts = [`${t.table}: ${t.totalRows} row(s) total, ${t.rowsInWindow} on/after ${since}`]
        if (t.totalRows === 0) {
          parts.push("table is empty — Stage 2 dual-write may not have run yet, or DATABASE_URL points at the wrong project")
        }
        if (t.newestDates.length > 0) parts.push(`newest snapshot_date: ${t.newestDates.slice(0, 3).join(", ")}`)
        lines.push(parts.join(" · "))
      }
    }
  } catch (diagErr) {
    lines.push(`Diagnostics unavailable: ${diagErr instanceof Error ? diagErr.message : "unknown error"}`)
  }
  return lines
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rangeParam = searchParams.get("range")
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : "30d"
  const force = searchParams.get("refresh") === "1"
  const debug = searchParams.get("debug") === "1"

  const cacheKey = `${SOURCE}:${range}`
  const cached = cache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, cached: true, source: SOURCE, data: cached.payload })
  }

  const days = RANGE_DAYS[range]
  // One extra day so the first in-range day has a predecessor to diff against —
  // without it the earliest date would always show a zero delta.
  const since = new Date(Date.now() - (days + 1) * 86400000).toISOString().slice(0, 10)

  try {
    // ?debug=1 reports what the source actually contains, so an empty result
    // can be diagnosed without guessing. Schema/coverage shape only, never
    // row contents.
    if (debug) {
      return NextResponse.json({
        success: true,
        source: SOURCE,
        debug: {
          sinceDate: since,
          requestedDays: days,
          serverToday: new Date().toISOString().slice(0, 10),
          tabs: SOURCE === "sheets" ? await diagnoseSheets(since) : await diagnoseNeon(since),
        },
      })
    }

    // The channel-age proxy is a Neon-only read: it looks at the whole
    // `videos` table, outside the snapshot window, and the Sheets path has no
    // equivalent. On Sheets it stays undefined and every age field is null.
    const [channelSnapshots, videoSnapshots, firstVideoByChannelId] = await Promise.all([
      readChannelSnapshots(since),
      readVideoSnapshots(since),
      SOURCE === "neon"
        ? readChannelFirstVideoDates()
        : Promise.resolve(undefined as Map<string, string> | undefined),
    ])

    const result = aggregate({
      channelSnapshots,
      videoSnapshots,
      requestedDays: days,
      firstVideoByChannelId,
    })

    // An empty result is the hardest failure to diagnose from the UI. When
    // nothing came back, attach what the source actually contains so the page
    // explains itself instead of just saying "no rows".
    if (result.coverageDays === 0) {
      result.warnings.push(...(await describeEmptySource(since)))
    }

    const payload: MetricsPayload = {
      range,
      requestedDays: days,
      generatedAt: new Date().toISOString(),
      ...result,
    }

    cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS })

    return NextResponse.json({ success: true, cached: false, source: SOURCE, data: payload })
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError || err instanceof SheetsConfigError) {
      return NextResponse.json(
        { success: false, error: err.message, code: "CONFIG", source: SOURCE },
        { status: 503 }
      )
    }

    const message = err instanceof Error ? err.message : "Unknown error"
    const isPermission = /permission|not found|forbidden|caller does not have/i.test(message)

    return NextResponse.json(
      {
        success: false,
        source: SOURCE,
        code: isPermission ? "PERMISSION" : "UNKNOWN",
        error:
          isPermission && SOURCE === "sheets"
            ? "The service account cannot read the metrics spreadsheet. Share it with " +
              `${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "the service account"} as a Viewer.`
            : message,
      },
      { status: 500 }
    )
  }
}
