# Stage 2 → Neon migration spec

Written 2026-08-26. Companion to `NEXT-SESSION.md` (the "tomorrow, in order"
plan) and `stage2-backup-2026-08-25.md` (full node-level history). This is
the concrete schema + sequencing for step 2 of that plan: move Stage 2's
storage off Google Sheets onto Neon Postgres, without a cutover.

## Scope

In scope: the two Sheets Stage 2 writes to — *YT Channel Metrics*
(`All_Video_Snapshots` + related tabs) and *Sheet3 Date Archive*. Out of
scope: Stage 1 (`Niche Selector` roster) — stays exactly as-is, still
Sheets-backed. Nothing here touches how videos get classified (niche,
category, format, produced_by, niche_group) — that classification still
comes from the roster at read time inside the `Score All Videos` node,
exactly like today. This migration only changes where the *scored output*
of that node gets stored.

## Why 4 tables, not the 3 sketched in NEXT-SESSION.md

The original sketch (`videos` / `video_meta` / `snapshots`) covers video-level
data. It doesn't have a home for the classification fields
(`handle`, `niche`, `category`, `format`, `produced_by`, `niche_group`) that
the current Sheets rows carry on *every row*, denormalized. Two options:

1. Denormalize them onto every `snapshots` row, like Sheets does today.
2. Add a `channels` table (one row per channel_id) and join.

