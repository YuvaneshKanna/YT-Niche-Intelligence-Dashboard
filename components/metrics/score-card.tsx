"use client"

import { useState } from "react"
import { Info } from "lucide-react"
import type { CompositeScore, ScoreComponent } from "@/lib/metrics/types"

const SOURCE_STYLE: Record<ScoreComponent["source"], { label: string; className: string }> = {
  measured: { label: "measured", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  nexlev: { label: "NexLev", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  estimate: { label: "estimate", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
}

const CONFIDENCE_STYLE: Record<CompositeScore["confidence"], string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-red-400",
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400"
  if (score >= 45) return "text-amber-400"
  return "text-red-400"
}

interface ScoreCardProps {
  title: string
  subtitle: string
  score: CompositeScore
}

/**
 * A composite score with its full breakdown on hover.
 *
 * Every component shows where its value came from — measured from the user's
 * own pipeline, pulled from NexLev, or estimated. Estimates are never styled
 * to look like measurements.
 */
export function ScoreCard({ title, subtitle, score }: ScoreCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="flex h-full flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">{subtitle}</p>
          </div>
          <Info className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />
        </div>

        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold leading-none tabular-nums ${scoreColor(score.score)}`}>
            {score.score}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${score.score}%` }}
          />
        </div>

        <p className={`text-[11px] font-medium ${CONFIDENCE_STYLE[score.confidence]}`}>
          {score.confidence} confidence
        </p>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(26rem,90vw)] rounded-xl border border-border bg-popover p-4 shadow-2xl">
          <p className="mb-3 text-xs font-semibold text-foreground">{title} breakdown</p>

          <div className="space-y-3">
            {score.components.map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{c.label}</span>
                    <span
                      className={`rounded border px-1.5 py-px text-[9px] uppercase tracking-wide ${
                        SOURCE_STYLE[c.source].className
                      }`}
                    >
                      {SOURCE_STYLE[c.source].label}
                    </span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {c.displayValue}
                  </span>
                </div>

                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${c.score}%` }}
                  />
                </div>

                {c.note && (
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{c.note}</p>
                )}
              </div>
            ))}
          </div>

          <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
            <span className={CONFIDENCE_STYLE[score.confidence]}>
              {score.confidence} confidence.
            </span>{" "}
            {score.confidenceReason}
          </p>
        </div>
      )}
    </div>
  )
}
