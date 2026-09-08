"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, ChevronRight, RefreshCw, Sparkles } from "lucide-react"
import type {
  ChannelRollup,
  MetricsPayload,
  NicheGroupSummary,
  RangeKey,
  VideoRollup,
  VideoType,
} from "@/lib/metrics/types"
import type { NexlevChannelDetail } from "@/lib/metrics/neon"
import { peerRanks, recommend, type EvidenceAnchor } from "@/lib/niche/recommend"
import { PageNav } from "@/components/page-nav"
import { SearchableDropdown } from "@/components/searchable-dropdown"
import { OutlierTable } from "@/components/metrics/outlier-table"
import { ChatPanel } from "@/components/metrics/chat-panel"
import {
  buildCompareRows,
  colorForEntity,
  COMPARE_MAX_SERIES,
  CompareLegend,
  CompareTrend,
  SERIES,
} from "@/components/metrics/views-trend"
import { VerdictPanel } from "./verdict-panel"
import { NextMoves } from "./next-moves"
import { PeerRanks } from "./peer-ranks"
import { ChannelLeaderboard } from "./channel-leaderboard"

const RANGES: RangeKey[] = ["7d", "14d", "30d", "90d", "180d"]
const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "7d",
  "14d": "14d",
  "30d": "30d",
  "90d": "90d",
  "180d": "6mo",
}

const isRangeKey = (v: string | null): v is RangeKey =>
  v !== null && (RANGES as string[]).includes(v)

/**
 * Niche Performance — the drill-down page.
 *
 * /metrics answers "which niche should I look at". This page answers "what do I
 * make in it", for one niche group at a time. Structure is deliberately
 * answer-first: the verdict and the ranked moves sit above every chart, and
 * each move jumps to the panel whose numbers produced it.
 *
 * Data comes from two places. The shared aggregate is the cached /api/metrics
 * payload — identical to what /metrics renders, so the two pages can never
 * disagree. The NexLev money layer comes from /api/niche-detail, which returns
 * the enrichment fields the metrics payload collapses away.
 */
