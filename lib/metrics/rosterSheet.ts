// Reader for the Stage 1 roster — `Manual Sheet` in the Niche Selector
// spreadsheet, the same tab and column layout `app/api/channels/route.ts`
// serves to the dashboard sidebar.
//
// The snapshot export needs this because Neon only holds channels Stage 2 has
// actually collected metrics for. Measured 2026-09-06: the roster carries 414
// unique handles, Neon carries 192, and 227 roster handles have no row in Neon
// at all — 180 of them marked Tracking = NO, 43 blank, 4 YES. Those 227 are
// invisible to a database-only export, which is exactly the gap this closes.
//
// Read-only and best-effort: every caller degrades to Neon-only rather than
// failing the export when the sheet is unreachable.

import { google } from "googleapis"

export class RosterConfigError extends Error {}

export interface RosterEntry {
  ytUrl: string
  handle: string
  type: string
  niche: string
  category: string
  format: string
  producedBy: string
  nicheGroup: string
  sharedOn: string
  /** The sheet's own text: "YES", "NO", or empty. */
  tracking: string
}

/** Join key between the sheet and `channels.handle`, which stores "@handle". */
export function handleKey(handle: string): string {
  return String(handle ?? "").trim().toLowerCase().replace(/^@/, "")
}

/**
 * Cached briefly. The export dialog re-counts on every filter change, and
 * without this each of those would be a Sheets API call for a tab that
 * changes a few times a day.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { rows: RosterEntry[]; expiresAt: number } | null = null

function authClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!email || !key) {
    throw new RosterConfigError(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY are not set — the roster sheet cannot be read."
    )
  }
  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

/**
 * Every roster row, deduplicated by handle.
 *
 * The sheet holds a handful of duplicate handles (4 of 418 rows when last
 * measured); first row wins, matching the order a human reads the tab in.
 */
export async function readRoster(): Promise<RosterEntry[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows

  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (!spreadsheetId) {
    throw new RosterConfigError("GOOGLE_SHEET_ID is not set — the roster sheet cannot be read.")
  }

  const sheets = google.sheets({ version: "v4", auth: authClient() })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // Same range the dashboard's own roster read uses.
    range: "Manual Sheet!A2:O",
  })

  const cell = (row: string[], i: number) => (row[i] ?? "").toString().trim()
  const seen = new Set<string>()
  const rows: RosterEntry[] = []

  for (const row of res.data.values ?? []) {
    const handle = cell(row as string[], 1)
    const key = handleKey(handle)
    if (!key || seen.has(key)) continue
    seen.add(key)
    rows.push({
      ytUrl: cell(row as string[], 0),
      handle,
      type: cell(row as string[], 2),
      niche: cell(row as string[], 3),
      category: cell(row as string[], 4),
      format: cell(row as string[], 5),
      producedBy: cell(row as string[], 6),
      nicheGroup: cell(row as string[], 7),
      // Column J is a Google serial date, not text; the export leaves it out,
      // so it is carried only as whatever the sheet returns.
      sharedOn: cell(row as string[], 9),
      tracking: cell(row as string[], 10).toUpperCase(),
    })
  }

  cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

/** Roster read that reports failure instead of throwing, for optional paths. */
export async function tryReadRoster(): Promise<{
  rows: RosterEntry[]
  error: string | null
}> {
  try {
    return { rows: await readRoster(), error: null }
  } catch (err: unknown) {
    return { rows: [], error: err instanceof Error ? err.message : "Roster sheet unavailable" }
  }
}
