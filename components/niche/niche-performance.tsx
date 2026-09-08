"use client"

import "./niche.css"

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
import type { IdeationPayload } from "@/lib/niche/ideation"
import { peerRanks, recommend, formatCount, type EvidenceAnchor } from "@/lib/niche/recommend"
import { PageNav } from "@/components/page-nav"
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
import { Headline } from "./headline"
import { OpportunityWorkbench } from "./opportunity-workbench"
import { NextMoves } from "./next-moves"
import { PeerRanks } from "./peer-ranks"
import { ChannelLeaderboard } from "./channel-leaderboard"
import { AnglesPanel } from "./angles-panel"
import {
  ArchetypePanel,
  IdeationCoverageLine,
  OverlapPanel,
  RecyclingPanel,
  TopicBoard,
} from "./ideation-panels"
import { Disclosure, EmptyPanel, Eyebrow, Panel } from "./ui"

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
 * Niche Performance.
 *
 * /metrics answers "which niche deserves attention". This page answers "what do
 * I make in it" — and the answer it leads with is about IDEAS, not throughput:
 * which title framings beat their publisher's own baseline, which subjects the
 * niche has worn out, who is ideating from the same pool as everyone else, and
 * what is left open. The performance numbers still exist, one disclosure down,
 * because they are the context for those answers rather than the answer.
 *
 * Three data sources, all cached, in decreasing order of how often they change:
 *   /api/metrics        the shared windowed aggregate, identical to /metrics
 *   /api/niche-ideation the permanent title corpus, analysed deterministically
 *   /api/niche-angles   the semantic read, on demand only — it costs money
 */
