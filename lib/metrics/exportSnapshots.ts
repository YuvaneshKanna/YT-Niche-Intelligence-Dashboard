// The Dashboard's snapshot export: `All_Video_Snapshots` and
// `Sheet4_Daily_Channel_Snapshot` reproduced as ONE flat sheet.
//
// The two tabs share eight columns (Snapshot_Date, Handle, Channel_ID and the
// five Context fields); those appear once here, not twice. Every other column
// from either tab is carried through under its exact sheet name, in the
// banner order the sheets themselves use.
//
// Row grain is one video-snapshot per row, with that channel's same-day
// Sheet4 figures joined on (channel_id, snapshot_date). Measured against the
// live database, every video row has a matching channel-day row, but 2,612 of
// 6,450 channel-days (40%) carry no video at all — a video-only export would
// silently drop those, so they are emitted as `CHANNEL_ONLY` rows with the
// video columns blank. The result is a strict superset of both tabs.
//
// Two columns the rest of the app never reads live only here:
// `Niche_Outlier_Score` and `Baseline_Method` (All_Video_Snapshots cols X, Y),
// populated on ~74% of snapshot rows.

import { sql } from "@/lib/metrics/db"
import { deriveVideoUrl, secondsToHms } from "@/lib/metrics/neon"
import type { VideoType } from "@/lib/metrics/types"

export type TrackingFilter = "YES" | "NO" | "ALL"

export interface SnapshotExportFilters {
  /** Niche names to keep. Empty/undefined means every niche. */
  niches?: string[]
  tracking: TrackingFilter
  /** Inclusive ISO date bounds. Undefined means unbounded on that side. */
  from?: string
  to?: string
}

/** One row of the combined sheet, in column order. */
export interface CombinedSnapshotRow {
  rowKey: string
  snapshotDate: string
  recordType: string
  handle: string
  channelId: string
  videoId: string
  videoUrl: string
  videoType: string
  title: string
  publishedAt: string
  durationHms: string
  thumbnailUrl: string
  views: number | null
  likes: number | null
  comments: number | null
  outlierScore: number | null
  outlierReason: string
  outlierAgeTag: string
  nicheOutlierScore: number | null
  baselineMethod: string
  subscribers: number | null
  totalViews: number | null
  totalVideos: number | null
  country: string
  niche: string
  category: string
  format: string
  producedBy: string
  nicheGroup: string
  fetchedAt: string
}

/**
 * Sheet column headers, in order, with the banner group each one sits under in
 * the source spreadsheet. Labels are the sheets' own header text verbatim —
 * renaming one breaks parity with the tab it came from.
 */
export const COMBINED_COLUMNS: {
  group: string
  label: string
  key: keyof CombinedSnapshotRow
}[] = [
  { group: "Primary Key", label: "Row_Key", key: "rowKey" },
  { group: "Snapshot", label: "Snapshot_Date", key: "snapshotDate" },
  { group: "Snapshot", label: "Record_Type", key: "recordType" },
  { group: "Identity", label: "Handle", key: "handle" },
  { group: "Identity", label: "Channel_ID", key: "channelId" },
  { group: "Identity", label: "Video_ID", key: "videoId" },
  { group: "Identity", label: "Video_URL", key: "videoUrl" },
  { group: "Identity", label: "Video_Type", key: "videoType" },
  { group: "Metadata", label: "Title", key: "title" },
  { group: "Metadata", label: "Published_At", key: "publishedAt" },
  { group: "Metadata", label: "Duration_HMS", key: "durationHms" },
  { group: "Metadata", label: "Thumbnail_URL", key: "thumbnailUrl" },
  { group: "Video Metrics", label: "Views", key: "views" },
  { group: "Video Metrics", label: "Likes", key: "likes" },
  { group: "Video Metrics", label: "Comments", key: "comments" },
  { group: "Outlier", label: "Outlier_Score", key: "outlierScore" },
  { group: "Outlier", label: "Outlier_Reason", key: "outlierReason" },
  { group: "Outlier", label: "Outlier_Age_Tag", key: "outlierAgeTag" },
  { group: "Outlier", label: "Niche_Outlier_Score", key: "nicheOutlierScore" },
  { group: "Outlier", label: "Baseline_Method", key: "baselineMethod" },
  { group: "Channel Daily", label: "Subscribers", key: "subscribers" },
  { group: "Channel Daily", label: "Total_Views", key: "totalViews" },
  { group: "Channel Daily", label: "Total_Videos", key: "totalVideos" },
  { group: "Channel Daily", label: "Country", key: "country" },
  { group: "Context", label: "Niche", key: "niche" },
  { group: "Context", label: "Category", key: "category" },
  { group: "Context", label: "Format", key: "format" },
  { group: "Context", label: "Produced_By", key: "producedBy" },
  { group: "Context", label: "Niche_Group", key: "nicheGroup" },
  { group: "Audit", label: "Fetched_At", key: "fetchedAt" },
]

