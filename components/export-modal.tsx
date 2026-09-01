"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Download, Loader2, X } from "lucide-react"
import type { Channel } from "@/lib/constants"
import type { RankedEntry } from "@/lib/useRankings"
import { normaliseHandle } from "@/lib/useRankings"
import type { ChannelRollup, MetricsPayload, NicheGroupSummary } from "@/lib/metrics/types"
import { EXPORT_GROUPS, type ExportColumn } from "@/lib/exportColumns"
import { downloadXlsx } from "@/lib/xlsxExport"

/** Fixed for v1 — matches the Niche Breakdown page's own default range. */
const METRICS_RANGE = "30d"

function defaultSelection(): Record<string, boolean> {
  const sel: Record<string, boolean> = {}
  for (const group of EXPORT_GROUPS) {
    for (const col of group.columns) sel[col.key] = group.defaultOn
  }
  return sel
}

interface ExportModalProps {
  open: boolean
  onClose: () => void
  /** The currently filtered + ranked roster — exactly what the sidebar shows. */
  channels: Channel[]
  rankingByChannelId: Map<string, RankedEntry>
}

export function ExportModal({ open, onClose, channels, rankingByChannelId }: ExportModalProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>(defaultSelection)
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  const needsMetricsSelected = useMemo(
    () =>
      EXPORT_GROUPS.filter((g) => g.needsMetrics).some((g) =>
        g.columns.some((c) => selected[c.key])
      ),
    [selected]
  )

  // Fetched once, lazily — only once a Niche Breakdown column group is
  // actually checked, so opening the modal never costs a Metrics fetch on
  // its own.
  useEffect(() => {
    if (!needsMetricsSelected || metrics || metricsLoading || metricsError) return
    setMetricsLoading(true)
    fetch(`/api/metrics?range=${METRICS_RANGE}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || "Failed to load Niche Breakdown data")
        setMetrics(json.data as MetricsPayload)
      })
      .catch((err: unknown) =>
        setMetricsError(err instanceof Error ? err.message : "Failed to load Niche Breakdown data")
      )
      .finally(() => setMetricsLoading(false))
  }, [needsMetricsSelected, metrics, metricsLoading, metricsError])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const rollupByHandle = useMemo(() => {
    const map = new Map<string, ChannelRollup>()
    if (!metrics) return map
    for (const r of metrics.channels) map.set(normaliseHandle(r.handle), r)
    return map
  }, [metrics])

  const groupSummaryByNicheGroup = useMemo(() => {
    const map = new Map<string, NicheGroupSummary>()
    if (!metrics) return map
    for (const g of metrics.groups) map.set(g.nicheGroup, g)
    return map
  }, [metrics])

  const matchedCount = useMemo(
    () => channels.filter((c) => rollupByHandle.has(normaliseHandle(c.handle))).length,
    [channels, rollupByHandle]
  )

  if (!open) return null

  const toggle = (key: string) => setSelected((s) => ({ ...s, [key]: !s[key] }))
  const setGroup = (columns: ExportColumn[], value: boolean) =>
    setSelected((s) => {
      const next = { ...s }
      for (const col of columns) next[col.key] = value
      return next
    })

  const selectedCount = Object.values(selected).filter(Boolean).length

  const handleExport = () => {
    const activeColumns = EXPORT_GROUPS.flatMap((g) => g.columns.filter((c) => selected[c.key]))
    if (activeColumns.length === 0 || channels.length === 0) return

    const rows = channels.map((channel) => {
      const ctx = {
        channel,
        ranked: rankingByChannelId.get(channel.id),
        rollup: rollupByHandle.get(normaliseHandle(channel.handle)),
        groupSummary: groupSummaryByNicheGroup.get(channel.nicheGroup),
      }
      const row: Record<string, string | number | null> = {}
      for (const col of activeColumns) row[col.label] = col.get(ctx)
      return row
    })

    const date = new Date().toISOString().slice(0, 10)
    downloadXlsx(rows, `YT-Niche-Roster-Export-${date}.xlsx`, "Roster")
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Export to Excel"
        className="fixed left-1/2 top-1/2 z-[70] flex max-h-[88vh] w-[640px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Export to Excel</h2>
            <p className="text-xs text-muted-foreground">
              {channels.length} channel{channels.length === 1 ? "" : "s"} match the active filters
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
          {EXPORT_GROUPS.map((group) => {
            const allOn = group.columns.every((c) => selected[c.key])
            const someOn = !allOn && group.columns.some((c) => selected[c.key])
            return (
              <section key={group.key}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </h3>
                    <p className="text-[11px] text-muted-foreground/70">{group.hint}</p>
                  </div>
                  <button
                    onClick={() => setGroup(group.columns, !allOn)}
                    className="flex-shrink-0 text-[11px] font-medium text-purple-400 hover:text-purple-300"
                  >
                    {allOn ? "Deselect all" : "Select all"}
                  </button>
                </div>

                {group.needsMetrics && someOn && metricsLoading && (
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading Niche Breakdown data…
                  </p>
                )}
                {group.needsMetrics && someOn && metricsError && (
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] text-red-400">
                    <AlertCircle className="h-3 w-3" /> {metricsError}
                  </p>
                )}
                {group.needsMetrics && someOn && metrics && (
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {matchedCount} of {channels.length} channels have a match in this range.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {group.columns.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 text-xs text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[col.key]}
                        onChange={() => toggle(col.key)}
                        className="h-3.5 w-3.5 rounded border-border accent-purple-600"
                      />
                      <span className="truncate">{col.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="text-[11px] text-muted-foreground">{selectedCount} columns selected</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={selectedCount === 0 || channels.length === 0}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-purple-600 px-3 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export {channels.length} channel{channels.length === 1 ? "" : "s"}
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}
