import { NextRequest, NextResponse } from "next/server"
import { MetricsConfigError } from "@/lib/metrics/db"
import { readNicheCorpus } from "@/lib/metrics/neon"
import { buildIdeation, type IdeationPayload } from "@/lib/niche/ideation"
import type { VideoType } from "@/lib/metrics/types"

// The ideation layer of the Niche Performance page.
//
// Reads the permanent title corpus rather than the snapshot window, so it is
// Neon-only and has no Sheets equivalent — with METRICS_SOURCE=sheets the page
// simply does not show these panels.
//
// The corpus does not change between Stage 2 runs and the analysis is pure
// arithmetic over it, so this caches hard. "Overall" is ~5,500 videos and the
// term pass is O(titles x words); an hour of cache keeps that off the request
// path entirely.

const SOURCE: "neon" | "sheets" =
  (process.env.METRICS_SOURCE ?? "neon").toLowerCase() === "sheets" ? "sheets" : "neon"

const CACHE_TTL_MS = 60 * 60 * 1000

// Response caps. The engine returns everything it finds; the wire does not
// need to. These are display budgets, not analysis limits — the medians and
// shares were computed over the full set before truncation.
const MAX_TOPICS = 120
const MAX_MATRIX_HANDLES = 12
const MAX_REPETITION_ROWS = 40

interface CacheEntry {
  payload: IdeationPayload
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

const isVideoType = (v: string | null): v is VideoType => v === "LONG_FORM" || v === "SHORTS"

/**
 * Trims the payload for the wire, keeping the matrix square: pairs are filtered
 * to the handles that survive the cap, so the UI never receives an edge whose
 * endpoint is missing from the axis.
 */
function trim(payload: IdeationPayload): IdeationPayload {
  const keptHandles = payload.overlap.handles.slice(0, MAX_MATRIX_HANDLES)
  const keep = new Set(keptHandles)
  return {
    ...payload,
    topics: payload.topics.slice(0, MAX_TOPICS),
    repetition: payload.repetition.slice(0, MAX_REPETITION_ROWS),
    overlap: {
      ...payload.overlap,
      handles: keptHandles,
      pairs: payload.overlap.pairs.filter((p) => keep.has(p.a) && keep.has(p.b)),
    },
  }
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const group = (params.get("group") ?? "").trim()
  const formatParam = params.get("format")
  const videoType: VideoType = isVideoType(formatParam) ? formatParam : "LONG_FORM"
  const force = params.get("refresh") === "1"

  if (!group) {
    return NextResponse.json(
      { success: false, error: "Missing required ?group= parameter", code: "BAD_REQUEST" },
      { status: 400 }
    )
  }

  if (SOURCE === "sheets") {
    return NextResponse.json(
      {
        success: false,
        error: "Ideation analysis needs the Neon title corpus; the Sheets source has no equivalent.",
        code: "UNAVAILABLE",
      },
      { status: 503 }
    )
  }

  const cacheKey = `${group}::${videoType}`
  const cached = cache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, cached: true, data: cached.payload })
  }

  try {
    const corpus = await readNicheCorpus(group)
    const payload = trim(buildIdeation(corpus, group, videoType))
    cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ success: true, cached: false, data: payload })
  } catch (err: unknown) {
    if (err instanceof MetricsConfigError) {
      return NextResponse.json({ success: false, error: err.message, code: "CONFIG" }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
