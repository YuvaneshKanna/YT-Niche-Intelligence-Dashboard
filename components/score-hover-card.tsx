"use client"

import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Check, Info } from "lucide-react"

import { cn } from "@/lib/utils"
import type { RankedEntry } from "@/lib/useRankings"
import type { NicheScore } from "@/lib/scoring/types"

const POOL_NAME = { LONG_FORM: "long-form", SHORTS: "Shorts" } as const

type Variant = "compact" | "large"

/**
 * Sizing per variant. "large" is for the one header badge that stands alone on
 * a page (the audit panel's identity block) rather than one of 400 rows in a
 * sidebar — it can afford real width and a second data section without ever
 * competing for space the way the sidebar's cards would.
 */
const SIZE: Record<
  Variant,
  { width: number; estimatedHeight: number; score: string; label: string; pad: string }
> = {
  compact: { width: 340, estimatedHeight: 340, score: "text-3xl", label: "text-[9px]", pad: "px-3.5" },
  large: { width: 460, estimatedHeight: 620, score: "text-6xl", label: "text-[10px]", pad: "px-5" },
}

const VIEWPORT_MARGIN = 12
/** Long enough that skimming the list does not strobe cards open, short enough to feel instant. */
const OPEN_DELAY_MS = 120

/**
 * Score band. Returned as a token pair so the bar and the number always agree,
 * and so the value is never carried by colour alone — every bar sits beside its
 * own number and label.
 */
function band(score: number): { bar: string; text: string; label: string } {
  if (score >= 70) return { bar: "bg-emerald-400", text: "text-emerald-300", label: "strong" }
  if (score >= 40) return { bar: "bg-sky-400", text: "text-sky-300", label: "mid" }
  return { bar: "bg-slate-500", text: "text-slate-400", label: "weak" }
}

