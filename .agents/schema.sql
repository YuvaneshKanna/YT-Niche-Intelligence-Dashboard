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
