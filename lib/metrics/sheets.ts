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

/** Normalises the many date shapes Sheets hands back to `YYYY-MM-DD`. */
export function normaliseDate(raw: unknown): string {
  const s = str(raw)
  if (!s) return ""
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return s.split(" ")[0]
}

/**
 * Builds a header-name → column-index map so the readers survive column
 * reordering in the sheet. Stage 2 writes by column name, not position, so
 * positional parsing would be fragile.
 */
function headerIndex(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {}
  headerRow.forEach((cell, i) => {
    const name = str(cell)
    if (name) map[name] = i
  })
  return map
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
  const at = (row: unknown[], name: string) => row[h[name] ?? -1]

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
  const at = (row: unknown[], name: string) => row[h[name] ?? -1]

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
