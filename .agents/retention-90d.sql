-- ============================================================================
-- 90-day rolling retention for the Neon metrics tables — SPEC ONLY, NOT WIRED
-- ============================================================================
--
-- Status: reviewed but deliberately NOT scheduled. Nothing in the app runs
-- this. Wire it in Chunk 3b, alongside the other pipeline work, after the
-- checks in "Before you schedule this" below.
--
-- Goal (user's words): "each old day should be auto removed if a new current
-- day is added into Neon storage", with the ranking based on 90 days plus the
-- current day.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NOT JUST "DELETE THE OLDEST DAY"
-- ---------------------------------------------------------------------------
--
-- Deleting one day per insert couples retention to write timing: a missed
-- Stage 2 run skips a delete and the window silently grows; a double run
-- deletes two days and it silently shrinks. An absolute cutoff is idempotent —
-- run it once a day or ten times a day, the result is identical — so it holds
-- the window at exactly 90 days without depending on the writer's cadence.
--
-- ---------------------------------------------------------------------------
-- THE CONFLICT THAT HAS TO BE RESOLVED FIRST
-- ---------------------------------------------------------------------------
--
-- Stage 2 maintenance already deletes HISTORICAL rows from `snapshots` after
-- SEVEN days. Measured 2026-08-31: snapshot_date >= 2026-08-24 carries ~3,300
-- HISTORICAL rows per day; 2026-08-23 and earlier carry exactly 0, only
-- OUTLIER and RECENT_UPLOAD rows survive.
--
-- So per-video history is already only a week deep for ordinary videos. A
-- 90-day window over `snapshots` is therefore 83 days of outliers plus 7 days
-- of everything — a survivor-biased sample that systematically flatters any
-- channel that once had a hit.
--
-- Two consequences:
--   1. The ranking (lib/metrics/neon.ts readRankingRows) is anchored on
--      `channel_snapshots`, which nothing sweeps and which is complete for
--      every day it covers. Video rows are used only for the format split and
--      the outlier rate, where the bias is tolerable and disclosed.
--   2. If you want a genuinely 90-day-deep video history, the existing 7-day
--      HISTORICAL purge must be raised to 90 FIRST. Scheduling the sweep below
--      without doing that keeps the window hollow.
--
-- Row-count impact of raising 7d -> 90d, at ~3,300 HISTORICAL rows/day:
--   ~3,300 x 83 additional days ~= 274,000 extra rows in `snapshots`.
-- Check that against the Neon plan's storage before committing to it.
--
-- ---------------------------------------------------------------------------
-- BEFORE YOU SCHEDULE THIS
-- ---------------------------------------------------------------------------
--
--  [ ] Run the dry-run block below and confirm the counts are what you expect.
--      As of 2026-08-31 every count is 0 — Neon holds 2026-07-30 onward, so
--      nothing is older than 90 days yet. This sweep is a forward-looking
--      policy, not a cleanup.
--  [ ] Decide whether the 7-day HISTORICAL purge is being raised to 90.
--  [ ] Take a Neon branch or point-in-time restore marker first. These
--      DELETEs are irreversible.
--  [ ] Confirm no other consumer needs data older than 90 days. The metrics
--      page offers a 180d range (RANGE_DAYS in lib/metrics/types.ts) — that
--      range becomes permanently unsatisfiable once this runs.
--
-- ---------------------------------------------------------------------------
-- WHERE IT BELONGS
-- ---------------------------------------------------------------------------
--
-- n8n Stage 2 maintenance, next to the existing HISTORICAL purge. Reasons:
-- retention already lives there, it runs after the daily write so the current
-- day is always present before anything is dropped, and keeping one owner for
-- destructive pipeline operations avoids two systems racing to delete the same
-- rows. A Vercel cron in this app would split that ownership.
--
-- ============================================================================


-- ── DRY RUN — read-only, safe to run any time ───────────────────────────────
-- Reports exactly what the sweep would remove. Run this first, every time.

SELECT 'channel_snapshots' AS table_name,
       count(*)::int       AS rows_to_delete,
       min(snapshot_date)::text AS oldest_affected,
       max(snapshot_date)::text AS newest_affected
FROM channel_snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days'
UNION ALL
SELECT 'snapshots',
       count(*)::int,
       min(snapshot_date)::text,
       max(snapshot_date)::text
FROM snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days';


-- ── THE SWEEP — destructive, irreversible ───────────────────────────────────
-- Wrapped in a transaction so a failure part-way leaves the tables consistent.
--
-- CURRENT_DATE - 90 days keeps the trailing 90 days AND the current day, which
-- is what was asked for. Idempotent: re-running changes nothing.

BEGIN;

DELETE FROM channel_snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days';

DELETE FROM snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days';

-- `videos`, `video_meta` and `channels` are intentionally NOT swept here.
--
-- `videos` is a dimension table, not a time series: `readRankingRows` and the
-- Chunk 2 channel-age proxy both scan it in full, on purpose, to see further
-- back than the snapshot window. Deleting rows by `published_at` would erase a
-- channel's early uploads and make it look younger than it is — the exact
-- distortion the ranking's freshness component was rewritten to avoid.
--
-- Orphaned `videos` rows (every snapshot gone) are cheap: ~5,900 rows total.
-- If they ever need collecting, do it by absence of snapshots, never by date:
--
--   DELETE FROM videos v
--   WHERE NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.video_id = v.video_id);
--
-- Leave that commented until someone has confirmed nothing else reads it.

COMMIT;


-- ── VERIFY AFTER RUNNING ────────────────────────────────────────────────────

SELECT 'channel_snapshots' AS table_name,
       min(snapshot_date)::text AS oldest_remaining,
       max(snapshot_date)::text AS newest_remaining,
       count(DISTINCT snapshot_date)::int AS distinct_days
FROM channel_snapshots
UNION ALL
SELECT 'snapshots',
       min(snapshot_date)::text,
       max(snapshot_date)::text,
       count(DISTINCT snapshot_date)::int
FROM snapshots;
