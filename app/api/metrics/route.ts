import { NextRequest, NextResponse } from "next/server"
import { aggregate } from "@/lib/metrics/aggregate"
import {
  MetricsConfigError,
  diagnose,
  readChannelSnapshots,
  readVideoSnapshots,
} from "@/lib/metrics/sheets"
import { RANGE_DAYS, type MetricsPayload, type RangeKey } from "@/lib/metrics/types"

// Stage 2 refreshes twice a day (9AM / 3PM IST) plus hourly top-ups for new
// channels, so re-reading Sheets on every page load is pure waste. At ~165
// tracked channels the video tab alone runs to tens of thousands of rows;
// serving a cached aggregate keeps the page fast and stays well inside the
// Sheets API quota.
const CACHE_TTL_MS = 30 * 60 * 1000

interface CacheEntry {
  payload: MetricsPayload
  expiresAt: number
}

const cache = new Map<RangeKey, CacheEntry>()

function isRangeKey(v: string | null): v is RangeKey {
  return v === "7d" || v === "14d" || v === "30d" || v === "90d" || v === "180d"
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rangeParam = searchParams.get("range")
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : "30d"
  const force = searchParams.get("refresh") === "1"
  const debug = searchParams.get("debug") === "1"

  const cached = cache.get(range)
  if (!force && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, cached: true, data: cached.payload })
  }

  const days = RANGE_DAYS[range]
  // One extra day so the first in-range day has a predecessor to diff against —
  // without it the earliest date would always show a zero delta.
  const since = new Date(Date.now() - (days + 1) * 86400000).toISOString().slice(0, 10)

  try {
    // ?debug=1 reports what the tabs actually contain — headers found, raw
    // date values and how they parse — so an empty result can be diagnosed
    // without guessing. Reveals schema shape only, never row contents.
    if (debug) {
      return NextResponse.json({
        success: true,
        debug: {
          sinceDate: since,
          requestedDays: days,
          serverToday: new Date().toISOString().slice(0, 10),
          tabs: await diagnose(since),
        },
      })
    }

    const [channelSnapshots, videoSnapshots] = await Promise.all([
      readChannelSnapshots(since),
      readVideoSnapshots(since),
    ])

    const result = aggregate({
      channelSnapshots,
      videoSnapshots,
      requestedDays: days,
    })

    // An empty result is the hardest failure to diagnose from the UI, because
    // a misparsed date, a renamed header and a genuinely empty tab all look
    // identical. When nothing came back, attach what the tabs actually
    // contain so the page explains itself instead of just saying "no rows".
    if (result.coverageDays === 0) {
      try {
        for (const t of await diagnose(since)) {
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
            const sample = t.rawDateSamples[0]
            parts.push(
              `first Snapshot_Date: raw=${JSON.stringify(sample.raw)} (${sample.type}) -> parsed=${
                sample.parsed || "PARSE FAILED"
              }`
            )
          }
          if (t.parsedDatesFound.length > 0) {
            parts.push(`newest dates in tab: ${t.parsedDatesFound.slice(0, 3).join(", ")}`)
          }
          parts.push(`rows on/after ${since}: ${t.rowsInWindow}`)

          result.warnings.push(parts.join(" · "))
        }
      } catch (diagErr) {
        result.warnings.push(
          `Diagnostics unavailable: ${diagErr instanceof Error ? diagErr.message : "unknown error"}`
        )
      }
    }

    const payload: MetricsPayload = {
      range,
      requestedDays: days,
      generatedAt: new Date().toISOString(),
      ...result,
    }

    cache.set(range, { payload, expiresAt: Date.now() + CACHE_TTL_MS })

    return NextResponse.json({ success: true, cached: false, data: payload })
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError) {
      return NextResponse.json(
        { success: false, error: err.message, code: "CONFIG" },
        { status: 503 }
      )
    }

    const message = err instanceof Error ? err.message : "Unknown error"
    const isPermission = /permission|not found|forbidden|caller does not have/i.test(message)

    return NextResponse.json(
      {
        success: false,
        code: isPermission ? "PERMISSION" : "UNKNOWN",
        error: isPermission
          ? "The service account cannot read the metrics spreadsheet. Share it with " +
            `${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "the service account"} as a Viewer.`
          : message,
      },
      { status: 500 }
    )
  }
}
