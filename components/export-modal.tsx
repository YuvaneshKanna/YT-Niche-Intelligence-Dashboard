"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Check, Download, Loader2, X } from "lucide-react"
import type { SnapshotExportOptions, TrackingFilter } from "@/lib/metrics/exportSnapshots"

/**
 * The Dashboard's Excel export.
 *
 * Produces `All_Video_Snapshots` and `Sheet4_Daily_Channel_Snapshot` as one
 * flat sheet — column layout and row grain both live in
 * `lib/metrics/exportSnapshots.ts`; this dialog only chooses which rows.
 *
 * It has three controls: Niches, Tracking, and a snapshot-date range. Two of
 * those overlap with the top bar, so opening the dialog pre-fills them from
 * whatever the top bar currently has set, then leaves them editable — the
 * dialog, not the top bar, decides what ships. The top bar's other filters
 * (Category, Format, Produced By, Niche Group, Type, Date Added, search) have
 * no equivalent here and are listed as not applied rather than applied
 * silently.
 *
 * Note that the top bar's `Date Added` filters `Shared On` — when a channel
 * joined the roster — while the range below filters `Snapshot_Date`, which
 * days of tracked data land in the file. They are unrelated, so `Date Added`
 * is one of the filters deliberately left behind.
 */

type DateMode = "all" | "custom"

interface CountState {
  videoRows: number
  channelOnlyRows: number
  rosterOnlyRows: number
  totalRows: number
  channels: number
}

export interface ExportModalProps {
  open: boolean
  onClose: () => void
  /** Top bar's Niche value, "" when unset. Pre-ticks just that niche. */
  prefillNiche: string
  /** Top bar's Tracking value, "" when unset. */
  prefillTracking: string
  /** Human-readable top-bar filters this export does not apply. */
  unappliedFilters: string[]
}

function buildQuery(
  allNiches: string[],
  selectedNiches: Set<string>,
  tracking: TrackingFilter,
  dateMode: DateMode,
  from: string,
  to: string
) {
  const params = new URLSearchParams()
  // Omitting `niches` means "every niche" server-side, which also keeps the
  // URL short in the common all-ticked case.
  if (selectedNiches.size !== allNiches.length) {
    params.set("niches", [...selectedNiches].join(","))
  }
  params.set("tracking", tracking)
  if (dateMode === "custom") {
    if (from) params.set("from", from)
    if (to) params.set("to", to)
  }
  return params
}

