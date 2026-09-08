// What a niche makes, and which of it works.
//
// This is the analysis /metrics cannot do: it reads the permanent title corpus
// (lib/metrics/neon.ts readNicheCorpus) rather than the windowed snapshot
// aggregate, so it can speak about a channel's whole published history.
//
// ── The bias that shapes every number here ───────────────────────────────
// Raw view counts cannot be compared across a niche. A 2023 upload has had
// three years to accumulate; a channel with 500K subscribers starts every
// video ahead of one with 5K. Comparing medians of raw views measures age and
// channel size, then presents the result as a finding about ideas.
//
// So the primary statistic is never views. It is the video's PERCENTILE among
// the other videos its own channel published in the same format. A title
// pattern sitting at the 78th percentile means: when this channel used this
// pattern, it ranked above roughly 78% of its own tracked work. This reduces
// channel-scale effects; upload age, retention and sampling biases remain.
//
// Raw views-per-day is carried alongside so the UI can show a real number,
// but every ranking, every lift and every recommendation uses the percentile.

import type { Confidence, VideoType } from "@/lib/metrics/types"
import type { CorpusVideo } from "@/lib/metrics/neon"

// ── Sample-size policy, shared with lib/niche/recommend.ts ───────────────
const MIN_ARCHETYPE_VIDEOS = 5
const MIN_TERM_VIDEOS = 4
const MIN_VOCAB_FOR_OVERLAP = 20
const MEDIUM_SAMPLE = 12
const HIGH_SAMPLE = 30

function confidenceFrom(n: number): Confidence {
  if (n >= HIGH_SAMPLE) return "high"
  if (n >= MEDIUM_SAMPLE) return "medium"
  return "low"
}

// ── Title archetypes ─────────────────────────────────────────────────────
//
// Structural patterns, not topics. Each one is a way of FRAMING an idea, and
// the question the panel answers is which framings this niche's audience
// rewards. Ordered most to least specific: a title matches every archetype
// whose test it passes, deliberately — "Why Nobody Talks About The Collapse"
// is a question AND a negation AND a threat, and all three are true of it.

export interface ArchetypeSpec {
  key: string
  label: string
  /** What the pattern is, in the panel's own words. */
  description: string
  test: RegExp
}

export const ARCHETYPES: ArchetypeSpec[] = [
  {
    key: "question",
    label: "Question",
    description: "Opens with an interrogative or ends in a question mark",
    test: /^(why|how|what|when|who|where|is|are|does|do|can|should|did|will|would)\b|\?\s*$/i,
  },
  {
    key: "threat",
    label: "Collapse / threat",
    description: "Frames the subject as breaking, ending or in danger",
    test: /\b(crisis|collapse|crash|danger|end of|dying|dead|broke|broken|failing|reset|warning|disaster|destroy(ed|ing)?|ruin(ed|ing)?|lost)\b/i,
  },
  {
    key: "urgency",
    label: "Urgency / now",
    description: "Anchors the idea to this moment",
    test: /\b(now|today|is coming|about to|just|breaking|finally|no longer|anymore|this (week|month|year))\b/i,
  },
  {
    key: "secret",
    label: "Secret / hidden truth",
    description: "Promises information being withheld",
    test: /\b(secret|truth|real reason|hidden|nobody|no one|what really|they don'?t want|behind the)\b/i,
  },
  {
    key: "negation",
    label: "Negation",
    description: "Built on a never, nobody or not",
    test: /\b(never|nobody|no one|nothing|stop(ped)?|isn'?t|doesn'?t|don'?t|wasn'?t|won'?t|can'?t|not)\b/i,
  },
  {
    key: "number",
    label: "Number-led",
    description: "A count carries the promise",
    test: /^\d+\b|\b\d+\s+(things|ways|reasons|facts|times|rules|mistakes|signs|secrets)\b/i,
  },
  {
    key: "superlative",
    label: "Superlative",
    description: "Claims an extreme: most, best, worst",
    test: /\b(most|best|worst|biggest|greatest|richest|deadliest|craziest|largest|strongest|smallest|oldest)\b/i,
  },
  {
    key: "versus",
    label: "Versus",
    description: "Sets two subjects against each other",
    test: /\bvs\.?\b|\bversus\b/i,
  },
  {
    key: "person",
    label: "Named person or place",
    description: "A specific proper noun carries the title",
    // Two+ capitalised words in a row, past the first word — Title Case makes
    // single capitals meaningless, but a run of them is usually a real name.
    test: /\s[A-Z][a-z']+\s[A-Z][a-z']+/,
  },
  {
    key: "story",
    label: "Story / narrative",
    description: "Tells what happened to someone",
    test: /\b(story|happened|became|turned|went from|built|survived|escaped|lost everything)\b/i,
  },
]

// ── Tokenisation ─────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    "the a an and or of to in for on at by is are was were be been being it its this that with from as " +
    "how why what when who where you your yours i we they them he she his her their our my me do does did " +
    "not no but if then than so about into over under out up down more most just now new all one two three " +
    "can could will would should has have had get got make made take took go goes going come came see saw " +
    "like really very much many any every some there here also even still yet own same other another such " +
    "s t re ve ll d m o y " +
    // Generic intensifiers and units. They pass the content-word test but name
    // no subject, and without this they dominate the topic list with terms no
    // one could act on ("once", 5 uses, high percentile — a coincidence, not
    // an opening). Words that carry real subject matter stay in.
    "once entire whole actually literally basically ever thing things lot bit kind sort " +
    "way ways time times day days year years part parts full"
  ).split(/\s+/)
)

