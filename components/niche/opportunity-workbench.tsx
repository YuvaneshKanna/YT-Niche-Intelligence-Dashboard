"use client"

import { useMemo, useState } from "react"
import { ArrowUpRight, Bookmark, Check, Copy, Search, SlidersHorizontal, Sparkles } from "lucide-react"
import type { VideoRollup, VideoType } from "@/lib/metrics/types"
import { ARCHETYPES, terms, type IdeationPayload, type TopicTerm } from "@/lib/niche/ideation"
import { formatCount } from "@/lib/niche/recommend"
import { Panel, PercentileChip } from "./ui"

const control = "min-h-11 max-w-full rounded-lg bg-muted/60 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-within:ring-2 focus-within:ring-primary"
const topicLabel = (t: TopicTerm) => t.isSaturated ? "Crowded" : t.isWhitespace ? "Early signal" : "Contested"

function matchesTopic(title: string, term: string) {
  return terms(title).includes(term)
}

export function OpportunityWorkbench({ videos, videoType, ideation, group, range, coverage, analysisLoading, analysisError, onInspectEvidence }: {
  videos: VideoRollup[]
  videoType: VideoType
  ideation: IdeationPayload | null
  group: string
  range: string
  coverage: string
  analysisLoading: boolean
  analysisError: string | null
  onInspectEvidence: () => void
}) {
  const [query, setQuery] = useState("")
  const [channel, setChannel] = useState("")
  const [minimum, setMinimum] = useState(3)
  const [sort, setSort] = useState("score")
  const [topic, setTopic] = useState<TopicTerm | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [savedOnly, setSavedOnly] = useState(false)
  const [limit, setLimit] = useState(12)
  const [copyStatus, setCopyStatus] = useState("")
  const [manualBrief, setManualBrief] = useState("")
  const [topicLimit, setTopicLimit] = useState(4)
  const formatVideos = useMemo(() => videos.filter(v => v.videoType === videoType), [videos, videoType])
  const handles = useMemo(() => [...new Set(formatVideos.map(v => v.handle))].sort(), [formatVideos])
  const shortlist = formatVideos.filter(v => saved.has(v.videoId))
  const topics = useMemo(() => [...(ideation?.topics ?? [])].sort((a, b) =>
    Number(b.isWhitespace && !b.isSaturated) - Number(a.isWhitespace && !a.isSaturated) || b.medianPercentile - a.medianPercentile
  ), [ideation])
  const filtered = useMemo(() => formatVideos.filter(v =>
    (!channel || v.handle === channel) &&
    (!query.trim() || `${v.title} ${v.handle}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (savedOnly ? saved.has(v.videoId) : v.outlierScore >= minimum) &&
    (!topic || matchesTopic(v.title, topic.term))
  ).sort((a, b) => sort === "recent" ? b.publishedAt.localeCompare(a.publishedAt)
    : sort === "pace" ? (b.viewsPerDay ?? -1) - (a.viewsPerDay ?? -1)
    : b.outlierScore - a.outlierScore), [formatVideos, channel, query, savedOnly, saved, minimum, topic, sort])
  const patterns = ARCHETYPES.filter(a => a.key !== "person").map(a => {
    const hits = filtered.filter(v => a.test.test(v.title))
    return { ...a, count: hits.length, channels: new Set(hits.map(v => v.handle)).size }
  }).filter(a => a.count >= 2 && a.channels >= 2).sort((a, b) => b.channels - a.channels || b.count - a.count).slice(0, 3)

  function toggleSaved(id: string) {
    setCopyStatus("")
    setManualBrief("")
    setSaved(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function copyBrief() {
    const text = [
      `Creative research brief: ${group} / ${videoType === "SHORTS" ? "Shorts" : "Long-form"} / ${range}`,
      `Observed snapshots: ${coverage}`,
      "Reference videos (research signals, not predictions):",
      ...shortlist.map(v => `\n${v.title}\n${v.handle} · published ${v.publishedAt.slice(0, 10)} · duration ${v.durationHms}\nSource outlier score ${v.outlierScore} · ${v.viewsPerDay === null ? "pace unavailable" : `${v.viewsPerDay} views/day`} · ${v.views} total views · ${v.daysObserved} days observed\nhttps://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`),
      "\nMeasured snapshot evidence. Source scores are not title percentiles. Views/day is observed daily gain; retained snapshots may overrepresent outliers. These findings do not establish demand or predict success.",
      "\nBefore scripting: identify the audience promise, find a distinct angle, and verify the underlying claims.",
    ].join("\n")
    try { await navigator.clipboard.writeText(text); setManualBrief(""); setCopyStatus("Brief copied") }
    catch { setManualBrief(text); setCopyStatus("Clipboard unavailable. Your brief is below: select it and copy manually.") }
  }

  return (
    <section id="opportunity-workbench" className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">Research desk</p>
          <h2 className="text-2xl font-semibold tracking-tight">Which videos should you study next?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Spot unusual performers. See what travels across channels. Save the evidence for your next brief.</p>
        </div>
        <button disabled={!shortlist.length} onClick={copyBrief} className={`${control} flex items-center gap-2 bg-primary text-primary-foreground disabled:opacity-40`}>
          <Copy size={15} /> Copy brief{shortlist.length > 0 ? ` (${shortlist.length})` : ""}
        </button>
      </div>
      <p role="status" className="text-sm text-muted-foreground empty:hidden">{copyStatus}</p>
      {manualBrief && <label className="block text-sm">Research brief — select and copy<textarea aria-label="Research brief" readOnly value={manualBrief} onFocus={e => e.currentTarget.select()} className="mt-2 min-h-48 w-full rounded-lg bg-muted p-4" /></label>}
      <label className="flex flex-col gap-2 text-sm xl:hidden">Explore a topic from the full title history
        <select aria-label="Explore a topic" value={topic?.term ?? ""} className={control} onChange={e => { setTopic(topics.find(t => t.term === e.target.value) ?? null); setQuery(""); setChannel(""); setMinimum(0); setSavedOnly(false); setLimit(12) }}>
          <option value="">{analysisLoading ? "Reading topics…" : "All topics"}</option>
          {topics.map(t => <option key={t.term} value={t.term}>{t.term} · {topicLabel(t)} · {t.channelCount}/{ideation?.coverage.channelCount} channels</option>)}
        </select>
      </label>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <div className="space-y-3 border-b border-border p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold"><SlidersHorizontal size={16} className="text-primary" /> Outlier explorer</h3>
              <button aria-pressed={savedOnly} onClick={() => { setSavedOnly(!savedOnly); setQuery(""); setChannel(""); setTopic(null); setLimit(12) }} className={`${control} flex items-center gap-2 ${savedOnly ? "text-primary" : "text-muted-foreground"}`}><Bookmark size={15} /> Shortlist · {shortlist.length}</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={`${control} flex min-w-40 flex-1 items-center gap-2`}><Search size={16} className="shrink-0 text-muted-foreground" /><input aria-label="Search video titles or channels" placeholder="Search titles or channels…" value={query} onChange={e => { setQuery(e.target.value); setLimit(12) }} className="min-w-0 flex-1 bg-transparent py-2 outline-none" /></label>
              <select aria-label="Filter channel" className={control} value={channel} onChange={e => { setChannel(e.target.value); setLimit(12) }}><option value="">All channels</option>{handles.map(h => <option key={h}>{h}</option>)}</select>
              <select aria-label="Minimum source outlier score" disabled={savedOnly} className={control} value={minimum} onChange={e => { setMinimum(Number(e.target.value)); setLimit(12) }}><option value={0}>All tracked videos</option><option value={3}>Score ≥ 3</option><option value={5}>Score ≥ 5</option><option value={10}>Score ≥ 10</option></select>
              <select aria-label="Sort videos" className={control} value={sort} onChange={e => setSort(e.target.value)}><option value="score">Highest outlier score</option><option value="pace">Highest views/day</option><option value="recent">Newest published</option></select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span role="status">{filtered.length} videos · {new Set(filtered.map(v => v.handle)).size} channels · {range} snapshot window</span>
              {topic && <button onClick={() => setTopic(null)} className="rounded-md bg-primary/10 px-2 py-1 text-primary">Topic: {topic.term} ×</button>}
            </div>
          </div>
          {patterns.length > 0 && <div className="border-b border-border bg-primary/5 px-5 py-3"><p className="mb-2 text-xs font-medium text-muted-foreground">What these videos have in common</p><div className="flex flex-wrap gap-2">{patterns.map(p => <span key={p.key} className="rounded-md bg-muted px-2.5 py-1.5 text-xs">{p.label} <span className="text-muted-foreground">· {p.count} videos / {p.channels} channels</span></span>)}</div><p className="mt-2 text-xs text-muted-foreground">These title framings appear on at least two channels. Study how each delivers its promise; wording alone does not explain performance.</p></div>}
          {!patterns.length && <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">No shared title framing across channels in this selection. Broaden the filters to compare more references.</p>}
          {filtered.length === 0 ? <div className="px-6 py-16 text-center"><h4 className="font-medium">{savedOnly && !shortlist.length ? "Your shortlist is empty" : "No videos match this view"}</h4><p className="mt-2 text-sm text-muted-foreground">{savedOnly && !shortlist.length ? "Save reference videos with the bookmark button, then copy them into a brief." : topic ? "This topic appears in the full title history, but no references match your current snapshot window and filters." : "Try a lower score, another channel, or clear the search."}</p><button className={`${control} mt-5`} onClick={() => { setQuery(""); setChannel(""); setMinimum(0); setTopic(null); setSavedOnly(false) }}>Show all tracked videos</button></div> :
            <div className="grid gap-x-5 gap-y-7 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">{filtered.slice(0, limit).map(v => {
              const framing = ARCHETYPES.filter(a => a.key !== "person" && a.test.test(v.title)).slice(0, 2)
              return <article key={v.videoId} className="min-w-0">
                <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`} target="_blank" rel="noreferrer" className="group relative block aspect-video overflow-hidden rounded-lg bg-muted focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Watch ${v.title}`}>
                  <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Video reference</span>
                  {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = "none" }} className="relative h-full w-full object-cover" />}
                  <span className="absolute left-2 top-2 rounded-md bg-black/85 px-2 py-1 text-xs font-semibold text-white">{v.outlierScore.toFixed(1)} source score</span>
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">{v.durationHms}</span>
                </a>
                <div className="mt-3 flex items-start gap-2"><a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`} target="_blank" rel="noreferrer" className="line-clamp-2 flex-1 text-sm font-medium leading-5 hover:text-primary">{v.title}</a><button aria-label={`${saved.has(v.videoId) ? "Remove from" : "Add to"} shortlist: ${v.title}`} aria-pressed={saved.has(v.videoId)} onClick={() => toggleSaved(v.videoId)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-primary focus-visible:outline-2 focus-visible:outline-primary">{saved.has(v.videoId) ? <Check size={16} /> : <Bookmark size={16} />}</button></div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{v.handle} · {v.publishedAt.slice(0, 10)}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums"><span className="font-semibold">{v.viewsPerDay === null ? "—" : formatCount(v.viewsPerDay)} <span className="text-xs font-normal text-muted-foreground">views/day</span></span><span>{formatCount(v.views)} <span className="text-xs text-muted-foreground">total views</span></span></div>
                <div className="mt-2 flex flex-wrap gap-1">{framing.map(f => <span key={f.key} className="rounded bg-muted/70 px-1.5 py-1 text-[11px] text-muted-foreground">{f.label}</span>)}</div>
              </article>
            })}</div>}
          {filtered.length > limit && <button onClick={() => setLimit(limit + 12)} className={`${control} mx-5 mb-5`}>Show more · {filtered.length - limit} remaining</button>}
          <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">Scores come from the tracking pipeline; they are separate from title-pattern percentiles. Views/day uses observed snapshots. Older windows may overrepresent retained outliers. Shortlist lasts until you switch niche, format, range, refresh, or reload.</p>
        </Panel>
        <aside className="space-y-4">
          <Panel>
            <div className="border-b border-border p-5"><h3 className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-primary" /> Which topics are worth exploring?</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Full tracked title history, independent of the snapshot window. Select a topic to study matching references.</p></div>
            <div className="divide-y divide-border px-4">{topics.slice(0, topicLimit).map(t => <button key={t.term} aria-pressed={topic?.term === t.term} onClick={() => { setTopic(topic?.term === t.term ? null : t); setQuery(""); setChannel(""); setMinimum(0); setSavedOnly(false); setLimit(12) }} className={`w-full rounded-lg px-1 py-4 text-left focus-visible:outline-2 focus-visible:outline-primary ${topic?.term === t.term ? "bg-primary/10" : "hover:bg-muted/50"}`}>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold capitalize">{t.term}</span></div>
              <div className="mt-2 flex justify-between gap-2 text-xs"><span className={t.isSaturated ? "text-amber-400" : t.isWhitespace ? "text-emerald-400" : "text-muted-foreground"}>{topicLabel(t)}</span><span className="text-muted-foreground">{t.channelCount}/{ideation?.coverage.channelCount} channels</span></div>
              <div className="my-2 h-1 rounded-full bg-muted"><div className={`h-1 rounded-full ${t.isSaturated ? "bg-amber-400" : "bg-primary"}`} style={{ width: `${100 * t.channelCount / Math.max(1, ideation?.coverage.channelCount ?? 1)}%` }} /></div>
              <p className="mb-2 text-sm leading-relaxed">{(ideation?.coverage.channelCount ?? 0) < 3 ? "Too few channels to judge competition. Add more comparisons before deciding." : t.isSaturated ? "Find a distinct angle: this topic is widely used here." : t.isWhitespace ? (t.rankedChannelCount ?? t.channelCount) === 1 ? "Worth investigating, but validate beyond this one channel." : "Worth a small test; evidence is still limited." : "Compare the strongest examples before choosing your angle."}</p><p className="mb-2 text-xs text-muted-foreground">{t.medianPercentile >= 65 ? "Strong relative performance" : t.medianPercentile >= 55 ? "Above the typical upload" : t.medianPercentile >= 45 ? "Around the typical upload" : "Below the typical upload"} · median <PercentileChip value={t.medianPercentile} /></p><p className="text-xs text-muted-foreground">{t.videoCount} ranked videos · {(t.rankedChannelCount ?? t.channelCount) === 1 ? "single-channel evidence" : `${t.rankedChannelCount ?? t.channelCount} channels with ranked evidence`}</p>
            </button>)}</div>
            {topics.length > topicLimit && <button className={`${control} mx-4 mt-3`} onClick={() => setTopicLimit(n => n + 8)}>Show more topics</button>}
            {!topics.length && <p role="status" className="p-5 text-sm text-muted-foreground">{analysisLoading ? "Reading the title history…" : analysisError ?? ideation?.emptyReason ?? "Not enough topic evidence yet. You can still explore tracked videos."}</p>}
            <p className="px-5 pt-5 text-xs leading-relaxed text-muted-foreground">Usage across tracked channels is a saturation proxy, not proof of market saturation or unmet demand. Validate signals from just one channel.</p><details className="p-5 text-xs leading-relaxed text-muted-foreground"><summary className="cursor-pointer rounded py-1">How topics are assessed</summary><p className="mt-3">Crowded: used by ≥60% of channels tracked in this format. Early signal: below that threshold, ≤2 channels, ≥4 ranked videos and median p65+. Contested: other eligible topics. Adoption includes all tracked titles; performance uses only rankable videos. This is a saturation proxy, not proof of market saturation or unmet demand. A median p65 means the middle example ranks around the 65th percentile of its own channel and format; p50 is typical. Age and sampling effects remain.</p></details>
          </Panel>
          <button onClick={onInspectEvidence} className="flex items-center justify-between rounded-xl bg-muted/40 p-4 text-sm font-medium hover:bg-muted">Inspect channel similarities <ArrowUpRight size={16} /></button>
        </aside>
      </div>
    </section>
  )
}
