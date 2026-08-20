import { google } from "googleapis"
import type { ChannelSnapshot, RecordType, VideoSnapshot, VideoType } from "./types"

// Reads the Stage 2 output spreadsheet (YT Channel Metrics). This is a
// different spreadsheet from the Stage 1 roster that the main dashboard uses,
// so it needs its own env var — and the service account must be shared on it.

const CHANNEL_TAB = "Sheet4_Daily_Channel_Snapshot"
const VIDEO_TAB = "All_Video_Snapshots"

export class MetricsConfigError extends Error {}

function getAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY

  if (!email || !key) {
    throw new MetricsConfigError(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set."
    )
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

function metricsSheetId(): string {
  const id = process.env.GOOGLE_METRICS_SHEET_ID
  if (!id) {
    throw new MetricsConfigError(
      "GOOGLE_METRICS_SHEET_ID is not set. Add it in Vercel and share the " +
        "YT Channel Metrics spreadsheet with the service account."
    )
  }
  return id
}

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const parsed = parseFloat(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

const str = (v: unknown): string => String(v ?? "").trim()

// Google Sheets counts days from 1899-12-30 (serial 1 == 1899-12-31, which
// preserves the historical 1900 leap-year bug).
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30)

/** Plausible range for a snapshot date; anything outside is treated as garbage. */
const MIN_YEAR = 2000
const MAX_YEAR = 2100

const toIsoDay = (d: Date): string => {
  const year = d.getUTCFullYear()
  if (year < MIN_YEAR || year > MAX_YEAR) return ""
  return d.toISOString().slice(0, 10)
}

/**
 * Normalises the shapes Sheets hands back into `YYYY-MM-DD`.
 *
 * `valueRenderOption: UNFORMATTED_VALUE` returns a date-formatted cell as a
 * *serial number* (days since 1899-12-30), not a string. Passing that to
 * `new Date()` parses it as a calendar YEAR — 46234 becomes the year 46234,
 * whose ISO form ("+046234-01-01") sorts BELOW a normal date string and
 * silently filtered every row out of range. Serial numbers are converted
 * explicitly, and the string fallback is bounded to a plausible year range so
 * a stray number can never masquerade as a date again.
 */
export function normaliseDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return ""

  // Serial number, either as a JS number or a bare numeric string.
  const asNumber = typeof raw === "number" ? raw : Number(str(raw))
  if (Number.isFinite(asNumber) && String(raw).trim() !== "" && /^\d+(\.\d+)?$/.test(str(raw))) {
    // Serials below ~36525 predate 2000; treat those as out of range too.
    const d = new Date(SHEETS_EPOCH_MS + Math.floor(asNumber) * 86_400_000)
    return Number.isNaN(d.getTime()) ? "" : toIsoDay(d)
  }

  const s = str(raw)
  if (!s) return ""

  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return toIsoDay(parsed)

  return ""
}

/**
 * Canonical form of a header name: lowercase, no spaces/underscores/hyphens.
 * "Snapshot_Date", "Snapshot Date" and "snapshotdate" all collapse to the
 * same key, so a cosmetic rename in the sheet cannot silently zero out the
 * whole page.
 */
const canon = (name: string): string => name.toLowerCase().replace(/[\s_\-.]/g, "")

/**
 * Builds a header-name → column-index map so the readers survive column
 * reordering in the sheet. Stage 2 writes by column name, not position, so
 * positional parsing would be fragile.
 */
function headerIndex(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {}
  headerRow.forEach((cell, i) => {
    const name = str(cell)
    if (name) map[canon(name)] = i
  })
  return map
}

/** Reads a cell by header name, tolerating spacing/case differences. */
const cell = (row: unknown[], h: Record<string, number>, name: string): unknown => {
  const idx = h[canon(name)]
  return idx === undefined ? undefined : row[idx]
}

