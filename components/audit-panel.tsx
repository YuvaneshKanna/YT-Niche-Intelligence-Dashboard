"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BadgeCheck, Check, ChevronDown, ExternalLink, Plus, Search, Star } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Channel } from "@/lib/constants"
import type { RankedEntry } from "@/lib/useRankings"

export type AuditFieldKey =
  | "contentType"
  | "niche"
  | "category"
  | "format"
  | "producedBy"
  | "nicheGroup"
  | "tracking"

export interface AuditValues extends Record<AuditFieldKey, string> {
  /** The sheet's "Verified" column — free-text remarks written by the auditor. */
  verified: string
}

export interface ChannelFacts {
  channelName: string
  about: string
  subscribers: string
  totalVideos: string
  totalViews: string
  createdOn: string
  country: string
}

/**
 * Field order is the order a human actually decides them in: what kind of
 * channel is this, what is it about, how is it made, and only then the
 * bookkeeping. Two columns, four rows.
 */
const FIELDS: { key: AuditFieldKey; label: string; allowCreate: boolean }[] = [
  { key: "contentType", label: "Type", allowCreate: false },
  { key: "niche", label: "Niche", allowCreate: true },
  { key: "category", label: "Category", allowCreate: true },
  { key: "format", label: "Format", allowCreate: true },
  { key: "producedBy", label: "Produced By", allowCreate: true },
  { key: "nicheGroup", label: "Niche Group", allowCreate: true },
  { key: "tracking", label: "Tracking", allowCreate: false },
]

/** Fields whose emptiness makes a channel "needs audit". */
const REQUIRED: AuditFieldKey[] = ["niche", "category", "producedBy"]

// ── Searchable select ──────────────────────────────────────────────────────

/**
 * Rendered through a portal with fixed positioning: the panel is a scrolling
 * column, so an in-flow dropdown would be clipped by it.
 */
