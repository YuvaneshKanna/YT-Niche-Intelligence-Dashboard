// Dry-run harness for Stage 2's `Score All Videos` node.
//
// Pulls the most recent snapshot out of All_Video_Snapshots, reshapes it into
// the exact inputs the node sees at runtime (a YouTube videos.list response
// plus the videos_metadata built by `Flatten + Batch Video IDs`), executes the
// node's code, and reports what comes out.
//
// Nothing is written anywhere. Read-only against the sheet.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { google } = require('googleapis');

const SHEET = '1A5HszWL58ACHe4kNdiOevEgQ-n6u3ntdqzbjvsd2A9M';
const TAB = 'All_Video_Snapshots';
// Data ends around row 48k even though the grid is larger — read a tail wide
// enough to cover several snapshot days without pulling all 48k rows.
const READ_FROM_ROW = 43000;

const KEY_FILE = process.env.GOOGLE_SA_KEY;

// Column letters -> index, matching the live header row 4.
const C = {
  row_key: 0, snapshot_date: 1, record_type: 2, handle: 3, channel_id: 4,
  video_id: 5, video_url: 6, video_type: 7, title: 8, published_at: 9,
  duration_hms: 10, thumbnail_url: 11, views: 12, likes: 13, comments: 14,
  outlier_score: 15, outlier_reason: 16, outlier_age_tag: 17, niche: 18,
  category: 19, format: 20, produced_by: 21, niche_group: 22,
  niche_outlier_score: 23, baseline_method: 24,
};

