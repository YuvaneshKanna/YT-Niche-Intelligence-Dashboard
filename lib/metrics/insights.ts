import { google } from "googleapis"
import { MetricsConfigError } from "./sheets"

// Reads the AI_Insights tab — analysis produced out-of-band by a Claude Code
// session (a Routine, or `claude -p` in your own sandbox) and written back to
// the metrics spreadsheet. The dashboard only ever READS this tab; nothing in
// the web app authenticates as a Claude subscription.
//
// Tab layout (row 1 = headers):
//   Niche_Group | Generated_At | Range | Headline | Body | Confidence | Author

const INSIGHTS_TAB = "AI_Insights"

export interface NicheInsight {
  nicheGroup: string
  generatedAt: string
  range: string
  headline: string
  /** Markdown-ish body. Rendered as paragraphs and bullets, not raw HTML. */
  body: string
  confidence: string
  author: string
}

const str = (v: unknown): string => String(v ?? "").trim()

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

/**
 * Returns the latest insight per niche group.
 *
 * A missing tab is not an error — it just means no analysis has run yet, and
 * the panel says so rather than the page failing.
 */
export async function readInsights(): Promise<{
  insights: NicheInsight[]
  tabMissing: boolean
}> {
  const spreadsheetId = process.env.GOOGLE_METRICS_SHEET_ID
  if (!spreadsheetId) {
    throw new MetricsConfigError("GOOGLE_METRICS_SHEET_ID is not set.")
  }

  const auth = getAuthClient()
  const sheets = google.sheets({ version: "v4", auth })

  let rows: unknown[][]
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${INSIGHTS_TAB}!A1:G`,
    })
    rows = (res.data.values || []) as unknown[][]
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ""
    // "Unable to parse range" is what Sheets returns for a tab that does not exist.
    if (/unable to parse range|not found/i.test(msg)) {
      return { insights: [], tabMissing: true }
    }
    throw err
  }

  if (rows.length < 2) return { insights: [], tabMissing: false }

  const header = rows[0].map((c) => str(c).toLowerCase().replace(/[\s_]/g, ""))
  const col = (name: string) => header.indexOf(name.toLowerCase().replace(/[\s_]/g, ""))

  const iGroup = col("Niche_Group")
  const iAt = col("Generated_At")
  const iRange = col("Range")
  const iHead = col("Headline")
  const iBody = col("Body")
  const iConf = col("Confidence")
  const iAuthor = col("Author")

  const latest = new Map<string, NicheInsight>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const nicheGroup = iGroup >= 0 ? str(row[iGroup]) : ""
    const body = iBody >= 0 ? str(row[iBody]) : ""
    if (!nicheGroup || !body) continue

    const entry: NicheInsight = {
      nicheGroup,
      generatedAt: iAt >= 0 ? str(row[iAt]) : "",
      range: iRange >= 0 ? str(row[iRange]) : "",
      headline: iHead >= 0 ? str(row[iHead]) : "",
      body,
      confidence: iConf >= 0 ? str(row[iConf]) : "",
      author: iAuthor >= 0 ? str(row[iAuthor]) : "",
    }

    // Later rows win, so re-running the analysis appends rather than needing
    // the job to clear the tab first.
    const prev = latest.get(nicheGroup)
    if (!prev || entry.generatedAt >= prev.generatedAt) latest.set(nicheGroup, entry)
  }

  return { insights: [...latest.values()], tabMissing: false }
}
