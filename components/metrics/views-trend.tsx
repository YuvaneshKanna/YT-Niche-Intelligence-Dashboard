"use client"

import { useMemo } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TrendPoint } from "@/lib/metrics/types"

// Validated against the dark chart surface with scripts/validate_palette.js:
// lightness band, chroma floor, CVD separation (ΔE 32.9 protan), normal-vision
// floor and contrast all pass. Do not substitute by eye.
export const SERIES = {
  LONG_FORM: { color: "#8b5cf6", label: "Long-form" },
  SHORTS: { color: "#d97706", label: "Shorts" },
  TOTAL: { color: "#94a3b8", label: "All formats" },
} as const

export type TrendMode = "split" | "total"

// Dark-mode categorical set for the entity-comparison chart (niche groups
// against each other, or channels against each other) — up to 8 identities on
// screen at once. This is a different chart mode from the format split above
// (which is always exactly 2 series), so it draws from the dataviz skill's
// validated 8-hue dark palette rather than reusing SERIES: worst adjacent CVD
// ΔE 8.4, worst adjacent normal-vision ΔE 19.3 (OKLab ×100), both hues ordered
// so the gate holds pairwise down the legend. Do not reorder without
// re-validating — the order IS the safety mechanism, not cosmetic.
export const COMPARE_PALETTE = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
] as const

export const COMPARE_MAX_SERIES = COMPARE_PALETTE.length

export interface CompareEntity {
  key: string
  label: string
  trend: TrendPoint[]
}

/**
 * Assigns a palette slot per entity by its position in the FULL, stably
 * ordered candidate list (alphabetical) — never by current rank in whatever
 * top-N subset is on screen. Per the color rule: color follows the entity,
 * not its rank, so switching the range or the top-N selection must not
 * repaint a channel that was already visible under a different color.
 */
export function colorForEntity(allKeysSorted: string[], key: string): string {
  const idx = allKeysSorted.indexOf(key)
  return COMPARE_PALETTE[(idx < 0 ? 0 : idx) % COMPARE_PALETTE.length]
}

/** One point on the comparison chart: the date plus one numeric field per entity key. */
export interface CompareRow {
  date: string
  [entityKey: string]: string | number
}

/** Merges several entities' daily trends into one date-indexed row set for overlay plotting. Only needs key + trend — label is irrelevant here, so callers passing pre-label rows aren't forced to invent one. */
export function buildCompareRows(entities: Array<{ key: string; trend: TrendPoint[] }>): CompareRow[] {
  const perEntity = entities.map((e) => ({
    key: e.key,
    map: new Map(e.trend.map((t) => [t.date, t.totalViews])),
  }))
  const dates = [...new Set(entities.flatMap((e) => e.trend.map((t) => t.date)))].sort()

  return dates.map((date) => {
    const row: CompareRow = { date }
    for (const e of perEntity) row[e.key] = e.map.get(date) ?? 0
    return row
  })
}

const fmtCompact = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

const fmtFull = (n: number) => n.toLocaleString("en-US")

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

interface TooltipPayloadEntry {
  dataKey?: string | number
  value?: number
}

function TrendTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
  mode: TrendMode
}) {
  if (!active || !payload?.length) return null

  const point = payload[0] as TooltipPayloadEntry & { payload?: TrendPoint }
  const row = point.payload
  if (!row) return null

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-[11px] font-semibold text-foreground">{fmtDate(label ?? "")}</p>

      {mode === "split" ? (
        <div className="space-y-1">
          <Row color={SERIES.LONG_FORM.color} label="Long-form" value={row.longFormViews} />
          <Row color={SERIES.SHORTS.color} label="Shorts" value={row.shortsViews} />
        </div>
      ) : (
        <Row color={SERIES.TOTAL.color} label="All formats" value={row.totalViews} />
      )}

      <p className="mt-1.5 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
        {row.channelCount} channel{row.channelCount === 1 ? "" : "s"} reporting
      </p>

      {mode === "split" && row.splitIsPartial && (
        <p className="mt-1 text-[10px] leading-snug text-amber-400">
          Partial coverage — only outlier and recent-upload videos survive past 7 days.
        </p>
      )}
      {row.rosterChanged && (
        <p className="mt-1 text-[10px] leading-snug text-sky-400">
          Roster changed this day — not a like-for-like comparison.
        </p>
      )}
    </div>
  )
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-foreground">
        {fmtFull(value)}
      </span>
    </div>
  )
}

interface ViewsTrendProps {
  data: TrendPoint[]
  mode: TrendMode
  /** Accepts a px number or a CSS length so the chart can fill a flex parent. */
  height?: number | string
}

