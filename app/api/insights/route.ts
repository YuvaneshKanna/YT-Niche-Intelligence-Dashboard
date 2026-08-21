import { NextResponse } from "next/server"
import { readInsights } from "@/lib/metrics/insights"
import { MetricsConfigError } from "@/lib/metrics/sheets"

// Insights refresh at most a couple of times a day (whenever the analysis job
// runs), so a short cache keeps this off the Sheets API on every page view.
const CACHE_TTL_MS = 10 * 60 * 1000

let cache: { payload: unknown; expiresAt: number } | null = null

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1"

  if (!force && cache && cache.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, cached: true, ...(cache.payload as object) })
  }

  try {
    const { insights, tabMissing } = await readInsights()
    const payload = { insights, tabMissing }
    cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS }
    return NextResponse.json({ success: true, cached: false, ...payload })
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError) {
      return NextResponse.json({ success: false, error: err.message, code: "CONFIG" }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
