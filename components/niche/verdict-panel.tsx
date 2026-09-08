"use client"

import type { NicheGroupSummary, ScoreComponent } from "@/lib/metrics/types"
import { ScoreCard } from "@/components/metrics/score-card"
import { formatCount } from "@/lib/niche/recommend"

/** The one-line read on a niche, assembled from the three numbers that decide it. */
export function verdictSentence(group: NicheGroupSummary): string {
  const pace =
    group.momentum.score >= 70
      ? "Moving fast"
      : group.momentum.score >= 45
        ? "Steady"
        : "Slow-moving"
  const room =
    group.opportunity.score >= 70
      ? "high opportunity"
      : group.opportunity.score >= 45
        ? "moderate opportunity"
        : "thin opportunity"
  const field = group.concentrationHhi >= 2500 ? "concentrated field" : "fragmented field"
  return `${pace}, ${room}, ${field}.`
}

/** The RPM component of the opportunity score, which carries its own provenance. */
function rpmComponent(group: NicheGroupSummary): ScoreComponent | null {
  return group.opportunity.components.find((c) => c.key === "rpm") ?? null
}

const SOURCE_LABEL: Record<ScoreComponent["source"], string> = {
  measured: "measured",
  nexlev: "NexLev measured",
  estimate: "estimated",
}

const SOURCE_CLASS: Record<ScoreComponent["source"], string> = {
  measured: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  nexlev: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  estimate: "border-amber-500/30 bg-amber-500/10 text-amber-300",
}

function Tile({
  label,
  value,
  sub,
  badge,
  title,
}: {
  label: string
  value: string
  sub: string
  badge?: { text: string; className: string }
  title?: string
}) {
  return (
    <div
      title={title}
      className="flex flex-col justify-between overflow-hidden rounded-lg border border-border bg-background/40 p-2.5"
    >
      <p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold leading-none tabular-nums text-foreground">{value}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
        {badge && (
          <span
            className={`flex-shrink-0 rounded border px-1 py-px text-[9px] ${badge.className}`}
          >
            {badge.text}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The verdict: what this niche is, in one sentence, two meters and six numbers.
 * Sits beside "Next moves" so the answer and the instruction read together
 * before any chart is reached.
 */
export function VerdictPanel({ group }: { group: NicheGroupSummary }) {
  const rpm = rpmComponent(group)
  const age = group.medianChannelAgeDays

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-2.5">
        <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">Verdict</h3>
        <p className="mt-1 text-sm font-semibold text-foreground">{verdictSentence(group)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {group.channelCount} channel{group.channelCount === 1 ? "" : "s"} · {group.primaryNiche}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 p-3">
        <ScoreCard title="Momentum" subtitle="How fast it moves" score={group.momentum} />
        <ScoreCard
          title="Opportunity"
          subtitle={`vs ${group.primaryNiche}`}
          score={group.opportunity}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
        <Tile
          label="Views gained"
          value={formatCount(group.totalViewsDelta)}
          sub="in range"
        />
        <Tile
          label="Subs gained"
          value={formatCount(group.subscriberDelta)}
          sub="in range"
        />
        <Tile
          label="RPM"
          value={rpm?.displayValue ?? "—"}
          sub={rpm ? SOURCE_LABEL[rpm.source] : "no reading"}
          badge={
            rpm
              ? { text: rpm.source === "estimate" ? "est." : "measured", className: SOURCE_CLASS[rpm.source] }
              : undefined
          }
          title={rpm?.note}
        />
        <Tile
          label="Concentration"
          value={String(group.concentrationHhi)}
          sub={group.concentrationHhi >= 2500 ? "concentrated" : "fragmented"}
          title="Herfindahl-Hirschman Index of channel view share, 0-10000. Above 2500 a few channels take most of the views."
        />
        <Tile
          label="Median ch. age"
          value={age === null ? "—" : `${age}d`}
          sub="lower bound"
          title="Median days since each channel's oldest TRACKED upload. Stage 2 fetches only a slice of each channel's uploads, so this is a lower bound on real channel age, not a creation date."
        />
        <Tile
          label="Tracked videos"
          value={String(group.byFormat.LONG_FORM.videoCount + group.byFormat.SHORTS.videoCount)}
          sub={`${group.byFormat.LONG_FORM.videoCount} long · ${group.byFormat.SHORTS.videoCount} short`}
          title="Videos with snapshot coverage in this window. Ordinary videos are pruned after 7 days, so a long range is outlier-weighted."
        />
      </div>
    </section>
  )
}