const CONFIDENCE_STYLE = {
  high: { chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", Icon: Check },
  medium: { chip: "border-sky-500/30 bg-sky-500/10 text-sky-300", Icon: Info },
  low: { chip: "border-amber-500/30 bg-amber-500/10 text-amber-300", Icon: AlertTriangle },
} as const

/** One component row: label, percentile bar, value, weight. */
function ComponentRow({
  label,
  score,
  weight,
  displayValue,
  isTop,
  large = false,
}: {
  label: string
  score: number | null
  weight: number
  displayValue: string
  isTop: boolean
  large?: boolean
}) {
  const tone = score === null ? { bar: "bg-slate-700", text: "text-muted-foreground" } : band(score)

  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-2">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className={cn("truncate text-foreground", large ? "text-[13px]" : "text-[11px]")}>
          {label}
        </span>
        {isTop && (
          <span className="flex-shrink-0 rounded bg-primary/20 px-1 text-[8px] font-semibold uppercase tracking-wide text-primary">
            top driver
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className={cn("font-semibold", large ? "text-[13px]" : "text-[11px]", tone.text)}>
          {score === null ? "—" : score.toFixed(0)}
        </span>
        <span className="w-8 text-right text-[9px] text-muted-foreground">
          {Math.round(weight * 100)}%
        </span>
      </div>

      <div className={cn("col-span-2 mt-0.5 flex items-center gap-2", large ? "mb-2" : "mb-1.5")}>
        <div className={cn("flex-1 overflow-hidden rounded-full bg-white/[0.07]", large ? "h-1.5" : "h-1")}>
          <div
            className={cn("h-full rounded-full", tone.bar)}
            style={{ width: `${score === null ? 0 : Math.max(2, score)}%` }}
          />
        </div>
        <span className="w-[5.5rem] flex-shrink-0 text-right text-[9px] tabular-nums text-muted-foreground">
          {displayValue}
        </span>
      </div>
    </div>
  )
}

function CardBody({
  entry,
  variant = "compact",
  nicheScore = null,
}: {
  entry: RankedEntry
  variant?: Variant
  nicheScore?: NicheScore | null
}) {
  const { score, cohort, rank, poolSize, pool } = entry
  const split = score.formatSplit
  const measuredDiffers = split.measuredClass !== pool
  const tone = band(cohort.combinedScore)
  const conf = CONFIDENCE_STYLE[score.confidence]
  const large = variant === "large"
  const s = SIZE[variant]

  // Ordered by what actually moves the number — percentile times weight — so
  // the row that explains the score is the row the eye lands on first.
  const rows = [...cohort.components].sort(
    (a, b) => (b.score ?? 0) * b.weight - (a.score ?? 0) * a.weight
  )
  const nicheRows = nicheScore
    ? [...nicheScore.components].sort((a, b) => (b.score ?? 0) * b.weight - (a.score ?? 0) * a.weight)
    : []

  const videoTotal = split.longFormVideos + split.shortsVideos

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/60",
        large && "ring-1 ring-white/[0.04]"
      )}
    >
      {/* ── Headline: where it ranks, and what it scored ── */}
      <div className={cn("border-b border-border pb-3 pt-2.5", s.pad)}>
        <p className={cn("font-medium uppercase tracking-widest text-muted-foreground", s.label)}>
          #{rank} of {poolSize} · {POOL_NAME[pool]} pool
        </p>

        <div className={cn("flex items-end gap-3", large ? "mt-2.5" : "mt-1.5")}>
          <div className="flex items-baseline gap-1">
            <span className={cn("font-bold leading-none tabular-nums", s.score, tone.text)}>
              {cohort.combinedScore.toFixed(1)}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>

          <div className={cn("mb-0.5 flex-1", large ? "space-y-1.5" : "space-y-1")}>
            <div
              className={cn(
                "flex items-baseline justify-between gap-2",
                large ? "text-xs" : "text-[10px]"
              )}
            >
              <span className="text-muted-foreground">
                Channel{" "}
                <span className="font-semibold tabular-nums text-foreground">{cohort.channelScore}</span>
                <span className="ml-0.5 opacity-60">×75%</span>
              </span>
              <span className="text-muted-foreground">
                Niche{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {cohort.nicheScore ?? "—"}
                </span>
                <span className="ml-0.5 opacity-60">×25%</span>
              </span>
            </div>
            {/* Split bar: the 75/25 contribution, drawn to scale. */}
            <div className={cn("flex overflow-hidden rounded-full bg-white/[0.07]", large ? "h-1.5" : "h-1")}>
              <div className="bg-primary" style={{ width: `${cohort.channelScore * 0.75}%` }} />
              <div
                className="bg-primary/40"
                style={{ width: `${(cohort.nicheScore ?? 0) * 0.25}%` }}
              />
            </div>
          </div>
        </div>

        <p className={cn("leading-snug text-muted-foreground", large ? "mt-3 text-xs" : "mt-2 text-[10px]")}>
          Ranked only against other {POOL_NAME[pool]} channels — the two pools never mix.
        </p>

        {/* Large variant only: the long-form/Shorts upload mix as a visual bar,
            not just the plain-text line the provenance section already carries
            below — worth seeing at a glance on a card with room to show it. */}
        {large && videoTotal > 0 && (
          <div className="mt-3">
            <div className="flex overflow-hidden rounded-full bg-white/[0.07] h-2">
              <div
                className="bg-sky-400"
                style={{ width: `${(split.longFormVideos / videoTotal) * 100}%` }}
              />
              <div
                className="bg-red-400"
                style={{ width: `${(split.shortsVideos / videoTotal) * 100}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                {split.longFormVideos} long-form
              </span>
              <span className="flex items-center gap-1">
                {split.shortsVideos} Shorts
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── What drives the Channel score ── */}
      <div className={cn("py-2.5", s.pad)}>
        <div className="mb-2 flex items-baseline justify-between">
          <p className={cn("font-medium uppercase tracking-widest text-muted-foreground", s.label)}>
            What drives the Channel score
          </p>
          <p className="text-[8px] uppercase tracking-wide text-muted-foreground/70">
            percentile · weight
          </p>
        </div>
        {rows.map((c, i) => (
          <ComponentRow
            key={c.key}
            label={c.label}
            score={c.score}
            weight={c.weight}
            displayValue={c.displayValue}
            isTop={i === 0}
            large={large}
          />
        ))}
      </div>

      {/* ── What drives the Niche score — large variant only, and only when the
             caller resolved this channel's niche in the payload's niche list.
             The channel-score section above already exists on the sidebar's
             compact card; this is the genuinely new detail the bigger card
             earns its size with. ── */}
      {large && nicheScore && nicheRows.length > 0 && (
        <div className={cn("border-t border-border py-2.5", s.pad)}>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              What drives the {nicheScore.niche} niche score
            </p>
            <p className="text-[8px] uppercase tracking-wide text-muted-foreground/70">
              {nicheScore.channelCount} channels · {nicheScore.confidence} confidence
            </p>
          </div>
          {nicheRows.map((c, i) => (
            <ComponentRow
              key={c.key}
              label={c.label}
              score={c.score}
              weight={c.weight}
              displayValue={c.displayValue}
              isTop={i === 0}
              large
            />
          ))}
        </div>
      )}

      {/* ── Provenance ── */}
      <div className={cn("space-y-1.5 border-t border-border bg-black/20 py-2.5", s.pad)}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground",
            large ? "text-xs" : "text-[10px]"
          )}
        >
          <span className="tabular-nums">
            {split.longFormVideos} long-form · {split.shortsVideos} Shorts tracked
          </span>
          <span className="opacity-40">|</span>
          <span className="tabular-nums">{score.totalVideos} videos total</span>
          {score.createdAt && (
            <>
              <span className="opacity-40">|</span>
              <span className="tabular-nums">
                created {score.createdAt} ({score.channelAgeDays}d)
              </span>
            </>
          )}
        </div>

        {measuredDiffers && (
          <p
            className={cn(
              "flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 leading-snug text-amber-300",
              large ? "text-xs" : "text-[10px]"
            )}
          >
            <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span>
              Uploads look mostly {POOL_NAME[split.measuredClass]}, but Type says{" "}
              {POOL_NAME[pool]}. Pool follows Type — the Type field may be stale.
            </span>
          </p>
        )}

        <p
          className={cn(
            "flex items-start gap-1.5 rounded-md border px-2 py-1 leading-snug",
            large ? "text-xs" : "text-[10px]",
            conf.chip
          )}
        >
          <conf.Icon className="mt-px h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold capitalize">{score.confidence} confidence</span>
            {" — "}
            {score.confidenceReason}
          </span>
        </p>
      </div>
    </div>
  )
}

/**
 * Rich hover card for a channel's ranking.
 *
 * Replaces a native `title` tooltip, which cannot express hierarchy, renders as
 * flat OS text and is invisible to keyboard users. This one:
 *  - opens on hover AND on focus, and toggles on click, so it is reachable
 *    without a pointer (a hover-only affordance strands keyboard and touch);
 *  - renders through a portal with fixed positioning, because the sidebar is an
 *    `overflow-y-auto` column that would otherwise clip it;
 *  - flips to the other side of the trigger when it would leave the viewport;
 *  - honours prefers-reduced-motion by dropping the entrance transition.
 */
export function ScoreHoverCard({
  entry,
  children,
  className,
  ariaLabel,
  variant = "compact",
  nicheScore = null,
}: {
  entry: RankedEntry
  children: ReactNode
  className?: string
  ariaLabel: string
  /** "large" is for a standalone header badge with room to spare — see SIZE above. */
  variant?: Variant
  /** Only rendered for variant="large". Pass the entry's own niche/pool entry from ranking.niches. */
  nicheScore?: NicheScore | null
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardId = useId()
  const s = SIZE[variant]

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const show = useCallback((immediate = false) => {
    clearTimer()
    if (immediate) setOpen(true)
    else timer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS)
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setOpen(false)
  }, [])

  useEffect(() => clearTimer, [])

  // Position against the trigger before paint, so the card never appears at the
  // wrong place for a frame.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      const spaceRight = window.innerWidth - rect.right
      const left =
        spaceRight >= s.width + VIEWPORT_MARGIN
          ? rect.right + 8
          : Math.max(VIEWPORT_MARGIN, rect.left - s.width - 8)

      // Anchor near the trigger, then clamp so a card opened low in the list
      // is not cut off by the bottom of the window.
      const top = Math.min(
        Math.max(VIEWPORT_MARGIN, rect.top - 8),
        Math.max(VIEWPORT_MARGIN, window.innerHeight - s.estimatedHeight - VIEWPORT_MARGIN)
      )

      setCoords({ top, left })
    }

    place()
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [open, s.width, s.estimatedHeight])

  // Escape closes without moving focus off the trigger.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        hide()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, hide])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-describedby={open ? cardId : undefined}
        onClick={(e) => {
          // The card sits inside a clickable channel row; a click here is about
          // the score, not about selecting the channel.
          e.stopPropagation()
          open ? hide() : show(true)
        }}
        onMouseEnter={() => show()}
        onMouseLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        className={cn(
          "rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/70",
          className
        )}
      >
        {children}
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={cardId}
            role="tooltip"
            style={{ position: "fixed", top: coords.top, left: coords.left, width: s.width }}
            className="z-[100] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
            // Let the pointer travel into the card without it closing.
            onMouseEnter={() => show(true)}
            onMouseLeave={hide}
          >
            <CardBody entry={entry} variant={variant} nicheScore={nicheScore} />
          </div>,
          document.body
        )}
    </>
  )
}