export interface SnapshotExportOptions {
  /** Oldest and newest snapshot date held in either table, ISO. */
  minDate: string | null
  maxDate: string | null
  niches: { niche: string; channels: number }[]
  tracking: { yes: number; no: number; unknown: number }
}

const str = (v: unknown): string => (v == null ? "" : String(v))
const numOrNull = (v: unknown): number | null =>
  v == null || v === "" ? null : Number(v)

/**
 * Both filters are expressed as "NULL means no filter" so the whole thing
 * stays one prepared statement instead of string-built SQL.
 */
function filterParams(filters: SnapshotExportFilters) {
  const niches = filters.niches && filters.niches.length > 0 ? filters.niches : null
  const tracking = filters.tracking === "ALL" ? null : filters.tracking === "YES"
  return { niches, tracking, from: filters.from ?? null, to: filters.to ?? null }
}

/** Everything the export modal needs to render its controls. */
export async function readExportOptions(): Promise<SnapshotExportOptions> {
  const [bounds] = (await sql()`
    SELECT
      LEAST(
        (SELECT MIN(snapshot_date) FROM snapshots),
        (SELECT MIN(snapshot_date) FROM channel_snapshots)
      )::text AS min_date,
      GREATEST(
        (SELECT MAX(snapshot_date) FROM snapshots),
        (SELECT MAX(snapshot_date) FROM channel_snapshots)
      )::text AS max_date
  `) as Record<string, unknown>[]

  const niches = (await sql()`
    SELECT COALESCE(NULLIF(niche, ''), '(none)') AS niche, COUNT(*)::int AS channels
    FROM channels
    GROUP BY 1
    ORDER BY 2 DESC, 1
  `) as Record<string, unknown>[]

  const [tracking] = (await sql()`
    SELECT
      COUNT(*) FILTER (WHERE tracking IS TRUE)::int  AS yes,
      COUNT(*) FILTER (WHERE tracking IS FALSE)::int AS no,
      COUNT(*) FILTER (WHERE tracking IS NULL)::int  AS unknown
    FROM channels
  `) as Record<string, unknown>[]

  return {
    minDate: bounds?.min_date ? str(bounds.min_date) : null,
    maxDate: bounds?.max_date ? str(bounds.max_date) : null,
    niches: niches.map((r) => ({
      niche: str(r.niche),
      channels: Number(r.channels ?? 0),
    })),
    tracking: {
      yes: Number(tracking?.yes ?? 0),
      no: Number(tracking?.no ?? 0),
      unknown: Number(tracking?.unknown ?? 0),
    },
  }
}

/** How many rows the current filter selection would export. */
export async function countExportRows(
  filters: SnapshotExportFilters
): Promise<{ videoRows: number; channelOnlyRows: number; channels: number }> {
  const { niches, tracking, from, to } = filterParams(filters)

  const [row] = (await sql()`
    WITH filtered_channels AS (
      SELECT channel_id
      FROM channels
      WHERE (${niches}::text[] IS NULL OR COALESCE(NULLIF(niche, ''), '(none)') = ANY(${niches}::text[]))
        AND (${tracking}::boolean IS NULL OR tracking = ${tracking}::boolean)
    )
    SELECT
      (SELECT COUNT(*)::int FROM filtered_channels) AS channels,
      (
        SELECT COUNT(*)::int
        FROM snapshots s
        JOIN videos v ON v.video_id = s.video_id
        JOIN filtered_channels fc ON fc.channel_id = v.channel_id
        WHERE (${from}::date IS NULL OR s.snapshot_date >= ${from}::date)
          AND (${to}::date IS NULL OR s.snapshot_date <= ${to}::date)
      ) AS video_rows,
      (
        SELECT COUNT(*)::int
        FROM channel_snapshots cs
        JOIN filtered_channels fc ON fc.channel_id = cs.channel_id
        WHERE (${from}::date IS NULL OR cs.snapshot_date >= ${from}::date)
          AND (${to}::date IS NULL OR cs.snapshot_date <= ${to}::date)
          AND NOT EXISTS (
            SELECT 1
            FROM snapshots s2
            JOIN videos v2 ON v2.video_id = s2.video_id
            WHERE v2.channel_id = cs.channel_id
              AND s2.snapshot_date = cs.snapshot_date
          )
      ) AS channel_only_rows
  `) as Record<string, unknown>[]

  return {
    videoRows: Number(row?.video_rows ?? 0),
    channelOnlyRows: Number(row?.channel_only_rows ?? 0),
    channels: Number(row?.channels ?? 0),
  }
}

