# Dashboard improvements — session context / handoff

Started 2026-08-30. Read this to continue from a fresh session.

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

- **True channel-created date (real channel age).** Nowhere. Page 1 scrapes it live per-channel via `/api/channel-stats` and throws it away. **Proxy available now:** `MIN(videos.published_at)` per `channel_id` — a usable lower bound with zero new scraping.
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

### Chunk 2 — Page 2 metrics, Neon read-only — NEXT

Additive only: one SQL change in `lib/metrics/neon.ts`, type additions in `lib/metrics/types.ts`, aggregation in `lib/metrics/aggregate.ts`, and the outlier table component `components/metrics/outlier-table.tsx`. No schema migration.

1. **Channel-age proxy column** on the Trending Outliers table — `MIN(videos.published_at)` per channel, surfaced as days-since-first-video. Sortable. Also add it to the niche-group cards if it fits cleanly.
2. **"Young breakout" quick filter** on the outlier table — age ≤ ~90d AND high views/day (tune threshold against real data).
3. **"Authentic only" toggle** on the outlier table — filter on `produced_by` (interim, until the real rubric in Chunk 3), so the opportunity list isn't polluted by slop.

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

1. `git checkout feat/audit-throughput-chunk1` (or `main` if Chunk 1 is merged).
2. If Chunk 1 is merged: branch `feat/metrics-young-authentic-chunk2` off `main`.
3. Read `lib/metrics/aggregate.ts` and `components/metrics/outlier-table.tsx` before touching Chunk 2 — they weren't read in the first session.
4. Build the age-proxy SQL, verify against Neon directly, then wire the column.
5. `npx tsc --noEmit` and `npx next build` before every push. One chunk per branch/commit; let the user verify the preview between chunks.

## Open decisions for the user

- Merge Chunk 1 to `main` or keep iterating on the branch?
- Chunk 2 "young" threshold — 90 days? 180? Decide against the real age distribution once the column exists.
- Chunk 3 authenticity: new Sheet columns vs one JSON column in the existing remarks/verified field.
