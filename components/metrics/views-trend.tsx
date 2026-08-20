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
