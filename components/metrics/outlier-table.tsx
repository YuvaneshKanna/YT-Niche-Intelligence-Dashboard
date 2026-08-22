"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ExternalLink, LayoutGrid, Table2 } from "lucide-react"
import type { VideoRollup, VideoType } from "@/lib/metrics/types"
import { SERIES } from "./views-trend"

type SortKey = "viewsPerDay" | "views" | "outlierScore" | "dominancePct" | "engagementRatePct"

const SORT_LABELS: Record<SortKey, string> = {
  viewsPerDay: "Views / day",
  views: "Total views",
  outlierScore: "Outlier score",
  dominancePct: "Dominance",
  engagementRatePct: "Engagement",
}

const REASON_STYLE: Record<string, string> = {
  BREAKOUT: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  FAST_MOVER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  HIGH_ENGAGEMENT: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  VIRAL: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  EARLY_SIGNAL: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  NORMAL: "bg-muted text-muted-foreground border-border",
}

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

interface OutlierTableProps {
  videos: VideoRollup[]
  videoType: VideoType
}

/**
 * Trending outlier videos for one format. Shorts and long-form are never shown
 * in the same list — the caller passes one `videoType` at a time.
 */
export function OutlierTable({ videos, videoType }: OutlierTableProps) {
  const [view, setView] = useState<"cards" | "table">("table")
  const [sortKey, setSortKey] = useState<SortKey>("viewsPerDay")
  const [desc, setDesc] = useState(true)

  const rows = useMemo(() => {
    const filtered = videos.filter((v) => v.videoType === videoType)
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number
      const bv = (b[sortKey] ?? 0) as number
      return desc ? bv - av : av - bv
    })
  }, [videos, videoType, sortKey, desc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d)
    else {
      setSortKey(key)
      setDesc(true)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          No {videoType === "SHORTS" ? "Shorts" : "long-form"} videos in this range
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: SERIES[videoType].color }}
          />
          <h3 className="text-sm font-semibold text-foreground">
            {SERIES[videoType].label} outliers
          </h3>
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setView("cards")}
            aria-label="Card view"
            aria-pressed={view === "cards"}
            className={`rounded-md p-1.5 transition-colors ${
              view === "cards"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("table")}
            aria-label="Table view"
            aria-pressed={view === "table"}
            className={`rounded-md p-1.5 transition-colors ${
              view === "table"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[54rem] text-left">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2 font-medium">Video</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium">Badge</th>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <th key={key} className="px-3 py-2 text-right font-medium">
                    <button
                      onClick={() => toggleSort(key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {SORT_LABELS[key]}
                      {sortKey === key &&
                        (desc ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        ))}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr
                  key={v.videoId}
                  className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="max-w-[22rem] px-4 py-2.5">
                    <p className="truncate text-xs text-foreground" title={v.title}>
                      {v.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {v.publishedAt} · {v.durationHms}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{v.handle}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded border px-1.5 py-px text-[9px] uppercase tracking-wide ${
                        REASON_STYLE[v.outlierReason] ?? REASON_STYLE.NORMAL
                      }`}
                    >
                      {v.outlierReason || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {v.viewsPerDay === null ? (
                      <span className="text-muted-foreground" title="Needs two snapshots">
                        —
                      </span>
                    ) : (
                      fmt(v.viewsPerDay)
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {fmt(v.views)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {v.outlierScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {v.dominancePct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                    {v.engagementRatePct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5">
                    <a
                      href={v.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${v.title} on YouTube`}
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((v) => (
            <a
              key={v.videoId}
              href={v.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/50"
            >
              {v.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="mb-2 aspect-video w-full rounded object-cover"
                />
              )}
              <p className="line-clamp-2 text-xs font-medium text-foreground">{v.title}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{v.handle}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span className="tabular-nums">
                  {v.viewsPerDay === null ? "—" : `${fmt(v.viewsPerDay)}/day`}
                </span>
                <span>·</span>
                <span className="tabular-nums">{v.dominancePct.toFixed(1)}% share</span>
                <span>·</span>
                <span className="tabular-nums">{v.outlierScore.toFixed(1)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