/** Content words of a title: lowercase, no stopwords, no numerals, 3+ chars. */
export function contentWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
}

/** Content words plus adjacent pairs — "debt crisis" is one idea, not two. */
export function terms(title: string): string[] {
  const words = contentWords(title)
  const out = [...words]
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]} ${words[i + 1]}`)
  return out
}

// ── Numeric helpers ──────────────────────────────────────────────────────

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const round = (n: number, dp = 1): number => Number(n.toFixed(dp))

// ── Scoring ──────────────────────────────────────────────────────────────

export interface ScoredVideo extends CorpusVideo {
  viewsPerDay: number | null
  /**
   * 0-100 rank of this video's views/day among the same channel's other videos
   * in the same format. Null when the channel has too few to rank against.
   */
  percentile: number | null
}

/** How many videos a channel needs before ranking within it means anything. */
const MIN_PEERS_FOR_PERCENTILE = 4

export function scoreCorpus(corpus: CorpusVideo[]): ScoredVideo[] {
  const withVpd = corpus.map((v) => ({
    ...v,
    viewsPerDay: v.views === null ? null : v.views / Math.max(1, v.observedDays),
    percentile: null as number | null,
  }))

  // Rank within channel AND format: a channel's Shorts and long-form are
  // different populations, and mixing them makes every Short look like a hit.
  const buckets = new Map<string, ScoredVideo[]>()
  for (const v of withVpd) {
    if (v.viewsPerDay === null) continue
    const key = `${v.channelId}::${v.videoType}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(v)
    else buckets.set(key, [v])
  }

  for (const bucket of buckets.values()) {
    if (bucket.length < MIN_PEERS_FOR_PERCENTILE) continue
    const sorted = [...bucket].sort((a, b) => (a.viewsPerDay ?? 0) - (b.viewsPerDay ?? 0))
    for (let start = 0; start < sorted.length;) {
      let end = start + 1
      while (end < sorted.length && sorted[end].viewsPerDay === sorted[start].viewsPerDay) end++
      // Equal measured performance must receive equal ranks, regardless of
      // input order. An entirely tied channel sits at p50.
      const percentile = round(((start + end) / 2 / sorted.length) * 100, 1)
      for (let i = start; i < end; i++) sorted[i].percentile = percentile
      start = end
    }
  }

  return withVpd
}

// ── Panel 1: which framings win ──────────────────────────────────────────

export interface ArchetypeResult {
  key: string
  label: string
  description: string
  videoCount: number
  /** Share of the format's videos using this framing. */
  sharePct: number
  /** Distinct channels that use it — 1 means it is one creator's habit. */
  channelCount: number
  /** Median percentile of videos using it. 50 = no better than the niche's norm. */
  medianPercentile: number
  medianViewsPerDay: number | null
  confidence: Confidence
  /** Best-performing examples, for the hover. */
  examples: Array<{ title: string; handle: string; percentile: number | null }>
}

