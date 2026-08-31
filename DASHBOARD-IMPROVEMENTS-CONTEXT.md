# Dashboard improvements — session context / handoff

Started 2026-08-30, Chunk 2 added 2026-08-31. Read this to continue from a fresh session.

---

## Goal

Improve the YT Niche Intelligence Dashboard so it actually serves its two stated purposes:

1. **Find opportunities in niches/channels that started recently but pull outsized views** — young + high view-velocity.
2. **Separate authentic faceless channels from slop / inauthentic AI content.**

The front page (`/`, "YT Niche Overview") is a manual audit tool: a human works channel by channel, corrects the classification fields (Niche, Category, Format, Produced By, Niche Group, Type, Tracking) and writes remarks. The metrics page (`/metrics`, "Niche Breakdown") aggregates by those fields.

Delivery style the user asked for: **ship in small chunks — 2-3 features, build, push, verify — then the next chunk.** Sequence so easily-reversible changes go first and schema / Google-Sheet / pipeline changes go last (they are the expensive-to-undo ones).

---

## Architecture facts (confirmed this session)

Two independent data planes:

| Plane | Source | Written by | Read by | Contents |
|---|---|---|---|---|
| **Audit** | Google Sheet "Manual Sheet" | the dashboard (`app/api/channels/route.ts`) + n8n Stage 1 | Page 1 (`/`) | every shared channel, all audit/taxonomy fields, remarks. Row key = `ytUrl` + `handle`. **No `channel_id`.** |
| **Metrics** | Neon Postgres | n8n Stage 2 (dual-write) | Page 2 (`/metrics`) via `lib/metrics/neon.ts` | tracked subset only, daily time series |

Join between the two today is by **handle** (fragile — handles change; the dashboard already detects "Handle Diff").

### Neon schema (`.agents/schema.sql`) — what exists

- `channels` — `channel_id` (PK), `handle`, `niche`, `category`, `format`, `produced_by`, `niche_group`, `updated_at`. Classification is JOINed at read time, so historical rows reflect the *current* roster classification.
- `channel_snapshots` — `channel_id`, `snapshot_date`, `subscribers`, `total_views`, `total_videos`, `country`, `fetched_at`. Daily per-channel series, backfilled to ~2026-08-24.
- `videos` — `video_id` (PK), `channel_id`, `published_at` (DATE), `duration_seconds`, `video_type`, `first_seen_at`.
- `video_meta` — title / thumbnail history.
- `snapshots` — per-video daily: `views`, `likes`, `comments`, `channel_avg_views`, `channel_multiple`, `age_days`, `outlier_score`, `outlier_reason`, `outlier_age_tag`, `niche_outlier_score`, `views_per_day`, `baseline_method`, `is_main_trigger`, `fetched_at`.

### What is NOT in Neon (drives the chunk order)

- **True channel-created date (real channel age).** Nowhere. Page 1 scrapes it live per-channel via `/api/channel-stats` and throws it away. **Proxy shipped in Chunk 2:** `MIN(videos.published_at)` per `channel_id`. Measured 2026-08-31: 189/189 channels resolve one, but `videos` holds a median of only **31** uploads per channel (min 1, max 178), so this is a *lower bound* — a high-cadence channel running for years can report a first upload only weeks old. Age spread from the proxy: p25 67d, p50 124d, p75 209d, max 3431d.
- **Authenticity fields.** Nothing structured. `produced_by` (e.g. "Human Editor") is the only proxy.
- **Audit metadata** — audited-by / audited-at / audit-status. Not stored anywhere (would live Sheet-side).

---

## Chunk plan

### Chunk 1 — Page 1 audit throughput — DONE (not yet merged)

Branch: `feat/audit-throughput-chunk1`. Commits: `791e8ae`, `c9b2123`. Frontend only — no API, schema or Sheet change. `tsc --noEmit` + `next build` both clean. Waiting on the user to check the Vercel preview and merge to `main`.

Files touched: `components/dashboard.tsx`, `components/channel-card.tsx`.

