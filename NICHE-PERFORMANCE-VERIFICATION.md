# Local Niche Performance implementation

Branch: `feat/niche-performance-page` · 2026-09-08. Local verification completed
before deployment. The user subsequently authorized pushing this branch for a
Vercel preview. No production deployment or PR was requested.

The handoff was read in full. None of the three redesign draft files had been
copied into this worktree. Their diffs were reviewed first, then the research
desk, request sequencing and midpoint-rank fixes were reused and improved.

## What changed

- Research desk directly below the niche headline: real video thumbnails,
  source scores, observed views/day, total views, dates, durations and YouTube
  links. Search, channel/score filters, sorting and incremental results.
- Shared framings count videos and distinct channels in the filtered results;
  only multi-channel patterns are described as shared.
- Topic adoption offers plain-language next steps, median performance, sample
  size and tracked-channel adoption. Selecting a topic clears conflicting
  filters and uses the exact analysis tokenizer. Mobile gets a topic selector
  before the video list.
- Performance samples and adoption are separate: adoption includes unrankable
  titles; performance medians require ranked videos. Single-channel performance
  evidence is labelled. Crowded topics cannot also be early signals.
- Shortlist and Copy brief include exact measured values and URLs. Clipboard
  failure exposes a selectable brief. Shortlist is in memory and resets on
  niche, format, range, refresh or reload, as disclosed on the page.
- Detailed ideation panels and niche comparison scores are expandable. Matrix
  cells reveal shared vocabulary. Recommendations open and focus collapsed
  evidence. Channel leaderboard, performance context and explicit AI generation
  remain available. No automatic AI generation.
- Tied views/day receive midpoint ranks; a fully tied bucket is p50. Channel
  and format buckets and minimum sample gates remain intact. The page no longer
  claims that normalization removes age/sampling bias or that lexical overlap
  proves copying, semantic equivalence or unmet demand.
- Metrics requests are sequenced; stale responses cannot overwrite newer ranges.
  Old-window references are hidden while loading. Supplementary data is scoped
  to niche/format, AI panels are keyed by niche/format, invalid groups fall back
  to a named niche, and refresh reaches all three supported read endpoints.
- Page-scoped contrast, keyboard focus, comfortable controls and responsive
  layouts. Fixed expanded evidence panels overflowing the mobile viewport.

## Verified

`node --test tests/niche-regression.cjs`: five passing checks for tied ranks,
peer gates, contradictory topic classifications, adoption including unrankable
channels, and exact token matching.

`node node_modules/typescript/bin/tsc --noEmit --incremental false`: passed.
This was run separately because the repository's production build skips type
validation. `npm.cmd run build`: passed, including static /niche output.
`git diff --check`: passed.

Actual Chromium rendering inspected at 1440px desktop and 390px mobile; 320px
viewport overflow checked. Real Neon metrics supplied 6,365 reference videos
across six groups. Real FIN COMP thumbnails loaded from YouTube. Live browser
checks covered FIN COMP, FootyBallerIQ, Amish Way, Ancient Human Comp and GTA
Gaming, including thin long-form history, format switching and a live 7d range.

`tests/niche-browser.cjs` verifies live search, channel and source-score filters,
sort controls, pagination, empty states, shortlist add/remove, copy success,
clipboard failure/manual fallback, topic selection, matrix vocabulary,
recommendation evidence reveal/focus, mobile overflow, niche/format switching,
invalid URLs, no uncaught page errors and no automatic AI requests.

`tests/niche-request-races.cjs` uses explicitly controlled response fixtures
derived from live metrics to verify delayed old ranges, loading states, refresh
on all three read endpoints, metrics errors/retry and supplementary-analysis
failure. It does not modify source data. Clipboard rejection is also injected;
the normal clipboard path is exercised in Chromium with permission granted.

Browser scripts require a running app at localhost:3000 and Playwright available
through `PLAYWRIGHT_MODULE` or normal Node module resolution. The existing local
Playwright installation was used; no app dependency was added. Screenshots are
local artifacts in `.tmp/niche/` (ignored by Git).

## Limits and retained behavior

- Real paid AI generation was not exercised. It still needs configured
  credentials; the preview screenshot's missing-subscription setup is not fixed
  by this local UI change. Generated angles remain labelled as proposals.
- A cold metrics read took 68 seconds after the server cache expired; warm
  responses were around 0.1–0.2 seconds. The final screenshot retry passed after
  that read completed. Backend aggregation performance remains a limitation.
- Topic analysis is lexical and primarily English, with existing sample gates
  and response caps. Corpus evidence can have no matching video in the selected
  snapshot window. Tracked adoption is not total-market saturation.
- Chromium verification does not establish Safari/Firefox or screen-reader
  compatibility. No full automated accessibility audit was run.
- Unrelated worktree files were preserved, including the pre-existing modified
  `next-env.d.ts` and `tsconfig.tsbuildinfo` contents.
- Design direction is recorded in `.tastemaker/style-lock.md`, reference board
  and decisions log as pending user review. No personal profile was changed.
