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

/** Seconds → "H:MM:SS" (hours not zero-padded), matching the Sheets output. */
export function secondsToHms(totalSeconds: unknown): string {
  const n = num(totalSeconds)
  if (n <= 0) return ""
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