1. **URL deep-linking.** Selecting a channel writes `?channel=<handle>` (handle lower-cased, `@` stripped). Refresh-safe, shareable, and other pages can link straight to an audit view. Uses `history.replaceState` (not push) so a rapid audit pass doesn't stack history entries. A `popstate` listener handles browser back/forward and hand-edited params. On load, `?channel=` wins over the default "first channel". Implemented with plain `URLSearchParams` / `window.history` — no `next/navigation` router, to avoid a `useSearchParams` Suspense bailout (the page is already `dynamic(..., { ssr:false })`).
2. **"Needs audit" sidebar filter** with a live count. Toggling it filters the channel list to only the channels that need attention.
3. **Card triage dot.** An amber dot on sidebar cards for the same signal, so the list is scannable without opening each channel.

**How "needs audit" is decided** — purely derived, no stored flag, recomputed each render:

```ts
function needsAudit(c: Channel): boolean {
  return !c.niche?.trim() || !c.category?.trim() || !c.producedBy?.trim()
}
```

A channel is flagged if **Niche, Category, or Produced By** is blank/whitespace. **Niche Group is deliberately excluded** — a blank Niche Group on its own is fine (user's call, commit `c9b2123`). The sidebar count is `channelsState.filter(needsAudit).length`. Same function feeds the dot, the count and the filter. Fix a field in edit mode, save, and the signal clears on the next data load.

Known limits (accepted for now): can't tell "reviewed, field legitimately N/A" from "never looked at" — it only sees emptiness. No real audited-by / audited-at (that's Chunk 3).

### Chunk 2 — Page 2 metrics, Neon read-only — DONE (not yet merged)

Branch: `feat/metrics-young-authentic-chunk2`, branched off `feat/audit-throughput-chunk1` (Chunk 1 was still unmerged). Commit `cc44869`. Additive and read-only — no schema migration, no Sheet change. `tsc --noEmit` + `next build` clean; verified against live Neon through `/api/metrics?range=30d`.

Files touched: `lib/metrics/neon.ts`, `lib/metrics/types.ts`, `lib/metrics/aggregate.ts`, `app/api/metrics/route.ts`, `components/metrics/outlier-table.tsx`, `components/metrics/niche-metrics.tsx`.

1. **Channel-age proxy.** New `readChannelFirstVideoDates()` in `lib/metrics/neon.ts` — one unwindowed `SELECT channel_id, MIN(published_at) FROM videos GROUP BY channel_id`, returned as `Map<channel_id, YYYY-MM-DD>`. Unwindowed on purpose: the point is to look further back than the requested snapshot range. Runs once per cache miss alongside the two existing reads.

   The read is **Neon-only** — the Sheets path has no equivalent — so it enters the aggregator as the optional `AggregateInput.firstVideoByChannelId`. When absent, every age field is null and the aggregator stays source-agnostic. `app/api/chat/route.ts` still reads Sheets, so ages are null there; wire it up if that ever matters.

   New fields: `ChannelRollup.firstVideoAt` / `.channelAgeDays`, `VideoRollup.producedBy` / `.channelFirstVideoAt` / `.channelAgeDays`, `NicheGroupSummary.medianChannelAgeDays`. All ages measured from one `Date.now()` per aggregation.

   Surfaced as a sortable **"Ch. age"** column (amber under 90d) and a **median-age readout on the niche-group cards**. Every surface labels it as *oldest tracked upload* and carries the lower-bound caveat in a tooltip — do not let it get relabelled "channel age".

2. **"Young breakout" filter.** `channelAgeDays ≤ 90` **AND** `viewsPerDay ≥ p75` of the rows currently on screen. The velocity bar is deliberately *relative* — computed per format and per range from the visible list — so it retunes itself as the roster changes instead of a magic constant going stale. Measured 2026-08-31 over 30d: long-form p75 = 968 views/day (263 of 3867 qualify), Shorts p75 = 17,248 views/day (312 of 1988 qualify).

3. **"Authentic only" filter.** Keeps human production styles; hides `AI Tools`, `AI image`, `Stickman/AI`, `AI+B-Roll+Editor`, `Stock Slideshow`, **and blanks** (unaudited ≠ authentic). User chose this set on 2026-08-31 from the live `produced_by` distribution. It is the single `NON_AUTHENTIC_PRODUCED_BY` set in `components/metrics/outlier-table.tsx` — one-line edit if the call changes.

Also in this chunk, as fallout of adding a nullable sort column: **nulls now sort last in both directions** in the outlier table. Previously `?? 0` made a null `viewsPerDay` sort as zero; an unknown channel age would have read as "brand new".

Known limits (accepted): the age proxy understates age for high-cadence channels (see above); `produced_by` is a production-style label, not an authenticity judgement — Chunk 3 replaces both.

