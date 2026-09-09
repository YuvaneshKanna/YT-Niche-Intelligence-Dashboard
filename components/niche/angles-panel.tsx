"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles, TriangleAlert } from "lucide-react"
import type { VideoType } from "@/lib/metrics/types"
import { chatHeaders, loadSettings } from "@/lib/settings"
import { EmptyPanel, Panel, PanelHeader, SampleNote } from "./ui"

interface Cluster {
  name: string
  whatItIs: string
  examples: string[]
  verdict: string
}

interface Angle {
  title: string
  why: string
  groundedIn: string
  risk: string
}

interface AnglesData {
  readOfTheNiche: string
  clusters: Cluster[]
  angles: Angle[]
}

const VERDICT_TONE: Record<string, string> = {
  "over-served": "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  working: "bg-primary/15 text-primary ring-primary/30",
  thin: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
}

/**
 * The semantic layer, on demand.
 *
 * Everything else on this page is arithmetic and free. This panel calls a model,
 * so it never runs on load — the user asks for it, and the result is cached
 * server-side for six hours. The button says what it will do rather than hiding
 * the cost behind an automatic refresh.
 *
 * The model is given the deterministic analysis and told not to invent numbers.
 * Every angle it returns carries the evidence row it was grounded in, so a
 * claim with no basis in the data is visible as one.
 */
export function AnglesPanel({
  group,
  videoType,
  disabled,
}: {
  group: string
  videoType: VideoType
  disabled: boolean
}) {
  const [data, setData] = useState<AnglesData | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A different niche or format is a different question; drop the old answer
  // rather than leaving it on screen under a new heading.
  useEffect(() => {
    setData(null)
    setGeneratedAt(null)
    setError(null)
  }, [group, videoType])

  const generate = useCallback(
    (refresh = false) => {
      setLoading(true)
      setError(null)
      fetch("/api/niche-angles", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...chatHeaders(loadSettings()) },
        body: JSON.stringify({ group, format: videoType, refresh }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (!json.success) {
            setError(json.error || "Could not generate angles")
            return
          }
          setData(json.data as AnglesData)
          setGeneratedAt(json.generatedAt ?? null)
        })
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Network error")
        )
        .finally(() => setLoading(false))
    },
    [group, videoType]
  )

  return (
    <Panel id="angles">
      <PanelHeader
        title="Angles to test next"
        hint={
          generatedAt
            ? `generated ${new Date(generatedAt).toLocaleString()}`
            : "AI proposals · generated only when you ask"
        }
        right={
          <button
            onClick={() => generate(data !== null)}
            disabled={loading || disabled}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? "Analysing…" : data ? "Regenerate" : "Generate angles"}
          </button>
        }
      />

      {error && (
        <div className="flex items-start gap-2 border-b border-border bg-destructive/5 px-4 py-2.5">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
          <p className="text-[11px] leading-relaxed text-foreground">{error}</p>
        </div>
      )}

      {!data && !loading && (
        <EmptyPanel>
          {disabled
            ? "There is not enough published history in this niche to analyse."
            : "Generate possible titles and angles from this niche’s measured evidence. These are proposals to validate, not proven opportunities. Uses your configured AI account and may incur API charges; cached for six hours."}
        </EmptyPanel>
      )}

      {loading && !data && (
        <EmptyPanel>Reading the corpus and the analysis. This takes a few seconds.</EmptyPanel>
      )}

      {data && (
        <div className="flex flex-col">
          {data.readOfTheNiche && (
            <div className="border-b border-border px-4 py-3">
              <p className="text-[12px] leading-relaxed text-foreground">{data.readOfTheNiche}</p>
            </div>
          )}

          {data.clusters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
              {data.clusters.map((c) => (
                <span
                  key={c.name}
                  title={`${c.whatItIs}${c.examples.length ? `\n\ne.g. ${c.examples.join(" · ")}` : ""}`}
                  className={`cursor-default rounded-md px-2 py-1 text-[11px] ring-1 ring-inset transition-colors ${
                    VERDICT_TONE[c.verdict] ?? "bg-muted text-muted-foreground ring-border"
                  }`}
                >
                  {c.name}
                  <span className="ml-1.5 opacity-70">{c.verdict}</span>
                </span>
              ))}
            </div>
          )}

          <ul className="flex flex-col divide-y divide-border/60">
            {data.angles.map((a, i) => (
              <li key={a.title} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-foreground">{a.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{a.why}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="text-foreground/70">Grounded in:</span> {a.groundedIn}
                    </p>
                    {a.risk && (
                      <p className="text-[11px] text-muted-foreground">
                        <span className="text-foreground/70">Risk:</span> {a.risk}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-border px-4 py-2">
            <SampleNote>
              Written by Claude from the measured analysis on this page. The numbers it cites are
              the ones above; the angles themselves are proposals, not findings.
            </SampleNote>
          </div>
        </div>
      )}
    </Panel>
  )
}