Going with (2). These are channel-level facts, not video-level — repeating
them on every one of the ~819K snapshot rows over 6 months would be pure
waste (they're the same value across ~4,500 rows every single day), and it
would mean rewriting historical rows every time a channel gets
re-classified in the roster. This is the one deliberate departure from the
NEXT-SESSION.md sketch; everything else matches it exactly.

## Schema

```sql
-- One row per channel. Refreshed from the Stage 1 roster (source of
-- truth stays the Niche Selector sheet — this is a cache for joins).
CREATE TABLE channels (
  channel_id    TEXT PRIMARY KEY,
  handle        TEXT NOT NULL,
  niche         TEXT,
  category      TEXT,
  format        TEXT,
  produced_by   TEXT,
  niche_group   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per video, ever. Immutable facts only — nothing here is
-- expected to change after insert.
CREATE TABLE videos (
  video_id          TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES channels(channel_id),
  published_at      DATE NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  video_type        TEXT NOT NULL CHECK (video_type IN ('SHORTS', 'LONG_FORM')),
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_videos_channel_id ON videos(channel_id);

-- One row every time title or thumbnail actually changes. This is the
-- history Sheets throws away today (plain overwrite on update) — a
-- swapped thumbnail changing view velocity is a real signal the user
-- wants visible, not silently lost.
CREATE TABLE video_meta (
  id             BIGSERIAL PRIMARY KEY,
  video_id       TEXT NOT NULL REFERENCES videos(video_id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  title          TEXT NOT NULL,
  thumbnail_url  TEXT
);
CREATE INDEX idx_video_meta_video_id ON video_meta(video_id, changed_at DESC);

-- One row per video per day it was collected. The dominant growth
-- driver (~4,500 rows/day). video_url is NOT stored — it's fully
-- derivable from video_id + video_type at read time.
CREATE TABLE snapshots (
  video_id             TEXT NOT NULL REFERENCES videos(video_id),
  snapshot_date        DATE NOT NULL,
  record_type          TEXT NOT NULL CHECK (record_type IN ('OUTLIER', 'RECENT_UPLOAD', 'HISTORICAL')),
  views                INTEGER NOT NULL,
  likes                INTEGER NOT NULL,
  comments             INTEGER NOT NULL,
  channel_avg_views    INTEGER,
  channel_multiple     REAL,
  age_days             REAL,
  outlier_score        REAL,
  outlier_reason       TEXT,
  outlier_age_tag      TEXT,
  niche_outlier_score  REAL,
  views_per_day        INTEGER,
  baseline_method      TEXT,
  is_main_trigger      BOOLEAN NOT NULL DEFAULT true,
  fetched_at           TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (video_id, snapshot_date)
);
CREATE INDEX idx_snapshots_date ON snapshots(snapshot_date);
```

**The `(video_id, snapshot_date)` primary key retires the whole `row_key`
dedup subsystem.** Today, Sheets writes are plain `append` with app-level
`row_key = "${date}_${video_id}"` dedup cleaned up *after the fact* by the
`apps-script-yt-channel-metrics.gs` maintenance run (see the `dupsRemoved`
loose end in `NEXT-SESSION.md`). Postgres does this natively:
`INSERT ... ON CONFLICT (video_id, snapshot_date) DO UPDATE` — duplicates
become structurally impossible instead of monitored-and-cleaned.

## Storage estimate (revised)

NEXT-SESSION.md's "~40MB for 6 months" estimate covered only raw column
bytes, not Postgres row/tuple overhead or indexes. Recomputing with
~75 bytes/row realistic tuple size (row header + column data) plus btree
index overhead on `snapshot_date`:

- 4,500 snapshots/day × 182 days (6mo) ≈ 819,000 rows × ~75 bytes ≈ **61MB**
  table + ~40-80MB indexes ≈ **~100-140MB total for 6 months**.
- `videos`/`channels`/`video_meta` stay small (thousands, not hundreds of
  thousands, of rows) — low single-digit MB even after a year.

Still comfortably under Neon's 500MB free-tier ceiling for 1.5-2+ years at
current roster size. Confirms the earlier "500MB isn't your real
constraint" conclusion with a more conservative number than the original
40MB estimate.

## Sequencing (expand → migrate → verify → contract)

Per the `migration` skill: only **expand** and the start of **migrate**
happen in this pass. **Contract is explicitly out of scope** until dual-write
is verified stable in production — nothing gets deleted from Sheets yet.

### 1. Expand (this session)
- [x] Provision Neon (done — `neon-green-battery`, connected to the Vercel
      project, `DATABASE_URL` / `DATABASE_URL_UNPOOLED` in `.env.local`)
- [x] Create the schema above (`.agents/schema.sql` via
      `.agents/apply-schema.js`, direct/unpooled connection). Also added
      `UNIQUE (video_id, title, thumbnail_url)` on `video_meta` beyond the
      original sketch — lets the insert be a cheap skip-on-conflict
      instead of needing a pre-read to detect a real change.
- [x] Add a Postgres credential in n8n pointed at Neon — `Neon (Stage 2
      metrics)`, id `ul3XbPsvsUwpM3Aj`, pooled connection (app traffic,
      not migrations)
- [x] Add new Postgres nodes to Stage 2, wired in *parallel* to the
      existing Sheets writes (not replacing them) — 7 new nodes fed from
      `Score All Videos`: `Dedup Channels` → `Upsert Channels`,
      `Prep for Videos Insert` → `Insert Videos`, `Insert Video Meta`,
      `Upsert Snapshots`, all error-isolated to a dead-end
      `DB Write Error (Non-Fatal)` node (`onError: continueErrorOutput` +
      `retryOnFail`) so a DB hiccup can never take down the working Sheets
      + Discord pipeline. Verified via `n8n_get_workflow` — original 5
      branches off `Score All Videos` untouched, `Master merge`/Discord
      chain untouched, 0 new validation errors.
      Node `Insert Videos` runs through a small `Prep for Videos Insert`
      Code node first — reparses `duration_hms` into `duration_seconds`
      since the scoring node doesn't compute that already; everything
      else auto-maps by matching field name to column name (the schema
      was named to match the scoring node's existing output keys).
      **Live now** — the workflow is active, so the next scheduled trigger
      (main or hourly) will exercise these nodes for real.
- [x] One-time backfill (`.agents/backfill-neon.js`): audited
      `All_Video_Snapshots` first and found **6 gaps**, not the single one
      expected — row volume also grew ~10x across them as the tracked
      roster ramped up (19-400 rows/day in June → 4,458-4,515/day only
      from 2026-08-24). Backfilled **2026-08-24 onward only** (13,481
      rows) — the one segment that's both gap-free and at today's full
      roster scale; everything earlier would have distorted the
      dashboard's view-velocity charts on scale grounds even where dates
      happened to be contiguous. Ran inside a single transaction
      (rolled back clean on a first attempt that hit a data-shape bug,
      confirmed via readback before retrying) with the same conflict
      semantics as the live n8n nodes. Verified via readback: channels
      172, videos 4624, video_meta 4645, snapshots 13481 — exact match to
      the pre-computed unique counts.
      **Gotcha worth remembering:** Sheets' `UNFORMATTED_VALUE` returns a
      TIME-formatted cell (`Duration_HMS`) as a fractional-day serial
      (e.g. `0.000277...` = 24s), not the `"H:MM:SS"` display text —
      first backfill attempt failed on this until handled.

### 2. Migrate (after dual-write has run clean for a few days)
- [ ] Point `lib/metrics/sheets.ts` at Postgres behind a flag (env var or
      similar), default OFF
- [ ] Flip the flag in a preview/staging context first, compare dashboard
      output against the Sheets-backed version
- [ ] Flip in production once compared clean

### 3. Verify
- [ ] Row counts match between Sheets and Neon for a sample of days
- [ ] Dashboard trend pages render identically old vs new path
- [ ] Discord digests unaffected (they read `Score All Videos` output
      directly, never touch Sheets or the DB — no change needed here)

### 4. Contract — NOT in this pass, needs separate explicit go-ahead
- [ ] Drop the Sheets writer nodes from Stage 2
- [ ] Delete both Apps Scripts (`apps-script-yt-channel-metrics.gs`,
      `apps-script-sheet3-archive.gs`) and their triggers
- [ ] Stop the Sheet3 date-archive tabs and retention pruning
- [ ] Retire the `row_key` dedup convention

## Rollback

At every point up through step 2's flag-flip, Sheets is untouched and
authoritative — the flag flips back instantly with zero data loss if
Postgres reads look wrong. Nothing becomes irreversible until step 4
(contract), which requires a separate explicit go-ahead per the migration
skill's rule against implicit destructive contraction.

## Hard rule carried over

Same as everywhere else in this workflow: **never `patchNodeField` on a
Stage 2 Code node.** New/changed node bodies go through
`.agents/push-node-code.js` (write from file, read back, byte-compare).
