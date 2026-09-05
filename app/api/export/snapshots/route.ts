import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { MetricsConfigError } from "@/lib/metrics/db"
import {
  COMBINED_COLUMNS,
  countExportRows,
  readCombinedSnapshots,
  readExportOptions,
  type SnapshotExportFilters,
  type TrackingFilter,
} from "@/lib/metrics/exportSnapshots"

// The workbook is built here rather than in the browser. The unfiltered set is
// ~74k rows across 30 columns — shipping that as JSON costs ~41MB over the
// wire before the client has even started writing a file, so the route returns
// the .xlsx itself and the modal just follows the download.
export const maxDuration = 300

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseFilters(params: URLSearchParams): SnapshotExportFilters | string {
  const rawTracking = (params.get("tracking") ?? "ALL").toUpperCase()
  if (rawTracking !== "YES" && rawTracking !== "NO" && rawTracking !== "ALL") {
    return `tracking must be YES, NO or ALL — got "${rawTracking}"`
  }

  const from = params.get("from") ?? undefined
  const to = params.get("to") ?? undefined
  for (const [name, value] of [["from", from], ["to", to]] as const) {
    if (value && !ISO_DATE.test(value)) return `${name} must be YYYY-MM-DD — got "${value}"`
  }
  if (from && to && from > to) return `from (${from}) is after to (${to})`

  // Absent `niches` means every niche, which is not the same as an explicitly
  // empty selection — that one exports nothing and says so.
  const rawNiches = params.get("niches")
  const niches =
    rawNiches === null
      ? undefined
      : rawNiches
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)

  return { niches, tracking: rawTracking as TrackingFilter, from, to }
}

function fail(error: unknown) {
  if (error instanceof MetricsConfigError) {
    return NextResponse.json({ success: false, error: error.message, kind: "config" }, { status: 503 })
  }
  const message = error instanceof Error ? error.message : "Snapshot export failed"
  return NextResponse.json({ success: false, error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  try {
    if (params.get("meta") === "1") {
      return NextResponse.json({ success: true, data: await readExportOptions() })
    }

    const filters = parseFilters(params)
    if (typeof filters === "string") {
      return NextResponse.json({ success: false, error: filters }, { status: 400 })
    }

    if (params.get("count") === "1") {
      const counts = await countExportRows(filters)
      return NextResponse.json({
        success: true,
        data: { ...counts, totalRows: counts.videoRows + counts.channelOnlyRows },
      })
    }

    // An empty niche selection is a valid request with an empty answer; there
    // is no point spending two wide reads to discover that.
    const rows =
      filters.niches && filters.niches.length === 0 ? [] : await readCombinedSnapshots(filters)

    // Built as an array-of-arrays. `json_to_sheet` would have to re-derive the
    // header order from the objects, and the column order here is the whole
    // point — it mirrors the two source tabs.
    const aoa: (string | number | null)[][] = [COMBINED_COLUMNS.map((c) => c.label)]
    for (const row of rows) aoa.push(COMBINED_COLUMNS.map((c) => row[c.key]))

    const worksheet = XLSX.utils.aoa_to_sheet(aoa)
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { c: 0, r: 0 },
        e: { c: COMBINED_COLUMNS.length - 1, r: Math.max(rows.length, 1) },
      }),
    }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Combined_Snapshots")
    // `compression` defaults to false, which stores the xlsx zip uncompressed
    // — the full 73,764-row export weighs 92MB that way and 29MB with it on.
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      compression: true,
    }) as Buffer

    // Streamed rather than returned as one body. A buffered function response
    // is capped well below the size of a full export; chunking it makes this a
    // streaming response, which is not.
    const CHUNK = 1024 * 1024
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < buffer.length; offset += CHUNK) {
          controller.enqueue(new Uint8Array(buffer.subarray(offset, offset + CHUNK)))
        }
        controller.close()
      },
    })

    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="YT-Combined-Snapshots-${stamp}.xlsx"`,
        "Content-Length": String(buffer.length),
        // The row count travels in a header so the modal can report what it
        // actually got without re-running the count query.
        "X-Export-Rows": String(rows.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return fail(error)
  }
}
