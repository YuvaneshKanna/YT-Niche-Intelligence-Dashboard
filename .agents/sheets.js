// Small Sheets helper for agent-driven reads/writes.
//
// Auth comes from .env.local (pulled from Vercel) — the same service account
// the dashboard and the n8n Stage 1/2 workflows use, so anything this script
// can reach, the pipeline can reach too, and nothing else.
//
// Usage:
//   node .agents/sheets.js read  <spreadsheetId> "<A1Range>"
//   node .agents/sheets.js write <spreadsheetId> "<A1Range>" '<json 2D array>'
//   node .agents/sheets.js tabs  <spreadsheetId>
//
// Ranges are literal A1 notation, e.g. "All_Video_Snapshots!A4:Y6".

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ── .env.local parser ────────────────────────────────────────────────
// Handles KEY=value and KEY="value with \n escapes" (Vercel writes the
// private key that way).
function loadEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  const text = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length > 1) {
      v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    env[m[1]] = v;
  }
  return env;
}

// Preferred source: a service-account JSON key kept OUTSIDE the repo, so it
// can never be committed. Falls back to .env.local for the sheet IDs.
//
// Vercel cannot supply these: every var on the project is marked "Sensitive",
// which is write-only — `vercel env pull` returns placeholders, not values.
const KEY_FILE = process.env.GOOGLE_SA_KEY
  || path.join(process.env.USERPROFILE || process.env.HOME || '', '.gcp', 'yt-metrics-sa.json');

function credentials() {
  if (fs.existsSync(KEY_FILE)) {
    const j = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    if (!j.client_email || !j.private_key) {
      throw new Error('Key file at ' + KEY_FILE + ' has no client_email / private_key');
    }
    return { email: j.client_email, key: j.private_key };
  }
  const env = loadEnv();
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || key.length < 100) {
    throw new Error(
      'No usable credentials.\n' +
      '  Looked for a service-account JSON at: ' + KEY_FILE + '\n' +
      '  .env.local has no valid GOOGLE_PRIVATE_KEY (Vercel Sensitive vars are write-only).\n' +
      '  Fix: download a JSON key from Google Cloud Console and save it to the path above.'
    );
  }
  return { email, key };
}

function client() {
  const env = loadEnv();
  const { email, key } = credentials();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return { sheets: google.sheets({ version: 'v4', auth }), env, email };
}

async function main() {
  const [cmd, id, range, payload] = process.argv.slice(2);
  const { sheets, email } = client();

  if (cmd === 'whoami') {
    console.log('service account: ' + email);
    return;
  }

  if (cmd === 'tabs') {
    const res = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'properties.title,sheets.properties' });
    console.log('spreadsheet: ' + res.data.properties.title);
    for (const s of res.data.sheets) {
      const p = s.properties;
      console.log('  ' + String(p.sheetId).padStart(12) + '  ' + p.title
        + '  (' + p.gridProperties.rowCount + ' rows x ' + p.gridProperties.columnCount + ' cols)');
    }
    return;
  }

  if (cmd === 'read') {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id, range, valueRenderOption: 'UNFORMATTED_VALUE',
    });
    console.log(JSON.stringify(res.data.values || [], null, 1));
    return;
  }

  if (cmd === 'write') {
    const values = JSON.parse(payload);
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId: id, range, valueInputOption: 'RAW',
      requestBody: { values },
    });
    console.log('updated range: ' + res.data.updatedRange
      + '  cells: ' + res.data.updatedCells);
    return;
  }

  if (cmd === 'batch') {
    // payload file: [{ "range": "Tab!A1", "values": [[...]] }, ...]
    const data = JSON.parse(fs.readFileSync(range, 'utf8'));
    const res = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: 'RAW', data },
    });
    console.log('ranges updated: ' + res.data.totalUpdatedRanges
      + '  cells: ' + res.data.totalUpdatedCells);
    for (const r of res.data.responses || []) console.log('  ' + r.updatedRange);
    return;
  }

  console.error('commands: whoami | tabs <id> | read <id> <range> | write <id> <range> <json> | batch <id> <payload.json>');
  process.exit(1);
}

main().catch(e => {
  console.error('ERROR: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
