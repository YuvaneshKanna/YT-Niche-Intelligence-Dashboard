#!/usr/bin/env node
/**
 * Appends Claude-generated analysis to the AI_Insights tab of the metrics
 * spreadsheet, creating the tab if it does not exist.
 *
 * Run by the /analyze-niches command from a Claude Code session — a Routine,
 * or `claude -p` inside your own sandbox. Nothing in the deployed web app
 * calls this; the dashboard only ever reads the tab.
 *
 *   node scripts/write-insights.mjs /tmp/insights.json
 *
 * Requires (same service account as the dashboard, but with WRITE scope, so
 * the spreadsheet must be shared with it as Editor rather than Viewer):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *   GOOGLE_METRICS_SHEET_ID
 */

import { readFileSync } from "node:fs"
import { google } from "googleapis"

const TAB = "AI_Insights"
const HEADERS = [
  "Niche_Group",
  "Generated_At",
  "Range",
  "Headline",
  "Body",
  "Confidence",
  "Author",
]

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

const file = process.argv[2]
if (!file) fail("usage: node scripts/write-insights.mjs <insights.json>")

const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_METRICS_SHEET_ID } = process.env
if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  fail("GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set")
}
if (!GOOGLE_METRICS_SHEET_ID) fail("GOOGLE_METRICS_SHEET_ID must be set")

let entries
try {
  entries = JSON.parse(readFileSync(file, "utf8"))
} catch (err) {
  fail(`could not read ${file}: ${err.message}`)
}
if (!Array.isArray(entries)) fail("expected a JSON array of insight objects")
if (entries.length === 0) fail("no insights to write")

for (const [i, e] of entries.entries()) {
  if (!e || typeof e !== "object") fail(`entry ${i} is not an object`)
  if (!e.nicheGroup) fail(`entry ${i} is missing nicheGroup`)
  if (!e.body) fail(`entry ${i} (${e.nicheGroup}) is missing body`)
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
})

const sheets = google.sheets({ version: "v4", auth })
const spreadsheetId = GOOGLE_METRICS_SHEET_ID

async function ensureTab() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === TAB)
  if (exists) return false

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1:G1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  })
  return true
}

// IST matches how Stage 2 stamps its own rows, so timestamps line up.
const generatedAt = new Date()
  .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
  .replace("T", " ")

try {
  const created = await ensureTab()
  if (created) console.log(`created ${TAB} tab`)

  const rows = entries.map((e) => [
    String(e.nicheGroup),
    generatedAt,
    String(e.range ?? ""),
    String(e.headline ?? ""),
    String(e.body),
    String(e.confidence ?? ""),
    String(e.author ?? "Claude Code"),
  ])

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${TAB}!A:G`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  })

  console.log(`wrote ${rows.length} insight row(s) at ${generatedAt} IST:`)
  for (const e of entries) console.log(`  - ${e.nicheGroup} (${e.confidence ?? "no confidence"})`)
} catch (err) {
  const msg = err?.message ?? String(err)
  if (/permission|forbidden|caller does not have/i.test(msg)) {
    fail(
      `${msg}\n\nThe service account needs EDITOR access to write. Share the ` +
        `metrics spreadsheet with ${GOOGLE_SERVICE_ACCOUNT_EMAIL} as Editor ` +
        `(Viewer is enough for the dashboard, but not for this writer).`
    )
  }
  fail(msg)
}
