"use client"

import { useMemo, useState, type ReactNode } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type {
  ArchetypeResult,
  IdeationPayload,
  OverlapResult,
  RepetitionResult,
  TopicTerm,
} from "@/lib/niche/ideation"
import { EmptyPanel, MiniBar, Panel, PanelHeader, PercentileChip, SampleNote } from "./ui"

const fmt = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${Math.round(n)}`
}

/**
 * Example titles on hover, in a portal.
 *
 * Every hover surface on this page goes through Radix rather than an absolutely
 * positioned child. The previous version put a breakdown card inside a panel
 * with `overflow-hidden` and it was clipped at the panel edge — a portal cannot
 * be clipped by an ancestor's overflow, so the bug class is designed out rather
 * than worked around per component.
 */
function Examples({
  children,
  title,
  note,
  examples,
}: {
  children: ReactNode
  title: string
  note?: string
  examples: Array<{ title: string; handle: string; percentile: number | null }>
}) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-96 border-border bg-popover p-3">
        <p className="text-[12px] font-semibold text-foreground">{title}</p>
        {note && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p>}
        {examples.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
            {examples.map((e) => (
              <li key={e.title} className="flex items-start gap-2">
                {e.percentile !== null && <PercentileChip value={e.percentile} />}
                <span className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">
                  {e.title}
                  <span className="ml-1 text-muted-foreground">{e.handle}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

// ── What framings win ────────────────────────────────────────────────────

/**
 * Archetype performance as a deviation from par.
 *
 * Bars grow from a centre line at percentile 50, not from zero. The question
 * is never "how big is this number" — every median percentile is somewhere
 * near 50 by construction — it is "which side of par does this framing fall
 * on, and by how much". A zero-based bar makes a 30 and a 70 look almost
 * identical; a centred one makes them opposites, which is what they are.
 */
export function ArchetypePanel({ archetypes }: { archetypes: ArchetypeResult[] }) {
  if (archetypes.length === 0) {
    return (
      <Panel className="h-full">
        <PanelHeader title="What framings win here" />
        <EmptyPanel>
          No title framing appears often enough in this niche to measure. That usually means the
          corpus is small, not that framing does not matter.
        </EmptyPanel>
      </Panel>
    )
  }

  const spread = Math.max(...archetypes.map((a) => Math.abs(a.medianPercentile - 50)), 10)

  return (
    <Panel className="h-full">
      <PanelHeader
        title="What framings win here"
        hint="median percentile vs the channel's own baseline"
      />
      <div className="flex flex-col divide-y divide-border/60">
        {archetypes.map((a) => {
          const delta = a.medianPercentile - 50
          const width = (Math.abs(delta) / spread) * 50
          return (
            <Examples
              key={a.key}
              title={a.label}
              note={`${a.description}. ${a.videoCount} videos (${a.sharePct}% of the niche) across ${a.channelCount} channel${a.channelCount === 1 ? "" : "s"}, ${a.confidence} confidence.`}
              examples={a.examples}
            >
              <div className="grid cursor-default grid-cols-[9.5rem_1fr_auto] items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/30">
                <p className="truncate text-[12px] text-foreground">{a.label}</p>

                <div className="relative h-4">
                  {/* Par line. Everything is read against this, so it is the
                      only gridline the chart needs. */}
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <div
                    className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-[4px] ${
                      delta >= 0 ? "bg-primary" : "bg-slate-500"
                    }`}
                    style={
                      delta >= 0
                        ? { left: "50%", width: `${width}%` }
                        : { right: "50%", width: `${width}%` }
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">
                    {a.sharePct}% used
                  </span>
                  <PercentileChip value={a.medianPercentile} />
                </div>
              </div>
            </Examples>
          )
        })}
      </div>
      <div className="border-t border-border px-4 py-2">
        <SampleNote>
          Left of the line is below the publisher&apos;s midpoint rank, right is above. Share tells you
          how much of the niche already uses it — a framing that wins and is rarely used is the
          interesting one.
        </SampleNote>
      </div>
    </Panel>
  )
}

// ── The topic board ──────────────────────────────────────────────────────

type Lane = { key: string; label: string; blurb: string; terms: TopicTerm[] }

/**
 * Topics in three lanes rather than a treemap.
 *
 * A treemap was the obvious choice and the wrong one: a hundred text labels in
 * proportional rectangles are unreadable at any dashboard size, and the skill's
 * own chart guidance rates treemaps high-risk and insists the accessible table
 * be the primary view. The decision this panel supports is categorical — is
 * this topic table stakes, contested, or open — so the lanes ARE the encoding,
 * and size lives in an honest bar.
 */
