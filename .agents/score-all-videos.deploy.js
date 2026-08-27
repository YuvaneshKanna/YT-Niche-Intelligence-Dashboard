
// ── STEP 1: Flatten all videos ────────────────────────────────────
const allVideos  = [];
// ── Detect trigger type ───────────────────────────────────────────
let isMainTrigger = true;
try {
  $('Prepare Channel Requests').first();
} catch(e) {
  isMainTrigger = false;
}
const apiItems   = $input.all();
const batchItems = $('Flatten + Batch Video IDs').all();

const today     = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const fetchedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace('T', ' ');
const nowMs     = Date.now();

for (let i = 0; i < apiItems.length; i++) {
  const apiVideos      = apiItems[i].json.items || [];
  const videosMetadata = (batchItems[i] || { json: {} }).json.videos_metadata || [];

  const metaMap = {};
  for (const meta of videosMetadata) metaMap[meta.video_id] = meta;

  for (const video of apiVideos) {
    const id      = video.id;
    const snippet = video.snippet        || {};
    const stats   = video.statistics     || {};
    const cd      = video.contentDetails || {};
    const meta    = metaMap[id]          || {};

    // Parse duration
    const dur    = cd.duration || '';
    const dm     = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const durSec = dm ? ((+dm[1]||0)*3600) + ((+dm[2]||0)*60) + (+dm[3]||0) : 0;
    const h = Math.floor(durSec / 3600);
    const m = Math.floor((durSec % 3600) / 60);
    const s = durSec % 60;
    const durHMS = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    // Source playlist tag takes priority over duration check
    const sourcePl  = meta.source_playlist || '';
    const videoType = sourcePl === 'SHORTS'         ? 'SHORTS'
                    : sourcePl === 'LONG_FORM'       ? 'LONG_FORM'
                    : (durSec > 0 && durSec < 60)   ? 'SHORTS'
                    :                                  'LONG_FORM';

    const views    = parseInt(stats.viewCount    || '0');
    const likes    = parseInt(stats.likeCount    || '0');
    const comments = parseInt(stats.commentCount || '0');

    const pubRaw   = snippet.publishedAt || meta.published_at || '';
    const pubDate  = pubRaw.split('T')[0];
    const ageDays  = pubDate ? (nowMs - new Date(pubDate)) / 86400000 : 999;

    allVideos.push({
      _id:        id,
      _channelId: meta.channel_id  || snippet.channelId || '',
      _handle:    meta.handle      || '',
      _niche:     meta.niche       || '',
      _sub:       meta.category    || '',
      _format:    meta.format      || '',
      _prod:      meta.produced_by || '',
      _nichgrp:   meta.niche_group || '',
      _title:     snippet.title    || '',
      _pub:       pubDate,
      _durHMS:    durHMS,
      _thumb:     snippet.thumbnails?.maxres?.url
               || snippet.thumbnails?.high?.url
               || '',
      _url:       videoType === 'SHORTS'
                  ? `https://youtube.com/shorts/${id}`
                  : `https://youtube.com/watch?v=${id}`,
      _views:     views,
      _likes:     likes,
      _comments:  comments,
      _ageDays:   ageDays,
      _vpd:       views / Math.max(ageDays, 1),
      _videoType: videoType,
    });
  }
}

// ── STEP 2: Two baselines ────────────────────────────────────────
// CHANNEL baseline answers "unusual FOR THIS CHANNEL?"
//   MEDIAN views of the channel's OTHER videos of the same format.
//   The video being scored is never part of its own baseline — that
//   was the old bug: a channel with a single video in the window was
//   compared against itself and always scored exactly 1.0x.
//   Preferred sample is peers inside the recency window (Shorts 60d,
//   Long-Form 90d). Channels that upload too rarely to fill that
//   window fall back to their most recent RECENT_PEERS uploads, so a
//   three-videos-a-year channel is judged against its own history
//   instead of against nothing.
//
// NICHE baseline answers "unusual FOR THE NICHE?"
//   MEDIAN views-per-day across every tracked video in the same
//   Niche_Group + Video_Type. Catches videos that are extraordinary in
//   absolute terms even where the channel's own bar is already high —
//   a 10M-view video on a channel whose median is 5.5M is only 1.8x
//   for its channel but enormous for the niche.

