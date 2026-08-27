// Renders what the Discord digests would look like under the proposed changes,
// using the latest real snapshot. Read-only — nothing is written anywhere.
//
//   node .agents/mock-digest.js

const fs = require('fs');
const { google } = require('googleapis');

const SHEET = '1A5HszWL58ACHe4kNdiOevEgQ-n6u3ntdqzbjvsd2A9M';
const EPOCH = Date.UTC(1899, 11, 30);
const NOW   = Date.now();

const iso = v => typeof v === 'number'
  ? new Date(EPOCH + Math.floor(v) * 86400000).toISOString().slice(0, 10)
  : String(v || '').slice(0, 10);

const median = a => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const fmt = n => {
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return sign + Math.round(abs);
};

// ── Proposed change ④: format-specific age bands ────────────────
function ageTag(days, type) {
  if (type === 'SHORTS') {
    return days <= 3 ? 'FRESH' : days <= 14 ? 'SUSTAINED' : days <= 45 ? 'LONG_TAIL' : 'EVERGREEN';
  }
  return days <= 7 ? 'FRESH' : days <= 30 ? 'SUSTAINED' : days <= 90 ? 'LONG_TAIL' : 'EVERGREEN';
}

const REASON_BADGE = {
  BREAKOUT: '🔥 BREAKOUT', FAST_MOVER: '⚡ FAST_MOVER', HIGH_ENGAGEMENT: '💬 HIGH_ENGAGEMENT',
  VIRAL: '🚀 VIRAL', EARLY_SIGNAL: '📈 EARLY_SIGNAL', NICHE_BREAKOUT: '🌐 NICHE_BREAKOUT',
};
const AGE_BADGE = {
  FRESH: '🆕 FRESH', SUSTAINED: '📊 SUSTAINED', LONG_TAIL: '🔁 LONG_TAIL', EVERGREEN: '🌲 EVERGREEN',
};

function heat(pct) {
  const label  = pct < 12 ? '🧊 COLD' : pct < 22 ? '🌤️ WARM' : pct < 32 ? '🔥 HOT' : '🌋 VOLCANIC';
  const filled = Math.min(Math.round((pct / 40) * 10), 10);
  return label + '  ' + '●'.repeat(filled) + '○'.repeat(10 - filled) + '  ' + pct.toFixed(1) + '%';
}

function dateLabel(d) {
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const x = new Date(d + 'T00:00:00Z');
  return String(x.getUTCDate()).padStart(2, '0') + '-' + M[x.getUTCMonth()] + '-' + x.getUTCFullYear();
}