async function readTab(tab: string, range: string): Promise<unknown[][]> {
  const auth = getAuthClient()
  const sheets = google.sheets({ version: "v4", auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: metricsSheetId(),
    range: `${tab}!${range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  })
  return (res.data.values || []) as unknown[][]
}

export async function readChannelSnapshots(sinceDate: string): Promise<ChannelSnapshot[]> {
  const rows = await readTab(CHANNEL_TAB, "A1:N")
  if (rows.length < 2) return []

  const h = headerIndex(rows[0])
  const at = (row: unknown[], name: string) => cell(row, h, name)

  const out: ChannelSnapshot[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const snapshotDate = normaliseDate(at(row, "Snapshot_Date"))
    if (!snapshotDate || snapshotDate < sinceDate) continue

    const handle = str(at(row, "Handle"))
    if (!handle) continue

    out.push({
      rowKey: str(at(row, "Row_Key")),
      snapshotDate,
      handle,
      channelId: str(at(row, "Channel_ID")),
      subscribers: num(at(row, "Subscribers")),
      totalViews: num(at(row, "Total_Views")),
      totalVideos: num(at(row, "Total_Videos")),
      country: str(at(row, "Country")),
      fetchedAt: str(at(row, "Fetched_At")),
      producedBy: str(at(row, "Produced_By")),
      niche: str(at(row, "Niche")),
      category: str(at(row, "Category")),
      format: str(at(row, "Format")),
      nicheGroup: str(at(row, "Niche_Group")),
    })
  }
  return out
}

const asVideoType = (raw: string): VideoType => (raw === "SHORTS" ? "SHORTS" : "LONG_FORM")

const asRecordType = (raw: string): RecordType =>
  raw === "OUTLIER" || raw === "RECENT_UPLOAD" ? raw : "HISTORICAL"

export async function readVideoSnapshots(sinceDate: string): Promise<VideoSnapshot[]> {
  const rows = await readTab(VIDEO_TAB, "A1:W")
  if (rows.length < 2) return []

  const h = headerIndex(rows[0])
  const at = (row: unknown[], name: string) => cell(row, h, name)

  const out: VideoSnapshot[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const snapshotDate = normaliseDate(at(row, "Snapshot_Date"))
    if (!snapshotDate || snapshotDate < sinceDate) continue

    const videoId = str(at(row, "Video_ID"))
    if (!videoId) continue

    out.push({
      rowKey: str(at(row, "Row_Key")),
      snapshotDate,
      recordType: asRecordType(str(at(row, "Record_Type"))),
      handle: str(at(row, "Handle")),
      channelId: str(at(row, "Channel_ID")),
      videoId,
      videoUrl: str(at(row, "Video_URL")),
      title: str(at(row, "Title")),
      publishedAt: normaliseDate(at(row, "Published_At")),
      durationHms: str(at(row, "Duration_HMS")),
      thumbnailUrl: str(at(row, "Thumbnail_URL")),
      videoType: asVideoType(str(at(row, "Video_Type"))),
      views: num(at(row, "Views")),
      likes: num(at(row, "Likes")),
      comments: num(at(row, "Comments")),
      outlierScore: num(at(row, "Outlier_Score")),
      outlierReason: str(at(row, "Outlier_Reason")),
      outlierAgeTag: str(at(row, "Outlier_Age_Tag")),
      producedBy: str(at(row, "Produced_By")),
      niche: str(at(row, "Niche")),
      category: str(at(row, "Category")),
      format: str(at(row, "Format")),
      nicheGroup: str(at(row, "Niche_Group")),
    })
  }
  return out
}

/** What a tab actually contains, for diagnosing an empty result. */
export interface TabDiagnostics {
  tab: string
  totalRows: number
  detectedHeaders: string[]
  /** Headers the readers require that were NOT found. */
  missingHeaders: string[]
  /** Raw Snapshot_Date values from the first few data rows, before parsing. */
  rawDateSamples: { raw: unknown; type: string; parsed: string }[]
  /** Distinct parsed dates present, newest first (capped). */
  parsedDatesFound: string[]
  rowsInWindow: number
}

async function diagnoseTab(
  tab: string,
  range: string,
  required: string[],
  sinceDate: string
): Promise<TabDiagnostics> {
  const rows = await readTab(tab, range)
  if (rows.length === 0) {
    return {
      tab,
      totalRows: 0,
      detectedHeaders: [],
      missingHeaders: required,
      rawDateSamples: [],
      parsedDatesFound: [],
      rowsInWindow: 0,
    }
  }

  const detectedHeaders = rows[0].map((c) => str(c)).filter(Boolean)
  const h = headerIndex(rows[0])
  const missingHeaders = required.filter((r) => h[canon(r)] === undefined)

  const rawDateSamples = rows.slice(1, 4).map((row) => {
    const raw = cell(row, h, "Snapshot_Date")
    return { raw, type: typeof raw, parsed: normaliseDate(raw) }
  })

  const parsed = new Set<string>()
  let rowsInWindow = 0
  for (let i = 1; i < rows.length; i++) {
    const d = normaliseDate(cell(rows[i], h, "Snapshot_Date"))
    if (d) {
      parsed.add(d)
      if (d >= sinceDate) rowsInWindow++
    }
  }

  return {
    tab,
    totalRows: Math.max(0, rows.length - 1),
    detectedHeaders,
    missingHeaders,
    rawDateSamples,
    parsedDatesFound: [...parsed].sort().reverse().slice(0, 10),
    rowsInWindow,
  }
}

/** Diagnostics for both tabs — surfaced via /api/metrics?debug=1. */
export async function diagnose(sinceDate: string): Promise<TabDiagnostics[]> {
  return Promise.all([
    diagnoseTab(CHANNEL_TAB, "A1:N", ["Snapshot_Date", "Handle", "Total_Views", "Subscribers"], sinceDate),
    diagnoseTab(VIDEO_TAB, "A1:W", ["Snapshot_Date", "Video_ID", "Views", "Video_Type"], sinceDate),
  ])
}
