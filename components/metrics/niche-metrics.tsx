"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  RefreshCw,
  Settings,
  Sparkles,
  Youtube,
} from "lucide-react"
import type {
  ChannelRollup,
  MetricsPayload,
  NicheGroupSummary,
  RangeKey,
  VideoType,
} from "@/lib/metrics/types"
import { ScoreCard } from "./score-card"
import { OutlierTable } from "./outlier-table"
import {
  buildCompareRows,
  colorForEntity,
  COMPARE_MAX_SERIES,
  CompareLegend,
  CompareTrend,
  SERIES,
} from "./views-trend"
import { InsightsDrawer } from "./insights-drawer"
import { ChatPanel } from "./chat-panel"
import { SettingsModal } from "@/components/settings-modal"
import { PageNav } from "@/components/page-nav"

const RANGES: RangeKey[] = ["7d", "14d", "30d", "90d", "180d"]
const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "7d",
  "14d": "14d",
  "30d": "30d",
  "90d": "90d",
  "180d": "6mo",
}

/**
 * Picks up to `cap` entities by delta, always keeping `mustIncludeKey` (the
 * one focused elsewhere on the page) even if it would otherwise fall outside
 * the top-N — so the highlighted line never disappears from its own chart.
 */
function topEntities<T extends { key: string; delta: number }>(
  all: T[],
  mustIncludeKey: string | null,
  cap: number
): T[] {
  const sorted = [...all].sort((a, b) => b.delta - a.delta)
  const must = mustIncludeKey ? sorted.find((e) => e.key === mustIncludeKey) : undefined
  if (!must) return sorted.slice(0, cap)
  const rest = sorted.filter((e) => e.key !== mustIncludeKey).slice(0, cap - 1)
  return [must, ...rest].sort((a, b) => b.delta - a.delta)
}

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
  // A channel is now only ever a NARROWING FILTER on the videos comparison —
  // it never puts the channel's own long-form-vs-shorts split on screen.
  // That split is exactly the "compare formats against each other" the chart
  // must never do; the channel's own trend already lives in the "channels"
  // scope as one line among its siblings.
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  // What the trend chart compares: "groups" overlays every niche group,
  // "channels" overlays the channels inside the selected group, "videos"
  // overlays videos (whole group, or just selectedChannel's if set) — one
  // format at a time, chosen by videoType below, never both at once.
  const [chartScope, setChartScope] = useState<"groups" | "channels" | "videos">("groups")
  const [videoType, setVideoType] = useState<VideoType>("LONG_FORM")
  // Legend-click-to-hide and a manual Y ceiling — both exist so one dominant
  // line (a viral spike) doesn't flatten every other line on the same chart.
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const [yMaxOverride, setYMaxOverride] = useState<number | null>(null)
  const [showWarnings, setShowWarnings] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // A new comparison set makes old hidden/zoom choices stop meaning anything
  // sensible — start clean whenever what's being compared changes.
  useEffect(() => {
    setHiddenKeys(new Set())
    setYMaxOverride(null)
  }, [chartScope, selectedGroup, selectedChannel, videoType])

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

  // ── Niche-group-vs-niche-group comparison (chartScope "groups") ──
  const allGroupKeysSorted = useMemo(
    () => (data ? [...data.groups.map((g) => g.nicheGroup)].sort() : []),
    [data]
  )
  const groupCompareSelection = useMemo(() => {
    if (!data) return []
    return topEntities(
      data.groups.map((g) => ({ key: g.nicheGroup, delta: g.totalViewsDelta, trend: g.trend })),
      selectedGroup,
      COMPARE_MAX_SERIES
    )
  }, [data, selectedGroup])
  const groupCompareEntries = useMemo(
    () =>
      groupCompareSelection.map((e) => ({
        key: e.key,
        label: e.key,
        color: colorForEntity(allGroupKeysSorted, e.key),
      })),
    [groupCompareSelection, allGroupKeysSorted]
  )
  const groupCompareRows = useMemo(() => buildCompareRows(groupCompareSelection), [groupCompareSelection])
  const groupsOmitted = (data?.groups.length ?? 0) - groupCompareSelection.length

  // ── Channel-vs-channel comparison within the selected group (chartScope "channels") ──
  const allChannelKeysSorted = useMemo(
    () => [...groupChannels.map((c) => c.handle)].sort(),
    [groupChannels]
  )
  const channelCompareSelection = useMemo(
    () =>
      topEntities(
        groupChannels.map((c) => ({ key: c.handle, delta: c.totalViewsDelta, trend: c.trend })),
        selectedChannel,
        COMPARE_MAX_SERIES
      ),
    [groupChannels, selectedChannel]
  )
  const channelCompareEntries = useMemo(
    () =>
      channelCompareSelection.map((e) => ({
        key: e.key,
        label: e.key,
        color: colorForEntity(allChannelKeysSorted, e.key),
      })),
    [channelCompareSelection, allChannelKeysSorted]
  )
  const channelCompareRows = useMemo(
    () => buildCompareRows(channelCompareSelection),
    [channelCompareSelection]
  )
  const channelsOmitted = groupChannels.length - channelCompareSelection.length

  // ── Video-vs-video comparison (chartScope "videos") ──
  // Whole group by default; narrowed to one channel's videos when selectedChannel
  // is set. Always one format at a time — mixing long-form and shorts videos
  // into the same set of comparison lines is exactly the merge that's banned.
  const videoCandidates = useMemo(() => {
    if (!data || !group) return []
    return data.videos.filter(
      (v) =>
        v.videoType === videoType &&
        (selectedChannel ? v.handle === selectedChannel : groupChannels.some((c) => c.handle === v.handle))
    )
  }, [data, group, groupChannels, selectedChannel, videoType])

  const videosRanked = useMemo(
    () => [...videoCandidates].sort((a, b) => b.views - a.views),
    [videoCandidates]
  )

  const allVideoKeysSorted = useMemo(
    () => [...videoCandidates.map((v) => v.videoId)].sort(),
    [videoCandidates]
  )
  const videoCompareSelection = useMemo(
    () =>
      topEntities(
        videoCandidates.map((v) => ({ key: v.videoId, delta: v.viewsPerDay ?? 0, trend: v.trend })),
        null,
        COMPARE_MAX_SERIES
      ),
    [videoCandidates]
  )
  const videoTitleByKey = useMemo(
    () => new Map(videoCandidates.map((v) => [v.videoId, v.title])),
    [videoCandidates]
  )
  const videoCompareEntries = useMemo(
    () =>
      videoCompareSelection.map((e) => {
        const title = videoTitleByKey.get(e.key) ?? e.key
        return {
          key: e.key,
          label: title.length > 26 ? `${title.slice(0, 26)}…` : title,
          color: colorForEntity(allVideoKeysSorted, e.key),
        }
      }),
    [videoCompareSelection, videoTitleByKey, allVideoKeysSorted]
  )
  const videoCompareRows = useMemo(() => buildCompareRows(videoCompareSelection), [videoCompareSelection])
  const videosOmitted = videoCandidates.length - videoCompareSelection.length

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
          {/*
            Dropdown, not a tab row — this is headed for 5-8 pages, and a
            strip that wide never fits the header.
          */}
          <PageNav />
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
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
          <button
            onClick={() => setShowInsights(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
            Insights
          </button>
          <button
            onClick={() => setShowChat(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask Claude
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
              {/*
                Three levels, breadcrumb-driven: all niche groups compared ->
                channels within one group compared -> videos compared (whole
                group, or narrowed to one channel). Every level is always ONE
                format at a time (videoType below) or total-views-only for
                groups/channels — long-form and shorts never share an axis.
                A Channels/Videos radio picks the compare unit within a group;
                a channel click just narrows "videos" to that channel instead
                of showing its own format split.
              */}
              <section className="flex h-[296px] flex-shrink-0 gap-3">
                <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-card p-3">
                  <div className="mb-1 flex flex-shrink-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <div className="min-w-0">
                      <Breadcrumb
                        group={group.nicheGroup}
                        channel={chartScope === "videos" ? selectedChannel : null}
                        scope={chartScope}
                        onShowGroups={() => {
                          setChartScope("groups")
                          setSelectedChannel(null)
                        }}
                        onShowChannels={() => {
                          setChartScope("channels")
                          setSelectedChannel(null)
                        }}
                      />
                      {chartScope === "groups" && groupsOmitted > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          +{groupsOmitted} more not shown, sorted by views gained
                        </p>
                      )}
                      {chartScope === "channels" && channelsOmitted > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          +{channelsOmitted} more not shown, sorted by views gained
                        </p>
                      )}
                      {chartScope === "videos" && videosOmitted > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          +{videosOmitted} more not shown, sorted by views/day
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                      {chartScope !== "groups" && (
                        <div className="flex rounded-lg border border-border p-0.5">
                          {(["channels", "videos"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => {
                                setChartScope(s)
                                if (s === "channels") setSelectedChannel(null)
                              }}
                              className={`rounded-md px-2.5 py-1 text-[11px] capitalize transition-colors ${
                                chartScope === s
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      {chartScope === "videos" && (
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
                      )}

                      <YZoomControl value={yMaxOverride} onChange={setYMaxOverride} />

                      <CompareLegend
                        entries={
                          chartScope === "groups"
                            ? groupCompareEntries
                            : chartScope === "channels"
                              ? channelCompareEntries
                              : videoCompareEntries
                        }
                        focusKey={
                          chartScope === "groups" ? selectedGroup : chartScope === "channels" ? selectedChannel : null
                        }
                        hiddenKeys={hiddenKeys}
                        onToggle={(key) =>
                          setHiddenKeys((prev) => {
                            const next = new Set(prev)
                            next.has(key) ? next.delete(key) : next.add(key)
                            return next
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1">
                    {chartScope === "groups" ? (
                      <CompareTrend
                        data={groupCompareRows}
                        entries={groupCompareEntries}
                        focusKey={selectedGroup}
                        hiddenKeys={hiddenKeys}
                        yMax={yMaxOverride}
                        height="100%"
                      />
                    ) : chartScope === "channels" ? (
                      <CompareTrend
                        data={channelCompareRows}
                        entries={channelCompareEntries}
                        focusKey={selectedChannel}
                        hiddenKeys={hiddenKeys}
                        yMax={yMaxOverride}
                        height="100%"
                      />
                    ) : (
                      <CompareTrend
                        data={videoCompareRows}
                        entries={videoCompareEntries}
                        hiddenKeys={hiddenKeys}
                        yMax={yMaxOverride}
                        height="100%"
                      />
                    )}
                  </div>
                </div>

                {/* Drill-down list — niche groups, channels in the selected group, or videos in the current comparison set */}
                <div className="flex w-[340px] flex-shrink-0 flex-col rounded-xl border border-border bg-card">
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-2">
                    <p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                      {chartScope === "groups"
                        ? `Niche groups (${data.groups.length})`
                        : chartScope === "channels"
                          ? `Channels (${groupChannels.length})`
                          : `Videos (${videosRanked.length}) · ${SERIES[videoType].label}`}
                    </p>
                    {chartScope === "videos" && selectedChannel && (
                      <button
                        onClick={() => {
                          setChartScope("channels")
                          setSelectedChannel(null)
                        }}
                        className="flex flex-shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Back
                      </button>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                    {chartScope === "groups" ? (
                      [...data.groups]
                        .sort((a, b) => b.totalViewsDelta - a.totalViewsDelta)
                        .map((g) => (
                          <button
                            key={g.nicheGroup}
                            onClick={() => setSelectedGroup(g.nicheGroup)}
                            aria-pressed={g.nicheGroup === selectedGroup}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                              g.nicheGroup === selectedGroup ? "bg-primary/15" : "hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-2 w-2 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: colorForEntity(allGroupKeysSorted, g.nicheGroup) }}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-medium text-foreground">
                                  {g.nicheGroup}
                                </p>
                                <p className="truncate text-[10px] text-muted-foreground">
                                  {g.channelCount} channel{g.channelCount === 1 ? "" : "s"}
                                </p>
                              </div>
                            </div>
                            <p className="flex-shrink-0 text-[11px] tabular-nums text-foreground">
                              {fmt(g.totalViewsDelta)}
                            </p>
                          </button>
                        ))
                    ) : chartScope === "channels" ? (
                      groupChannels.map((c) => (
                        <button
                          key={c.handle}
                          onClick={() => {
                            setSelectedChannel(c.handle)
                            setChartScope("videos")
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: colorForEntity(allChannelKeysSorted, c.handle) }}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-medium text-foreground">
                                {c.handle}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {c.niche || "—"} · {fmt(c.subscribers)} subs
                              </p>
                            </div>
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
                      ))
                    ) : videosRanked.length === 0 ? (
                      <p className="p-3 text-center text-[11px] text-muted-foreground">
                        No {SERIES[videoType].label.toLowerCase()} videos in this range
                      </p>
                    ) : (
                      videosRanked.map((v, i) => (
                        <a
                          key={v.videoId}
                          href={v.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
                        >
                          <span className="w-4 flex-shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-medium text-foreground">{v.title}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {v.handle} · {fmt(v.views)} views
                              {v.viewsPerDay !== null ? ` · ${fmt(v.viewsPerDay)}/d` : ""}
                            </p>
                          </div>
                          <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        </a>
                      ))
                    )}
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

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      <ChatPanel
        open={showChat}
        onClose={() => setShowChat(false)}
        range={range}
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

/**
 * Manual Y-axis ceiling for the compare charts. Complements clicking a legend
 * entry off: that hides a dominant line entirely, this lets you cap the axis
 * without losing the line from the chart at all.
 */
function YZoomControl({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">Y max</span>
      <input
        type="number"
        min={0}
        placeholder="Auto"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-[72px] rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-foreground outline-none focus:border-primary/50"
      />
      {value != null && (
        <button
          onClick={() => onChange(null)}
          className="text-[10px] text-primary hover:underline"
        >
          Reset
        </button>
      )}
    </div>
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

/** Three-level breadcrumb: all niche groups -> one group's channels -> one channel. Each non-terminal crumb jumps the chart's compare scope there. */
function Breadcrumb({
  group,
  channel,
  scope,
  onShowGroups,
  onShowChannels,
}: {
  group: string
  channel: string | null
  scope: "groups" | "channels" | "videos"
  onShowGroups: () => void
  onShowChannels: () => void
}) {
  const atGroups = scope === "groups"
  const atChannels = scope !== "groups" && !channel

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <button
        onClick={onShowGroups}
        className={atGroups ? "font-medium text-foreground" : "text-primary hover:underline"}
      >
        All niche groups
      </button>
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      <button
        onClick={onShowChannels}
        className={atChannels ? "font-medium text-foreground" : "text-primary hover:underline"}
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