const MIN_PEERS_IN_WINDOW     = 3;
const RECENT_PEERS            = 10;
const NICHE_OUTLIER_THRESHOLD = 8.0;
const NICHE_PROMOTE_MAX_AGE   = 90;   // days — stops the whole back
                                      // catalogue re-flagging daily
const NICHE_PROMOTE_MIN_CHANNEL = 1.0; // a niche breakout must at least match
                                       // its own channel's normal
const NICHE_PROMOTE_MIN_AGE   = 7;    // days — views-per-day is meaningless
                                      // before this. A video published today
                                      // has age clamped to 1 day, so its vpd
                                      // is its entire view count and it would
                                      // out-score everything. Day-0 breakouts
                                      // are already caught by the channel-level
                                      // FAST_MOVER / EARLY_SIGNAL path.

function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Pool by channel + format, newest first.
const chPool = {};
for (const v of allVideos) {
  const key = `${v._channelId}_${v._videoType}`;
  if (!chPool[key]) chPool[key] = [];
  chPool[key].push(v);
}
for (const key of Object.keys(chPool)) {
  chPool[key].sort((a, b) => a._ageDays - b._ageDays);
}

function channelBaseline(v) {
  const key    = `${v._channelId}_${v._videoType}`;
  const window = v._videoType === 'SHORTS' ? 60 : 90;
  const peers  = (chPool[key] || []).filter(p => p._id !== v._id);

  if (peers.length === 0) return { value: null, method: 'NO_PEERS' };

  const inWindow = peers.filter(p => p._ageDays <= window);
  if (inWindow.length >= MIN_PEERS_IN_WINDOW) {
    return { value: median(inWindow.map(p => p._views)), method: 'WINDOW' };
  }
  const recent = peers.slice(0, RECENT_PEERS);
  return { value:  median(recent.map(p => p._views)),
           method: 'RECENT_' + recent.length };
}

// Grouping key for the niche baseline. Niche_Group is unset on most of the
// roster, so falling back to Niche keeps football, finance and culture in
// separate pools instead of collapsing them into one meaningless bucket.
function nicheKeyFor(v) {
  const grp = (v._nichgrp || '').trim() || (v._niche || '').trim() || 'UNGROUPED';
  return grp + '_' + v._videoType;
}

// Niche baseline is computed once per group rather than per video.
// Excluding self would be marginally more correct, but at these sample
// sizes it moves the median by less than the noise it removes, and
// per-video recomputation is O(n^2) on a single-core box.
const nichePool = {};
for (const v of allVideos) {
  const key = nicheKeyFor(v);
  if (!nichePool[key]) nichePool[key] = [];
  nichePool[key].push(v._vpd);
}
const nicheBaseline = {};
for (const [key, vpds] of Object.entries(nichePool)) {
  nicheBaseline[key] = median(vpds);
}