export function TopicBoard({ topics }: { topics: TopicTerm[] }) {
  const lanes: Lane[] = useMemo(() => {
    const saturated = topics.filter((t) => t.isSaturated).slice(0, 12)
    const openings = topics.filter((t) => t.isWhitespace && !t.isSaturated).slice(0, 12)
    const claimed = new Set([...saturated, ...openings].map((t) => t.term))
    const working = topics
      .filter((t) => !claimed.has(t.term) && t.medianPercentile >= 50)
      .slice(0, 12)
    return [
      {
        key: "saturated",
        label: "Table stakes",
        blurb: "Most of the niche already makes this. Entering here means competing on execution.",
        terms: saturated,
      },
      {
        key: "working",
        label: "Working",
        blurb: "Above par, contested by a few channels. Relative performance is above baseline; demand is not established.",
        terms: working,
      },
      {
        key: "openings",
        label: "Openings",
        blurb: "Strong relative performance on few channels. Investigate before treating this as an opportunity.",
        terms: openings,
      },
    ]
  }, [topics])

  const maxCount = Math.max(1, ...topics.slice(0, 40).map((t) => t.videoCount))
  const empty = lanes.every((l) => l.terms.length === 0)

  return (
    <Panel className="h-full">
      <PanelHeader title="What this niche makes" hint="subjects, by how contested they are" />
      {empty ? (
        <EmptyPanel>
          Not enough repeated subjects to map. A term needs at least four videos before its
          performance means anything.
        </EmptyPanel>
      ) : (
        <div className="grid flex-1 grid-cols-1 divide-y divide-border/60 md:grid-cols-3 md:divide-x md:divide-y-0">
          {lanes.map((lane) => (
            <div key={lane.key} className="flex min-w-0 flex-col">
              <div className="px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-foreground">
                  {lane.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{lane.blurb}</p>
              </div>
              <ul className="flex flex-col gap-px px-1.5 pb-2">
                {lane.terms.length === 0 && (
                  <li className="px-1.5 py-2 text-[11px] text-muted-foreground/70">
                    Nothing in this lane.
                  </li>
                )}
                {lane.terms.map((t) => (
                  <li key={t.term}>
                    <Examples
                      title={`"${t.term}"`}
                      note={`${t.videoCount} videos across ${t.channelCount} channel${t.channelCount === 1 ? "" : "s"}${t.medianViewsPerDay ? `, median ${fmt(t.medianViewsPerDay)} views/day` : ""}.`}
                      examples={t.examples}
                    >
                      <div className="cursor-default rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[12px] text-foreground">
                            {t.term}
                          </span>
                          <PercentileChip value={t.medianPercentile} />
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <MiniBar
                            value={t.videoCount}
                            max={maxCount}
                            tone={lane.key === "saturated" ? "neutral" : "accent"}
                            className="flex-1"
                          />
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {t.videoCount}v · {t.channelCount}ch
                          </span>
                        </div>
                      </div>
                    </Examples>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ── Who ideates from the same well ───────────────────────────────────────

/**
 * Channel-vs-channel vocabulary overlap as a matrix.
 *
 * The value is printed in every cell, not just encoded as intensity — a
 * colour-only heatmap fails for anyone who cannot separate the steps, and here
 * the exact number is the point. Intensity is a second channel on the same
 * value, never the only one.
 */
export function OverlapPanel({ overlap }: { overlap: OverlapResult }) {
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const lookup = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of overlap.pairs) {
      map.set(`${p.a}::${p.b}`, p.similarity)
      map.set(`${p.b}::${p.a}`, p.similarity)
    }
    return map
  }, [overlap.pairs])

  if (overlap.handles.length < 2) {
    return (
      <Panel id="channel-similarity" className="h-full">
        <PanelHeader title="Shared title vocabulary" />
        <EmptyPanel>
          At least two channels with enough titles are needed to compare vocabularies. This niche has{" "}
          {overlap.handles.length}.
        </EmptyPanel>
      </Panel>
    )
  }

  const pair = overlap.pairs.find(p => `${p.a}::${p.b}` === selectedPair || `${p.b}::${p.a}` === selectedPair) ?? overlap.pairs[0]
  const max = Math.max(...overlap.pairs.map((p) => p.similarity), 1)
  const short = (h: string) => h.replace(/^@/, "").slice(0, 10)

  return (
    <Panel id="channel-similarity" className="h-full">
      <PanelHeader
        title="Shared title vocabulary"
        hint={`median overlap ${overlap.medianSimilarity ?? 0}%`}
        right={
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            0%
            <span className="h-2 w-16 rounded-[4px] bg-[linear-gradient(to_right,var(--muted),var(--primary))]" />
            {max}%
          </span>
        }
      />

      <div className="overflow-x-auto px-3 pb-3">
        <table className="border-separate border-spacing-0.5 text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card" />
              {overlap.handles.map((h) => (
                <th
                  key={h}
                  className="h-16 w-8 align-bottom text-muted-foreground"
                  title={h}
                >
                  <span className="block origin-bottom-left translate-x-3 -rotate-45 whitespace-nowrap text-left">
                    {short(h)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overlap.handles.map((row) => (
              <tr key={row}>
                <th
                  className="sticky left-0 z-10 max-w-[7.5rem] truncate bg-card pr-2 text-right font-normal text-muted-foreground"
                  title={row}
                >
                  {short(row)}
                </th>
                {overlap.handles.map((col) => {
                  if (row === col) {
                    return <td key={col} className="h-7 w-8 rounded bg-muted/20" />
                  }
                  const value = lookup.get(`${row}::${col}`) ?? 0
                  const active = hovered === row || hovered === col
                  return (
                    <td key={col} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSelectedPair(`${row}::${col}`)}
                        aria-label={`${row} and ${col}: ${value}% vocabulary overlap. Inspect shared words`}
                        aria-pressed={pair?.a === row && pair?.b === col || pair?.b === row && pair?.a === col}
                        onMouseEnter={() => setHovered(row)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(row)}
                        onBlur={() => setHovered(null)}
                        title={`${row} and ${col} share ${value}% of their title vocabulary`}
                        className={`h-7 w-8 rounded tabular-nums transition-colors duration-150 ${
                          active ? "ring-1 ring-primary/60" : ""
                        }`}
                        style={{
                          backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(
                            (value / max) * 85
                          )}%, var(--muted))`,
                        }}
                      >
                        <span
                          className={
                            value / max > 0.55 ? "text-primary-foreground" : "text-muted-foreground"
                          }
                        >
                          {value}
                        </span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pair && <div aria-live="polite" className="border-t border-border px-4 py-4 text-sm">
        <p className="break-words font-medium">{pair.a} × {pair.b} · {pair.similarity}%</p>
        <p className="mt-2 text-muted-foreground">Shared words: {pair.shared.length ? pair.shared.join(", ") : "No shared vocabulary"}</p>
      </div>}
      <div className="border-t border-border px-4 py-2">
        <SampleNote>
          Jaccard overlap measures shared title words, not semantic equivalence or copying. Select a cell to inspect shared vocabulary. Channels need at least 20 distinct content words; at most 12 channels are displayed.
        </SampleNote>
      </div>
    </Panel>
  )
}

// ── Does re-running a topic still work ───────────────────────────────────

export function RecyclingPanel({ repetition }: { repetition: RepetitionResult[] }) {
  if (repetition.length === 0) {
    return (
      <Panel className="h-full">
        <PanelHeader title="Repeating a subject" />
        <EmptyPanel>Not enough upload history in this niche to measure repetition.</EmptyPanel>
      </Panel>
    )
  }

  return (
    <Panel className="h-full">
      <PanelHeader title="Repeating a subject" hint="does re-running a topic still land?" />
      <div className="flex flex-col divide-y divide-border/60">
        {repetition.slice(0, 8).map((r) => {
          const lifts = r.repeatPercentile !== null && r.freshPercentile !== null
          const better = lifts && (r.repeatPercentile as number) > (r.freshPercentile as number)
          return (
            <div
              key={r.handle}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2"
            >
              <p className="truncate text-[12px] text-foreground">{r.handle}</p>
              <p className="justify-self-end text-[11px] tabular-nums text-muted-foreground">
                {r.recycleRatePct}% recycled
                {r.medianDaysBetweenRepeats !== null && ` · every ${r.medianDaysBetweenRepeats}d`}
              </p>
              <div className="col-span-2 flex items-center gap-2">
                <MiniBar value={r.recycleRatePct} max={100} className="flex-1" />
                {lifts && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    repeat <PercentileChip value={r.repeatPercentile as number} /> vs fresh{" "}
                    <PercentileChip value={r.freshPercentile as number} />
                    <span className={better ? "text-primary" : "text-slate-400"}>
                      {better ? "repeats win" : "fresh wins"}
                    </span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/** Coverage line for the whole ideation block — what the panels above are made of. */
export function IdeationCoverageLine({ payload }: { payload: IdeationPayload }) {
  const c = payload.coverage
  return (
    <SampleNote>
      Read from {c.corpusSize.toLocaleString()} published{" "}
      {c.videoType === "SHORTS" ? "Shorts" : "long-form videos"} across {c.channelCount} channels
      {c.oldestPublished && c.newestPublished ? `, ${c.oldestPublished} to ${c.newestPublished}` : ""}.
      Performance ranks lifetime views per observed day within each channel and format. This reduces channel-scale effects; age and sampling biases remain. p50 is the midpoint rank.
    </SampleNote>
  )
}
