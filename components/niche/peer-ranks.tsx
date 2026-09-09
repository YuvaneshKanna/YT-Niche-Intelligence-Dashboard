"use client"

import type { PeerMeasure } from "@/lib/niche/recommend"
import { formatCount } from "@/lib/niche/recommend"

function formatValue(m: PeerMeasure): string {
  if (m.format === "pct") return `${m.value.toFixed(2)}%`
  if (m.format === "rate") return `${m.value.toFixed(1)}/wk`
  return formatCount(m.value)
}

function Bullet({ measure }: { measure: PeerMeasure }) {
  const { value, best, median } = measure
  // Every bar shares the best-in-class as its ceiling, so the six rows are
  // read against each other as "how close to the leader", not six unrelated
  // scales that happen to sit in one column.
  const pct = best > 0 ? Math.max(0, Math.min(100, (value / best) * 100)) : 0
  const medianPct = best > 0 ? Math.max(0, Math.min(100, (median / best) * 100)) : 0
  const leader = measure.rank === 1

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5">
      <p className="truncate text-[11px] text-muted-foreground" title={measure.note}>
        {measure.label}
      </p>
      <p className="flex items-baseline gap-2 justify-self-end text-[11px]">
        <span className="font-semibold tabular-nums text-foreground">{formatValue(measure)}</span>
        <span
          className={`tabular-nums ${leader ? "font-semibold text-primary" : "text-muted-foreground"}`}
        >
          #{measure.rank} of {measure.outOf}
        </span>
      </p>

      <div className="col-span-2 relative h-2 rounded-[4px] bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-[4px] bg-primary"
          style={{ width: `${pct}%` }}
        />
        {/* Median across all groups — the "is this actually good" reference. */}
        <div
          className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground/60"
          style={{ left: `${medianPct}%` }}
          title={`Median across all niche groups: ${
            measure.format === "pct"
              ? `${median.toFixed(2)}%`
              : measure.format === "rate"
                ? `${median.toFixed(1)}/wk`
                : formatCount(median)
          }`}
        />
      </div>
    </div>
  )
}

/**
 * Where this niche sits against every other tracked group, on six measures.
 *
 * Bars, not a radar: six axes on a polygon make area read as quality, and the
 * shape changes meaning when the measures are reordered. Each figure is
 * normalised per channel, so a 159-channel group cannot win on size alone.
 */
export function PeerRanks({ measures, groupName }: { measures: PeerMeasure[]; groupName: string }) {
  return (
    <section
      id="peers"
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card scroll-mt-24"
    >
      <header className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {groupName} vs other niches
        </h3>
        <span className="text-[10px] text-muted-foreground">
          bar = share of best · tick = median
        </span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {measures.map((m) => (
          <Bullet key={m.key} measure={m} />
        ))}
      </div>
    </section>
  )
}
