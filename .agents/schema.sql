-- Stage 2 Neon schema. See .agents/neon-migration-spec.md for the full
-- rationale. Run via .agents/apply-schema.js (uses the direct/unpooled
-- connection, per Neon's own guidance for migrations).

CREATE TABLE IF NOT EXISTS channels (
  channel_id    TEXT PRIMARY KEY,
  handle        TEXT NOT NULL,
  niche         TEXT,
  category      TEXT,
  format        TEXT,
  produced_by   TEXT,
  niche_group   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS videos (
  video_id          TEXT PRIMARY KEY,
  channel_id        TEXT NOT NULL REFERENCES channels(channel_id),
  published_at      DATE NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  video_type        TEXT NOT NULL CHECK (video_type IN ('SHORTS', 'LONG_FORM')),
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos(channel_id);

CREATE TABLE IF NOT EXISTS video_meta (
  id             BIGSERIAL PRIMARY KEY,
  video_id       TEXT NOT NULL REFERENCES videos(video_id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  title          TEXT NOT NULL,
  thumbnail_url  TEXT
);
CREATE INDEX IF NOT EXISTS idx_video_meta_video_id ON video_meta(video_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS snapshots (
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
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(snapshot_date);

-- Added 2026-08-27: mirrors Sheet4_Daily_Channel_Snapshot (full daily
-- per-channel time series). Not covered by `snapshots`, which only tracks
-- outlier/tracked videos. See .agents/neon-migration-spec.md.
CREATE TABLE IF NOT EXISTS channel_snapshots (
  channel_id     TEXT NOT NULL REFERENCES channels(channel_id),
  snapshot_date  DATE NOT NULL,
  subscribers    INTEGER NOT NULL,
  total_views    BIGINT NOT NULL,
  total_videos   INTEGER NOT NULL,
  country        TEXT,
  fetched_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (channel_id, snapshot_date)
);

-- Added 2026-09-05: per-channel NexLev enrichment, fed by the claude-puller
-- pipeline (n8n Schedule -> claude-puller -> here). Columns mirror NexLev's
-- get_geography_revenue response exactly — that tool is the sole canonical
-- source for this table, deliberately: get_batch_channel_metrics_v2 reports a
-- different RPM for the same channel on the same day, and reconciling two
-- disagreeing numbers is worse than picking the richer one. `raw` keeps the
-- untouched payload so a NexLev response-shape change loses nothing.
--
-- is_monetized has no source in get_geography_revenue; it stays NULL until a
-- second locked-down tool (check_channel_monetization) is added to the
-- puller's TOOLS map.
CREATE TABLE IF NOT EXISTS channel_nexlev (
  channel_id             TEXT PRIMARY KEY REFERENCES channels(channel_id),
  channel_type           TEXT,
  category               TEXT,
  language_code          TEXT,
  month_revenue          NUMERIC,
  month_long_revenue     NUMERIC,
  month_short_revenue    NUMERIC,
  long_view_count        BIGINT,
  short_view_count       BIGINT,
  category_rpm           NUMERIC,
  long_rpm               NUMERIC,
  short_rpm              NUMERIC,
  weighted_avg_duration  REAL,
  gender                 JSONB,
  age                    JSONB,
  viewership_country     JSONB,
  is_monetized           BOOLEAN,
  raw                    JSONB NOT NULL,
  fetched_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The pipeline's "which channels are missing or >14d stale" query sorts on this.
CREATE INDEX IF NOT EXISTS idx_channel_nexlev_fetched_at ON channel_nexlev(fetched_at);

-- Added 2026-09-05: supports the NexLev enrichment queue's priority order —
-- channels carrying a niche group first, then most-recently-shared first.
-- "Shared On" lives only in the Niche Selector spreadsheet's Manual Sheet
-- (column J, a Google serial date); the enrichment workflow refreshes this
-- column from that sheet at the start of each run, so the whole queue query
-- stays in SQL and its LIMIT remains the single structural spend cap.
-- Stage 2 is deliberately NOT modified to populate this.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS shared_on DATE;

-- Added 2026-09-05: lets a channel NexLev has no data for drop out of the
-- queue instead of sitting at its head and re-burning the daily budget every
-- day forever. Ordering uses last_attempt_at; only a success sets fetched_at.
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS last_error       TEXT;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS attempts         INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_channel_nexlev_last_attempt ON channel_nexlev(last_attempt_at);

-- Added 2026-09-05: mirrors the Manual Sheet's "Tracking" column, refreshed
-- from the sheet on every enrichment run alongside shared_on. The queue
-- filters on it so NexLev quota is never spent on a channel that is in Neon
-- but no longer tracked (or was never in the sheet).
ALTER TABLE channels ADD COLUMN IF NOT EXISTS tracking BOOLEAN;

-- Added 2026-09-06: the batch layer's own block. channel_nexlev was modelled
-- on a real get_geography_revenue payload and is exactly right for it, but the
-- weekly get_batch_channel_metrics_v2 backbone is what covers all 174 tracked
-- channels, and only two of its ten fields had a column. Without these the 152
-- channels that get batch-only data would land nothing queryable.
--
-- The two layers write DISJOINT column sets into the same row: the geography
-- upsert owns the month_*/[long|short|category]_rpm/demographics block plus
-- raw + fetched_at; the batch upsert owns this batch_* block plus is_monetized
-- (which get_geography_revenue does not return at all). Neither clobbers the
-- other's provenance, which a shared raw/fetched_at would have done.
--
-- batch_rpm is deliberately NOT merged into long_rpm: the batch value is a
-- model prediction and get_geography_revenue is the canonical measurement.
-- Measured on the same channel the same day: batch 3.62 vs canonical 1.72.
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS batch_rpm            NUMERIC;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS avg_views_per_video  BIGINT;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS avg_video_length     REAL;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS batch_category       TEXT;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS batch_format         TEXT;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS has_shorts           BOOLEAN;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS is_faceless          BOOLEAN;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS country_top          TEXT;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS confidence           REAL;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS batch_raw            JSONB;
ALTER TABLE channel_nexlev ADD COLUMN IF NOT EXISTS batch_fetched_at     TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_channel_nexlev_batch_fetched ON channel_nexlev(batch_fetched_at);

-- `raw` holds the geography payload and is NOT NULL, but the batch layer
-- creates rows for the 152 channels that never get a geography pull. Without a
-- default those inserts violate the constraint. The default keeps NOT NULL
-- meaningful (a geography row always carries its payload) while letting a
-- batch-only row exist with an empty object until geography fills it in.
ALTER TABLE channel_nexlev ALTER COLUMN raw SET DEFAULT '{}'::jsonb;

-- Added 2026-09-07: fetched_at means "geography last fetched" and the queue
-- filters on it. It was NOT NULL DEFAULT now(), so a row CREATED by the batch
-- layer silently acquired a fetched_at it had not earned, and the geography
-- queue then skipped that channel as already done — 14 candidates offered
-- instead of 24. The batch layer has batch_fetched_at for its own provenance;
-- this column must stay null until a geography pull actually succeeds.
ALTER TABLE channel_nexlev ALTER COLUMN fetched_at DROP DEFAULT;
ALTER TABLE channel_nexlev ALTER COLUMN fetched_at DROP NOT NULL;
UPDATE channel_nexlev SET fetched_at = NULL WHERE raw = '{}'::jsonb;
