"use client"

import { useEffect, useState } from "react"
import { RefreshCw, Sparkles, X } from "lucide-react"
import type { NicheInsight } from "@/lib/metrics/insights"

interface InsightsDrawerProps {
  open: boolean
  onClose: () => void
  /** Currently selected niche group; its insight is shown first. */
  nicheGroup: string | null
}

/**
 * Displays analysis produced out-of-band by a Claude Code session and written
 * to the AI_Insights tab. The dashboard reads that tab — it never calls Claude
 * itself, so no model credentials live in the deployed app.
 *
 * Slides over the fixed 1920x1080 canvas rather than taking a band of it.
 */
export function InsightsDrawer({ open, onClose, nicheGroup }: InsightsDrawerProps) {
  const [insights, setInsights] = useState<NicheInsight[]>([])
  const [tabMissing, setTabMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = (refresh = false) => {
    setLoading(true)
    setError(null)
    fetch(`/api/insights${refresh ? "?refresh=1" : ""}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          setError(json.error || "Failed to load insights")
          return
        }
        setInsights(json.insights ?? [])
        setTabMissing(Boolean(json.tabMissing))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Network error"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open && insights.length === 0 && !error) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Escape closes, matching the rest of the app's overlay behaviour.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const selected = insights.find((i) => i.nicheGroup === nicheGroup)
  const others = insights.filter((i) => i.nicheGroup !== nicheGroup)
  const ordered = selected ? [selected, ...others] : insights

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Claude analysis"
        className="fixed right-0 top-0 z-50 flex h-screen w-[520px] max-w-[92vw] flex-col border-l border-border bg-card shadow-2xl"
      >
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Claude analysis</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => load(true)}
              disabled={loading}
              aria-label="Reload insights"
              className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && insights.length === 0 && (
            <p className="text-sm text-muted-foreground">Loading analysis…</p>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-foreground">{error}</p>
            </div>
          )}

          {!loading && !error && tabMissing && <EmptyState reason="missing" />}
          {!loading && !error && !tabMissing && insights.length === 0 && (
            <EmptyState reason="empty" />
          )}

          <div className="space-y-4">
            {ordered.map((insight) => (
              <article
                key={insight.nicheGroup}
                className={`rounded-xl border p-3 ${
                  insight.nicheGroup === nicheGroup
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{insight.nicheGroup}</h3>
                  {insight.confidence && (
                    <span className="flex-shrink-0 rounded border border-border px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                      {insight.confidence}
                    </span>
                  )}
                </div>

                {insight.headline && (
                  <p className="mb-2 text-xs font-medium text-foreground">{insight.headline}</p>
                )}

                <InsightBody text={insight.body} />

                <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  {[insight.generatedAt, insight.range, insight.author]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}

/** Renders the body as paragraphs and bullets. Plain text only — never HTML. */
function InsightBody({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
        if (bullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">{bullet[1]}</p>
            </div>
          )
        }
        return (
          <p key={i} className="text-xs leading-relaxed text-muted-foreground">
            {line}
          </p>
        )
      })}
    </div>
  )
}

function EmptyState({ reason }: { reason: "missing" | "empty" }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-medium text-foreground">No analysis yet</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {reason === "missing"
          ? "The AI_Insights tab does not exist in the metrics spreadsheet yet."
          : "The AI_Insights tab is empty."}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Run the analysis from a Claude Code session:
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/50 p-2 text-[11px] text-foreground">
        <code>claude -p &quot;/analyze-niches&quot;</code>
      </pre>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Works headless in any sandbox, or on a schedule as a Routine. The job writes the
        tab; this page only reads it.
      </p>
    </div>
  )
}