export function NichePerformance() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [range, setRange] = useState<RangeKey>(() =>
    isRangeKey(searchParams.get("range")) ? (searchParams.get("range") as RangeKey) : "30d"
  )
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    () => searchParams.get("group")
  )
  const [videoType, setVideoType] = useState<VideoType>("LONG_FORM")

  const [data, setData] = useState<MetricsPayload | null>(null)
  const [nexlev, setNexlev] = useState<NexlevChannelDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [showWarnings, setShowWarnings] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())

  const scrollRef = useRef<HTMLElement | null>(null)

  // ── Data ───────────────────────────────────────────────────────────────

  const loadMetrics = useCallback((r: RangeKey, refresh = false) => {
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
  }, [])

  useEffect(() => {
    loadMetrics(range)
  }, [range, loadMetrics])

  // The money layer is supplementary: a failure here leaves the page fully
  // usable on measured view data, so it never surfaces as a page-level error.
  useEffect(() => {
    if (!selectedGroup) return
    let cancelled = false
    setNexlev([])
    fetch(`/api/niche-detail?group=${encodeURIComponent(selectedGroup)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.success) return
        setNexlev((json.channels ?? []) as NexlevChannelDetail[])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedGroup])

  // ── Selection ──────────────────────────────────────────────────────────

  const groupNames = useMemo(
    () => (data ? data.groups.map((g) => g.nicheGroup) : []),
    [data]
  )

  // Default to the biggest *named* niche group, never "Overall" — Overall is
  // the ungrouped remainder of the roster, and drilling into it answers
  // nothing about a niche.
  useEffect(() => {
    if (selectedGroup || !data?.groups.length) return
    const named = data.groups.filter((g) => g.nicheGroup !== "Overall")
    const pick = [...(named.length > 0 ? named : data.groups)].sort(
      (a, b) => b.totalViewsDelta - a.totalViewsDelta
    )[0]
    setSelectedGroup(pick.nicheGroup)
  }, [data, selectedGroup])

  // Keep the URL shareable — a niche + range is exactly what gets pasted into
  // a message. `replace` so back does not walk every filter change.
  useEffect(() => {
    if (!selectedGroup) return
    const next = `/niche?group=${encodeURIComponent(selectedGroup)}&range=${range}`
    router.replace(next, { scroll: false })
  }, [selectedGroup, range, router])

  const group: NicheGroupSummary | null = useMemo(
    () => data?.groups.find((g) => g.nicheGroup === selectedGroup) ?? null,
    [data, selectedGroup]
  )

  const channels: ChannelRollup[] = useMemo(() => {
    if (!data || !group) return []
    return data.channels
      .filter((c) => c.nicheGroup === group.nicheGroup)
      .sort((a, b) => b.totalViewsDelta - a.totalViewsDelta)
  }, [data, group])

  const videos: VideoRollup[] = useMemo(() => {
    if (!data || channels.length === 0) return []
    const handles = new Set(channels.map((c) => c.handle))
    return data.videos.filter((v) => handles.has(v.handle))
  }, [data, channels])

  const nexlevByChannelId = useMemo(
    () => new Map(nexlev.map((n) => [n.channelId, n])),
    [nexlev]
  )

  // Open on whichever format this niche actually has tracked videos for, so a
  // long-form niche does not greet you with an empty Shorts table.
  useEffect(() => {
    if (videos.length === 0) return
    const long = videos.filter((v) => v.videoType === "LONG_FORM").length
    const shorts = videos.length - long
    setVideoType(shorts > long ? "SHORTS" : "LONG_FORM")
  }, [videos])

  // ── Derived ────────────────────────────────────────────────────────────

  const recommendation = useMemo(() => {
    if (!group) return { moves: [], emptyReason: null }
    return recommend({ group, channels, videos, nexlev })
  }, [group, channels, videos, nexlev])

  const measures = useMemo(() => {
    if (!group || !data) return []
    return peerRanks(group, data.groups)
  }, [group, data])

  const allHandlesSorted = useMemo(() => [...channels.map((c) => c.handle)].sort(), [channels])

  const compareSelection = useMemo(
    () => channels.slice(0, COMPARE_MAX_SERIES).map((c) => ({ key: c.handle, trend: c.trend })),
    [channels]
  )
  const compareEntries = useMemo(
    () =>
      compareSelection.map((e) => ({
        key: e.key,
        label: e.key,
        color: colorForEntity(allHandlesSorted, e.key),
      })),
    [compareSelection, allHandlesSorted]
  )
  const compareRows = useMemo(() => buildCompareRows(compareSelection), [compareSelection])
  const channelsOmitted = channels.length - compareSelection.length

  useEffect(() => setHiddenKeys(new Set()), [selectedGroup, range])

  const showEvidence = useCallback((anchor: EvidenceAnchor) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const toggleSeries = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-destructive/40 bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Could not load niche metrics</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{error.message}</p>
          <button
            onClick={() => loadMetrics(range, true)}
            className="mt-4 rounded-lg border border-border px-3 py-1.5 text-[11px] text-foreground hover:border-primary/50"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <PageNav />

        <SearchableDropdown
          value={selectedGroup ?? ""}
          options={groupNames}
          placeholder="Select a niche group"
          onSelect={(v) => setSelectedGroup(v)}
        />

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
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
            onClick={() => loadMetrics(range, true)}
            aria-label="Refresh metrics"
            title="Re-read the source, bypassing the 30-minute cache"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
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

      <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {/* Coverage line — what the numbers below are actually made of. */}
        {data && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Coverage: <span className="text-foreground">{data.coverageDays}d</span>
              {data.coverageStart && data.coverageEnd
                ? ` (${data.coverageStart} → ${data.coverageEnd})`
                : ""}
            </span>
            <span>
              Generated {new Date(data.generatedAt).toLocaleString()}
            </span>
            {data.warnings.length > 0 && (
              <button
                onClick={() => setShowWarnings((v) => !v)}
                className="flex items-center gap-1 text-amber-400 hover:underline"
              >
                <AlertTriangle className="h-3 w-3" />
                {data.warnings.length} data caveat{data.warnings.length === 1 ? "" : "s"}
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${showWarnings ? "rotate-90" : ""}`}
                />
              </button>
            )}
          </div>
        )}

        {showWarnings && data && data.warnings.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            {data.warnings.map((w, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-amber-200/90">
                {w}
              </li>
            ))}
          </ul>
        )}

        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading niche metrics…</p>
          </div>
        ) : !group ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No niche group selected. Pick one from the dropdown above.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Answer first: the verdict and what to do about it. */}
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <VerdictPanel group={group} />
              </div>
              <div className="lg:col-span-7">
                <NextMoves
                  moves={recommendation.moves}
                  emptyReason={recommendation.emptyReason}
                  onShowEvidence={showEvidence}
                />
              </div>
            </div>

            {/* Evidence. */}
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <PeerRanks measures={measures} groupName={group.nicheGroup} />
              </div>

              <section
                id="trend"
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card scroll-mt-24 lg:col-span-8"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Who is driving {group.nicheGroup}
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                      daily views gained per channel
                      {channelsOmitted > 0 ? ` · ${channelsOmitted} smaller channel${channelsOmitted === 1 ? "" : "s"} omitted` : ""}
                    </span>
                  </div>
                  <CompareLegend
                    entries={compareEntries}
                    hiddenKeys={hiddenKeys}
                    onToggle={toggleSeries}
                  />
                </header>
                <div className="p-2">
                  <CompareTrend
                    data={compareRows}
                    entries={compareEntries}
                    hiddenKeys={hiddenKeys}
                    height={280}
                  />
                </div>
              </section>
            </div>

            <ChannelLeaderboard
              channels={channels}
              nexlevByChannelId={nexlevByChannelId}
              groupName={group.nicheGroup}
            />

            {/* The drill: every tracked video in the niche, one format at a time. */}
            <section id="outliers" className="flex flex-col gap-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Outliers · {group.nicheGroup}
                </h2>
                <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                  {(["LONG_FORM", "SHORTS"] as VideoType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setVideoType(t)}
                      aria-pressed={videoType === t}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        videoType === t
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: SERIES[t].color }}
                      />
                      {SERIES[t].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-[420px]">
                <OutlierTable videos={videos} videoType={videoType} />
              </div>
            </section>
          </div>
        )}
      </main>

      <ChatPanel
        open={showChat}
        onClose={() => setShowChat(false)}
        page="metrics"
        range={range}
        subtitle={selectedGroup ? `${selectedGroup} · ${range}` : range}
        aboutBlurb="Ask anything about this niche group. Claude sees the same aggregated metrics this page renders — channels, daily trends and top videos by views/day."
        placeholder="Ask what to make in this niche…"
        suggestions={[
          `What should my next three videos in ${selectedGroup ?? "this niche"} be about?`,
          "Which channel here is growing fastest, and what changed for it?",
          "What do the outlier videos in this niche have in common?",
          "Is this niche worth entering right now, or is it too concentrated?",
        ]}
      />
    </div>
  )
}