/**
 * Above this share of the corpus an archetype stops discriminating. "Named
 * person or place" matches 88% of a football niche's titles and lands at
 * exactly par, which is not a finding — it is the regex describing Title Case.
 * A pattern that nearly everything matches cannot explain why some of it wins.
 */
const MAX_ARCHETYPE_SHARE = 0.7

export function archetypeResults(scored: ScoredVideo[]): ArchetypeResult[] {
  const ranked = scored.filter((v) => v.percentile !== null)
  if (ranked.length === 0) return []

  const results: ArchetypeResult[] = []
  for (const spec of ARCHETYPES) {
    const hits = ranked.filter((v) => spec.test.test(v.title))
    if (hits.length < MIN_ARCHETYPE_VIDEOS) continue
    if (hits.length / ranked.length > MAX_ARCHETYPE_SHARE) continue
    const percentiles = hits.map((v) => v.percentile as number)
    results.push({
      key: spec.key,
      label: spec.label,
      description: spec.description,
      videoCount: hits.length,
      sharePct: round((hits.length / ranked.length) * 100),
      channelCount: new Set(hits.map((v) => v.handle)).size,
      medianPercentile: round(median(percentiles) ?? 50),
      medianViewsPerDay: median(hits.map((v) => v.viewsPerDay ?? 0)),
      confidence: confidenceFrom(hits.length),
      examples: [...hits]
        .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))
        .slice(0, 3)
        .map((v) => ({ title: v.title, handle: v.handle, percentile: v.percentile })),
    })
  }
  return results.sort((a, b) => b.medianPercentile - a.medianPercentile)
}

// ── Panel 2: who is ideating from the same well ──────────────────────────

export interface OverlapPair {
  a: string
  b: string
  /** Jaccard similarity of the two channels' title vocabularies, 0-100. */
  similarity: number
  /** The terms they most conspicuously share. */
  shared: string[]
}

export interface OverlapResult {
  /** Every pair above the vocabulary floor, sorted most similar first. */
  pairs: OverlapPair[]
  /** Channels included, in a stable order — the matrix axis. */
  handles: string[]
  /** Median similarity across all pairs: the niche's overall copy level. */
  medianSimilarity: number | null
}

export function overlapResult(scored: ScoredVideo[]): OverlapResult {
  const vocab = new Map<string, Map<string, number>>()
  for (const v of scored) {
    let bag = vocab.get(v.handle)
    if (!bag) {
      bag = new Map()
      vocab.set(v.handle, bag)
    }
    for (const w of new Set(contentWords(v.title))) bag.set(w, (bag.get(w) ?? 0) + 1)
  }

  const handles = [...vocab.entries()]
    .filter(([, bag]) => bag.size >= MIN_VOCAB_FOR_OVERLAP)
    .map(([h]) => h)
    .sort()

  const pairs: OverlapPair[] = []
  for (let i = 0; i < handles.length; i++) {
    for (let j = i + 1; j < handles.length; j++) {
      const A = vocab.get(handles[i]) as Map<string, number>
      const B = vocab.get(handles[j]) as Map<string, number>
      const shared: Array<[string, number]> = []
      let intersection = 0
      for (const [w, countA] of A) {
        const countB = B.get(w)
        if (countB === undefined) continue
        intersection++
        shared.push([w, Math.min(countA, countB)])
      }
      const union = A.size + B.size - intersection
      if (union === 0) continue
      pairs.push({
        a: handles[i],
        b: handles[j],
        similarity: round((intersection / union) * 100),
        shared: shared
          .sort((x, y) => y[1] - x[1])
          .slice(0, 5)
          .map(([w]) => w),
      })
    }
  }

  pairs.sort((x, y) => y.similarity - x.similarity)
  return { pairs, handles, medianSimilarity: median(pairs.map((p) => p.similarity)) }
}

// ── Panel 3: the topic map ───────────────────────────────────────────────

