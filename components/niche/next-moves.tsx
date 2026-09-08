"use client"

import { ArrowRight, CircleAlert, CircleCheck, CircleHelp } from "lucide-react"
import type { Confidence } from "@/lib/metrics/types"
import type { EvidenceAnchor, Move } from "@/lib/niche/recommend"

/**
 * Confidence is a status, not a series, so it gets its own reserved colours —
 * and always ships with an icon and the word, never colour alone.
 */
const CONFIDENCE_STYLE: Record<Confidence, { className: string; icon: typeof CircleCheck }> = {
  high: { className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: CircleCheck },
  medium: { className: "border-amber-500/30 bg-amber-500/10 text-amber-300", icon: CircleAlert },
  low: { className: "border-border bg-muted/40 text-muted-foreground", icon: CircleHelp },
}

function ConfidenceChip({ confidence, reason }: { confidence: Confidence; reason: string }) {
  const { className, icon: Icon } = CONFIDENCE_STYLE[confidence]
  return (
    <span
      title={reason}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${className}`}
    >
      <Icon className="h-3 w-3" />
      {confidence} confidence
    </span>
  )
}

function MoveCard({
  move,
  rank,
  onShowEvidence,
}: {
  move: Move
  rank: number
  onShowEvidence: (anchor: EvidenceAnchor) => void
}) {
  return (
    <li className="group flex gap-3 rounded-lg border border-border bg-background/40 p-3 transition-colors hover:border-primary/40">
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
        {rank}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-semibold leading-snug text-foreground">{move.headline}</h4>
          <span className="flex-shrink-0 text-xl font-bold leading-none tabular-nums text-primary">
            {move.metric}
          </span>
        </div>

        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{move.detail}</p>

        <div className="mt-2 flex items-center gap-2">
          <ConfidenceChip confidence={move.confidence} reason={move.confidenceReason} />
          <button
            onClick={() => onShowEvidence(move.anchor)}
            className="inline-flex items-center gap-1 text-[10px] text-primary opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100"
          >
            Show the evidence
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  )
}

/**
 * The page's answer, above its evidence. Every card states the number it was
 * computed from and how far that number can be trusted, and jumps to the panel
 * that produced it — a claim with no traceable evidence does not belong here.
 */
export function NextMoves({
  moves,
  emptyReason,
  onShowEvidence,
}: {
  moves: Move[]
  emptyReason: string | null
  onShowEvidence: (anchor: EvidenceAnchor) => void
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">Next moves</h3>
        <span className="text-[10px] text-muted-foreground">ranked by effect × confidence</span>
      </header>

      {emptyReason ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
            {emptyReason}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto p-3">
          {moves.map((move, i) => (
            <MoveCard key={move.id} move={move} rank={i + 1} onShowEvidence={onShowEvidence} />
          ))}
        </ul>
      )}
    </section>
  )
}
