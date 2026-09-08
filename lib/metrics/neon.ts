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

/**
 * Per-channel RPM from the Stage 3 NexLev enrichment tables, and a per-niche
 * median as a fallback for niche groups no enriched channel belongs to yet.
 *
 * Which column is "the" RPM depends on what the channel actually publishes,
 * because NexLev measures the two formats separately and they are an order of
 * magnitude apart:
 *
 *  - `SHORTS_ONLY` → `short_rpm`. Shorts RPM is genuinely ~$0.04, not a
 *    scaling bug; a Shorts-only channel scored on its long-form RPM would be
 *    credited with revenue it cannot earn.
 *  - everything else (`MIXED`, `LONG_ONLY`, and rows with no `channel_type`)
 *    → `long_rpm`.
 *  - `batch_rpm` as the fallback, which is what the ~150-channel tail has:
 *    the weekly `get_batch_channel_metrics_v2` layer covers the whole roster
 *    and writes only `batch_rpm`, while the nightly geography layer that
 *    writes `long_rpm`/`short_rpm` is capped at 20 channels a day.
 *
 * `batch_rpm` is a NexLev model prediction and `long_rpm` a measurement, so
 * they are deliberately not merged in the schema (see .agents/schema.sql) —
 * this is a read-time preference order, measured first, predicted second.
 *
 * Neon-only: the Sheets path has no enrichment tables and leaves both maps
 * undefined, which puts the opportunity score back on the niche-profile
 * estimate exactly as before.
 */
export interface NexlevRpm {
  /** Effective RPM per `channel_id`. */
  byChannelId: Map<string, number>
  /** Median effective RPM per lowercase `channels.niche`. */
  byNiche: Map<string, number>
}

export async function readNexlevRpm(): Promise<NexlevRpm> {
  const rows = (await sql()`
    SELECT
      n.channel_id                 AS channel_id,
      lower(COALESCE(c.niche, '')) AS niche,
      COALESCE(
        CASE WHEN n.channel_type = 'SHORTS_ONLY' THEN n.short_rpm ELSE n.long_rpm END,
        n.batch_rpm
      )::float8                    AS rpm
    FROM channel_nexlev n
    JOIN channels c ON c.channel_id = n.channel_id
    WHERE COALESCE(
      CASE WHEN n.channel_type = 'SHORTS_ONLY' THEN n.short_rpm ELSE n.long_rpm END,
      n.batch_rpm
    ) IS NOT NULL
  `) as Record<string, unknown>[]

  const byChannelId = new Map<string, number>()
  const perNiche = new Map<string, number[]>()

  for (const r of rows) {
    const channelId = str(r.channel_id)
    if (!channelId) continue
    const rpm = num(r.rpm)
    byChannelId.set(channelId, rpm)

    const niche = str(r.niche)
    if (!niche) continue
    const bucket = perNiche.get(niche)
    if (bucket) bucket.push(rpm)
    else perNiche.set(niche, [rpm])
  }

  const byNiche = new Map<string, number>()
  for (const [niche, values] of perNiche) {
    values.sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    byNiche.set(
      niche,
      values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]
    )
  }

  return { byChannelId, byNiche }
}

/**
 * Everything `channel_nexlev` knows about one channel, unaggregated.
 *
 * `readNexlevRpm` above collapses this table to a single effective RPM per
 * channel because that is all the opportunity score needs. The niche
 * drill-down page needs the parts that collapse throws away — the long/short
 * RPM split, the revenue figures, and the audience JSONB — so this reader
 * returns the row as-is and lets the caller decide.
 *
 * Every numeric field is nullable on purpose: NexLev returns partial rows for
 * channels it has thin data on, and a missing RPM must stay missing rather
 * than read as $0.
 */
export interface NexlevChannelDetail {
  channelId: string
  handle: string
  nicheGroup: string
  channelType: string | null
  categoryRpm: number | null
  longRpm: number | null
  shortRpm: number | null
  monthRevenue: number | null
  monthLongRevenue: number | null
  monthShortRevenue: number | null
  longViewCount: number | null
  shortViewCount: number | null
  weightedAvgDuration: number | null
  /** NexLev's gender split, shape as returned. Null when not enriched. */
  gender: unknown
  /** NexLev's age-band split, shape as returned. Null when not enriched. */
  age: unknown
  /** NexLev's per-country viewership split, shape as returned. */
  viewershipCountry: unknown
  fetchedAt: string | null
}

const nullableNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

const nullableStr = (v: unknown): string | null => {
  const s = str(v)
  return s === "" ? null : s
}

/**
 * NexLev enrichment for every channel in one niche group.
 *
 * A channel whose `niche_group` is blank belongs to the "Overall" bucket —
 * the same fold `lib/metrics/aggregate.ts` applies via `UNGROUPED`, repeated
 * here in SQL so the two agree on which channels a group contains.
 *
 * Returns only channels that have a `channel_nexlev` row; the caller knows
 * the group's full channel list from the metrics payload and can report
 * coverage by comparing the two.
 */