export function ExportModal({
  open,
  onClose,
  prefillNiche,
  prefillTracking,
  unappliedFilters,
}: ExportModalProps) {
  const [options, setOptions] = useState<SnapshotExportOptions | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  const [selectedNiches, setSelectedNiches] = useState<Set<string>>(new Set())
  const [tracking, setTracking] = useState<TrackingFilter>("ALL")
  const [dateMode, setDateMode] = useState<DateMode>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const [counts, setCounts] = useState<CountState | null>(null)
  const [counting, setCounting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Fetched once per mount and reused — the niche list and date bounds only
  // move when Stage 2 runs, not while the dialog is open.
  useEffect(() => {
    if (!open || options || optionsError) return
    fetch("/api/export/snapshots?meta=1")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || "Failed to load export options")
        setOptions(json.data as SnapshotExportOptions)
      })
      .catch((err: unknown) =>
        setOptionsError(err instanceof Error ? err.message : "Failed to load export options")
      )
  }, [open, options, optionsError])

  const allNiches = useMemo(() => options?.niches.map((n) => n.niche) ?? [], [options])

  // The top bar's niche only pre-ticks when the roster value actually exists
  // in the snapshot data; otherwise the dialog would open with nothing
  // selected and no explanation.
  const prefillNicheMatches = !!prefillNiche && allNiches.includes(prefillNiche)

  // Re-runs on every open so the dialog always reflects the top bar as it is
  // now, not as it was the first time it was opened.
  useEffect(() => {
    if (!open || !options) return
    setSelectedNiches(new Set(prefillNicheMatches ? [prefillNiche] : allNiches))
    setTracking(
      prefillTracking === "YES" ? "YES" : prefillTracking === "NO" ? "NO" : "ALL"
    )
    setDateMode("all")
    setFrom(options.minDate ?? "")
    setTo(options.maxDate ?? "")
    setExportError(null)
  }, [open, options, allNiches, prefillNiche, prefillNicheMatches, prefillTracking])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const query = useMemo(
    () => buildQuery(allNiches, selectedNiches, tracking, dateMode, from, to),
    [allNiches, selectedNiches, tracking, dateMode, from, to]
  )

  // Debounced so dragging through the niche list doesn't fire a count per
  // click. An aborted request is the normal case here, not an error.
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!open || !options) return
    if (selectedNiches.size === 0) {
      setCounts({ videoRows: 0, channelOnlyRows: 0, rosterOnlyRows: 0, totalRows: 0, channels: 0 })
      return
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setCounting(true)
      fetch(`/api/export/snapshots?count=1&${query.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json) => {
          if (!json.success) throw new Error(json.error || "Count failed")
          setCounts(json.data as CountState)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return
          setCounts(null)
        })
        .finally(() => {
          if (!controller.signal.aborted) setCounting(false)
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [open, options, query, selectedNiches.size])

  const handleExport = useCallback(async () => {
    setExporting(true)
    setExportError(null)
    try {
      const res = await fetch(`/api/export/snapshots?${query.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const named = /filename="([^"]+)"/.exec(disposition)?.[1]
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = named ?? `YT-Combined-Snapshots-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }, [query, onClose])

  if (!open) return null

  const allTicked = allNiches.length > 0 && selectedNiches.size === allNiches.length
  const rangeLabel =
    dateMode === "all"
      ? options?.minDate && options?.maxDate
        ? `${options.minDate} → ${options.maxDate}`
        : "no snapshot data"
      : `${from || "…"} → ${to || "…"}`

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Export snapshots to Excel"
        className="fixed left-1/2 top-1/2 z-[70] flex max-h-[88vh] w-[640px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Export snapshots to Excel</h2>
            <p className="text-xs text-muted-foreground">
              All_Video_Snapshots + Sheet4_Daily_Channel_Snapshot, one sheet
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close export dialog"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {optionsError && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" /> {optionsError}
            </p>
          )}
          {!options && !optionsError && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading export options…
            </p>
          )}

          {options && (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      Niches
                    </h3>
                    <p className="text-[11px] text-muted-foreground/70">
                      {prefillNicheMatches
                        ? `Pre-set from the top bar's Niche filter (${prefillNiche}).`
                        : "Channel counts, not row counts."}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSelectedNiches(allTicked ? new Set() : new Set(allNiches))
                    }
                    className="flex-shrink-0 text-[11px] font-medium text-purple-400 hover:text-purple-300"
                  >
                    {allTicked ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                  {options.niches.map(({ niche, channels }) => (
                    <label key={niche} className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={selectedNiches.has(niche)}
                        onChange={() =>
                          setSelectedNiches((prev) => {
                            const next = new Set(prev)
                            if (next.has(niche)) next.delete(niche)
                            else next.add(niche)
                            return next
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-border accent-purple-600"
                      />
                      <span className="truncate">
                        {niche}{" "}
                        <span className="text-muted-foreground/70">({channels})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Tracking
                </h3>
                <div className="flex gap-2">
                  {(
                    [
                      ["YES", `Yes (${options.tracking.yes})`],
                      ["NO", `No (${options.tracking.no})`],
                      ["ALL", `All (${options.tracking.yes + options.tracking.no + options.tracking.unknown})`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setTracking(value)}
                      className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${
                        tracking === value
                          ? "border-purple-500 bg-purple-600/20 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Snapshot date
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["all", "All time"],
                      ["custom", "Custom range"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setDateMode(value)}
                      className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${
                        dateMode === value
                          ? "border-purple-500 bg-purple-600/20 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {dateMode === "custom" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={from}
                        min={options.minDate ?? undefined}
                        max={options.maxDate ?? undefined}
                        onChange={(e) => setFrom(e.target.value)}
                        aria-label="From date"
                        className="h-8 rounded-lg border border-border bg-transparent px-2 text-xs text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input
                        type="date"
                        value={to}
                        min={options.minDate ?? undefined}
                        max={options.maxDate ?? undefined}
                        onChange={(e) => setTo(e.target.value)}
                        aria-label="To date"
                        className="h-8 rounded-lg border border-border bg-transparent px-2 text-xs text-foreground"
                      />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                  Range: {rangeLabel}. Data held from {options.minDate ?? "—"} onward.
                </p>
                {/* The roster rows carry no snapshot date, so a custom range
                    cannot honestly include them. Said out loud, because the
                    row count changes the moment the range is narrowed. */}
                {options.roster.available && options.roster.onlyChannels > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {dateMode === "all"
                      ? `Includes ${options.roster.onlyChannels} roster channels with no metrics yet, one ROSTER_ONLY row each.`
                      : `${options.roster.onlyChannels} roster channels with no metrics are left out of a custom range — they have no snapshot date. Use All time to include them.`}
                  </p>
                )}
                {!options.roster.available && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-400">
                    <AlertCircle className="h-3 w-3" /> Roster sheet unreachable — exporting
                    database channels only.
                  </p>
                )}
              </section>

              {unappliedFilters.length > 0 && (
                <section className="rounded-lg border border-border/60 bg-white/[0.02] px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Not applied to this export:</span>{" "}
                    {unappliedFilters.join(", ")}. Only the three controls above narrow the file.
                  </p>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {counting && <Loader2 className="h-3 w-3 animate-spin" />}
            {exportError ? (
              <span className="flex items-center gap-1.5 text-red-400">
                <AlertCircle className="h-3 w-3" /> {exportError}
              </span>
            ) : counts ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                {counts.totalRows.toLocaleString()} rows · {counts.channels} channels ·{" "}
                {counts.channelOnlyRows.toLocaleString()} channel-only
                {counts.rosterOnlyRows > 0 && ` · ${counts.rosterOnlyRows} roster-only`}
              </>
            ) : (
              "Counting rows…"
            )}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || !options || selectedNiches.size === 0 || counts?.totalRows === 0}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-purple-600 px-3 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {exporting ? "Building workbook…" : "Export"}
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}
