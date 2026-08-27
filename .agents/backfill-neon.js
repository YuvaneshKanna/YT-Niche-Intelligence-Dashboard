// One-time backfill: All_Video_Snapshots (2026-08-24 onward only — see
// .agents/neon-migration-spec.md for why: 6 gaps found in the sheet's
// history, and row volume grew ~10x as the tracked roster ramped up, so
// only the most recent gap-free, full-roster-scale segment is safe to
// backfill without distorting the dashboard's view-velocity charts.
//
// Source data already fetched to a local JSON file (see backfill-neon.md
// notes) — this script reads it, transforms into the 4-table shape, and
// upserts into Neon using the same conflict semantics as the live n8n
// dual-write nodes: channels/snapshots upsert, videos/video_meta
// insert-skip-on-conflict.
//
// Usage: node .agents/backfill-neon.js <path-to-raw-sheet-rows.json>

const fs = require('fs');
const path = require('path');
const { Client } = require('@neondatabase/serverless');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  const text = fs.readFileSync(file, 'utf8');
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

function serialToISODate(s) {
  const ms = Math.round((s - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function hmsToSeconds(hms) {
  // Sheets returns TIME-formatted cells as a fractional-day serial under
  // UNFORMATTED_VALUE (e.g. 0.0002777... = 24s), not "H:MM:SS" text —
  // handle both since the source column mixes representations.
  if (typeof hms === 'number') return Math.round(hms * 86400);
  const parts = String(hms || '0:00:00').split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Sheet columns (A..Y), 0-indexed:
// 0 Row_Key, 1 Snapshot_Date, 2 Record_Type, 3 Handle, 4 Channel_ID,
// 5 Video_ID, 6 Video_URL, 7 Video_Type, 8 Title, 9 Published_At,
// 10 Duration_HMS, 11 Thumbnail_URL, 12 Views, 13 Likes, 14 Comments,
// 15 Outlier_Score, 16 Outlier_Reason, 17 Outlier_Age_Tag, 18 Niche,
// 19 Category, 20 Format, 21 Produced_By, 22 Niche_Group,
// 23 Niche_Outlier_Score, 24 Baseline_Method

async function chunkedInsert(client, table, columns, rows, conflictTarget, conflictAction, chunkSize) {
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const tuples = [];
    let p = 1;
    for (const row of chunk) {
      const placeholders = columns.map(() => `$${p++}`);
      tuples.push(`(${placeholders.join(',')})`);
      values.push(...row);
    }
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT ${conflictTarget} ${conflictAction}`;
    await client.query(sql, values);
    written += chunk.length;
    process.stdout.write(`\r  ${table}: ${written}/${rows.length}`);
  }
  console.log('');
}

async function main() {
  const rawPath = process.argv[2];
  if (!rawPath) throw new Error('Usage: node backfill-neon.js <raw-sheet-rows.json>');
  const rows = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  console.log(`Loaded ${rows.length} raw sheet rows.`);

  const channelsMap = new Map();
  const videosMap = new Map();
  const videoMetaSet = new Set(); // dedup key: video_id|title|thumbnail_url
  const videoMeta = [];
  const snapshots = [];

  for (const r of rows) {
    if (!r[5]) continue; // no Video_ID — skip malformed row
    const snapshotDate = typeof r[1] === 'number' ? serialToISODate(r[1]) : String(r[1]).slice(0, 10);
    const publishedAt = typeof r[9] === 'number' ? serialToISODate(r[9]) : String(r[9] || '').slice(0, 10);
    const channelId = r[4] || '';
    const videoId = r[5];
    const videoType = (r[7] === 'SHORTS' || r[7] === 'LONG_FORM') ? r[7] : 'LONG_FORM';

    if (channelId && !channelsMap.has(channelId)) {
      // last-write-wins is fine here too, but first is enough for backfill
    }
    if (channelId) {
      channelsMap.set(channelId, [channelId, r[3] || '', r[18] || null, r[19] || null, r[20] || null, r[21] || null, r[22] || null]);
    }

    if (!videosMap.has(videoId) && channelId && publishedAt) {
      videosMap.set(videoId, [videoId, channelId, publishedAt, hmsToSeconds(r[10]), videoType]);
    }

    const metaKey = `${videoId}|${r[8] || ''}|${r[11] || ''}`;
    if (!videoMetaSet.has(metaKey)) {
      videoMetaSet.add(metaKey);
      videoMeta.push([videoId, r[8] || '', r[11] || null]);
    }

    snapshots.push([
      videoId, snapshotDate, r[2] || 'HISTORICAL',
      Number(r[12]) || 0, Number(r[13]) || 0, Number(r[14]) || 0,
      r[15] != null && r[15] !== '' ? Number(r[15]) : null,
      r[16] || null, r[17] || null,
      r[23] != null && r[23] !== '' ? Number(r[23]) : null,
      r[24] || null,
      true, // is_main_trigger — unknown for historical rows, default true
      snapshotDate, // fetched_at — real fetch time not recoverable, use snapshot date
    ]);
  }

  console.log(`Unique channels: ${channelsMap.size}, unique videos: ${videosMap.size}, video_meta rows: ${videoMeta.length}, snapshots: ${snapshots.length}`);

  const env = loadEnv();
  const client = new Client(env.DATABASE_URL_UNPOOLED);
  await client.connect();
  try {
    await client.query('BEGIN');

    await chunkedInsert(client, 'channels',
      ['channel_id', 'handle', 'niche', 'category', 'format', 'produced_by', 'niche_group'],
      Array.from(channelsMap.values()),
      '(channel_id)', 'DO UPDATE SET handle = EXCLUDED.handle, niche = EXCLUDED.niche, category = EXCLUDED.category, format = EXCLUDED.format, produced_by = EXCLUDED.produced_by, niche_group = EXCLUDED.niche_group, updated_at = now()',
      500);

    await chunkedInsert(client, 'videos',
      ['video_id', 'channel_id', 'published_at', 'duration_seconds', 'video_type'],
      Array.from(videosMap.values()),
      '(video_id)', 'DO NOTHING',
      500);

    await chunkedInsert(client, 'video_meta',
      ['video_id', 'title', 'thumbnail_url'],
      videoMeta,
      '(video_id, title, thumbnail_url)', 'DO NOTHING',
      500);

    await chunkedInsert(client, 'snapshots',
      ['video_id', 'snapshot_date', 'record_type', 'views', 'likes', 'comments', 'outlier_score', 'outlier_reason', 'outlier_age_tag', 'niche_outlier_score', 'baseline_method', 'is_main_trigger', 'fetched_at'],
      snapshots,
      '(video_id, snapshot_date)', 'DO UPDATE SET views = EXCLUDED.views, likes = EXCLUDED.likes, comments = EXCLUDED.comments, outlier_score = EXCLUDED.outlier_score, outlier_reason = EXCLUDED.outlier_reason, outlier_age_tag = EXCLUDED.outlier_age_tag, niche_outlier_score = EXCLUDED.niche_outlier_score, baseline_method = EXCLUDED.baseline_method',
      300);

    await client.query('COMMIT');
    console.log('Backfill committed.');

    // Verify by reading back counts.
    const counts = await client.query(`
      SELECT 'channels' t, count(*) c FROM channels
      UNION ALL SELECT 'videos', count(*) FROM videos
      UNION ALL SELECT 'video_meta', count(*) FROM video_meta
      UNION ALL SELECT 'snapshots', count(*) FROM snapshots
    `);
    console.log('Row counts now in Neon:');
    for (const row of counts.rows) console.log(`  ${row.t}: ${row.c}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
