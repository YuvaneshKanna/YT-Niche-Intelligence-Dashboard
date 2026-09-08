"use client"

import type { NicheGroupSummary, ScoreComponent } from "@/lib/metrics/types"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { formatCount } from "@/lib/niche/recommend"

/** The one-line read on a niche, assembled from the three numbers that decide it. */
export function verdictSentence(group: NicheGroupSummary): string {
  const pace =
    group.momentum.score >= 70 ? "Moving fast" : group.momentum.score >= 45 ? "Steady" : "Slow-moving"
  const field = group.concentrationHhi >= 2500 ? "a few channels lead the views" : "views are spread across channels"
  return `${pace}; ${field}.`
}

const rpmOf = (group: NicheGroupSummary): ScoreComponent | null =>
  group.opportunity.components.find((c) => c.key === "rpm") ?? null

/**
 * A figure with its label under it, on the page background — no box.
 *
 * The version this replaces put every number in its own bordered tile, so eight
 * numbers meant eight competing rectangles and no hierarchy at all. Numbers do
 * not need containers to be read; they need space and a label.
 */
function Figure({
  value,
  label,
  note,
  tone = "default",
}: {
  value: string
  label: string
  note?: string
  tone?: "default" | "muted"
}) {
  const body = (
    <div className="min-w-0">
      <p
        className={`text-[22px] font-semibold leading-none tabular-nums ${
          tone === "muted" ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
    </div>
  )
  if (!note) return body
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div className="cursor-default">{body}</div>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-80 border-border bg-popover p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">{note}</p>
      </HoverCardContent>
    </HoverCard>
  )
}

/** A 0-100 composite as a thin inline meter. Two of these replace two full cards. */
function Meter({ label, score, reason }: { label: string; score: number; reason: string }) {
  const tone = score >= 70 ? "bg-emerald-400" : score >= 45 ? "bg-amber-400" : "bg-red-400"
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div className="w-28 cursor-default">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-foreground">{score}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-[4px] bg-muted">
            <div className={`h-full rounded-[4px] ${tone}`} style={{ width: `${score}%` }} />
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-80 border-border bg-popover p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">{reason}</p>
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * The page's masthead: what this niche is, in one sentence and five figures.
 * Deliberately not a card — it is the page's own heading, not a widget on it.
 */
export function Headline({
  group,
  rank,
  outOf,
}: {
  group: NicheGroupSummary
  rank: number | null
  outOf: number
}) {
  const rpm = rpmOf(group)

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-1 py-1">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold leading-none tracking-tight text-foreground">
            {group.nicheGroup}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {group.channelCount} channel{group.channelCount === 1 ? "" : "s"} · {group.primaryNiche}
            {rank !== null && ` · #${rank} of ${outOf} by views gained`}
          </p>
        </div>
        <p className="mt-2 text-[13px] text-foreground/90">{verdictSentence(group)}</p>
      </div>

      <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
        <Figure value={formatCount(group.totalViewsDelta)} label="Views gained" />
        <Figure value={formatCount(group.subscriberDelta)} label="Subs gained" />
        <Figure
          value={rpm?.displayValue ?? "—"}
          label={rpm?.source === "estimate" ? "RPM (est.)" : "RPM"}
          note={rpm?.note}
          tone={rpm?.source === "estimate" ? "muted" : "default"}
        />
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer rounded py-2">Compare niche scores</summary>
          <div className="mt-3 flex flex-wrap items-end gap-5">
        <Figure
          value={group.concentrationHhi >= 2500 ? "Few leaders" : "Spread out"}
          label="Who gets the views"
          note="Herfindahl-Hirschman Index of channel view share, 0-10000. Above 2500 a few channels take most of the views in this niche."
        />
        <Meter
          label="Momentum"
          score={group.momentum.score}
          reason={`How fast this niche is moving. ${group.momentum.confidenceReason}`}
        />
        <Meter
          label="Opportunity"
          score={group.opportunity.score}
          reason={`Room to win against the wider ${group.primaryNiche} niche. ${group.opportunity.confidenceReason}`}
        />
          </div>
        </details>
      </div>
    </div>
  )
}
