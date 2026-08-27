// Detect (and optionally repair) rows in All_Video_Snapshots where
// Outlier_Reason and Outlier_Age_Tag hold each other's values.
//
// The Stage 2 writer had these two mappings crossed. It was fixed on
// 2026-08-25, so rows written from that point are correct — but every row
// written while the bug was live has the two values transposed, and the
// dashboard reads both columns by name.
//
// The two vocabularies do not overlap, so detection is unambiguous:
//   REASON: BREAKOUT FAST_MOVER HIGH_ENGAGEMENT VIRAL EARLY_SIGNAL NORMAL
//           NICHE_BREAKOUT INSUFFICIENT_DATA
//   AGE:    FRESH SUSTAINED LONG_TAIL EVERGREEN
//
//   node .agents/fix-swapped-columns.js          # scan + back up, no writes
//   node .agents/fix-swapped-columns.js --apply  # repair

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SHEET = '1A5HszWL58ACHe4kNdiOevEgQ-n6u3ntdqzbjvsd2A9M';
const TAB   = 'All_Video_Snapshots';

// Header row 4, data from row 7. Q = Outlier_Reason, R = Outlier_Age_Tag.
const FIRST_DATA_ROW = 7;
const REASON_A1 = 'Q';
const AGE_A1    = 'R';

const REASONS = new Set(['BREAKOUT', 'FAST_MOVER', 'HIGH_ENGAGEMENT', 'VIRAL',
                         'EARLY_SIGNAL', 'NORMAL', 'NICHE_BREAKOUT', 'INSUFFICIENT_DATA']);
const AGES    = new Set(['FRESH', 'SUSTAINED', 'LONG_TAIL', 'EVERGREEN']);

const APPLY = process.argv.includes('--apply');

async function client(readonly) {
  const keyFile = process.env.GOOGLE_SA_KEY;
  if (!keyFile) throw new Error('set GOOGLE_SA_KEY to the service-account JSON path');
  const j = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: j.client_email, private_key: j.private_key },
    scopes: [readonly
      ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
      : 'https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function classify(reason, age) {
  const r = String(reason || '').trim().toUpperCase();
  const a = String(age || '').trim().toUpperCase();

  if (!r && !a) return 'both_empty';
  // The tell: an age word sitting in the reason column.
  if (AGES.has(r) && (REASONS.has(a) || !a)) return 'swapped';
  if (REASONS.has(r) && (AGES.has(a) || !a)) return 'correct';
  if (!r && AGES.has(a)) return 'reason_missing';
  return 'unrecognised';
}

async function main() {
  const sheets = await client(!APPLY);

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET,
    ranges: [
      `${TAB}!A${FIRST_DATA_ROW}:B`,                                  // Row_Key, Snapshot_Date
      `${TAB}!${REASON_A1}${FIRST_DATA_ROW}:${AGE_A1}`,               // Outlier_Reason, Outlier_Age_Tag
    ],
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const keys = res.data.valueRanges[0].values || [];
  const pair = res.data.valueRanges[1].values || [];
  const total = Math.max(keys.length, pair.length);
  console.log('data rows scanned: ' + total + '  (from row ' + FIRST_DATA_ROW + ')\n');

  const tally = {};
  const swappedRows = [];
  const byDate = {};
  const oddities = [];

  for (let i = 0; i < total; i++) {
    const reason = (pair[i] || [])[0];
    const age    = (pair[i] || [])[1];
    const verdict = classify(reason, age);
    tally[verdict] = (tally[verdict] || 0) + 1;

    if (verdict === 'swapped') {
      swappedRows.push({ i, row: FIRST_DATA_ROW + i, reason, age });
      const d = String((keys[i] || [])[1] || '').slice(0, 10);
      byDate[d] = (byDate[d] || 0) + 1;
    }
    if (verdict === 'unrecognised' && oddities.length < 8) {
      oddities.push({ row: FIRST_DATA_ROW + i, reason, age });
    }
  }

  console.log('classification:');
  Object.entries(tally).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log('  ' + k.padEnd(16) + v));

  if (oddities.length) {
    console.log('\nunrecognised samples:');
    oddities.forEach(o => console.log('  r' + o.row + '  reason=' + JSON.stringify(o.reason)
      + '  age=' + JSON.stringify(o.age)));
  }

  if (swappedRows.length === 0) {
    console.log('\nNothing to repair.');
    return;
  }

  const dates = Object.keys(byDate).sort();
  console.log('\nswapped rows span ' + dates[0] + ' .. ' + dates[dates.length - 1]
    + '  across ' + dates.length + ' snapshot dates');
  console.log('first few dates: ' + dates.slice(0, 5).map(d => d + ':' + byDate[d]).join('  '));

  // Always write a local backup of the two columns before any repair.
  const backup = path.join(__dirname, 'swapped-columns-backup.json');
  fs.writeFileSync(backup, JSON.stringify({
    takenAt: new Date().toISOString(),
    sheet: SHEET, tab: TAB, firstDataRow: FIRST_DATA_ROW,
    columns: [REASON_A1, AGE_A1],
    rows: pair,
  }));
  console.log('\nbacked up both columns to ' + backup);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to repair.');
    return;
  }

  // Repair: rewrite the whole Q:R block with the two values exchanged on the
  // rows that need it. One write, not one per row.
  const fixed = [];
  for (let i = 0; i < total; i++) {
    const reason = (pair[i] || [])[0];
    const age    = (pair[i] || [])[1];
    fixed.push(classify(reason, age) === 'swapped'
      ? [age === undefined ? '' : age, reason === undefined ? '' : reason]
      : [reason === undefined ? '' : reason, age === undefined ? '' : age]);
  }

  const out = await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET,
    range: `${TAB}!${REASON_A1}${FIRST_DATA_ROW}:${AGE_A1}${FIRST_DATA_ROW + total - 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: fixed },
  });

  console.log('\nrepaired ' + swappedRows.length + ' rows');
  console.log('updated range: ' + out.data.updatedRange + '  cells: ' + out.data.updatedCells);
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
