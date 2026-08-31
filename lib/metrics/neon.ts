import { sql } from "./db"
import type { ChannelSnapshot, RecordType, VideoSnapshot, VideoType } from "./types"

// Neon-backed replacement for lib/metrics/sheets.ts. Same two functions,
// same return shapes — the aggregator (lib/metrics/aggregate.ts) is
// unchanged and cannot tell which source it got.
//
// Data comes from the Stage 2 dual-write tables (see .agents/schema.sql):
//   channel_snapshots ⋈ channels           → readChannelSnapshots
//   snapshots ⋈ videos ⋈ channels ⋈ meta   → readVideoSnapshots
//
// Deliberate differences from the Sheets path, all confirmed with the user:
//  - Classification (handle, niche, category, format, produced_by,
//    niche_group) is JOINed from `channels` at read time, not frozen onto
//    each row. Historical rows therefore reflect the *current* roster
//    classification — retroactively consistent grouping.
//  - `video_url` is not stored; it is derived from video_id + video_type
//    using the standard YouTube URL shapes.
//  - `duration_hms` is derived by formatting `videos.duration_seconds`.
//  - `outlier_reason` / `outlier_age_tag` are passed straight through:
//    Neon's copies are already correct, unlike the Sheets writer whose
//    crossed mapping `resolveOutlierLabels()` had to undo.

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const parsed = parseFloat(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

const str = (v: unknown): string => String(v ?? "").trim()

const asVideoType = (raw: string): VideoType => (raw === "SHORTS" ? "SHORTS" : "LONG_FORM")

const asRecordType = (raw: string): RecordType =>
  raw === "OUTLIER" || raw === "RECENT_UPLOAD" ? raw : "HISTORICAL"

/**
 * Seconds → "H:MM:SS" (hours not zero-padded), matching the Sheets output.
 *
 * `duration_seconds` is `INTEGER NOT NULL`, so a 0 is a real value (live
 * streams / premieres the YouTube API reports no length for) — emit
 * "0:00:00" for it, exactly as the Sheets `normaliseDuration(0)` did. Only a
 * negative / non-finite value is treated as garbage and blanked.
 */
export function secondsToHms(totalSeconds: unknown): string {
  const n = num(totalSeconds)
  if (!Number.isFinite(n) || n < 0) return ""
  const s = Math.round(n)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

/** The canonical watch/shorts URL for a video id — Neon does not store it. */
export function deriveVideoUrl(videoId: string, videoType: VideoType): string {
  return videoType === "SHORTS"
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`
}

export async function readChannelSnapshots(sinceDate: string): Promise<ChannelSnapshot[]> {
  const rows = (await sql()`
    SELECT
      cs.snapshot_date::text      AS snapshot_date,
      cs.channel_id               AS channel_id,
      c.handle                    AS handle,
      cs.subscribers              AS subscribers,
      cs.total_views::float8      AS total_views,
      cs.total_videos             AS total_videos,
      COALESCE(cs.country, '')    AS country,
      cs.fetched_at::text         AS fetched_at,
      COALESCE(c.produced_by, '') AS produced_by,
      COALESCE(c.niche, '')       AS niche,
      COALESCE(c.category, '')    AS category,
      COALESCE(c.format, '')      AS format,
      COALESCE(c.niche_group, '') AS niche_group
    FROM channel_snapshots cs
    JOIN channels c ON c.channel_id = cs.channel_id
    WHERE cs.snapshot_date >= ${sinceDate}
    ORDER BY cs.snapshot_date
  `) as Record<string, unknown>[]

  return rows.map((r) => {
    const snapshotDate = str(r.snapshot_date)
    const channelId = str(r.channel_id)
    return {
      rowKey: `${snapshotDate}_${channelId}`,
      snapshotDate,
      handle: str(r.handle),
      channelId,
      subscribers: num(r.subscribers),
      totalViews: num(r.total_views),
      totalVideos: num(r.total_videos),
      country: str(r.country),
      fetchedAt: str(r.fetched_at),
      producedBy: str(r.produced_by),
      niche: str(r.niche),
      category: str(r.category),
      format: str(r.format),
      nicheGroup: str(r.niche_group),
    }
  })
}

export async function readVideoSnapshots(sinceDate: string): Promise<VideoSnapshot[]> {
  const rows = (await sql()`
    SELECT
      s.video_id                    AS video_id,
      s.snapshot_date::text         AS snapshot_date,
      s.record_type                 AS record_type,
      v.channel_id                  AS channel_id,
      c.handle                      AS handle,
      vm.title                      AS title,
      vm.thumbnail_url              AS thumbnail_url,
      v.published_at::text          AS published_at,
      v.duration_seconds            AS duration_seconds,
      v.video_type                  AS video_type,
      s.views                       AS views,
      s.likes                       AS likes,
      s.comments                    AS comments,
      s.outlier_score               AS outlier_score,
      COALESCE(s.outlier_reason, '')  AS outlier_reason,
      COALESCE(s.outlier_age_tag, '') AS outlier_age_tag,
      COALESCE(c.produced_by, '')   AS produced_by,
      COALESCE(c.niche, '')         AS niche,
      COALESCE(c.category, '')      AS category,
      COALESCE(c.format, '')        AS format,
      COALESCE(c.niche_group, '')   AS niche_group
    FROM snapshots s
    JOIN videos v   ON v.video_id = s.video_id
    JOIN channels c ON c.channel_id = v.channel_id
    LEFT JOIN LATERAL (
      SELECT title, thumbnail_url
      FROM video_meta
      WHERE video_id = s.video_id
      ORDER BY changed_at DESC
      LIMIT 1
    ) vm ON true
    WHERE s.snapshot_date >= ${sinceDate}
    ORDER BY s.snapshot_date
  `) as Record<string, unknown>[]

  return rows.map((r) => {
    const videoId = str(r.video_id)
    const videoType = asVideoType(str(r.video_type))
    return {
      rowKey: `${str(r.snapshot_date)}_${videoId}`,
      snapshotDate: str(r.snapshot_date),
      recordType: asRecordType(str(r.record_type)),
      handle: str(r.handle),
      channelId: str(r.channel_id),
      videoId,
      videoUrl: deriveVideoUrl(videoId, videoType),
      title: str(r.title),
      publishedAt: str(r.published_at),
      durationHms: secondsToHms(r.duration_seconds),
      thumbnailUrl: str(r.thumbnail_url),
      videoType,
      views: num(r.views),
      likes: num(r.likes),
      comments: num(r.comments),
      outlierScore: num(r.outlier_score),
      outlierReason: str(r.outlier_reason).toUpperCase(),
      outlierAgeTag: str(r.outlier_age_tag).toUpperCase(),
      producedBy: str(r.produced_by),
      niche: str(r.niche),
      category: str(r.category),
      format: str(r.format),
      nicheGroup: str(r.niche_group),
    }
  })
}

/**
 * Oldest upload date on record for every channel, keyed by `channel_id`.
 *
 * This is the Chunk 2 **channel-age proxy**: `MIN(videos.published_at)`, not
 * the channel's creation date, which Neon does not store yet. Two things make
 * it a lower bound on real age rather than a measurement of it:
 *
 *  - Stage 2 fetches a slice of each channel's uploads, not the full back
 *    catalogue (median ~31 videos per channel), so a channel running for years
 *    at a high cadence can report a first upload only weeks old.
 *  - Channels with no rows in `videos` are simply absent from the map.
 *
 * The UI must label it as "oldest tracked upload", never as channel age.
 * Chunk 3 replaces it with the real created date from the channel scrape.
 *
 * Unwindowed on purpose — the whole point is to look further back than the
 * requested snapshot range. One grouped scan of `videos` (~6k rows), run once
 * per cache miss alongside the two snapshot reads.
 */
export async function readChannelFirstVideoDates(): Promise<Map<string, string>> {
  const rows = (await sql()`
    SELECT
      channel_id                AS channel_id,
      MIN(published_at)::text   AS first_video_at
    FROM videos
    WHERE published_at IS NOT NULL
    GROUP BY channel_id
  `) as Record<string, unknown>[]

  const byChannelId = new Map<string, string>()
  for (const r of rows) {
    const channelId = str(r.channel_id)
    const firstVideoAt = str(r.first_video_at)
    if (channelId && firstVideoAt) byChannelId.set(channelId, firstVideoAt)
  }
  return byChannelId
}

/**
 * One row of the per-channel measurements the ranking engine consumes.
 * Mirrors `ChannelMetricInput` in lib/scoring/types.ts minus `createdAt`,
 * which Neon does not hold and the YouTube reader supplies.
 */
export interface RankingRow {
  channelId: string
  handle: string
  niche: string
  category: string
  nicheGroup: string
  producedBy: string
  coverageDays: number
  viewsDelta: number
  subscriberDelta: number
  subscribersAtStart: number
  subscribers: number
  totalVideos: number
  totalViews: number
  longFormVideos: number
  shortsVideos: number
  longFormViews: number
  shortsViews: number
  trackedVideos: number
  outlierVideos: number
}

/**
 * Everything the ranking needs, over a trailing window, in one round trip.
 *
 * Deliberately anchored on `channel_snapshots` rather than the per-video
 * `snapshots` table. Stage 2 maintenance deletes HISTORICAL video rows after
 * 7 days, so beyond a week the video table retains only outliers and recent
 * uploads — ranking on it would be a survivor-biased sample that flatters any
 * channel that once had a hit. `channel_snapshots` is swept by nothing and is
 * complete for every day it covers, which makes it the only honest basis for a
 * window longer than 7 days.
 *
 * Video rows are still read, but only for what they can support: the
 * long-form/Shorts split that decides a channel's format class, and the share
 * of tracked videos flagged as outliers.
 */
export async function readRankingRows(sinceDate: string): Promise<RankingRow[]> {
  const rows = (await sql()`
    WITH cs_first AS (
      SELECT DISTINCT ON (channel_id)
        channel_id, subscribers, total_views
      FROM channel_snapshots
      WHERE snapshot_date >= ${sinceDate}
      ORDER BY channel_id, snapshot_date ASC
    ),
    cs_last AS (
      SELECT DISTINCT ON (channel_id)
        channel_id, subscribers, total_views, total_videos
      FROM channel_snapshots
      WHERE snapshot_date >= ${sinceDate}
      ORDER BY channel_id, snapshot_date DESC
    ),
    cov AS (
      SELECT channel_id, count(DISTINCT snapshot_date)::int AS days
      FROM channel_snapshots
      WHERE snapshot_date >= ${sinceDate}
      GROUP BY channel_id
    ),
    latest_video AS (
      SELECT DISTINCT ON (video_id) video_id, views, outlier_reason
      FROM snapshots
      WHERE snapshot_date >= ${sinceDate}
      ORDER BY video_id, snapshot_date DESC
    ),
    vf AS (
      SELECT
        v.channel_id,
        count(*) FILTER (WHERE v.video_type = 'LONG_FORM')::int          AS lf_n,
        count(*) FILTER (WHERE v.video_type = 'SHORTS')::int             AS sh_n,
        COALESCE(sum(lv.views) FILTER (WHERE v.video_type = 'LONG_FORM'), 0)::float8 AS lf_views,
        COALESCE(sum(lv.views) FILTER (WHERE v.video_type = 'SHORTS'), 0)::float8    AS sh_views,
        count(lv.video_id)::int                                          AS tracked,
        count(*) FILTER (
          WHERE lv.outlier_reason IS NOT NULL
            AND upper(TRIM(lv.outlier_reason)) NOT IN ('', 'NORMAL')
        )::int                                                           AS outliers
      FROM videos v
      LEFT JOIN latest_video lv ON lv.video_id = v.video_id
      GROUP BY v.channel_id
    )
    SELECT
      c.channel_id                       AS channel_id,
      c.handle                           AS handle,
      COALESCE(c.niche, '')              AS niche,
      COALESCE(c.category, '')           AS category,
      COALESCE(c.niche_group, '')        AS niche_group,
      COALESCE(c.produced_by, '')        AS produced_by,
      COALESCE(cov.days, 0)              AS coverage_days,
      GREATEST(COALESCE(cs_last.total_views, 0) - COALESCE(cs_first.total_views, 0), 0)::float8
                                         AS views_delta,
      (COALESCE(cs_last.subscribers, 0) - COALESCE(cs_first.subscribers, 0))
                                         AS subscriber_delta,
      COALESCE(cs_first.subscribers, 0)  AS subscribers_at_start,
      COALESCE(cs_last.subscribers, 0)   AS subscribers,
      COALESCE(cs_last.total_videos, 0)  AS total_videos,
      COALESCE(cs_last.total_views, 0)::float8 AS total_views,
      COALESCE(vf.lf_n, 0)               AS lf_n,
      COALESCE(vf.sh_n, 0)               AS sh_n,
      COALESCE(vf.lf_views, 0)::float8   AS lf_views,
      COALESCE(vf.sh_views, 0)::float8   AS sh_views,
      COALESCE(vf.tracked, 0)            AS tracked,
      COALESCE(vf.outliers, 0)           AS outliers
    FROM channels c
    LEFT JOIN cs_first  ON cs_first.channel_id  = c.channel_id
    LEFT JOIN cs_last   ON cs_last.channel_id   = c.channel_id
    LEFT JOIN cov       ON cov.channel_id       = c.channel_id
    LEFT JOIN vf        ON vf.channel_id        = c.channel_id
  `) as Record<string, unknown>[]

  return rows.map((r) => ({
    channelId: str(r.channel_id),
    handle: str(r.handle),
    niche: str(r.niche),
    category: str(r.category),
    nicheGroup: str(r.niche_group),
    producedBy: str(r.produced_by),
    coverageDays: num(r.coverage_days),
    viewsDelta: num(r.views_delta),
    subscriberDelta: num(r.subscriber_delta),
    subscribersAtStart: num(r.subscribers_at_start),
    subscribers: num(r.subscribers),
    totalVideos: num(r.total_videos),
    totalViews: num(r.total_views),
    longFormVideos: num(r.lf_n),
    shortsVideos: num(r.sh_n),
    longFormViews: num(r.lf_views),
    shortsViews: num(r.sh_views),
    trackedVideos: num(r.tracked),
    outlierVideos: num(r.outliers),
  }))
}

/** Oldest and newest snapshot day actually present in the window. */
export async function readCoverage(
  sinceDate: string
): Promise<{ start: string | null; end: string | null; days: number }> {
  const rows = (await sql()`
    SELECT min(snapshot_date)::text AS start,
           max(snapshot_date)::text AS "end",
           count(DISTINCT snapshot_date)::int AS days
    FROM channel_snapshots
    WHERE snapshot_date >= ${sinceDate}
  `) as Record<string, unknown>[]
  const r = rows[0] ?? {}
  return { start: str(r.start) || null, end: str(r.end) || null, days: num(r.days) }
}

/** What the Neon tables actually hold, for diagnosing an empty result. */
export interface NeonDiagnostics {
  table: string
  totalRows: number
  rowsInWindow: number
  newestDates: string[]
}

export async function diagnose(sinceDate: string): Promise<NeonDiagnostics[]> {
  const db = sql()
  const [snap, snapDates, chan, chanDates] = await Promise.all([
    db`SELECT count(*)::int AS total,
              count(*) FILTER (WHERE snapshot_date >= ${sinceDate})::int AS in_window
       FROM snapshots` as Promise<Record<string, unknown>[]>,
    db`SELECT DISTINCT snapshot_date::text AS d FROM snapshots ORDER BY d DESC LIMIT 5` as Promise<
      Record<string, unknown>[]
    >,
    db`SELECT count(*)::int AS total,
              count(*) FILTER (WHERE snapshot_date >= ${sinceDate})::int AS in_window
       FROM channel_snapshots` as Promise<Record<string, unknown>[]>,
    db`SELECT DISTINCT snapshot_date::text AS d FROM channel_snapshots ORDER BY d DESC LIMIT 5` as Promise<
      Record<string, unknown>[]
    >,
  ])

  return [
    {
      table: "snapshots",
      totalRows: num(snap[0]?.total),
      rowsInWindow: num(snap[0]?.in_window),
      newestDates: snapDates.map((r) => str(r.d)),
    },
    {
      table: "channel_snapshots",
      totalRows: num(chan[0]?.total),
      rowsInWindow: num(chan[0]?.in_window),
      newestDates: chanDates.map((r) => str(r.d)),
    },
  ]
}
