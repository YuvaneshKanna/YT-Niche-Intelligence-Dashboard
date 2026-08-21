"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, ChevronRight, RefreshCw, Sparkles, Youtube } from "lucide-react"
import type {
  ChannelRollup,
  MetricsPayload,
  NicheGroupSummary,
  RangeKey,
  VideoType,
} from "@/lib/metrics/types"
import { ScoreCard } from "./score-card"
import { OutlierTable } from "./outlier-table"
import { SERIES, TrendLegend, ViewsTrend, type TrendMode } from "./views-trend"
import { InsightsDrawer } from "./insights-drawer"

const RANGES: RangeKey[] = ["7d", "14d", "30d"]
const RANGE_LABEL: Record<RangeKey, string> = { "7d": "7 days", "14d": "14 days", "30d": "30 days" }

const fmt = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

/**
 * Fixed 1920x1080 canvas. The page itself never scrolls — every band has a
 * fixed height and only the outlier table's body scrolls internally. Heights
 * below are budgeted against 1080px:
 *   header 52 + padding 24 + gaps 36 + status 26 + groups 122 + scores 118
 *   + chart 296 = 674, leaving ~406 for the table band.
 */
export function NicheMetrics() {
  const [range, setRange] = useState<RangeKey>("30d")
  const [data, setData] = useState<MetricsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  const [trendMode, setTrendMode] = useState<TrendMode>("split")
  const [videoType, setVideoType] = useState<VideoType>("LONG_FORM")
  const [showWarnings, setShowWarnings] = useState(false)
  const [showInsights, setShowInsights] = useState(false)

  const load = (r: RangeKey, refresh = false) => {
    setLoading(true)
    setError(null)
    fetch(`/api/metrics?range=${r}${refresh ? "&refresh=1" : ""}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError({ message: json.error || "Failed to load metrics", code: json.code })
          setData(null)
          return
        }
        setData(json.data as MetricsPayload)
      })
      .catch((err: unknown) =>
        setError({ message: err instanceof Error ? err.message : "Network error" })
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const group: NicheGroupSummary | null = useMemo(
    () => data?.groups.find((g) => g.nicheGroup === selectedGroup) ?? null,
    [data, selectedGroup]
  )

  useEffect(() => {
    if (!selectedGroup && data?.groups.length) setSelectedGroup(data.groups[0].nicheGroup)
  }, [data, selectedGroup])

  const groupChannels: ChannelRollup[] = useMemo(() => {
    if (!data || !group) return []
    return data.channels
      .filter((c) => c.nicheGroup === group.nicheGroup)
      .sort((a, b) => b.totalViewsDelta - a.totalViewsDelta)
  }, [data, group])

  const channel = useMemo(
    () => groupChannels.find((c) => c.handle === selectedChannel) ?? null,
    [groupChannels, selectedChannel]
  )

  const visibleVideos = useMemo(() => {
    if (!data || !group) return []
    const handles = new Set(channel ? [channel.handle] : groupChannels.map((c) => c.handle))
    return data.videos.filter((v) => handles.has(v.handle))
  }, [data, group, channel, groupChannels])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* ── Header · 52px ── */}
      <header className="flex h-[52px] flex-shrink-0 items-center justify-between gap-4 border-b border-border px-5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Youtube className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          {/* The nav carries both page names, so the wordmark is not repeated here. */}
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              YT Niche Overview
            </Link>
            <Link
              href="/metrics"
              aria-current="page"
              className="rounded-lg bg-muted/60 px-3 py-1.5 text-sm font-medium text-foreground"
            >
              Niche Breakdown
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(range, true)}
            disabled={loading}
            aria-label="Refresh metrics"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowInsights(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Analysis
          </button>
        </div>
      </header>

      {error && (
        <div className="flex flex-1 items-center justify-center p-8">
          <ErrorPanel error={error} />
        </div>
      )}

      {loading && !data && !error && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading metrics…</p>
        </div>
      )}

      {data && !error && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-3">
          {/* ── Status strip · 32px ── */}
          <StatusStrip
            data={data}
            expanded={showWarnings}
            onToggle={() => setShowWarnings((v) => !v)}
          />

          {/* ── 1. Niche group cards · 122px ── */}
          <section className="h-[122px] flex-shrink-0">
            <div className="flex h-full gap-3 overflow-x-auto pb-1">
              {data.groups.map((g) => (
                <GroupCard
                  key={g.nicheGroup}
                  group={g}
                  active={g.nicheGroup === selectedGroup}
                  onSelect={() => {
                    setSelectedGroup(g.nicheGroup)
                    setSelectedChannel(null)
                  }}
                />
              ))}
            </div>
          </section>

          {group && (
            <>
              {/* ── 2. Scores · 122px ── */}
              <section className="grid h-[118px] flex-shrink-0 grid-cols-4 gap-3">
                <ScoreCard
                  title="Momentum"
                  subtitle="How fast this niche is moving"
                  score={group.momentum}
                />
                <ScoreCard
                  title="Opportunity"
                  subtitle={`vs ${group.primaryNiche || "unclassified"}`}
                  score={group.opportunity}
                />
                <StatTile
                  label="Views gained"
                  value={fmt(group.totalViewsDelta)}
                  sub={`across ${group.channelCount} channels`}
                />
                <StatTile
                  label="Subscribers gained"
                  value={fmt(group.subscriberDelta)}
                  sub={`HHI ${group.concentrationHhi} · ${
                    group.concentrationHhi > 2500 ? "concentrated" : "fragmented"
                  }`}
                />
              </section>

              {/* ── 3. Trend + drill-down · 296px ── */}
              <section className="flex h-[296px] flex-shrink-0 gap-3">
                <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-card p-3">
                  <div className="mb-1 flex flex-shrink-0 items-center justify-between gap-3">
                    <Breadcrumb
                      group={group.nicheGroup}
                      channel={channel?.handle ?? null}
                      onReset={() => setSelectedChannel(null)}
                    />
                    <div className="flex items-center gap-3">
                      <TrendLegend mode={trendMode} />
                      <div className="flex rounded-lg border border-border p-0.5">
                        {(["split", "total"] as TrendMode[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => setTrendMode(m)}
                            className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                              trendMode === m
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {m === "split" ? "By format" : "All formats"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1">
                    {channel ? (
                      <ChannelDetail channel={channel} />
                    ) : (
                      <ViewsTrend data={group.trend} mode={trendMode} height="100%" />
                    )}
                  </div>
                </div>

                {/* Drill-down: channels in the selected group */}
                <div className="flex w-[340px] flex-shrink-0 flex-col rounded-xl border border-border bg-card">
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Channels ({groupChannels.length})
                    </p>
                    {channel && (
                      <button
                        onClick={() => setSelectedChannel(null)}
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Back
                      </button>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                    {groupChannels.map((c) => (
                      <button
                        key={c.handle}
                        onClick={() => setSelectedChannel(c.handle)}
                        aria-pressed={c.handle === selectedChannel}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                          c.handle === selectedChannel ? "bg-primary/15" : "hover:bg-muted/40"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-foreground">
                            {c.handle}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {c.niche || "—"} · {fmt(c.subscribers)} subs
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          <div className="text-right">
                            <p className="text-[11px] tabular-nums text-foreground">
                              {fmt(c.totalViewsDelta)}
                            </p>
                            <p className="text-[10px] tabular-nums text-muted-foreground">
                              {c.dominancePct.toFixed(1)}%
                            </p>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* ── 4. Outlier table · fills remaining, scrolls internally ── */}
              <section className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex flex-shrink-0 items-center justify-between gap-3">
                  <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Trending outliers · {channel ? channel.handle : group.nicheGroup}
                  </h2>
                  <div className="flex rounded-lg border border-border p-0.5">
                    {(["LONG_FORM", "SHORTS"] as VideoType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setVideoType(t)}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                          videoType === t
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: SERIES[t].color }}
                        />
                        {SERIES[t].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <OutlierTable videos={visibleVideos} videoType={videoType} />
                </div>
              </section>
            </>
          )}
        </div>
      )}

      <InsightsDrawer
        open={showInsights}
        onClose={() => setShowInsights(false)}
        nicheGroup={selectedGroup}
      />
    </div>
  )
}

function StatusStrip({
  data,
  expanded,
  onToggle,
}: {
  data: MetricsPayload
  expanded: boolean
  onToggle: () => void
}) {
  const short = data.coverageDays < data.requestedDays
  // With no data at all the caveats ARE the content, so show them unfolded —
  // the user should not have to hunt for why the page is blank.
  const isEmpty = data.coverageDays === 0
  const open = expanded || isEmpty

  return (
    <div className={isEmpty ? "flex min-h-0 flex-1 flex-col" : "flex-shrink-0"}>
      <div className="flex h-[26px] items-center gap-4 text-[11px] text-muted-foreground">
        <span>
          Coverage:{" "}
          <span className={short ? "text-amber-400" : "text-foreground"}>
            {data.coverageDays}d
          </span>
          {data.coverageStart && data.coverageEnd && (
            <>
              {" "}
              ({data.coverageStart} → {data.coverageEnd})
            </>
          )}
        </span>
        <span>
          Generated{" "}
          {new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
        </span>
        {data.warnings.length > 0 && (
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-amber-400 hover:underline"
          >
            <AlertTriangle className="h-3 w-3" />
            {data.warnings.length} data caveat{data.warnings.length === 1 ? "" : "s"}
            <ChevronRight
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        )}
      </div>

      {open && data.warnings.length > 0 && (
        <div
          className={`mt-1 space-y-2 overflow-y-auto rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 ${
            isEmpty ? "min-h-0 flex-1" : ""
          }`}
        >
          {data.warnings.map((w, i) => (
            <p
              key={i}
              className="break-words font-mono text-[11px] leading-relaxed text-amber-200/90"
            >
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupCard({
  group,
  active,
  onSelect,
}: {
  group: NicheGroupSummary
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={`flex h-full w-[260px] flex-shrink-0 flex-col justify-between rounded-xl border p-3 text-left transition-all ${
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{group.nicheGroup}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {group.channelCount} channel{group.channelCount === 1 ? "" : "s"}
            {group.primaryNiche ? ` · ${group.primaryNiche}` : ""}
          </p>
        </div>
        <span className="flex-shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">
          {group.momentum.score}
        </span>
      </div>

      <div>
        <p className="text-xl font-bold tabular-nums leading-tight text-foreground">
          {fmt(group.totalViewsDelta)}
        </p>
        <p className="text-[10px] text-muted-foreground">views gained</p>
      </div>

      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: SERIES.LONG_FORM.color }}
          />
          {fmt(group.byFormat.LONG_FORM.viewsPerDay)}/d
        </span>
        <span className="flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: SERIES.SHORTS.color }}
          />
          {fmt(group.byFormat.SHORTS.viewsPerDay)}/d
        </span>
      </div>
    </button>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-3">
      <p className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold leading-none tabular-nums text-foreground">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

function Breadcrumb({
  group,
  channel,
  onReset,
}: {
  group: string
  channel: string | null
  onReset: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <button
        onClick={onReset}
        className={channel ? "text-primary hover:underline" : "font-medium text-foreground"}
      >
        {group}
      </button>
      {channel && (
        <>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium text-foreground">{channel}</span>
        </>
      )}
    </div>
  )
}

function ChannelDetail({ channel }: { channel: ChannelRollup }) {
  const formats: VideoType[] = ["LONG_FORM", "SHORTS"]

  return (
    <div className="grid h-full grid-cols-2 gap-3">
      {formats.map((t) => {
        const m = channel.byFormat[t]
        return (
          <div
            key={t}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-background p-3"
          >
            <div className="mb-2 flex flex-shrink-0 items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: SERIES[t].color }}
              />
              <p className="text-xs font-semibold text-foreground">{SERIES[t].label}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              <Metric label="Views / day" value={fmt(m.viewsPerDay)} />
              <Metric
                label="Acceleration"
                value={
                  m.velocityChangePct === null
                    ? "—"
                    : `${m.velocityChangePct > 0 ? "+" : ""}${m.velocityChangePct}%`
                }
              />
              <Metric label="Videos" value={String(m.videoCount)} />
              <Metric label="Outlier rate" value={`${m.outlierRatePct}%`} />
              <Metric label="Hit rate" value={`${m.hitRatePct}%`} />
              <Metric label="Engagement" value={`${m.engagementRatePct}%`} />
              <Metric label="Uploads / week" value={String(m.uploadsPerWeek)} />
              <Metric label="Total views" value={fmt(m.totalViews)} />
            </dl>
          </div>
        )
      })}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function ErrorPanel({ error }: { error: { message: string; code?: string } }) {
  return (
    <div className="max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {error.code === "CONFIG"
              ? "Metrics not configured"
              : error.code === "PERMISSION"
                ? "Cannot read the metrics spreadsheet"
                : "Failed to load metrics"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error.message}</p>
          {error.code === "CONFIG" && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Add <code className="rounded bg-muted px-1">GOOGLE_METRICS_SHEET_ID</code> in Vercel →
              Project Settings → Environment Variables, then redeploy.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
