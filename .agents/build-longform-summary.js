const allVideos = $('Score All Videos').all();

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const now = new Date().toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false
});

const istHour = new Date(
  new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
).getHours();

const yesterdaySnapshot = $('Get Yesterday Sheet3 Snapshot').all();
const yesterdayViewsMap = {};
for (const row of yesterdaySnapshot) {
  const vid = row.json && row.json['Video_ID'];
  if (vid) yesterdayViewsMap[vid] = parseInt(row.json['Views'] || '0');
}

const nicheEmojiMap = {
  'Amish Way':     '🌾',
  'FootyBallerIQ': '⚽',
  'FIN COMP':      '💰',
};

const nicheFrequency = {
  'Amish Way': '3PM_ONLY',
};

const TOP_LIMIT        = 6;
const RISING_LIMIT     = 4;
const MAX_PER_CHANNEL  = 2;

// A video below its niche's median velocity is not worth a Top slot however
// well it beat its own small channel — without this, 1.2K-view videos on
// 91-view channels displaced genuine breakouts. Rising Signals is left
// unfiltered so small-channel momentum still surfaces.
const NICHE_FLOOR = 1.0;

// ── Ranking: most recent best outlier across the niche ────────────
// The digest exists to surface the strongest CURRENT outlier, so niche
// magnitude is the signal and age is a hard discount. Exponential decay with
// a 14-day half-life: a stale giant must be far larger to outrank something
// from this week. Replaces the old age-tier -> reason -> score walk, where
// tiers dominated and a 21K-view FRESH video outranked a 10M-view one.
const RANK_HALF_LIFE = 14;

function rankScore(v) {
  const niche = Math.max(v.json.niche_outlier_score || 0, 0.01);
  const age   = Math.max(v.json.age_days || 0, 0);
  return niche * Math.pow(0.5, age / RANK_HALF_LIFE);
}

const CHANNEL_FLOOR = 1.0;

const TREMENDOUS_VPD_THRESHOLD = 1000000;
const TREMENDOUS_PCT_THRESHOLD = 50;
const RISING_VPD_THRESHOLD     = 200000;
const RISING_PCT_THRESHOLD     = 20;

function isTremendous(deltaViews, pct, context) {
  const vpdT = context === 'rising' ? RISING_VPD_THRESHOLD : TREMENDOUS_VPD_THRESHOLD;
  const pctT = context === 'rising' ? RISING_PCT_THRESHOLD : TREMENDOUS_PCT_THRESHOLD;
  return Math.abs(deltaViews) >= vpdT || Math.abs(pct) >= pctT;
}

function formatViews(num) {
  const sign = num < 0 ? '-' : '';
  const abs  = Math.abs(num);
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1000)    return sign + (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return sign + abs.toString();
}

// Bands rescaled 2026-08-25. Median-based channel baselines roughly doubled
// the outlier rate, so the old 3/8/15 read VOLCANIC every day.
function getNicheHeat(rate) {
  const pct    = parseFloat(rate);
  const label  = pct < 12 ? '🧊 COLD'
               : pct < 22 ? '🌤️ WARM'
               : pct < 32 ? '🔥 HOT'
               :             '🌋 VOLCANIC';
  const filled = Math.min(Math.round((pct / 40) * 10), 10);
  const bar    = '●'.repeat(filled) + '○'.repeat(10 - filled);
  return `${label}  ${bar}  ${pct}%`;
}

// Single ranked pass. Floors: must beat its own channel, and must be at or
// above the niche's median velocity. Both were needed — without them the list
// filled with videos that had underperformed their own channel.
function topFill(videos, limit, capPerChannel) {
  const result = [];
  const channelCount = {};
  const ranked = videos
    .filter(v => (v.json.niche_outlier_score || 0) >= NICHE_FLOOR)
    .filter(v => (v.json.channel_multiple || 0) >= CHANNEL_FLOOR)
    .sort((a, b) => rankScore(b) - rankScore(a));

  for (const v of ranked) {
    if (result.length >= limit) break;
    const ch = v.json.channel_id;
    if ((channelCount[ch] || 0) >= capPerChannel) continue;
    result.push(v);
    channelCount[ch] = (channelCount[ch] || 0) + 1;
  }
  return result;
}

