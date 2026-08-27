// Compares ranking schemes for one niche group, using the latest real
// snapshot. Read-only.
//
//   node .agents/rank-compare.js "FIN COMP" LONG_FORM

const fs = require('fs');
const { google } = require('googleapis');

const SHEET = '1A5HszWL58ACHe4kNdiOevEgQ-n6u3ntdqzbjvsd2A9M';
const EPOCH = Date.UTC(1899, 11, 30);
const NOW   = Date.now();

const GROUP = process.argv[2] || 'FIN COMP';
const TYPE  = process.argv[3] || 'LONG_FORM';

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
  const abs = Math.abs(n);
  if (abs >= 1e6) return (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return (abs / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(abs));
};

function ageTag(days, type) {
  return type === 'SHORTS'
    ? (days > 45 ? 'EVERGREEN' : days > 14 ? 'LONG_TAIL' : days > 3 ? 'SUSTAINED' : 'FRESH')
    : (days > 90 ? 'EVERGREEN' : days > 30 ? 'LONG_TAIL' : days > 7 ? 'SUSTAINED' : 'FRESH');
}

const strength = v => Math.sqrt(Math.max(v.chMult, 0.01) * Math.max(v.nicheMult, 0.01));

// Proposed: gentle recency decay instead of hard age tiers.
const HALF_LIFE = { SHORTS: Number(process.env.HL_S||5), LONG_FORM: Number(process.env.HL_L||14) };
// Digest intent: the most RECENT best outlier across niches. Niche magnitude
// is the signal; age is a hard discount. Exponential decay so a stale giant
// must be far larger to outrank something from this week.
const weighted = v => v.nicheMult * Math.pow(0.5, v.age / HALF_LIFE[v.type]);

// Current behaviour: age tier first, then reason, then strength.
function tieredFill(videos, limit, cap) {
  const ages = ['FRESH', 'SUSTAINED', 'LONG_TAIL', 'EVERGREEN'];
  const reasons = ['BREAKOUT', 'FAST_MOVER', 'HIGH_ENGAGEMENT', 'VIRAL', 'EARLY_SIGNAL', 'NICHE_BREAKOUT'];
  const out = [], used = new Set(), perCh = {};
  for (const a of ages) {
    if (out.length >= limit) break;
    for (const r of reasons) {
      if (out.length >= limit) break;
      const c = videos.filter(v => v.reason === r && v.ageTag === a && !used.has(v.id) && v.nicheMult >= 1)
                      .sort((x, y) => strength(y) - strength(x));
      for (const v of c) {
        if (out.length >= limit) break;
        if ((perCh[v.channelId] || 0) >= cap) continue;
        out.push(v); used.add(v.id); perCh[v.channelId] = (perCh[v.channelId] || 0) + 1;
      }
    }
  }
  return out;
}

function weightedFill(videos, limit, cap) {
  const out = [], perCh = {};
  const c = videos.filter(v => v.nicheMult >= 1 && v.chMult >= 1).sort((x, y) => weighted(y) - weighted(x));
  for (const v of c) {
    if (out.length >= limit) break;
    if ((perCh[v.channelId] || 0) >= cap) continue;
    out.push(v); perCh[v.channelId] = (perCh[v.channelId] || 0) + 1;
  }
  return out;
}

const show = (label, list) => {
  console.log('\n=== ' + label + ' ===');
  list.forEach((v, i) => {
    console.log('  ' + (i + 1) + '. ' + String(fmt(v.views)).padStart(7)
      + '  ch ' + v.chMult.toFixed(1).padStart(6) + '×'
      + '  niche ' + v.nicheMult.toFixed(1).padStart(6) + '×'
      + '  str ' + strength(v).toFixed(1).padStart(6)
      + '  wt ' + weighted(v).toFixed(1).padStart(6)
      + '  ' + String(Math.round(v.age)).padStart(3) + 'd ' + v.ageTag.padEnd(10)
      + v.reason.padEnd(15) + v.handle.padEnd(22) + String(v.title).slice(0, 30));
  });
};

(async () => {
  const j = JSON.parse(fs.readFileSync(process.env.GOOGLE_SA_KEY, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: j.client_email, private_key: j.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const s = google.sheets({ version: 'v4', auth });
  const r = await s.spreadsheets.values.get({
    spreadsheetId: SHEET, range: 'All_Video_Snapshots!A40000:Y', valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = (r.data.values || []).filter(x => x[5]);
  const dates = [...new Set(rows.map(x => iso(x[1])))].sort();
  const latest = dates[dates.length - 1];

  const all = rows.filter(x => iso(x[1]) === latest).map(x => ({
    handle: x[3], channelId: x[4], id: x[5], type: x[7], title: x[8], pub: iso(x[9]),
    views: Number(x[12]) || 0, reason: String(x[16] || ''), niche: String(x[18] || ''),
    group: String(x[22] || ''), record: String(x[2] || ''),
  }));
  all.forEach(v => {
    v.age = Math.max((NOW - new Date(v.pub + 'T00:00:00Z')) / 86400000, 0.5);
    v.vpd = v.views / Math.max(v.age, 1);
    v.ageTag = ageTag(v.age, v.type);
  });

  // Baselines computed over the whole population, as the node does.
  const pool = {}, npool = {};
  all.forEach(v => {
    (pool[v.channelId + '_' + v.type] = pool[v.channelId + '_' + v.type] || []).push(v);
    const k = ((v.group || '').trim() || (v.niche || '').trim() || 'UNGROUPED') + '_' + v.type;
    (npool[k] = npool[k] || []).push(v.vpd);
  });
  const nbase = {};
  Object.entries(npool).forEach(([k, a]) => { nbase[k] = median(a); });
  all.forEach(v => {
    const win = v.type === 'SHORTS' ? 60 : 90;
    const peers = (pool[v.channelId + '_' + v.type] || []).filter(p => p.id !== v.id);
    const inWin = peers.filter(p => p.age <= win);
    const sample = inWin.length >= 3 ? inWin : peers.slice(0, 10);
    v.chMedian = Math.max(median(sample.map(p => p.views)), 1);
    v.chMult = peers.length ? v.views / v.chMedian : 0;
    const k = ((v.group || '').trim() || (v.niche || '').trim() || 'UNGROUPED') + '_' + v.type;
    v.nicheMult = v.vpd / Math.max(nbase[k] || 0, 0.0001);
  });

  const group = all.filter(v => v.group.trim() === GROUP && v.type === TYPE && v.record === 'OUTLIER');
  console.log(GROUP + ' / ' + TYPE + '  outliers: ' + group.length);

  const globalBest = [...group].filter(v => v.nicheMult >= 1).sort((a, b) => strength(b) - strength(a))[0];
  console.log('header "Strongest Today" picks : ' + (globalBest ? globalBest.chMult.toFixed(1) + '× ' + globalBest.handle
    + '  (' + globalBest.ageTag + ', ' + globalBest.reason + ')' : 'none'));

  show('CURRENT — age tier, then reason, then strength', tieredFill(group, 6, 2));
  show('PROPOSED — one sort by strength with recency decay', weightedFill(group, 6, 2));
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
