---
description: Analyse each niche group from the Stage 2 metrics and write the AI_Insights tab
---

Analyse the tracked niche groups and write the results to the `AI_Insights` tab
of the YT Channel Metrics spreadsheet.

Runs headless (`claude -p "/analyze-niches"`) in any sandbox, or on a schedule
as a Routine. The dashboard only reads the tab this produces.

## 1. Pull the aggregated metrics

Fetch the deployed API rather than re-reading the sheets — the aggregation,
delta handling and format split are already correct there:

```bash
curl -s "$DASHBOARD_URL/api/metrics?range=30d" > /tmp/metrics.json
```

If `DASHBOARD_URL` is unset, ask for it once, then continue.

Check `data.warnings` before analysing. If `coverageDays` is well below
`requestedDays`, say so in the output rather than treating a short window as a
trend.

## 2. Analyse each niche group

For every entry in `data.groups`, study its `trend`, `byFormat`,
`concentrationHhi`, `momentum` and `opportunity`, plus the group's channels in
`data.channels` and videos in `data.videos`.

Write for a YouTube strategist deciding where to spend the next month of
production effort. Be specific and quantitative — cite the actual numbers.

Cover:

- **What changed** this window, and whether it is momentum or a single video
  carrying the group. Check `dominancePct` before calling anything a trend.
- **Shorts vs long-form separately.** Never merge them. Say which format is
  working and what the gap implies.
- **Concentration.** Read `concentrationHhi`: above ~2500 one channel dominates
  and entry is hard; below ~1500 the niche is fragmented and open.
- **Outlier patterns.** Look for repeated formats, title shapes, or durations
  across `BREAKOUT`/`VIRAL` videos. A repeatable pattern beats a one-off hit.
- **One concrete recommendation** — what to make, or what to stop making.

Rules:

- Cite numbers you actually read. Never invent a metric.
- `Niche_Group` is only ~21% populated, so the `Overall` bucket is everything
  ungrouped — treat it as a baseline to compare against, not a real cohort.
- The Shorts/long-form split thins after 7 days (Stage 2 deletes `HISTORICAL`
  video rows), so prefer the last 7 days when reasoning about format mix, and
  say so if a claim rests on older data.
- If a group has too little data to support a conclusion, say that instead of
  padding. `low` confidence is a valid, useful answer.

## 3. Write the tab

Emit one JSON object per group and hand the array to the writer:

```json
[
  {
    "nicheGroup": "FIN COMP",
    "headline": "one sentence, the single most important finding",
    "body": "2-5 short paragraphs or '- ' bullets. Plain text, no markdown headings.",
    "confidence": "high | medium | low",
    "range": "30d"
  }
]
```

Then:

```bash
node scripts/write-insights.mjs /tmp/insights.json
```

The script appends rows and creates the tab if missing. Report which groups
were written and any you skipped for thin data.