// ── Rising Signals — FRESH only, no niche floor ───────────────────
// FAST_MOVER/EARLY_SIGNAL are age-gated at classification time, so this pool
// reflects genuine early momentum. Deliberately unfiltered by scale, so a
// small channel breaking out still gets seen.
function risingFill(videos, limit, capPerChannel, excludeIds) {
  const candidates = videos
    .filter(v => ['FAST_MOVER', 'EARLY_SIGNAL'].includes(v.json.outlier_reason))
    .filter(v => v.json.outlier_age_tag === 'FRESH')
    .filter(v => !excludeIds.has(v.json.video_id))
    .sort((a, b) => rankScore(b) - rankScore(a));

  const result       = [];
  const channelCount = {};
  for (const v of candidates) {
    if (result.length >= limit) break;
    const ch = v.json.channel_id;
    if ((channelCount[ch] || 0) >= capPerChannel) continue;
    result.push(v);
    channelCount[ch] = (channelCount[ch] || 0) + 1;
  }
  return result;
}

function formatDate(isoDate) {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const d = new Date(isoDate + 'T00:00:00Z');
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const month = months[d.getUTCMonth()];
  const year  = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

// Leads with what the video did and what that means for its channel, rather
// than a 0-10 score that saturated at 10 and hid the difference between a
// 12x and a 113x result.
function buildMetricsLines(v, context) {
  const views    = v.json.views;
  const likes    = v.json.likes;
  const comments = v.json.comments;
  const chMult   = v.json.channel_multiple;
  const chNormal = v.json.channel_avg_views;
  const niche    = v.json.niche_outlier_score;
  const pubDate  = v.json.published_at;

  const engagementRate = views > 0 ? (((likes + comments) / views) * 100).toFixed(2) : '0.00';

  const perf = `👁️ ${formatViews(views)} \`(${chMult}× their normal ${formatViews(chNormal)})\` · niche \`${niche}×\``;

  let vpdPart;
  if (pubDate === today) {
    vpdPart = '🆕 New Upload';
  } else {
    const prevViews = yesterdayViewsMap[v.json.video_id];
    if (prevViews !== undefined && prevViews > 0) {
      const delta  = views - prevViews;
      const pctNum = (delta / prevViews) * 100;
      const sign   = delta >= 0 ? '+' : '';
      vpdPart = isTremendous(delta, pctNum, context)
        ? `🔥\`${sign}${formatViews(delta)}\` (🔥**${sign}${pctNum.toFixed(1)}%**)`
        : `\`${sign}${formatViews(delta)}\` (${sign}${pctNum.toFixed(1)}%)`;
    } else {
      const ageDays = Math.max(1, Math.round(
        (new Date(today + 'T00:00:00Z') - new Date(pubDate + 'T00:00:00Z')) / 86400000));
      const avgVpd  = Math.round(views / ageDays);
      vpdPart = isTremendous(avgVpd, 0, context)
        ? `🔥**\`${formatViews(avgVpd)}/day\`**`
        : `\`${formatViews(avgVpd)}/day\``;
    }
  }

  return {
    line1: perf,
    line2: `👍 ${formatViews(likes)} | 💬 ${formatViews(comments)} | VPD ${vpdPart} | 📊 Eng \`${engagementRate}%\``,
  };
}

const reasonBadge = {
  BREAKOUT:        '🔥 BREAKOUT',
  FAST_MOVER:      '⚡ FAST_MOVER',
  HIGH_ENGAGEMENT: '💬 HIGH_ENGAGEMENT',
  VIRAL:           '🚀 VIRAL',
  EARLY_SIGNAL:    '📈 EARLY_SIGNAL',
  NICHE_BREAKOUT:  '🌐 NICHE_BREAKOUT',
};

const ageBadge = {
  FRESH:     '🆕 FRESH',
  SUSTAINED: '📊 SUSTAINED',
  LONG_TAIL: '🔁 LONG_TAIL',
  EVERGREEN: '🌲 EVERGREEN',
};

const badgeColor = {
  BREAKOUT:        0xE74C3C,
  FAST_MOVER:      0xF39C12,
  HIGH_ENGAGEMENT: 0xE91E63,
  VIRAL:           0x9B59B6,
  EARLY_SIGNAL:    0x1ABC9C,
  NICHE_BREAKOUT:  0x3498DB,
};

function buildEmbed(v, index, context) {
  const badge     = reasonBadge[v.json.outlier_reason] || v.json.outlier_reason;
  const age       = ageBadge[v.json.outlier_age_tag] || v.json.outlier_age_tag;
  const dateLabel = formatDate(v.json.published_at);
  const metrics   = buildMetricsLines(v, context);
  const color     = badgeColor[v.json.outlier_reason] || 0x95A5A6;

  return {
    title:       `${index}. ${badge} ${age} · ${dateLabel}`,
    description: `\`${v.json.title}\`\n${metrics.line1}\n${metrics.line2}\n${v.json.handle} | <${v.json.video_url}>`,
    url:         v.json.video_url,
    color:       color,
    image:       { url: v.json.thumbnail_url },
  };
}

function buildVideoEmbeds(top, rising) {
  const embeds = [];
  top.forEach((v, i) => embeds.push(buildEmbed(v, i + 1, 'main')));
  rising.forEach((v, i) => embeds.push(buildEmbed(v, top.length + i + 1, 'rising')));
  return embeds.slice(0, 10);
}

// Headline stat, ranked the same way the Top list is so the two agree.
function bestOf(videos) {
  const ranked = videos
    .filter(v => (v.json.niche_outlier_score || 0) >= NICHE_FLOOR)
    .filter(v => (v.json.channel_multiple || 0) >= CHANNEL_FLOOR)
    .sort((a, b) => rankScore(b) - rankScore(a));
  return ranked.length > 0 ? ranked[0] : null;
}

function bestLabel(v) {
  return v
    ? `\`${v.json.channel_multiple}× normal\` (${v.json.handle})`
    : '`N/A`';
}

const longFormVideos = allVideos.filter(v => v.json.video_type === 'LONG_FORM');

function buildSnapshot(videos) {
  const total    = videos.length;
  const channels = [...new Set(videos.map(v => v.json.channel_id))].length;
  const outliers = videos.filter(v => v.json.record_type === 'OUTLIER');
  const recent   = videos.filter(v => v.json.record_type === 'RECENT_UPLOAD');
  const rate     = total > 0 ? ((outliers.length / total) * 100).toFixed(1) : '0.0';

  const bestScorer = bestOf(outliers);

  const top    = topFill(outliers, TOP_LIMIT, MAX_PER_CHANNEL);
  const topIds = new Set(top.map(v => v.json.video_id));
  const rising = risingFill(outliers, RISING_LIMIT, MAX_PER_CHANNEL, topIds);

  return { total, channels, outliers, recent, rate, bestScorer, top, rising };
}

function buildHeader(emoji, label, stats) {
  return `${emoji} **${label} — Long-Form Intelligence ⏰ ${now} IST**

📊 **Snapshot**
📺 Channels: \`${stats.channels}\` | 🎬 Videos: \`${stats.total}\`
🔴 Outliers: \`${stats.outliers.length}\` | 🟢 Recent Uploads: \`${stats.recent.length}\`
⚡ Niche Heat: ${getNicheHeat(stats.rate)}
🏆 Strongest Today: ${bestLabel(stats.bestScorer)}

👇 Top ${stats.top.length} Winning + ${stats.rising.length} Rising below`;
}

const overallStats   = buildSnapshot(longFormVideos);
const overallContent = buildHeader('📺', 'All Long-Form Channels', overallStats);
const overallEmbeds  = buildVideoEmbeds(overallStats.top, overallStats.rising);

const outputs = [{
  json: { type: 'overall', group: 'ALL', emoji: '📺', content: overallContent, embeds: overallEmbeds }
}];

const nicheGroups = [...new Set(
  longFormVideos
    .filter(v => v.json.niche_group && v.json.niche_group.trim() !== '')
    .map(v => v.json.niche_group)
)];

for (const group of nicheGroups) {
  const freq = nicheFrequency[group] || 'ALL_MAIN';
  if (freq === '3PM_ONLY' && istHour !== 15) continue;

  const emoji = nicheEmojiMap[group] || '📺';
  const groupVideos = longFormVideos.filter(v => v.json.niche_group === group);
  const stats   = buildSnapshot(groupVideos);
  const content = buildHeader(emoji, group, stats);
  const embeds  = buildVideoEmbeds(stats.top, stats.rising);

  outputs.push({ json: { type: 'niche', group, emoji, content, embeds } });
}

return outputs;