async function load() {
  const j = JSON.parse(fs.readFileSync(process.env.GOOGLE_SA_KEY, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: j.client_email, private_key: j.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const s = google.sheets({ version: 'v4', auth });
  const r = await s.spreadsheets.values.get({
    spreadsheetId: SHEET, range: 'All_Video_Snapshots!A40000:Y',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = (r.data.values || []).filter(x => x[5]);
  const dates = [...new Set(rows.map(x => iso(x[1])))].sort();
  const latest = dates[dates.length - 1];
  const prev   = dates[dates.length - 2];

  const map = x => ({
    handle: x[3], channelId: x[4], id: x[5], url: x[6], type: x[7], title: x[8],
    pub: iso(x[9]), views: Number(x[12]) || 0, likes: Number(x[13]) || 0,
    comments: Number(x[14]) || 0, reason: String(x[16] || ''), niche: String(x[18] || ''),
    group: String(x[22] || ''),
  });

  const today = rows.filter(x => iso(x[1]) === latest).map(map);
  const yday  = {};
  rows.filter(x => iso(x[1]) === prev).forEach(x => { yday[x[5]] = Number(x[12]) || 0; });

  today.forEach(v => {
    v.age = Math.max((NOW - new Date(v.pub + 'T00:00:00Z')) / 86400000, 0.5);
    v.vpd = v.views / Math.max(v.age, 1);
    v.prevViews = yday[v.id];
    v.ageTag = ageTag(v.age, v.type);
  });

  return { today, latest };
}

function score(videos) {
  // Channel baseline: median of the channel's OTHER same-format videos in window.
  const pool = {};
  videos.forEach(v => { const k = v.channelId + '_' + v.type; (pool[k] = pool[k] || []).push(v); });
  Object.values(pool).forEach(p => p.sort((a, b) => a.age - b.age));

  // Niche baseline on views/day.
  const npool = {};
  videos.forEach(v => {
    const k = ((v.group || '').trim() || (v.niche || '').trim() || 'UNGROUPED') + '_' + v.type;
    (npool[k] = npool[k] || []).push(v.vpd);
  });
  const nbase = {};
  Object.entries(npool).forEach(([k, a]) => { nbase[k] = median(a); });

  videos.forEach(v => {
    const win   = v.type === 'SHORTS' ? 60 : 90;
    const peers = (pool[v.channelId + '_' + v.type] || []).filter(p => p.id !== v.id);
    const inWin = peers.filter(p => p.age <= win);
    const sample = inWin.length >= 3 ? inWin : peers.slice(0, 10);
    v.chMedian = Math.max(median(sample.map(p => p.views)), 1);
    v.chMult   = peers.length ? v.views / v.chMedian : 0;   // ← uncapped (change ①)

    const k = ((v.group || '').trim() || (v.niche || '').trim() || 'UNGROUPED') + '_' + v.type;
    v.nicheMult = v.vpd / Math.max(nbase[k] || 0, 0.0001);
  });
  return videos;
}

// Ranking strength. Pure channel-multiple favours tiny channels; pure niche
// multiple favours whoever is simply biggest. The geometric mean asks for
// both — the idea beat its own channel AND the result matters at niche scale.
const strength = v => Math.sqrt(Math.max(v.chMult, 0.01) * Math.max(v.nicheMult, 0.01));

// Scale floor: a video below its niche's median velocity is not a signal
// worth a slot, however well it did against its own small channel.
const NICHE_FLOOR = Number(process.env.NICHE_FLOOR || 1.0);

// ── Proposed change ②: rank by uncapped multiple ────────────────
function topFill(videos, limit, capPerChannel) {
  const ageOrder    = ['FRESH', 'SUSTAINED', 'LONG_TAIL', 'EVERGREEN'];
  const reasonOrder = ['BREAKOUT', 'FAST_MOVER', 'HIGH_ENGAGEMENT', 'VIRAL', 'EARLY_SIGNAL', 'NICHE_BREAKOUT'];
  const out = [], used = new Set(), perCh = {};

  for (const at of ageOrder) {
    if (out.length >= limit) break;
    for (const rs of reasonOrder) {
      if (out.length >= limit) break;
      const cands = videos
        .filter(v => v.reason === rs && v.ageTag === at && !used.has(v.id))
        .filter(v => v.nicheMult >= NICHE_FLOOR)
        .sort((a, b) => strength(b) - strength(a));
      for (const v of cands) {
        if (out.length >= limit) break;
        if ((perCh[v.channelId] || 0) >= capPerChannel) continue;
        out.push(v); used.add(v.id); perCh[v.channelId] = (perCh[v.channelId] || 0) + 1;
      }
    }
  }
  return out;
}

function risingFill(videos, limit, capPerChannel, exclude) {
  const cands = videos
    .filter(v => ['FAST_MOVER', 'EARLY_SIGNAL'].includes(v.reason))
    .filter(v => v.ageTag === 'FRESH' && !exclude.has(v.id))
    .sort((a, b) => strength(b) - strength(a));
  const out = [], perCh = {};
  for (const v of cands) {
    if (out.length >= limit) break;
    if ((perCh[v.channelId] || 0) >= capPerChannel) continue;
    out.push(v); perCh[v.channelId] = (perCh[v.channelId] || 0) + 1;
  }
  return out;
}

function renderItem(v, i) {
  const eng = v.views > 0 ? (((v.likes + v.comments) / v.views) * 100).toFixed(2) : '0.00';

  let delta = '';
  if (v.prevViews !== undefined && v.prevViews > 0) {
    const d = v.views - v.prevViews, p = (d / v.prevViews) * 100;
    const hot = Math.abs(d) >= 200000 || Math.abs(p) >= 20;
    delta = (hot ? '🔥' : '') + '`' + (d >= 0 ? '+' : '') + fmt(d) + '` (' + (d >= 0 ? '+' : '') + p.toFixed(1) + '%)';
  } else {
    delta = '`' + fmt(Math.round(v.vpd)) + '/day avg`';
  }

  const lines = [];
  lines.push(String(i) + '. ' + (REASON_BADGE[v.reason] || v.reason) + ' ' + (AGE_BADGE[v.ageTag] || v.ageTag)
    + ' · ' + dateLabel(v.pub));
  lines.push('   `' + String(v.title).slice(0, 60) + '`');
  lines.push('   **' + v.chMult.toFixed(1) + '× channel** (median ' + fmt(v.chMedian) + ')  |  '
    + v.nicheMult.toFixed(1) + '× niche  |  Eng `' + eng + '%`');
  lines.push('   👁 ' + fmt(v.views) + '  |  👍 ' + fmt(v.likes) + '  |  💬 ' + fmt(v.comments)
    + '  |  VPD ' + delta);
  lines.push('   ' + v.handle + ' | <' + v.url + '>');
  return lines.join('\n');
}

function digest(label, emoji, videos) {
  const outliers = videos.filter(v => REASON_BADGE[v.reason]);
  const recent   = videos.filter(v => v.age <= 7);
  const rate     = videos.length ? (outliers.length / videos.length) * 100 : 0;
  const best     = [...outliers].filter(v=>v.nicheMult>=1).sort((a, b) => strength(b) - strength(a))[0];

  const top    = topFill(outliers, 6, 2);
  const topIds = new Set(top.map(v => v.id));
  const rising = risingFill(outliers, 4, 2, topIds);

  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

  console.log('\n' + '═'.repeat(78));
  console.log(emoji + ' **' + label + ' ⏰ ' + now + ' IST**\n');
  console.log('📊 **Snapshot**');
  console.log('📺 Channels: `' + new Set(videos.map(v => v.channelId)).size + '` | 🎬 Videos: `' + videos.length + '`');
  console.log('🔴 Outliers: `' + outliers.length + '` | 🟢 Recent Uploads: `' + recent.length + '`');
  console.log('⚡ Niche Heat: ' + heat(rate));
  console.log('🏆 Strongest today: `' + (best ? best.chMult.toFixed(1) + '× channel' : 'N/A') + '` '
    + (best ? '(' + best.handle + ')' : ''));
  console.log('\n👇 Top ' + top.length + ' Winning + ' + rising.length + ' Rising below');
  console.log('─'.repeat(78));
  top.forEach((v, i) => { console.log(renderItem(v, i + 1)); console.log(''); });
  console.log('📈 **Rising Signals**');
  rising.forEach((v, i) => { console.log(renderItem(v, i + 1)); console.log(''); });
}

(async () => {
  const { today, latest } = await load();
  score(today);
  console.log('snapshot: ' + latest + '   videos: ' + today.length);
  digest('All Long-Form Channels — Long-Form Intelligence', '📺', today.filter(v => v.type === 'LONG_FORM'));
  digest('All Shorts Channels — Shorts Intelligence', '🎬', today.filter(v => v.type === 'SHORTS'));
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