/**
 * The combined rows themselves — two statements, one per row kind.
 *
 * Both are single wide reads rather than a per-day loop. Measured on the full
 * unfiltered set: 71,152 video rows in ~9s and 2,612 channel-only rows in
 * ~1.5s, against ~40s if the same work is sliced a day at a time. The title /
 * thumbnail lookup is a `DISTINCT ON` CTE hash-joined once, not a per-row
 * LATERAL — the LATERAL form alone cost more than this whole query does now.
 */
export async function readCombinedSnapshots(
  filters: SnapshotExportFilters
): Promise<CombinedSnapshotRow[]> {
  const { niches, tracking, from, to } = filterParams(filters)

  const videoRows = (await sql()`
    WITH filtered_channels AS (
      SELECT channel_id, handle, niche, category, format, produced_by, niche_group
      FROM channels
      WHERE (${niches}::text[] IS NULL OR COALESCE(NULLIF(niche, ''), '(none)') = ANY(${niches}::text[]))
        AND (${tracking}::boolean IS NULL OR tracking = ${tracking}::boolean)
    ),
    latest_meta AS (
      SELECT DISTINCT ON (video_id) video_id, title, thumbnail_url
      FROM video_meta
      ORDER BY video_id, changed_at DESC
    )
    SELECT
      s.snapshot_date::text     AS snapshot_date,
      s.record_type             AS record_type,
      fc.handle                 AS handle,
      fc.channel_id             AS channel_id,
      s.video_id                AS video_id,
      v.video_type              AS video_type,
      lm.title                  AS title,
      v.published_at::text      AS published_at,
      v.duration_seconds        AS duration_seconds,
      lm.thumbnail_url          AS thumbnail_url,
      s.views                   AS views,
      s.likes                   AS likes,
      s.comments                AS comments,
      s.outlier_score           AS outlier_score,
      s.outlier_reason          AS outlier_reason,
      s.outlier_age_tag         AS outlier_age_tag,
      s.niche_outlier_score     AS niche_outlier_score,
      s.baseline_method         AS baseline_method,
      cs.subscribers            AS subscribers,
      cs.total_views            AS total_views,
      cs.total_videos           AS total_videos,
      cs.country                AS country,
      -- Sheet4 writes Fetched_At as a bare IST wall-clock string
      -- ("2026-05-25 06:14:33"); rendering the raw timestamptz here would
      -- print a JS Date and lose parity with the tab.
      to_char(cs.fetched_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS fetched_at,
      fc.niche                  AS niche,
      fc.category               AS category,
      fc.format                 AS format,
      fc.produced_by            AS produced_by,
      fc.niche_group            AS niche_group
    FROM snapshots s
    JOIN videos v ON v.video_id = s.video_id
    JOIN filtered_channels fc ON fc.channel_id = v.channel_id
    LEFT JOIN latest_meta lm ON lm.video_id = s.video_id
    LEFT JOIN channel_snapshots cs
      ON cs.channel_id = v.channel_id AND cs.snapshot_date = s.snapshot_date
    WHERE (${from}::date IS NULL OR s.snapshot_date >= ${from}::date)
      AND (${to}::date IS NULL OR s.snapshot_date <= ${to}::date)
  `) as Record<string, unknown>[]

  // Channel-days with no tracked video that day. Without these the export
  // would drop 40% of Sheet4's rows and stop being a superset of both tabs.
  const channelOnlyRows = (await sql()`
    WITH filtered_channels AS (
      SELECT channel_id, handle, niche, category, format, produced_by, niche_group
      FROM channels
      WHERE (${niches}::text[] IS NULL OR COALESCE(NULLIF(niche, ''), '(none)') = ANY(${niches}::text[]))
        AND (${tracking}::boolean IS NULL OR tracking = ${tracking}::boolean)
    )
    SELECT
      cs.snapshot_date::text  AS snapshot_date,
      fc.handle               AS handle,
      fc.channel_id           AS channel_id,
      cs.subscribers          AS subscribers,
      cs.total_views          AS total_views,
      cs.total_videos         AS total_videos,
      cs.country              AS country,
      to_char(cs.fetched_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS fetched_at,
      fc.niche                AS niche,
      fc.category             AS category,
      fc.format               AS format,
      fc.produced_by          AS produced_by,
      fc.niche_group          AS niche_group
    FROM channel_snapshots cs
    JOIN filtered_channels fc ON fc.channel_id = cs.channel_id
    WHERE (${from}::date IS NULL OR cs.snapshot_date >= ${from}::date)
      AND (${to}::date IS NULL OR cs.snapshot_date <= ${to}::date)
      AND NOT EXISTS (
        SELECT 1
        FROM snapshots s2
        JOIN videos v2 ON v2.video_id = s2.video_id
        WHERE v2.channel_id = cs.channel_id
          AND s2.snapshot_date = cs.snapshot_date
      )
  `) as Record<string, unknown>[]

  const out: CombinedSnapshotRow[] = []

  for (const r of videoRows) {
    const videoId = str(r.video_id)
    const videoType = str(r.video_type)
    out.push({
      // All_Video_Snapshots' own key: Snapshot_Date + Video_ID.
      rowKey: `${str(r.snapshot_date)}_${videoId}`,
      snapshotDate: str(r.snapshot_date),
      recordType: str(r.record_type),
      handle: str(r.handle),
      channelId: str(r.channel_id),
      videoId,
      videoUrl: deriveVideoUrl(videoId, videoType as VideoType),
      videoType,
      title: str(r.title),
      publishedAt: str(r.published_at),
      durationHms: r.duration_seconds == null ? "" : secondsToHms(r.duration_seconds),
      thumbnailUrl: str(r.thumbnail_url),
      views: numOrNull(r.views),
      likes: numOrNull(r.likes),
      comments: numOrNull(r.comments),
      outlierScore: numOrNull(r.outlier_score),
      // Emitted verbatim, unlike the dashboard readers which upper-case
      // these for display. The stored values are already upper-case, and an
      // export that quietly transforms a column is no longer a copy of it.
      outlierReason: str(r.outlier_reason),
      outlierAgeTag: str(r.outlier_age_tag),
      nicheOutlierScore: numOrNull(r.niche_outlier_score),
      baselineMethod: str(r.baseline_method),
      subscribers: numOrNull(r.subscribers),
      totalViews: numOrNull(r.total_views),
      totalVideos: numOrNull(r.total_videos),
      country: str(r.country),
      niche: str(r.niche),
      category: str(r.category),
      format: str(r.format),
      producedBy: str(r.produced_by),
      nicheGroup: str(r.niche_group),
      fetchedAt: str(r.fetched_at),
    })
  }

  for (const r of channelOnlyRows) {
    const handle = str(r.handle)
    out.push({
      // Sheet4's own key: Snapshot_Date + handle without the leading @.
      rowKey: `${str(r.snapshot_date)}_${handle.replace(/^@/, "")}`,
      snapshotDate: str(r.snapshot_date),
      recordType: "CHANNEL_ONLY",
      handle,
      channelId: str(r.channel_id),
      videoId: "",
      videoUrl: "",
      videoType: "",
      title: "",
      publishedAt: "",
      durationHms: "",
      thumbnailUrl: "",
      views: null,
      likes: null,
      comments: null,
      outlierScore: null,
      outlierReason: "",
      outlierAgeTag: "",
      nicheOutlierScore: null,
      baselineMethod: "",
      subscribers: numOrNull(r.subscribers),
      totalViews: numOrNull(r.total_views),
      totalVideos: numOrNull(r.total_videos),
      country: str(r.country),
      niche: str(r.niche),
      category: str(r.category),
      format: str(r.format),
      producedBy: str(r.produced_by),
      nicheGroup: str(r.niche_group),
      fetchedAt: str(r.fetched_at),
    })
  }

  // Sorted here rather than in SQL: the two reads are separate statements, so
  // a database ORDER BY on each would still leave the halves unmerged.
  out.sort(
    (a, b) =>
      a.snapshotDate.localeCompare(b.snapshotDate) ||
      a.handle.localeCompare(b.handle) ||
      a.videoId.localeCompare(b.videoId)
  )

  return out
}