function AuditSelect({
  label,
  value,
  options,
  allowCreate,
  required,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  allowCreate: boolean
  required: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = options.filter(Boolean)
    return q ? list.filter((o) => o.toLowerCase().includes(q)) : list
  }, [options, query])

  const canCreate =
    allowCreate &&
    query.trim().length > 0 &&
    !options.some((o) => o.toLowerCase() === query.trim().toLowerCase())

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const height = 260
      const below = window.innerHeight - rect.bottom
      setCoords({
        top: below >= height ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
        left: rect.left,
        width: Math.max(rect.width, 200),
      })
    }
    place()
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
    setQuery("")
  }

  const isEmpty = !value.trim()

  return (
    <div className="min-w-0">
      <label className="mb-0.5 block text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
        {required && isEmpty && (
          <span className="ml-1 text-amber-400" title="Required — blank marks this channel as needing audit">
            •
          </span>
        )}
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
          isEmpty
            ? "border-amber-500/40 bg-amber-500/5 text-muted-foreground"
            : "border-border bg-background text-foreground hover:border-primary/50"
        )}
      >
        <span className="truncate">{value || "—"}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
            className="z-[120] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/60"
          >
            <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
              <Search className="h-3 w-3 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (canCreate) commit(query.trim())
                    else if (matches.length > 0) commit(matches[0])
                  }
                }}
                placeholder={allowCreate ? "Search or type to add…" : "Search…"}
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="no-scrollbar max-h-[200px] overflow-y-auto py-1">
              {matches.map((opt) => (
                <button
                  key={opt}
                  role="option"
                  aria-selected={opt === value}
                  onClick={() => commit(opt)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
                    opt === value
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span className="truncate">{opt}</span>
                  {opt === value && <Check className="h-3 w-3 flex-shrink-0 text-primary" />}
                </button>
              ))}

              {canCreate && (
                <button
                  onClick={() => commit(query.trim())}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-primary transition-colors hover:bg-primary/10"
                >
                  <Plus className="h-3 w-3 flex-shrink-0" />
                  Add &ldquo;{query.trim()}&rdquo;
                </button>
              )}

              {matches.length === 0 && !canCreate && (
                <p className="px-2.5 py-2 text-xs italic text-muted-foreground">No matches</p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

// ── The panel ──────────────────────────────────────────────────────────────

/**
 * Everything about the selected channel, in the order the audit needs it.
 *
 * The classification fields live here rather than in the top bar for two
 * reasons. They sit beside the video that is the evidence for them, so the eye
 * does not travel to the top of the screen and back for every decision; and the
 * top bar's controls were doing double duty as filters and editors, where the
 * same dropdown meant "show only Gaming" in one mode and "set this channel to
 * Gaming" in the other — a mode error with a mis-tagged channel as its cost.
 *
 * Nothing is read-only. There is no edit mode to enter: change a field or type
 * in Remarks and a Save appears. Remarks especially, because the thought worth
 * recording occurs while the video is playing.
 */
export function AuditPanel({
  channel,
  facts,
  entry,
  values,
  options,
  dirty,
  saving,
  isFavourite,
  verifiedLabel,
  onChange,
  onSave,
  onReset,
  onVerify,
  onToggleFavourite,
}: {
  channel: Channel
  facts: ChannelFacts
  entry?: RankedEntry
  values: AuditValues
  options: Record<AuditFieldKey, readonly string[]>
  dirty: boolean
  saving: boolean
  isFavourite: boolean
  /** "Verified by X on Y" when the stamp still matches the current fields, else null. */
  verifiedLabel: string | null
  onChange: (key: AuditFieldKey | "verified", value: string) => void
  onSave: () => void
  onReset: () => void
  onVerify: () => void
  onToggleFavourite: () => void
}) {
  const [aboutExpanded, setAboutExpanded] = useState(false)

  // A long About should not push the form off screen; two lines is enough to
  // tell what the channel is, and the rest is one click away.
  useEffect(() => setAboutExpanded(false), [channel.id])

  const hasCountry = Boolean(facts.country?.trim()) && facts.country.trim() !== "—"

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
      {/* ── Identity ── */}
      <div className="flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold leading-tight text-foreground">
              {channel.handle}
            </h2>
            {facts.channelName && facts.channelName !== "—" && (
              // The display name is what the channel calls itself and often
              // reads nothing like the handle, so it earns real contrast
              // rather than muted fine print.
              <p className="truncate text-sm font-medium text-foreground/80">
                {facts.channelName}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {values.contentType && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    values.contentType === "Shorts"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-blue-500/20 text-blue-400"
                  )}
                >
                  {values.contentType}
                </span>
              )}
              {values.niche && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {values.niche}
                </span>
              )}
              {values.category && (
                <span className="text-[10px] italic text-muted-foreground">{values.category}</span>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {entry && (
              <div
                className={cn(
                  "flex flex-col items-center rounded-lg border px-2 py-1 leading-none",
                  entry.cohort.combinedScore >= 70
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : entry.cohort.combinedScore >= 40
                      ? "border-sky-500/40 bg-sky-500/10"
                      : "border-border bg-muted/60"
                )}
                title={`Rank ${entry.rank} of ${entry.poolSize} among ${entry.pool === "SHORTS" ? "Shorts" : "long-form"} channels · combined ${entry.cohort.combinedScore} (Channel ${entry.cohort.channelScore}, Niche ${entry.cohort.nicheScore ?? "—"})`}
              >
                <span
                  className={cn(
                    "text-base font-bold tabular-nums",
                    entry.cohort.combinedScore >= 70
                      ? "text-emerald-300"
                      : entry.cohort.combinedScore >= 40
                        ? "text-sky-300"
                        : "text-muted-foreground"
                  )}
                >
                  {entry.cohort.combinedScore}
                </span>
                <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  #{entry.rank} {entry.pool === "SHORTS" ? "SH" : "LF"}
                </span>
              </div>
            )}
            <button
              onClick={onToggleFavourite}
              title={isFavourite ? "Remove from favourites" : "Add to favourites"}
              aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  isFavourite ? "fill-amber-400 text-amber-400" : "text-muted-foreground hover:text-foreground"
                )}
              />
            </button>
            {channel.ytUrl && (
              <a
                href={channel.ytUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
              >
                <ExternalLink className="h-3 w-3" />
                YouTube
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Facts. Labelled tiles, not five stacked bordered cards and not a
             run-on line: each value has a fixed place on the card, so a glance
             finds the one you want instead of reading the sentence. ── */}
      <div
        className={cn(
          "grid flex-shrink-0 gap-px overflow-hidden rounded-lg border border-border bg-border",
          hasCountry ? "grid-cols-5" : "grid-cols-4"
        )}
      >
        {[
          ["Subs", facts.subscribers],
          ["Videos", facts.totalVideos],
          ["Views", facts.totalViews],
          ["Created", facts.createdOn],
          ...(hasCountry ? [["Country", facts.country] as const] : []),
        ].map(([label, value]) => (
          <div key={label} className="bg-muted/40 px-2 py-1.5">
            <p className="text-[8px] font-medium uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <p className="truncate text-[13px] font-bold tabular-nums leading-tight text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* ── About ── */}
      {facts.about && facts.about !== "—" && (
        <div className="flex-shrink-0">
          <p className="mb-0.5 text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            About
          </p>
          <p className={cn("text-xs leading-snug text-foreground", !aboutExpanded && "line-clamp-2")}>
            {facts.about}
          </p>
          {facts.about.length > 110 && (
            <button
              onClick={() => setAboutExpanded((v) => !v)}
              className="mt-0.5 text-[10px] text-primary hover:underline"
            >
              {aboutExpanded ? "less" : "more"}
            </button>
          )}
        </div>
      )}

      {/* ── Audit form ── */}
      <div className="flex-shrink-0 rounded-lg border border-border bg-muted/30 p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            Audit
          </p>
          <div className="flex items-center gap-1.5">
            {dirty ? (
              <>
                <span className="text-[10px] text-amber-400">unsaved</span>
                <button
                  onClick={onReset}
                  className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Reset
                </button>
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="rounded-md bg-purple-600 px-2.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground">saved</span>
            )}

            {/* Verifying is a separate act from saving. Saving records what the
                fields say; verifying records that a human watched the videos
                and stands behind them — including the case where the AI was
                already right and nothing needed changing, which a field save
                cannot express. */}
            <button
              onClick={onVerify}
              disabled={saving}
              title={
                verifiedLabel
                  ? `${verifiedLabel}. Verify again to re-stamp with the current values.`
                  : "Record that you watched the videos and these fields are correct"
              }
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50",
                verifiedLabel
                  ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              )}
            >
              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
              {verifiedLabel ? "Verified" : "Verify"}
            </button>
          </div>
        </div>

        {verifiedLabel && (
          <p className="mb-2 text-[10px] text-emerald-300/80">{verifiedLabel}</p>
        )}

        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
          {FIELDS.map(({ key, label, allowCreate }) => (
            <AuditSelect
              key={key}
              label={label}
              value={values[key] ?? ""}
              options={options[key] ?? []}
              allowCreate={allowCreate}
              required={REQUIRED.includes(key)}
              onChange={(v) => onChange(key, v)}
            />
          ))}
        </div>
      </div>

      {/* ── Remarks. Two lines by default: long enough for the note actually
             written, short enough not to claim the rest of the column. It
             scrolls, and drag-resizes vertically for the rare long one. ── */}
      <div className="flex flex-shrink-0 flex-col">
        <p className="mb-0.5 text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
          Verified / Remarks
        </p>
        <textarea
          value={values.verified ?? ""}
          onChange={(e) => onChange("verified", e.target.value)}
          rows={2}
          placeholder="What did the videos show? Production style, hooks…"
          className={cn(
            "no-scrollbar w-full resize-y rounded-lg border border-border bg-background px-2.5 py-1.5",
            "text-xs leading-snug text-foreground placeholder:text-muted-foreground",
            "focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
          )}
        />
      </div>
    </div>
  )
}
