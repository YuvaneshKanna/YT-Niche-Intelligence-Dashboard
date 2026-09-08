"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

/**
 * Shared surface primitives for the Niche Performance page.
 *
 * The page it replaced nested cards three deep — a bordered panel holding
 * bordered score cards holding bordered tiles. Every border was doing depth
 * work that a border is bad at, and the radii never agreed, which is the
 * single most reliable way to make an interface look unfinished.
 *
 * The rule here: ONE bordered surface, `Panel`. Everything inside it is
 * separated by space and hairline dividers, never by another box. Where a
 * child genuinely needs its own ground (a hover row, a chip) it gets a filled
 * shape with no border, at a radius that fits inside the panel's.
 */

export function Panel({
  children,
  className = "",
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section
      id={id}
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card scroll-mt-20 ${className}`}
    >
      {children}
    </section>
  )
}

export function PanelHeader({
  title,
  hint,
  right,
}: {
  title: string
  hint?: string
  right?: ReactNode
}) {
  return (
    <header className="flex flex-shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="truncate text-[13px] font-semibold text-foreground">{title}</h3>
        {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {right}
    </header>
  )
}

/** Uppercase micro-label. The one place 11px is allowed to carry meaning. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
  )
}

/**
 * A percentile against the publisher's own baseline. 50 is par, and the scale
 * is diverging around it: above-par leans on the accent, below-par goes cool
 * and desaturated, par is neutral grey. Never a rainbow, and the number is
 * always printed — colour alone never carries the value.
 */
export function PercentileChip({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const above = value >= 58
  const below = value <= 42
  const tone = above
    ? "bg-primary/15 text-primary-foreground/90 ring-primary/40"
    : below
      ? "bg-slate-500/15 text-slate-300 ring-slate-500/30"
      : "bg-muted text-muted-foreground ring-border"
  return (
    <span
      title={`Median percentile ${value} against the publishing channel's own videos. 50 = par.`}
      className={`inline-flex items-center rounded-md px-1.5 tabular-nums ring-1 ring-inset ${tone} ${
        size === "lg" ? "py-0.5 text-[13px] font-semibold" : "py-px text-[11px] font-medium"
      }`}
    >
      p{value}
    </span>
  )
}

/**
 * Horizontal magnitude bar. 4px rounded ends anchored to the baseline, thin
 * mark, recessive track — the value is always printed beside it, so the bar
 * carries comparison and the number carries precision.
 */
export function MiniBar({
  value,
  max,
  tone = "accent",
  className = "",
}: {
  value: number
  max: number
  tone?: "accent" | "neutral"
  className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`h-1.5 rounded-[4px] bg-muted ${className}`}>
      <div
        className={`h-full rounded-[4px] ${tone === "accent" ? "bg-primary" : "bg-slate-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Sample size, stated wherever a claim is made from one. */
export function SampleNote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <p className="max-w-sm text-center text-[12px] leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  )
}

/**
 * Progressive disclosure for the sections that are no longer the point of the
 * page but still have to be reachable. Collapsed by default, and the trigger
 * states what is inside so the label is not a mystery box.
 */
export function Disclosure({
  label,
  hint,
  children,
  defaultOpen = false,
}: {
  label: string
  hint?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-fit cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
        <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground group-hover:text-foreground">
          {label}
        </span>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </button>
      {open && <div className="animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
    </div>
  )
}
