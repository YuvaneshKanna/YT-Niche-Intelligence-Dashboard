"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, Download, ExternalLink } from "lucide-react"
import type { ChannelRollup, FormatMetrics } from "@/lib/metrics/types"
import type { NexlevChannelDetail } from "@/lib/metrics/neon"
import { downloadXlsx } from "@/lib/xlsxExport"
import { formatCount } from "@/lib/niche/recommend"

/** Mean of a per-format field weighted by that format's video count. */
function weighted(c: ChannelRollup, pick: (f: FormatMetrics) => number): number {
  const long = c.byFormat.LONG_FORM
  const shorts = c.byFormat.SHORTS
  const total = long.videoCount + shorts.videoCount
  if (total === 0) return 0
  return (pick(long) * long.videoCount + pick(shorts) * shorts.videoCount) / total
}

const uploadsPerWeek = (c: ChannelRollup): number =>
  c.byFormat.LONG_FORM.uploadsPerWeek + c.byFormat.SHORTS.uploadsPerWeek

/**
 * The RPM NexLev actually measured for this channel — Shorts-only channels are
 * measured on Shorts RPM, everyone else on long-form, matching the preference
 * order `readNexlevRpm` uses for scoring.
 */
function effectiveRpm(n: NexlevChannelDetail | undefined): number | null {
  if (!n) return null
  return n.channelType === "SHORTS_ONLY" ? n.shortRpm : n.longRpm
}

type Row = {
  channel: ChannelRollup
  nexlev: NexlevChannelDetail | undefined
  ageDays: number | null
  uploads: number
  outlierRate: number
  hitRate: number
  engagement: number
  rpm: number | null
  revenue: number | null
}

type SortKey =
  | "views"
  | "subs"
  | "subsDelta"
  | "age"
  | "dominance"
  | "uploads"
  | "outlierRate"
  | "hitRate"
  | "engagement"
  | "rpm"
  | "revenue"

const COLUMNS: Array<{ key: SortKey; label: string; title?: string }> = [
  { key: "age", label: "Ch. age", title: "Days since the channel's oldest TRACKED upload — a lower bound on real channel age, not a creation date." },
  { key: "subs", label: "Subs" },
  { key: "subsDelta", label: "Subs Δ", title: "Subscribers gained across the selected range." },
  { key: "views", label: "Views Δ", title: "Views gained across the selected range." },
  { key: "dominance", label: "Dominance", title: "This channel's share of its niche group's view gain." },
  { key: "uploads", label: "Uploads/wk" },
  { key: "outlierRate", label: "Outlier rate", title: "Share of the channel's tracked videos that scored as outliers." },
  { key: "hitRate", label: "Hit rate", title: "Share of videos beating the channel's own mean views." },
  { key: "engagement", label: "Engagement", title: "(likes + comments) / views across tracked videos." },
  { key: "rpm", label: "RPM", title: "NexLev-measured revenue per thousand views. Blank where the channel is not enriched yet." },
  { key: "revenue", label: "Est. revenue/mo", title: "NexLev's estimated monthly AdSense revenue. Excludes sponsorships and products." },
]

const VALUE_OF: Record<SortKey, (r: Row) => number | null> = {
  views: (r) => r.channel.totalViewsDelta,
  subs: (r) => r.channel.subscribers,
  subsDelta: (r) => r.channel.subscriberDelta,
  age: (r) => r.ageDays,
  dominance: (r) => r.channel.dominancePct,
  uploads: (r) => r.uploads,
  outlierRate: (r) => r.outlierRate,
  hitRate: (r) => r.hitRate,
  engagement: (r) => r.engagement,
  rpm: (r) => r.rpm,
  revenue: (r) => r.revenue,
}

function Cell({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-right text-[11px] tabular-nums ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {children}
    </td>
  )
}

/**
 * Every channel in the niche, ranked. This is the "who is winning and how" panel
 * that the cadence and entry moves point at.
 *
 * A channel handle links back to the audit page, so a promising competitor found
 * here can be classified without retyping the handle.
 */