// ── STEP 3: Score + classify + output ────────────────────────────
return allVideos.map(v => {
  const base        = channelBaseline(v);
  const hasBaseline = base.value !== null;
  const chAvg       = hasBaseline ? Math.max(base.value, 1) : 0;

  const likeRate  = v._views > 0 ? v._likes    / v._views : 0;
  const commRate  = v._views > 0 ? v._comments / v._views : 0;
  const engBonus  = Math.min((likeRate / 0.05) + (commRate / 0.005), 1);
  const perfRatio = hasBaseline ? v._views / chAvg : 0;

  const nicheKey   = nicheKeyFor(v);
  const nicheBase  = Math.max(nicheBaseline[nicheKey] || 0, 0.0001);
  const nicheScore = parseFloat(Math.min(v._vpd / nicheBase, 999).toFixed(2));

  let rawScore = 0;
  let reason   = 'INSUFFICIENT_DATA';

  if (hasBaseline && v._videoType === 'SHORTS') {
    // Shorts — tighter recency windows — baseline: Shorts peers only
    const recencyBonus = v._ageDays <= 1 ? 1.5
                       : v._ageDays <= 3 ? 1.2
                       : 1.0;

    rawScore = ((perfRatio * recencyBonus) * 0.7) + (engBonus * 0.3);

    if      (rawScore >= 5.0)                              reason = 'BREAKOUT';
    else if (rawScore >= 3.0 && v._ageDays <= 1)           reason = 'FAST_MOVER';
    else if (rawScore >= 3.0 && likeRate > 0.05)           reason = 'HIGH_ENGAGEMENT';
    else if (rawScore >= 3.0)                              reason = 'VIRAL';
    else if (v._views > chAvg * 2 && v._ageDays <= 3)      reason = 'EARLY_SIGNAL';
    else                                                   reason = 'NORMAL';

  } else if (hasBaseline) {
    // Long-Form — wider recency windows — baseline: Long-Form peers only
    const recencyBonus = v._ageDays <= 3 ? 1.5
                       : v._ageDays <= 7 ? 1.2
                       : 1.0;

    rawScore = ((perfRatio * recencyBonus) * 0.7) + (engBonus * 0.3);

    if      (rawScore >= 5.0)                              reason = 'BREAKOUT';
    else if (rawScore >= 3.0 && v._ageDays <= 3)           reason = 'FAST_MOVER';
    else if (rawScore >= 3.0 && likeRate > 0.08)           reason = 'HIGH_ENGAGEMENT';
    else if (rawScore >= 3.0)                              reason = 'VIRAL';
    else if (v._views > chAvg * 2 && v._ageDays <= 7)      reason = 'EARLY_SIGNAL';
    else                                                   reason = 'NORMAL';
  }

  const isChannelOutlier = hasBaseline
                        && (rawScore >= 3.0 || reason === 'EARLY_SIGNAL');

  // A niche breakout must still have matched its own channel. Without this a
  // video could be promoted while doing 0.2x its channel's normal — it only
  // looked strong against the niche because views-per-day flatters anything
  // recent, and that is not a win worth putting in front of anyone.
  const isNicheOutlier = nicheScore >= NICHE_OUTLIER_THRESHOLD
                      && perfRatio >= NICHE_PROMOTE_MIN_CHANNEL
                      && v._ageDays >= NICHE_PROMOTE_MIN_AGE
                      && v._ageDays <= NICHE_PROMOTE_MAX_AGE;

  if (isNicheOutlier && (reason === 'NORMAL' || reason === 'INSUFFICIENT_DATA')) {
    reason = 'NICHE_BREAKOUT';
  }

  // Cap at 10.0 — presented as X.XX / 10
  // rawScore used for classification, capped score for display
  const score = parseFloat(Math.min(rawScore, 10).toFixed(2));

  // Age tag — independent of performance score.
  // Bands differ by format. A Short's useful life is roughly a week, so the
  // long-form thresholds reported almost every Short as FRESH and the tiered
  // Discord fill had nothing to sort by.
  const ageTag = v._videoType === 'SHORTS'
    ? (v._ageDays > 45 ? 'EVERGREEN'
     : v._ageDays > 14 ? 'LONG_TAIL'
     : v._ageDays > 3  ? 'SUSTAINED'
     :                   'FRESH')
    : (v._ageDays > 90 ? 'EVERGREEN'
     : v._ageDays > 30 ? 'LONG_TAIL'
     : v._ageDays > 7  ? 'SUSTAINED'
     :                   'FRESH');

  const isOutlier  = isChannelOutlier || isNicheOutlier;
  const recordType = isOutlier       ? 'OUTLIER'
                   : v._ageDays <= 7 ? 'RECENT_UPLOAD'
                   :                   'HISTORICAL';

  return { json: {
    row_key:             `${today}_${v._id}`,
    snapshot_date:       today,
    record_type:         recordType,
    video_type:          v._videoType,
    handle:              v._handle,
    channel_id:          v._channelId,
    video_id:            v._id,
    video_url:           v._url,
    title:               v._title,
    published_at:        v._pub,
    duration_hms:        v._durHMS,
    thumbnail_url:       v._thumb,
    views:               v._views,
    likes:               v._likes,
    comments:            v._comments,
    channel_avg_views:   Math.round(chAvg),
    channel_multiple:    parseFloat(perfRatio.toFixed(1)),
    age_days:            parseFloat(v._ageDays.toFixed(1)),
    outlier_score:       score,
    outlier_reason:      reason,
    outlier_age_tag:     ageTag,
    niche_outlier_score: nicheScore,
    views_per_day:       Math.round(v._vpd),
    baseline_method:     base.method,
    niche:               v._niche,
    category:            v._sub,
    format:              v._format,
    produced_by:         v._prod,
    niche_group:         v._nichgrp,
    fetched_at:          fetchedAt,
    is_main_trigger:     isMainTrigger,
  }};
});
