// One-time backfill: Sheet4_Daily_Channel_Snapshot -> Neon channel_snapshots.
//
// channel_snapshots was added late (2026-08-27) so the live dual-write only
// covers a couple of days. This pulls the Sheets history in so the
// dashboard's channel-level charts (headline trend line, dominance %,
// subscriber delta) work on the Neon path.
//
// Same conflict semantics as the live n8n node: channel_snapshots upsert on
// (channel_id, snapshot_date). channels are inserted DO NOTHING — never
// clobber the current roster classification, only add rows missing so the
// FK holds.
//
// Usage:
//   node .agents/backfill-channel-snapshots.js --inspect
//   node .agents/backfill-channel-snapshots.js [--since YYYY-MM-DD] [--commit]
//
// Default --since is 2026-08-24 (matches the video-snapshot backfill window
// in neon-migration-spec.md). Without --commit it is a dry run.

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Client } = require('@neondatabase/serverless');

const METRICS_SHEET_ID = '1A5HszWL58ACHe4kNdiOevEgQ-n6u3ntdqzbjvsd2A9M';
const TAB = 'Sheet4_Daily_Channel_Snapshot';
const DEFAULT_SINCE = '2026-08-24';

// ── env / auth ───────────────────────────────────────────────────────
function loadEnv() {
  const text = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length > 1) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function sheetsClient() {
  const keyFile = process.env.GOOGLE_SA_KEY;
  if (!keyFile || !fs.existsSync(keyFile)) {
    throw new Error('Set GOOGLE_SA_KEY to the service-account JSON path (Vercel sheet vars are write-only).');
  }
  const j = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: j.client_email, private_key: j.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Sheets serial date (days since 1899-12-30) -> "YYYY-MM-DD".
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
function serialToISODate(s) {
  return new Date(SHEETS_EPOCH_MS + Math.floor(s) * 86400000).toISOString().slice(0, 10);
}
// Serial datetime -> ISO instant, treating the wall clock as IST (+05:30),
// the timezone Stage 2 writes Fetched_At in.
function serialToInstantIST(s) {
  const ms = SHEETS_EPOCH_MS + Math.round(s * 86400000);
  return new Date(ms - 5.5 * 3600000).toISOString();
}

function normDate(raw) {
  if (typeof raw === 'number') return serialToISODate(raw);
  const s = String(raw || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}
function normInstant(raw, fallbackDate) {
  if (typeof raw === 'number' && raw > 0) return serialToInstantIST(raw);
  const s = String(raw || '').trim();
  if (s) {
    const d = new Date(s.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return `${fallbackDate}T00:00:00.000Z`;
}
const intOr = (v, d = 0) => {
  const n = parseInt(String(v ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : d;
};

// Header row is auto-located (banner rows precede it); data starts 2 rows
// below (a type row and a description row sit between).
const REQUIRED = ['Row_Key', 'Snapshot_Date', 'Handle', 'Channel_ID', 'Subscribers', 'Total_Views'];
const canon = (s) => String(s).toLowerCase().replace(/[\s_\-.]/g, '');

function parseRows(values) {
  let headerIdx = -1, best = 0;
  for (let i = 0; i < Math.min(values.length, 12); i++) {
    const names = new Set((values[i] || []).map((c) => canon(c)));
    const score = REQUIRED.reduce((n, r) => n + (names.has(canon(r)) ? 1 : 0), 0);
    if (score > best) { best = score; headerIdx = i; }
  }
  if (headerIdx === -1) throw new Error('Sheet4 header row not found');

  const h = {};
  (values[headerIdx] || []).forEach((c, i) => { if (c) h[canon(c)] = i; });
  const at = (row, name) => row[h[canon(name)]];

  const out = [];
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;
    const snapshotDate = normDate(at(row, 'Snapshot_Date'));
    const channelId = String(at(row, 'Channel_ID') || '').trim();
    const handle = String(at(row, 'Handle') || '').trim();
    if (!snapshotDate || !channelId || !handle) continue; // skips type/description rows too

    out.push({
      snapshotDate,
      channelId,
      handle,
      subscribers: intOr(at(row, 'Subscribers')),
      totalViews: intOr(at(row, 'Total_Views')),
      totalVideos: intOr(at(row, 'Total_Videos')),
      country: String(at(row, 'Country') || '').trim() || null,
      fetchedAt: normInstant(at(row, 'Fetched_At'), snapshotDate),
      niche: String(at(row, 'Niche') || '').trim() || null,
      category: String(at(row, 'Category') || '').trim() || null,
      format: String(at(row, 'Format') || '').trim() || null,
      producedBy: String(at(row, 'Produced_By') || '').trim() || null,
      nicheGroup: String(at(row, 'Niche_Group') || '').trim() || null,
    });
  }
  return out;
}

async function chunkedInsert(client, table, columns, rows, conflict, chunkSize) {
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const tuples = [];
    const vals = [];
    let p = 1;
    for (const r of chunk) {
      tuples.push(`(${columns.map(() => `$${p++}`).join(',')})`);
      vals.push(...r);
    }
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT ${conflict}`,
      vals
    );
    written += chunk.length;
    process.stdout.write(`\r  ${table}: ${written}/${rows.length}`);
  }
  if (rows.length) console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const inspect = args.includes('--inspect');
  const commit = args.includes('--commit');
  const sinceArg = args.indexOf('--since');
  const since = sinceArg !== -1 ? args[sinceArg + 1] : DEFAULT_SINCE;

  console.log(`Reading ${TAB} ...`);
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: METRICS_SHEET_ID,
    range: `${TAB}!A1:N`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const all = parseRows(res.data.values || []);
  console.log(`Parsed ${all.length} data rows.`);

  // Coverage report.
  const byDate = new Map();
  for (const r of all) byDate.set(r.snapshotDate, (byDate.get(r.snapshotDate) || 0) + 1);
  const dates = [...byDate.keys()].sort();
  console.log(`Date span: ${dates[0]} .. ${dates[dates.length - 1]} (${dates.length} distinct days)`);
  if (inspect) {
    let prev = null;
    for (const d of dates) {
      let gap = '';
      if (prev) {
        const days = Math.round((new Date(d) - new Date(prev)) / 86400000);
        if (days > 1) gap = `   <-- ${days - 1} day gap`;
      }
      console.log(`  ${d}  ${String(byDate.get(d)).padStart(5)} rows${gap}`);
      prev = d;
    }
    return;
  }

  const picked = all.filter((r) => r.snapshotDate >= since);
  console.log(`\n--since ${since}: ${picked.length} rows across ${new Set(picked.map((r) => r.snapshotDate)).size} days.`);

  // Dedup channel_snapshots on (channel_id, snapshot_date) — last row wins.
  const snapMap = new Map();
  for (const r of picked) snapMap.set(`${r.channelId}|${r.snapshotDate}`, r);
  const snapRows = [...snapMap.values()].map((r) => [
    r.channelId, r.snapshotDate, r.subscribers, r.totalViews, r.totalVideos, r.country, r.fetchedAt,
  ]);

  // Channels needed for the FK — insert DO NOTHING, never overwrite roster.
  const chanMap = new Map();
  for (const r of picked) {
    if (!chanMap.has(r.channelId)) {
      chanMap.set(r.channelId, [r.channelId, r.handle, r.niche, r.category, r.format, r.producedBy, r.nicheGroup]);
    }
  }
  const chanRows = [...chanMap.values()];

  console.log(`channel_snapshots to upsert: ${snapRows.length}`);
  console.log(`channels to ensure (DO NOTHING): ${chanRows.length}`);

  if (!commit) {
    console.log('\nDRY RUN — re-run with --commit to write. Sample channel_snapshot row:');
    console.log(JSON.stringify(snapRows[0], null, 2));
    return;
  }

  const env = loadEnv();
  const client = new Client(env.DATABASE_URL_UNPOOLED);
  await client.connect();
  try {
    const before = await client.query('SELECT count(*)::int c, min(snapshot_date)::text mn, max(snapshot_date)::text mx FROM channel_snapshots');
    console.log(`\nBefore: channel_snapshots ${JSON.stringify(before.rows[0])}`);

    await client.query('BEGIN');
    await chunkedInsert(client, 'channels',
      ['channel_id', 'handle', 'niche', 'category', 'format', 'produced_by', 'niche_group'],
      chanRows, '(channel_id) DO NOTHING', 500);
    await chunkedInsert(client, 'channel_snapshots',
      ['channel_id', 'snapshot_date', 'subscribers', 'total_views', 'total_videos', 'country', 'fetched_at'],
      snapRows,
      '(channel_id, snapshot_date) DO UPDATE SET subscribers = EXCLUDED.subscribers, total_views = EXCLUDED.total_views, total_videos = EXCLUDED.total_videos, country = EXCLUDED.country, fetched_at = EXCLUDED.fetched_at',
      400);
    await client.query('COMMIT');

    const after = await client.query('SELECT count(*)::int c, min(snapshot_date)::text mn, max(snapshot_date)::text mx FROM channel_snapshots');
    console.log(`After:  channel_snapshots ${JSON.stringify(after.rows[0])}`);
    const perDay = await client.query('SELECT snapshot_date::text d, count(*)::int c FROM channel_snapshots GROUP BY 1 ORDER BY 1');
    for (const row of perDay.rows) console.log(`  ${row.d}  ${row.c}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