export function ChannelLeaderboard({
  channels,
  nexlevByChannelId,
  groupName,
}: {
  channels: ChannelRollup[]
  nexlevByChannelId: Map<string, NexlevChannelDetail>
  groupName: string
}) {
  const [sortKey, setSortKey] = useState<SortKey>("views")
  const [desc, setDesc] = useState(true)

  const rows = useMemo<Row[]>(() => {
    const built = channels.map((channel) => {
      const nexlev = nexlevByChannelId.get(channel.channelId)
      return {
        channel,
        nexlev,
        ageDays: channel.channelAgeDays,
        uploads: uploadsPerWeek(channel),
        outlierRate: weighted(channel, (f) => f.outlierRatePct),
        hitRate: weighted(channel, (f) => f.hitRatePct),
        engagement: weighted(channel, (f) => f.engagementRatePct),
        rpm: effectiveRpm(nexlev),
        revenue: nexlev?.monthRevenue ?? null,
      }
    })

    const pick = VALUE_OF[sortKey]
    // Unknowns sink to the bottom whichever way the column sorts — a channel
    // with no measured RPM must not read as the cheapest one in the niche.
    return built.sort((a, b) => {
      const av = pick(a)
      const bv = pick(b)
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return desc ? bv - av : av - bv
    })
  }, [channels, nexlevByChannelId, sortKey, desc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d)
    else {
      setSortKey(key)
      setDesc(true)
    }
  }

  const exportRows = () => {
    const data = rows.map((r) => ({
      Channel: r.channel.handle,
      Niche: r.channel.niche,
      Category: r.channel.category,
      Format: r.channel.format,
      "Produced By": r.channel.producedBy,
      Country: r.channel.country,
      "Channel Age (Days)": r.ageDays,
      Subscribers: r.channel.subscribers,
      "Subscribers Gained": r.channel.subscriberDelta,
      "Views Gained": r.channel.totalViewsDelta,
      "Dominance %": r.channel.dominancePct,
      "Uploads / Week": Number(r.uploads.toFixed(2)),
      "Outlier Rate %": Number(r.outlierRate.toFixed(1)),
      "Hit Rate %": Number(r.hitRate.toFixed(1)),
      "Engagement %": Number(r.engagement.toFixed(2)),
      "NexLev RPM": r.rpm,
      "NexLev Monthly Revenue": r.revenue,
      "Coverage Days": r.channel.coverageDays,
    }))
    const date = new Date().toISOString().slice(0, 10)
    downloadXlsx(data, `YT-Niche-${groupName.replace(/\s+/g, "")}-Channels-${date}.xlsx`, "Channels")
  }

  const enriched = rows.filter((r) => r.nexlev !== undefined).length

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No channels tracked in this niche group</p>
      </div>
    )
  }

  return (
    <section
      id="channels"
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card scroll-mt-24"
    >
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">Channels in {groupName}</h3>
          <span className="text-xs text-muted-foreground">
            ({rows.length} · {enriched} with measured RPM)
          </span>
        </div>
        <button
          onClick={exportRows}
          aria-label="Export channels to Excel"
          title="Export the rows currently on screen"
          className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                Channel
              </th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-2 text-right">
                  <button
                    onClick={() => toggleSort(col.key)}
                    title={col.title}
                    aria-sort={sortKey === col.key ? (desc ? "descending" : "ascending") : "none"}
                    className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest transition-colors hover:text-foreground ${
                      sortKey === col.key ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {col.label}
                    {sortKey === col.key &&
                      (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.channel.channelId}
                className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30"
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2">
                  <Link
                    href={`/?channel=${encodeURIComponent(r.channel.handle.replace(/^@/, ""))}`}
                    className="group inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground hover:text-primary"
                    title={`Open ${r.channel.handle} on the audit page`}
                  >
                    {r.channel.handle}
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                  <p className="text-[10px] text-muted-foreground">
                    {r.channel.niche || "—"}
                    {r.channel.format ? ` · ${r.channel.format}` : ""}
                  </p>
                </td>
                <Cell muted={r.ageDays === null}>{r.ageDays === null ? "—" : `${r.ageDays}d`}</Cell>
                <Cell>{formatCount(r.channel.subscribers)}</Cell>
                <Cell muted={r.channel.subscriberDelta === 0}>
                  {r.channel.subscriberDelta > 0 ? "+" : ""}
                  {formatCount(r.channel.subscriberDelta)}
                </Cell>
                <Cell>{formatCount(r.channel.totalViewsDelta)}</Cell>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 rounded-[4px] bg-muted">
                      <div
                        className="h-full rounded-[4px] bg-primary"
                        style={{ width: `${Math.min(100, Math.max(0, r.channel.dominancePct))}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-[11px] tabular-nums text-foreground">
                      {r.channel.dominancePct.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <Cell>{r.uploads.toFixed(1)}</Cell>
                <Cell>{r.outlierRate.toFixed(1)}%</Cell>
                <Cell>{r.hitRate.toFixed(1)}%</Cell>
                <Cell>{r.engagement.toFixed(2)}%</Cell>
                <Cell muted={r.rpm === null}>{r.rpm === null ? "—" : `$${r.rpm.toFixed(2)}`}</Cell>
                <Cell muted={r.revenue === null}>
                  {r.revenue === null ? "—" : `$${formatCount(r.revenue)}`}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