export async function readNexlevChannels(nicheGroup: string): Promise<NexlevChannelDetail[]> {
  const rows = (await sql()`
    SELECT
      n.channel_id            AS channel_id,
      c.handle                AS handle,
      COALESCE(NULLIF(btrim(c.niche_group), ''), 'Overall') AS niche_group,
      n.channel_type          AS channel_type,
      n.category_rpm::float8  AS category_rpm,
      n.long_rpm::float8      AS long_rpm,
      n.short_rpm::float8     AS short_rpm,
      n.month_revenue::float8 AS month_revenue,
      n.month_long_revenue::float8  AS month_long_revenue,
      n.month_short_revenue::float8 AS month_short_revenue,
      n.long_view_count       AS long_view_count,
      n.short_view_count      AS short_view_count,
      n.weighted_avg_duration AS weighted_avg_duration,
      n.gender                AS gender,
      n.age                   AS age,
      n.viewership_country    AS viewership_country,
      n.fetched_at            AS fetched_at
    FROM channel_nexlev n
    JOIN channels c ON c.channel_id = n.channel_id
    WHERE COALESCE(NULLIF(btrim(c.niche_group), ''), 'Overall') = ${nicheGroup}
      AND n.fetched_at IS NOT NULL
    ORDER BY c.handle
  `) as Record<string, unknown>[]

  return rows.map((r) => ({
    channelId: str(r.channel_id),
    handle: str(r.handle),
    nicheGroup: str(r.niche_group),
    channelType: nullableStr(r.channel_type),
    categoryRpm: nullableNum(r.category_rpm),
    longRpm: nullableNum(r.long_rpm),
    shortRpm: nullableNum(r.short_rpm),
    monthRevenue: nullableNum(r.month_revenue),
    monthLongRevenue: nullableNum(r.month_long_revenue),
    monthShortRevenue: nullableNum(r.month_short_revenue),
    longViewCount: nullableNum(r.long_view_count),
    shortViewCount: nullableNum(r.short_view_count),
    weightedAvgDuration: nullableNum(r.weighted_avg_duration),
    gender: r.gender ?? null,
    age: r.age ?? null,
    viewershipCountry: r.viewership_country ?? null,
    fetchedAt: r.fetched_at ? String(r.fetched_at) : null,
  }))
}

/**
 * One tracked video, reduced to what an ideation analysis needs.
 *
 * Deliberately NOT windowed. `videos` and `video_meta` are permanent — only
 * `snapshots` rows are pruned — so the title record goes back to 2017 even
 * though the per-day metrics do not. Judging what a niche makes, and which of
 * it works, is a question about the whole history, not the last 30 days.
 */
export interface CorpusVideo {
  videoId: string
  channelId: string
  handle: string
  title: string
  videoType: VideoType
  durationSeconds: number
  publishedAt: string
  /** Highest view count ever observed. Null when no snapshot carries one. */
  views: number | null
  /** Days between publication and the last snapshot that saw this video. */
  observedDays: number
  /** Best outlier score ever recorded for this video. */
  outlierScore: number
}

/**
 * The full title corpus for one niche group.
 *
 * Views come from `max(views)`, i.e. lifetime-to-last-observation rather than
 * a windowed delta. That is the right basis for "did this idea work", but it
 * is age-biased by construction — a 2023 upload has had three years to
 * accumulate. Callers MUST normalise before comparing (lib/niche/ideation.ts
 * ranks within channel and format rather than comparing raw counts).
 */
export async function readNicheCorpus(nicheGroup: string): Promise<CorpusVideo[]> {
  const rows = (await sql()`
    SELECT
      v.video_id                                   AS video_id,
      v.channel_id                                 AS channel_id,
      c.handle                                     AS handle,
      vm.title                                     AS title,
      v.video_type                                 AS video_type,
      v.duration_seconds                           AS duration_seconds,
      v.published_at::text                         AS published_at,
      agg.max_views                                AS views,
      agg.last_seen::text                          AS last_seen,
      COALESCE(agg.max_outlier, 0)::float8         AS outlier_score
    FROM videos v
    JOIN channels c ON c.channel_id = v.channel_id
    -- Titles change; take the most recent one the pipeline recorded.
    JOIN LATERAL (
      SELECT title FROM video_meta m
      WHERE m.video_id = v.video_id
      ORDER BY changed_at DESC LIMIT 1
    ) vm ON true
    LEFT JOIN LATERAL (
      SELECT max(s.views) AS max_views,
             max(s.snapshot_date) AS last_seen,
             max(s.outlier_score) AS max_outlier
      FROM snapshots s WHERE s.video_id = v.video_id
    ) agg ON true
    WHERE COALESCE(NULLIF(btrim(c.niche_group), ''), 'Overall') = ${nicheGroup}
  `) as Record<string, unknown>[]

  return rows.map((r) => {
    const publishedAt = str(r.published_at)
    const lastSeen = str(r.last_seen)
    const views = r.views === null || r.views === undefined ? null : num(r.views)
    const observedDays =
      publishedAt && lastSeen
        ? Math.max(
            1,
            Math.round((Date.parse(lastSeen) - Date.parse(publishedAt)) / 86400000)
          )
        : 1
    return {
      videoId: str(r.video_id),
      channelId: str(r.channel_id),
      handle: str(r.handle),
      title: str(r.title),
      videoType: asVideoType(str(r.video_type)),
      durationSeconds: num(r.duration_seconds),
      publishedAt,
      views,
      observedDays,
      outlierScore: num(r.outlier_score),
    }
  })
}