export function ViewsTrend({ data, mode, height = 300 }: ViewsTrendProps) {
  // The contiguous leading stretch where the format split is thinned by
  // retention. Shading it keeps a data-coverage artefact from reading as a
  // real decline in Shorts or long-form output.
  const partialBand = useMemo(() => {
    if (mode !== "split") return null
    const partial = data.filter((d) => d.splitIsPartial)
    if (partial.length === 0) return null
    return { from: partial[0].date, to: partial[partial.length - 1].date }
  }, [data, mode])

  if (data.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-xl border border-dashed border-border"
        style={typeof height === "number" ? { height } : undefined}
      >
        <p className="text-sm text-muted-foreground">No trend data in this range</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full" style={typeof height === "number" ? { height } : undefined}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="fillLong" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.LONG_FORM.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={SERIES.LONG_FORM.color} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillShorts" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.SHORTS.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={SERIES.SHORTS.color} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.TOTAL.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={SERIES.TOTAL.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={fmtCompact}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />

          {partialBand && (
            <ReferenceArea
              x1={partialBand.from}
              x2={partialBand.to}
              fill="var(--muted-foreground)"
              fillOpacity={0.06}
            />
          )}

          <Tooltip
            content={<TrendTooltip mode={mode} />}
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
          />

          {mode === "split" ? (
            <>
              <Area
                type="monotone"
                dataKey="longFormViews"
                stroke="none"
                fill="url(#fillLong)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="shortsViews"
                stroke="none"
                fill="url(#fillShorts)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="longFormViews"
                stroke={SERIES.LONG_FORM.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="shortsViews"
                stroke={SERIES.SHORTS.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            </>
          ) : (
            <>
              <Area
                type="monotone"
                dataKey="totalViews"
                stroke="none"
                fill="url(#fillTotal)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="totalViews"
                stroke={SERIES.TOTAL.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Legend lives outside the chart so identity is never conveyed by colour alone. */
export function TrendLegend({ mode }: { mode: TrendMode }) {
  const entries =
    mode === "split"
      ? [SERIES.LONG_FORM, SERIES.SHORTS]
      : [SERIES.TOTAL]

  return (
    <div className="flex items-center gap-4">
      {entries.map((e) => (
        <span key={e.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
          {e.label}
        </span>
      ))}
    </div>
  )
}

interface CompareTooltipEntry {
  key: string
  label: string
  color: string
}

function CompareTooltip({
  active,
  payload,
  label,
  entries,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number }>
  label?: string
  entries: CompareTooltipEntry[]
}) {
  if (!active || !payload?.length) return null

  const byKey = new Map(entries.map((e) => [e.key, e]))
  const rows = payload
    .map((p) => {
      const meta = byKey.get(String(p.dataKey))
      return meta ? { ...meta, value: p.value ?? 0 } : null
    })
    .filter((r): r is CompareTooltipEntry & { value: number } => r !== null)
    .sort((a, b) => b.value - a.value)

  return (
    <div className="max-w-[220px] rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-[11px] font-semibold text-foreground">{fmtDate(label ?? "")}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <Row key={r.key} color={r.color} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  )
}

interface CompareTrendProps {
  /** Rows from buildCompareRows: one per date, one numeric field per entity key. */
  data: CompareRow[]
  entries: CompareTooltipEntry[]
  /** Entity key to draw thicker/opaque — the group or channel currently focused elsewhere on the page. */
  focusKey?: string | null
  height?: number | string
}

/** Overlays several entities' total-views trends on one chart — niche groups against each other, or channels within a group against each other. Always total views: stacking N entities × 2 formats would be unreadable. */
export function CompareTrend({ data, entries, focusKey, height = 300 }: CompareTrendProps) {
  if (data.length === 0 || entries.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-xl border border-dashed border-border"
        style={typeof height === "number" ? { height } : undefined}
      >
        <p className="text-sm text-muted-foreground">No trend data in this range</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full" style={typeof height === "number" ? { height } : undefined}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={fmtCompact}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />

          <Tooltip
            content={<CompareTooltip entries={entries} />}
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
          />

          {entries.map((e) => {
            const isFocus = focusKey ? e.key === focusKey : false
            return (
              <Line
                key={e.key}
                type="monotone"
                dataKey={e.key}
                stroke={e.color}
                strokeWidth={isFocus ? 3 : 1.5}
                strokeOpacity={focusKey && !isFocus ? 0.55 : 1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Legend for the comparison chart — the focused entity (if any) reads bold, matching the thicker line. */
export function CompareLegend({
  entries,
  focusKey,
}: {
  entries: CompareTooltipEntry[]
  focusKey?: string | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {entries.map((e) => (
        <span
          key={e.key}
          className={`flex items-center gap-1.5 text-[11px] ${
            focusKey && e.key === focusKey
              ? "font-semibold text-foreground"
              : "text-muted-foreground"
          }`}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
          {e.label}
        </span>
      ))}
    </div>
  )
}