export function NichePerformance() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [range, setRange] = useState<RangeKey>(() =>
    isRangeKey(searchParams.get("range")) ? (searchParams.get("range") as RangeKey) : "30d"
  )
  const [selectedGroup, setSelectedGroup] = useState<string | null>(() => searchParams.get("group"))
  const [videoType, setVideoType] = useState<VideoType>("LONG_FORM")
  const [formatTouched, setFormatTouched] = useState(false)

  const [data, setData] = useState<MetricsPayload | null>(null)
  const [rawNexlev, setNexlev] = useState<NexlevChannelDetail[]>([])
  const [rawIdeation, setIdeation] = useState<IdeationPayload | null>(null)
  const [ideationLoading, setIdeationLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [showWarnings, setShowWarnings] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const metricsRequest = useRef(0)
  const [refreshVersion, setRefreshVersion] = useState(0)

  const [nexlevGroup, setNexlevGroup] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({})
  const [patternsOpen, setPatternsOpen] = useState(false)
  const [inspectSimilarity, setInspectSimilarity] = useState(false)
  const [pendingEvidence, setPendingEvidence] = useState<EvidenceAnchor | null>(null)
  const ideation = rawIdeation?.coverage.nicheGroup === selectedGroup && rawIdeation.coverage.videoType === videoType ? rawIdeation : null
  const nexlev = useMemo(() => nexlevGroup === selectedGroup ? rawNexlev : [], [nexlevGroup, selectedGroup, rawNexlev])

  // ── Data ───────────────────────────────────────────────────────────────

  const loadMetrics = useCallback((r: RangeKey, refresh = false) => {
    const request = ++metricsRequest.current
    setLoading(true)
    setError(null)
    fetch(`/api/metrics?range=${r}${refresh ? "&refresh=1" : ""}`)
      .then((res) => res.json())
      .then((json) => {
        if (request !== metricsRequest.current) return
        if (!json.success) {
          setError({ message: json.error || "Failed to load metrics", code: json.code })
          setData(null)
          return
        }
        setData(json.data as MetricsPayload)
      })
      .catch((err: unknown) => {
        if (request === metricsRequest.current) setError({ message: err instanceof Error ? err.message : "Network error" })
      })
      .finally(() => { if (request === metricsRequest.current) setLoading(false) })
  }, [])

  useEffect(() => {
    loadMetrics(range)
    return () => { metricsRequest.current++ }
  }, [range, loadMetrics])

  // Both supplementary reads fail soft: the page stays usable on measured view
  // data if either is unavailable, so neither becomes a page-level error.
  useEffect(() => {
    if (!selectedGroup) return
    let cancelled = false
    setNexlev([])
    setDetailError(null)
    fetch(`/api/niche-detail?group=${encodeURIComponent(selectedGroup)}${refreshVersion ? "&refresh=1" : ""}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (!json.success) { setDetailError(json.error || "Channel enrichment unavailable"); return }
        setNexlevGroup(selectedGroup)
        setNexlev((json.channels ?? []) as NexlevChannelDetail[])
      })
      .catch(() => { if (!cancelled) setDetailError("Channel enrichment unavailable. Refresh to retry.") })
    return () => {
      cancelled = true
    }
  }, [selectedGroup, refreshVersion])

  useEffect(() => {
    if (!selectedGroup) return
    let cancelled = false
    setIdeation(null)
    setAnalysisError(null)
    setIdeationLoading(true)
    fetch(
      `/api/niche-ideation?group=${encodeURIComponent(selectedGroup)}&format=${videoType}${refreshVersion ? "&refresh=1" : ""}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (json.success) setIdeation(json.data as IdeationPayload)
        else setAnalysisError(json.error || "Title analysis unavailable. Refresh to retry.")
      })
      .catch(() => { if (!cancelled) setAnalysisError("Title analysis unavailable. Refresh to retry.") })
      .finally(() => {
        if (!cancelled) setIdeationLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedGroup, videoType, refreshVersion])

  // ── Selection ──────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    if (!data) return []
    return [...data.groups].sort((a, b) => b.totalViewsDelta - a.totalViewsDelta)
  }, [data])

  // Default to the biggest *named* group. "Overall" is the ungrouped remainder
  // of the roster; drilling into it answers nothing about a niche.
  useEffect(() => {
    if (groups.length === 0 || groups.some(g => g.nicheGroup === selectedGroup)) return
    const named = groups.filter((g) => g.nicheGroup !== "Overall")
    setSelectedGroup((named[0] ?? groups[0]).nicheGroup)
  }, [groups, selectedGroup])

  useEffect(() => {
    if (!selectedGroup) return
    router.replace(`/niche?group=${encodeURIComponent(selectedGroup)}&range=${range}`, {
      scroll: false,
    })
  }, [selectedGroup, range, router])

  const group: NicheGroupSummary | null = useMemo(
    () => groups.find((g) => g.nicheGroup === selectedGroup) ?? null,
    [groups, selectedGroup]
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

  const nexlevByChannelId = useMemo(() => new Map(nexlev.map((n) => [n.channelId, n])), [nexlev])

  // Open on the format this niche actually publishes — but stop guessing the
  // moment the user picks one, or their choice would be overwritten on every
  // niche switch.
  useEffect(() => {
    if (formatTouched || !ideation) return
    const { LONG_FORM, SHORTS } = ideation.coverage.byFormat
    setVideoType(SHORTS > LONG_FORM ? "SHORTS" : "LONG_FORM")
  }, [ideation, formatTouched])

  useEffect(() => {
    setOpenEvidence({})
  }, [selectedGroup])

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

  useEffect(() => setHiddenKeys(new Set()), [selectedGroup, range])

  const showEvidence = useCallback((anchor: EvidenceAnchor) => {
    setOpenEvidence(prev => ({ ...prev, [anchor === "trend" || anchor === "peers" ? "performance" : anchor]: true }))
    setPendingEvidence(anchor)
  }, [])

  useEffect(() => {
    if (!pendingEvidence) return
    const target = document.getElementById(pendingEvidence)
    if (target) {
      target.tabIndex = -1
      target.focus({ preventScroll: true })
      target.scrollIntoView({ block: "start" })
      setPendingEvidence(null)
    }
  }, [pendingEvidence, openEvidence])

  useEffect(() => {
    if (inspectSimilarity && patternsOpen && !ideationLoading) {
      const target = document.getElementById("channel-similarity") ?? document.getElementById("pattern-evidence")
      target?.scrollIntoView({ block: "start" })
      if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }) }
      setInspectSimilarity(false)
    }
  }, [inspectSimilarity, patternsOpen, ideationLoading, ideation])

  const toggleSeries = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const groupRank = group === null ? null : groups.findIndex((g) => g.nicheGroup === group.nicheGroup) + 1

  // ── Render ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-destructive/40 bg-card p-5">
          <h2 className="text-[13px] font-semibold text-foreground">Could not load niche metrics</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{error.message}</p>
          <button
            onClick={() => loadMetrics(range, true)}
            className="mt-4 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-[11px] text-foreground transition-[transform,border-color] duration-150 ease-out hover:border-primary/50 active:scale-[0.96]"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="niche-page flex h-dvh flex-col bg-background">
      {/* One toolbar row. The previous header spent a full-width band on the
          niche name and pushed every control onto a second line. */}
      <header className="sticky top-0 z-30 flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <PageNav />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(["LONG_FORM", "SHORTS"] as VideoType[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setVideoType(t)
                  setFormatTouched(true)
                }}
                aria-pressed={videoType === t}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
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

          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 ${
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
            onClick={() => { loadMetrics(range, true); setRefreshVersion(v => v + 1) }}
            aria-label="Refresh all research data"
            title="Re-read the source, bypassing the cache"
            className="cursor-pointer rounded-lg border border-border p-1.5 text-muted-foreground transition-[transform,color,border-color] duration-150 ease-out hover:border-primary/50 hover:text-foreground active:scale-[0.96]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setShowChat(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask Claude
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Niche rail: switching niche is the page's primary action, so it is a
            visible row of targets, not a hidden dropdown. */}
        <div className="border-b border-border bg-card/30">
          <div className="flex gap-1.5 overflow-x-auto px-4 py-2">
            {groups.map((g) => {
              const active = g.nicheGroup === selectedGroup
              return (
                <button
                  key={g.nicheGroup}
                  onClick={() => setSelectedGroup(g.nicheGroup)}
                  aria-pressed={active}
                  className={`flex flex-shrink-0 cursor-pointer items-baseline gap-2 rounded-lg px-2.5 py-1.5 transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
                    active
                      ? "bg-primary/15 shadow-[inset_0_0_0_1px_var(--primary)]"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`text-[12px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {g.nicheGroup}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground/80">
                    {formatCount(g.totalViewsDelta)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-7 px-4 py-7 sm:px-7 lg:px-10">
          {loading || data?.range !== range ? (
            <div className="flex h-64 items-center justify-center">
              <p role="status" className="text-[13px] text-muted-foreground">Loading niche metrics…</p>
            </div>
          ) : !group ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-[13px] text-muted-foreground">
                No niche group selected. Pick one from the rail above.
              </p>
            </div>
          ) : (
            <>
              <Headline group={group} rank={groupRank} outOf={groups.length} />
              <p className="-mt-4 text-xs text-muted-foreground">Headline totals include all formats. The research desk and title analysis use your selected format.</p>

              {data && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    Coverage {data.coverageDays}d
                    {data.coverageStart && data.coverageEnd
                      ? ` · ${data.coverageStart} → ${data.coverageEnd}`
                      : ""}
                  </span>
                  <span>Generated {new Date(data.generatedAt).toLocaleString()}</span>
                  {data.warnings.length > 0 && (
                    <button
                      onClick={() => setShowWarnings((v) => !v)}
                      className="flex cursor-pointer items-center gap-1 text-amber-400 hover:underline"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {data.warnings.length} data caveat{data.warnings.length === 1 ? "" : "s"}
                      <ChevronRight
                        className={`h-3 w-3 transition-transform duration-200 ${showWarnings ? "rotate-90" : ""}`}
                      />
                    </button>
                  )}
                </div>
              )}

              {showWarnings && data && (
                <ul className="space-y-1 rounded-lg bg-amber-500/5 px-3 py-2 ring-1 ring-inset ring-amber-500/30">
                  {data.warnings.map((w, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-amber-200/90">
                      {w}
                    </li>
                  ))}
                </ul>
              )}

              <OpportunityWorkbench
                key={`${group.nicheGroup}:${videoType}:${range}`}
                videos={videos}
                onInspectEvidence={() => { setPatternsOpen(true); setInspectSimilarity(true) }}
                analysisLoading={ideationLoading}
                analysisError={analysisError}
                videoType={videoType}
                ideation={ideation}
                group={group.nicheGroup}
                range={RANGE_LABEL[range]}
                coverage={`${data?.coverageStart ?? "unknown"} to ${data?.coverageEnd ?? "unknown"}`}
              />

              {/* ── The ideation layer: what this page exists for ── */}
              <div id="pattern-evidence" className="flex scroll-mt-24 flex-col gap-3">
                <Disclosure label="Inspect pattern evidence" hint="Title framings, topic history, channel similarities and repeat subjects" open={patternsOpen} onOpenChange={setPatternsOpen}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Eyebrow>Pattern evidence · full tracked title history</Eyebrow>
                  {ideation && !ideation.emptyReason && (
                    <IdeationCoverageLine payload={ideation} />
                  )}
                </div>

                {ideationLoading && !ideation ? (
                  <Panel>
                    <EmptyPanel>Reading the published title corpus…</EmptyPanel>
                  </Panel>
                ) : !ideation || ideation.emptyReason ? (
                  <Panel>
                    <EmptyPanel>
                      {ideation?.emptyReason ??
                        analysisError ?? "The ideation analysis is unavailable for this niche."}
                    </EmptyPanel>
                  </Panel>
                ) : (
                  <>
                    <div className="grid gap-3 xl:grid-cols-12">
                      <div className="xl:col-span-5">
                        <ArchetypePanel archetypes={ideation.archetypes} />
                      </div>
                      <div className="xl:col-span-7">
                        <TopicBoard topics={ideation.topics} />
                      </div>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-12">
                      <div className="xl:col-span-7">
                        <OverlapPanel overlap={ideation.overlap} />
                      </div>
                      <div className="xl:col-span-5">
                        <RecyclingPanel repetition={ideation.repetition} />
                      </div>
                    </div>
                  </>
                )}
                </Disclosure>
              </div>

              <AnglesPanel
                key={`${group.nicheGroup}:${videoType}`}
                group={group.nicheGroup}
                videoType={videoType}
                disabled={!ideation || Boolean(ideation.emptyReason)}
              />

              {/* ── The action layer ── */}
              <div className="flex flex-col gap-2">
                <Eyebrow>Next steps from the performance evidence · all formats</Eyebrow>
                <NextMoves
                  moves={recommendation.moves}
                  emptyReason={recommendation.emptyReason}
                  onShowEvidence={showEvidence}
                />
              </div>

              {/* ── Performance context, one disclosure down ── */}
              <Disclosure
                open={openEvidence.performance ?? false}
                onOpenChange={open => setOpenEvidence(prev => ({ ...prev, performance: open }))}
                label="Performance context"
                hint={`rank vs ${groups.length - 1} other niches, and who is driving this one`}
              >
                <div className="grid gap-3 xl:grid-cols-12">
                  <div className="xl:col-span-5">
                    <PeerRanks measures={measures} groupName={group.nicheGroup} />
                  </div>
                  <Panel id="trend" className="xl:col-span-7">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                      <h3 className="text-[13px] font-semibold text-foreground">
                        Daily views gained per channel
                      </h3>
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
                        height={260}
                      />
                    </div>
                  </Panel>
                </div>
              </Disclosure>

              <Disclosure
                open={openEvidence.channels ?? false}
                onOpenChange={open => setOpenEvidence(prev => ({ ...prev, channels: open }))}
                label="Channels"
                hint={`${channels.length} in this niche, with measured RPM where NexLev has it`}
              >
                {detailError && <p role="status" className="mb-3 text-sm text-muted-foreground">{detailError}</p>}
                <ChannelLeaderboard
                  channels={channels}
                  nexlevByChannelId={nexlevByChannelId}
                  groupName={group.nicheGroup}
                />
              </Disclosure>

              <Disclosure
                open={openEvidence.outliers ?? false}
                onOpenChange={open => setOpenEvidence(prev => ({ ...prev, outliers: open }))}
                label="Outlier videos"
                hint={`tracked ${videoType === "SHORTS" ? "Shorts" : "long-form"} in the last ${RANGE_LABEL[range]}`}
              >
                <div id="outliers" className="min-h-[420px] scroll-mt-20">
                  <OutlierTable videos={videos} videoType={videoType} />
                </div>
              </Disclosure>
            </>
          )}
        </div>
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