export interface TopicTerm {
  term: string
  /** Ranked videos used for the performance median, not all title matches. */
  videoCount: number
  /** All distinct tracked channels using the term, including unrankable ones. */
  channelCount: number
  rankedChannelCount: number
  medianPercentile: number
  medianViewsPerDay: number | null
  /** True when few channels use it AND it outperforms — an opening. */
  isWhitespace: boolean
  /** True when most of the niche uses it — table stakes, not an edge. */
  isSaturated: boolean
  examples: Array<{ title: string; handle: string; percentile: number | null }>
}

/** Above this share of the niche's channels, a term is table stakes. */
const SATURATION_SHARE = 0.6
/**
 * Percentile a term must clear before "unclaimed" means "unclaimed and good".
 * Set well above par: at 60 the list fills with terms that are barely better
 * than average and merely rare, which reads as an opening but is not one.
 */
const WHITESPACE_PERCENTILE = 65

export function topicTerms(scored: ScoredVideo[], channelCount: number): TopicTerm[] {
  const ranked = scored.filter((v) => v.percentile !== null)
  const byTerm = new Map<string, ScoredVideo[]>()
  const adoption = new Map<string, Set<string>>()
  for (const v of scored) {
    for (const term of new Set(terms(v.title))) {
      const channels = adoption.get(term) ?? new Set<string>()
      channels.add(v.channelId)
      adoption.set(term, channels)
    }
  }

  for (const v of ranked) {
    for (const t of new Set(terms(v.title))) {
      const bucket = byTerm.get(t)
      if (bucket) bucket.push(v)
      else byTerm.set(t, [v])
    }
  }

  const out: TopicTerm[] = []
  for (const [term, videos] of byTerm) {
    if (videos.length < MIN_TERM_VIDEOS) continue
    const channels = adoption.get(term)!
    const medianPercentile = round(median(videos.map((v) => v.percentile as number)) ?? 50)
    const share = channelCount === 0 ? 0 : channels.size / channelCount
    out.push({
      term,
      videoCount: videos.length,
      channelCount: channels.size,
      rankedChannelCount: new Set(videos.map(v => v.channelId)).size,
      medianPercentile,
      medianViewsPerDay: median(videos.map((v) => v.viewsPerDay ?? 0)),
      // A single video repeated in the term list is not an opening; require the
      // term to have worked across more than one upload.
      isWhitespace:
        share < SATURATION_SHARE && channels.size <= 2 && medianPercentile >= WHITESPACE_PERCENTILE && videos.length >= MIN_TERM_VIDEOS,
      isSaturated: share >= SATURATION_SHARE,
      examples: [...videos]
        .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))
        .slice(0, 3)
        .map((v) => ({ title: v.title, handle: v.handle, percentile: v.percentile })),
    })
  }

  // Drop the shorter term when a bigram containing it performs the same job —
  // "debt" and "debt crisis" side by side is noise, not two topics.
  const bigrams = out.filter((t) => t.term.includes(" "))
  const covered = new Set<string>()
  for (const b of bigrams) {
    for (const part of b.term.split(" ")) {
      const single = out.find((t) => t.term === part)
      if (single && single.videoCount <= b.videoCount * 1.5) covered.add(part)
    }
  }

  return out
    .filter((t) => !covered.has(t.term))
    .sort((a, b) => b.videoCount - a.videoCount)
}

// ── Panel 4: how often the niche repeats itself ──────────────────────────

export interface RepetitionResult {
  handle: string
  videoCount: number
  /** Share of uploads whose leading term the channel had already used. */
  recycleRatePct: number
  /** Median days between two uses of the same leading term. Null when never repeated. */
  medianDaysBetweenRepeats: number | null
  /** Median percentile of repeats vs first uses — does re-running a topic still work? */
  repeatPercentile: number | null
  freshPercentile: number | null
}