### Chunk 3 — persistence (do WITH the user, riskiest)

- Capture the **real channel-created date** — add a field to the Stage 2 channel scrape / an API call, store on `channels` or `channel_snapshots`. Replaces the `MIN(published_at)` proxy.
- **Authenticity rubric** — 5-6 scored sub-items (original narration vs TTS, original footage/edit vs stock recompile, channel POV, real comment engagement, upload-cadence sanity, handle/description quality). New Sheet columns or a JSON column. Yields a 0-100 score + flags. Badge + filter everywhere a channel appears. Prefill candidates from NexLev MCP (`check_faceless_channel`, quality rating, AI-generated flag) and vidIQ; human confirms.
- **Audit metadata** — `auditedBy`, `auditedAt`, `auditStatus` (unreviewed / done / stale). Handle Diff detected → auto-flip to `stale`. New Sheet columns. This is the real "needs audit" signal; the Chunk 1 heuristic is a stand-in.
- **Put `channel_id` into the Manual Sheet** so the two planes join on a stable key instead of handle.

Later / not yet scheduled (from the ideation pass): keyboard-driven audit flow (j/k/e/Tab/Ctrl+Enter), split filter-mode from edit-mode in the top bar, richer sidebar cards (age, authenticity badge, velocity sparkline), bulk niche-group assign, sidebar virtualization, "Young Breakouts" scatter (age × views/day) on metrics, cross-page links (metrics row → audit card and back), Discord alerts on momentum / young-outlier thresholds.

---

## File map

| Path | Role |
|---|---|
| `components/dashboard.tsx` | Page 1 — the whole audit UI (~1520 lines, one component) |
| `components/channel-card.tsx` | sidebar channel card |
| `lib/useChannels.ts` | fetches `/api/channels`, maps Sheet rows → `Channel` (`id` = `ytUrl`) |
| `lib/constants.ts` | `Channel` type + dead mock arrays |
| `app/api/channels/route.ts` | GET/PATCH/DELETE against the "Manual Sheet"; PATCH writes cols C..K back. **Has a pre-existing uncommitted change (webhook → `after()`) that is not ours — leave it.** |
| `app/metrics/page.tsx` → `components/metrics/*` | Page 2 |
| `lib/metrics/neon.ts` | the two Neon readers (`readChannelSnapshots`, `readVideoSnapshots`) |
| `lib/metrics/db.ts` | shared `neon()` SQL tag, pooled `DATABASE_URL` |
| `lib/metrics/types.ts` | all metrics types (`ChannelRollup`, `VideoRollup`, `NicheGroupSummary`, `MetricsPayload`, …) |
| `lib/metrics/aggregate.ts` | source-agnostic aggregator (Sheets and Neon feed it the same shapes) |
| `.agents/schema.sql` | Neon schema |
| `.agents/NEXT-SESSION.md` | broader project handoff (pipeline stages, n8n) |

Stack: Next.js 16.3.2 (Turbopack), React 19-ish, Node 24. `next build` regenerates a block in `CLAUDE.md` — commit it with your work if it appears, don't fight it.

---

## Resume checklist

1. Chunks 1 and 2 are both **pushed but unmerged**, and Chunk 2 is stacked on Chunk 1. Merge them in order (1 then 2), or merge Chunk 2 alone only after rebasing it onto `main`.
2. Chunk 3 is the persistence chunk — do it **with the user**, it is the expensive-to-undo one. Read `.agents/schema.sql` and the Stage 2 n8n writer before proposing a migration.
3. `npx tsc --noEmit` and `npx next build` before every push. One chunk per branch/commit; let the user verify the preview between chunks.
4. Useful during Chunk 2: local verification was `npx next dev -p 3999` then `curl "http://127.0.0.1:3999/api/metrics?range=30d"` and inspecting the JSON — faster than clicking through the preview to confirm a new field is populated.
5. Source files are **CRLF**. Anchored find-and-replace with LF-only anchors silently matches zero times — normalise line endings in any edit script.

## Open decisions for the user

- Merge Chunk 1 and Chunk 2 to `main`, or keep stacking branches?
- Chunk 3 authenticity: new Sheet columns vs one JSON column in the existing remarks/verified field.
- Should the `/api/chat` route move off Sheets onto Neon so the assistant sees the same age/authenticity fields the page does?