async function sheetsClient() {
  const j = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: j.client_email, private_key: j.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Sheets serial date -> ISO day. Serial 1 == 1899-12-31.
const EPOCH = Date.UTC(1899, 11, 30);
function toIso(v) {
  if (typeof v === 'number' && v > 20000 && v < 90000) {
    return new Date(EPOCH + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  return String(v || '').slice(0, 10);
}

function hmsToIso8601(hms) {
  // Rows store "0:47:00"-ish text, but the export coerces some to fractions.
  if (typeof hms === 'number') {
    const secs = Math.round(hms * 86400);
    return 'PT' + Math.floor(secs / 3600) + 'H' + Math.floor((secs % 3600) / 60) + 'M' + (secs % 60) + 'S';
  }
  const p = String(hms || '0:0:0').split(':').map(Number);
  const [h, m, s] = p.length === 3 ? p : [0, p[0] || 0, p[1] || 0];
  return 'PT' + (h || 0) + 'H' + (m || 0) + 'M' + (s || 0) + 'S';
}

async function main() {
  if (!KEY_FILE) throw new Error('set GOOGLE_SA_KEY to the service-account JSON path');

  const sheets = await sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET,
    range: `${TAB}!A${READ_FROM_ROW}:Y`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = (res.data.values || []).filter(r => r[C.video_id]);
  console.log('rows read: ' + rows.length);

  // Latest snapshot only — that is one run's worth of data.
  const dates = [...new Set(rows.map(r => toIso(r[C.snapshot_date])))].sort();
  const latest = dates[dates.length - 1];
  const day = rows.filter(r => toIso(r[C.snapshot_date]) === latest);
  console.log('dates present: ' + dates.slice(-4).join(', '));
  console.log('using snapshot: ' + latest + '  (' + day.length + ' videos)\n');

  // Reshape into the node's two inputs, batched by 50 exactly as the real
  // `Flatten + Batch Video IDs` node does.
  const apiItems = [], batchItems = [];
  for (let i = 0; i < day.length; i += 50) {
    const chunk = day.slice(i, i + 50);
    apiItems.push({ json: { items: chunk.map(r => ({
      id: r[C.video_id],
      snippet: {
        title: r[C.title],
        channelId: r[C.channel_id],
        publishedAt: toIso(r[C.published_at]) + 'T00:00:00Z',
        thumbnails: { high: { url: r[C.thumbnail_url] } },
      },
      statistics: {
        viewCount: String(r[C.views] || 0),
        likeCount: String(r[C.likes] || 0),
        commentCount: String(r[C.comments] || 0),
      },
      contentDetails: { duration: hmsToIso8601(r[C.duration_hms]) },
    })) } });
    batchItems.push({ json: { videos_metadata: chunk.map(r => ({
      video_id: r[C.video_id],
      channel_id: r[C.channel_id],
      handle: r[C.handle],
      niche: r[C.niche],
      category: r[C.category],
      format: r[C.format],
      produced_by: r[C.produced_by],
      niche_group: r[C.niche_group],
      published_at: toIso(r[C.published_at]),
      source_playlist: r[C.video_type],
    })) } });
  }

  // Execute the node's code with the runtime helpers it expects.
  const code = fs.readFileSync(path.join(__dirname, 'score-all-videos.js'), 'utf8');
  const $ = (name) => {
    if (name === 'Flatten + Batch Video IDs') return { all: () => batchItems };
    if (name === 'Prepare Channel Requests') return { first: () => ({ json: {} }) };
    throw new Error('unexpected node reference: ' + name);
  };
  const ctx = vm.createContext({ $input: { all: () => apiItems }, $, console });
  const out = vm.runInContext('(function(){' + code + '})()', ctx, { timeout: 60000 });

  report(out.map(o => o.json), day);
}

function tally(arr, key) {
  const m = {};
  for (const x of arr) m[x[key]] = (m[x[key]] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function report(out, before) {
  console.log('=== output: ' + out.length + ' items ===\n');

  const mapped = ['row_key','snapshot_date','record_type','video_type','handle','channel_id',
    'video_id','video_url','title','published_at','duration_hms','thumbnail_url','views',
    'likes','comments','outlier_score','outlier_reason','outlier_age_tag',
    'niche_outlier_score','baseline_method','niche','category','format','produced_by','niche_group'];
  const missing = mapped.filter(k => !(k in out[0]));
  console.log('fields the writers map, missing from output: ' + (missing.length ? missing.join(', ') : 'NONE'));

  const bad = out.filter(o => o.niche_outlier_score === undefined || Number.isNaN(o.niche_outlier_score));
  console.log('rows with unusable niche_outlier_score: ' + bad.length);
  const badScore = out.filter(o => Number.isNaN(o.outlier_score) || o.outlier_score === undefined);
  console.log('rows with unusable outlier_score: ' + badScore.length + '\n');

  console.log('record_type   ' + JSON.stringify(tally(out, 'record_type')));
  console.log('reason        ' + JSON.stringify(tally(out, 'outlier_reason')));
  console.log('baseline      ' + JSON.stringify(tally(out, 'baseline_method')) + '\n');

  // Before/after on record_type, using what the sheet already holds.
  const prev = {};
  for (const r of before) prev[r[C.video_id]] = r[C.record_type];
  let promoted = 0, demoted = 0;
  for (const o of out) {
    const was = prev[o.video_id];
    if (was && was !== 'OUTLIER' && o.record_type === 'OUTLIER') promoted++;
    if (was === 'OUTLIER' && o.record_type !== 'OUTLIER') demoted++;
  }
  console.log('record_type changes vs sheet: +' + promoted + ' promoted to OUTLIER, -' + demoted + ' demoted\n');

  // How many extra outliers each candidate threshold would create. Only rows
  // that are NOT already channel-level outliers can be promoted by the niche
  // signal, so count those.
  const chOutlier = new Set(['BREAKOUT','FAST_MOVER','HIGH_ENGAGEMENT','VIRAL','EARLY_SIGNAL']);
  const eligible = out.filter(o => !chOutlier.has(o.outlier_reason));
  console.log('=== niche threshold sweep (7-90 day window, non-channel-outliers) ===');
  for (const t of [3, 5, 8, 10, 15, 20, 30, 50]) {
    const n = eligible.filter(o => o.niche_outlier_score >= t).length;
    console.log('  >= ' + String(t).padStart(3) + '  ->  ' + String(n).padStart(5) + ' extra outliers');
  }

  const scores = out.map(o => o.niche_outlier_score).sort((a, b) => a - b);
  const pct = p => scores[Math.floor(scores.length * p / 100)];
  console.log('\nniche_outlier_score percentiles: p50=' + pct(50) + '  p75=' + pct(75)
    + '  p90=' + pct(90) + '  p95=' + pct(95) + '  p99=' + pct(99) + '  max=' + scores[scores.length - 1]);
  console.log('rows at the 999 cap: ' + scores.filter(s => s >= 999).length);

  const groups = {};
  for (const o of out) {
    const k = ((o.niche_group || '').trim() || (o.niche || '').trim() || 'UNGROUPED') + '_' + o.video_type;
    groups[k] = (groups[k] || 0) + 1;
  }
  const gs = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  console.log('\nniche pools: ' + gs.length + ' distinct; largest -> '
    + gs.slice(0, 6).map(g => g[0] + ':' + g[1]).join(', ') + '\n');

  // Outlier rate per Discord-reported group. buildSnapshot computes this per
  // niche_group (and once for all long-form), and getNicheHeat bands it.
  const lf = out.filter(o => o.video_type === 'LONG_FORM');
  const byGroup = { 'ALL (overall)': lf };
  for (const o of lf) {
    const g = (o.niche_group || '').trim();
    if (g) (byGroup[g] = byGroup[g] || []).push(o);
  }
  console.log('=== outlier rate per Discord group (long-form) ===');
  for (const [g, vids] of Object.entries(byGroup)) {
    const n = vids.filter(v => v.record_type === 'OUTLIER').length;
    console.log('  ' + g.padEnd(18) + String(vids.length).padStart(6) + ' videos   '
      + String(n).padStart(5) + ' outliers   ' + ((n / vids.length) * 100).toFixed(1) + '%');
  }
  console.log('');

  const top = out.filter(o => o.video_type === 'LONG_FORM')
    .sort((a, b) => b.niche_outlier_score - a.niche_outlier_score).slice(0, 12);
  console.log('=== top 12 long-form by niche_outlier_score ===');
  for (const o of top) {
    console.log('  ' + String(o.niche_outlier_score).padStart(8)
      + '  ch=' + String(o.outlier_score).padStart(6)
      + '  ' + String(o.record_type).padEnd(14)
      + String(o.outlier_reason).padEnd(18)
      + String(o.baseline_method).padEnd(11)
      + (o.handle || '?').padEnd(22)
      + String(o.views).padStart(10) + '  ' + String(o.title).slice(0, 42));
  }
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