export function repetitionResults(scored: ScoredVideo[]): RepetitionResult[] {
  const byChannel = new Map<string, ScoredVideo[]>()
  for (const v of scored) {
    const bucket = byChannel.get(v.handle)
    if (bucket) bucket.push(v)
    else byChannel.set(v.handle, [v])
  }

  const out: RepetitionResult[] = []
  for (const [handle, videos] of byChannel) {
    if (videos.length < MIN_ARCHETYPE_VIDEOS) continue
    const chronological = [...videos].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))

    const lastUse = new Map<string, string>()
    const gaps: number[] = []
    const repeatPercentiles: number[] = []
    const freshPercentiles: number[] = []
    let repeats = 0

    for (const v of chronological) {
      // The leading content word is the closest cheap proxy for "the subject".
      const lead = contentWords(v.title)[0]
      if (!lead) continue
      const previous = lastUse.get(lead)
      if (previous) {
        repeats++
        const days = Math.round((Date.parse(v.publishedAt) - Date.parse(previous)) / 86400000)
        if (Number.isFinite(days) && days >= 0) gaps.push(days)
        if (v.percentile !== null) repeatPercentiles.push(v.percentile)
      } else if (v.percentile !== null) {
        freshPercentiles.push(v.percentile)
      }
      lastUse.set(lead, v.publishedAt)
    }

    out.push({
      handle,
      videoCount: chronological.length,
      recycleRatePct: round((repeats / chronological.length) * 100),
      medianDaysBetweenRepeats: gaps.length === 0 ? null : Math.round(median(gaps) ?? 0),
      repeatPercentile: repeatPercentiles.length === 0 ? null : round(median(repeatPercentiles) ?? 50),
      freshPercentile: freshPercentiles.length === 0 ? null : round(median(freshPercentiles) ?? 50),
    })
  }

  return out.sort((a, b) => b.recycleRatePct - a.recycleRatePct)
}

// ── Assembly ─────────────────────────────────────────────────────────────

export interface IdeationCoverage {
  nicheGroup: string
  videoType: VideoType
  /** Videos of this format in the corpus. */
  corpusSize: number
  /** How many could be ranked against their own channel's other work. */
  rankedSize: number
  channelCount: number
  oldestPublished: string | null
  newestPublished: string | null
  /** Counts for both formats, so the UI can offer the one with data. */
  byFormat: Record<VideoType, number>
}

export interface IdeationPayload {
  coverage: IdeationCoverage
  archetypes: ArchetypeResult[]
  overlap: OverlapResult
  topics: TopicTerm[]
  repetition: RepetitionResult[]
  /** Set when the corpus is too thin to say anything. */
  emptyReason: string | null
}

export function buildIdeation(
  corpus: CorpusVideo[],
  nicheGroup: string,
  videoType: VideoType
): IdeationPayload {
  const byFormat: Record<VideoType, number> = {
    LONG_FORM: corpus.filter((v) => v.videoType === "LONG_FORM").length,
    SHORTS: corpus.filter((v) => v.videoType === "SHORTS").length,
  }

  // Score across the whole corpus first: a video's percentile is defined by
  // its channel's full output in that format, not by whatever subset is shown.
  const scored = scoreCorpus(corpus).filter((v) => v.videoType === videoType)
  const ranked = scored.filter((v) => v.percentile !== null)
  const dates = scored.map((v) => v.publishedAt).filter(Boolean).sort()
  const channels = new Set(scored.map((v) => v.handle))

  const coverage: IdeationCoverage = {
    nicheGroup,
    videoType,
    corpusSize: scored.length,
    rankedSize: ranked.length,
    channelCount: channels.size,
    oldestPublished: dates[0] ?? null,
    newestPublished: dates[dates.length - 1] ?? null,
    byFormat,
  }

  if (ranked.length < MIN_ARCHETYPE_VIDEOS * 2) {
    return {
      coverage,
      archetypes: [],
      overlap: { pairs: [], handles: [], medianSimilarity: null },
      topics: [],
      repetition: [],
      emptyReason:
        `Only ${ranked.length} ${videoType === "SHORTS" ? "Shorts" : "long-form"} video` +
        `${ranked.length === 1 ? "" : "s"} in this niche can be ranked against their own ` +
        `channel's other work. Patterns read off that few titles would be noise. ` +
        (byFormat.LONG_FORM > 0 && byFormat.SHORTS > 0
          ? "Try the other format."
          : "Add channels to this niche group to build the corpus."),
    }
  }

  return {
    coverage,
    archetypes: archetypeResults(scored),
    overlap: overlapResult(scored),
    topics: topicTerms(scored, channels.size),
    repetition: repetitionResults(scored),
    emptyReason: null,
  }
}
