"use client"

import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Check, Info } from "lucide-react"

import { cn } from "@/lib/utils"
import type { RankedEntry } from "@/lib/useRankings"

const POOL_NAME = { LONG_FORM: "long-form", SHORTS: "Shorts" } as const

const CARD_WIDTH = 340
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
}: {
  label: string
  score: number | null
  weight: number
  displayValue: string
  isTop: boolean
}) {
  const tone = score === null ? { bar: "bg-slate-700", text: "text-muted-foreground" } : band(score)

  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-2">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[11px] text-foreground">{label}</span>
        {isTop && (
          <span className="flex-shrink-0 rounded bg-primary/20 px-1 text-[8px] font-semibold uppercase tracking-wide text-primary">
            top driver
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className={cn("text-[11px] font-semibold", tone.text)}>
          {score === null ? "—" : score.toFixed(0)}
        </span>
        <span className="w-8 text-right text-[9px] text-muted-foreground">
          {Math.round(weight * 100)}%
        </span>
      </div>

      <div className="col-span-2 mt-0.5 mb-1.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
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

function CardBody({ entry }: { entry: RankedEntry }) {
  const { score, cohort, rank, poolSize, pool } = entry
  const split = score.formatSplit
  const measuredDiffers = split.measuredClass !== pool
  const tone = band(cohort.combinedScore)
  const conf = CONFIDENCE_STYLE[score.confidence]

  // Ordered by what actually moves the number — percentile times weight — so
  // the row that explains the score is the row the eye lands on first.
  const rows = [...cohort.components].sort(
    (a, b) => (b.score ?? 0) * b.weight - (a.score ?? 0) * a.weight
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/60">
      {/* ── Headline: where it ranks, and what it scored ── */}
      <div className="border-b border-border px-3.5 pb-3 pt-2.5">
        <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
          #{rank} of {poolSize} · {POOL_NAME[pool]} pool
        </p>

        <div className="mt-1.5 flex items-end gap-3">
          <div className="flex items-baseline gap-1">
            <span className={cn("text-3xl font-bold leading-none tabular-nums", tone.text)}>
              {cohort.combinedScore.toFixed(1)}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>

          <div className="mb-0.5 flex-1 space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground">
                Channel <span className="font-semibold tabular-nums text-foreground">{cohort.channelScore}</span>
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
            <div className="flex h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="bg-primary" style={{ width: `${cohort.channelScore * 0.75}%` }} />
              <div
                className="bg-primary/40"
                style={{ width: `${(cohort.nicheScore ?? 0) * 0.25}%` }}
              />
            </div>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          Ranked only against other {POOL_NAME[pool]} channels — the two pools never mix.
        </p>
      </div>

      {/* ── What drives it ── */}
      <div className="px-3.5 py-2.5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
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
          />
        ))}
      </div>

      {/* ── Provenance ── */}
      <div className="space-y-1.5 border-t border-border bg-black/20 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
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
          <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-300">
            <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span>
              Uploads look mostly {POOL_NAME[split.measuredClass]}, but Type says{" "}
              {POOL_NAME[pool]}. Pool follows Type — the Type field may be stale.
            </span>
          </p>
        )}

        <p
          className={cn(
            "flex items-start gap-1.5 rounded-md border px-2 py-1 text-[10px] leading-snug",
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
}: {
  entry: RankedEntry
  children: ReactNode
  className?: string
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardId = useId()

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
        spaceRight >= CARD_WIDTH + VIEWPORT_MARGIN
          ? rect.right + 8
          : Math.max(VIEWPORT_MARGIN, rect.left - CARD_WIDTH - 8)

      // Anchor near the trigger, then clamp so a card opened low in the list
      // is not cut off by the bottom of the window.
      const estimatedHeight = 340
      const top = Math.min(
        Math.max(VIEWPORT_MARGIN, rect.top - 8),
        Math.max(VIEWPORT_MARGIN, window.innerHeight - estimatedHeight - VIEWPORT_MARGIN)
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
  }, [open])

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
            style={{ position: "fixed", top: coords.top, left: coords.left, width: CARD_WIDTH }}
            className="z-[100] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
            // Let the pointer travel into the card without it closing.
            onMouseEnter={() => show(true)}
            onMouseLeave={hide}
          >
            <CardBody entry={entry} />
          </div>,
          document.body
        )}
    </>
  )
}
