"use client"

import { useState, useRef, useEffect } from "react"
import { MoreVertical, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { Channel } from "@/lib/constants"
import type { ChannelScore, FormatClass } from "@/lib/scoring/types"

/** Short cohort tag shown beside the score bar. */
const FORMAT_TAG: Record<FormatClass, string> = {
  LONG_FORM: "LF",
  SHORTS: "SH",
  BOTH: "L+S",
}

const FORMAT_TITLE: Record<FormatClass, string> = {
  LONG_FORM: "Scored against the long-form cohort",
  SHORTS: "Scored against the Shorts cohort",
  BOTH: "Publishes both — scored against each cohort, blended by view share",
}

/**
 * Score band colour. Always paired with the number and the bar length, never
 * the only carrier of the value — colour alone fails colour-blind readers and
 * is unreadable at this bar height.
 */
function scoreTone(score: number): string {
  if (score >= 70) return "bg-emerald-400"
  if (score >= 40) return "bg-sky-400"
  return "bg-slate-500"
}

/** The full breakdown, shown on hover over the bar and the score. */
function scoreTitle(score: ChannelScore): string {
  const lines = [
    `Rank #${score.rank} of ${score.cohortSize} in the ${FORMAT_TAG[score.formatSplit.formatClass]} cohort · combined ${score.combinedScore}`,
    `Channel ${score.channelScore} (75%) · Niche ${score.nicheScore ?? "—"} (25%) — both scored within this cohort`,
    FORMAT_TITLE[score.formatSplit.formatClass] +
      ` — ${score.formatSplit.longFormVideos} long-form / ${score.formatSplit.shortsVideos} Shorts tracked`,
    "",
    ...score.components.map(
      (c) => `${c.label}: ${c.score ?? "—"} (${c.displayValue}, weight ${Math.round(c.weight * 100)}%)`
    ),
    "",
    score.createdAt
      ? `Created ${score.createdAt} · ${score.channelAgeDays}d old · ${score.totalVideos} videos`
      : `Creation date unavailable · ${score.totalVideos} videos`,
    `Confidence: ${score.confidence}. ${score.confidenceReason}`,
  ]
  return lines.join("\n")
}

interface ChannelCardProps {
  channel: Channel
  isActive: boolean
  needsAudit?: boolean
  /** Ranking for this channel. Absent when the channel is not tracked in Neon. */
  score?: ChannelScore
  onClick: () => void
  onDeleteClick: () => void
}

export function ChannelCard({ channel, isActive, needsAudit, score, onClick, onDeleteClick }: ChannelCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}
      className={cn(
        "relative w-full text-left p-3 rounded-lg border transition-all duration-200 cursor-pointer",
        "hover:bg-sidebar-accent/50",
        isActive
          ? "border-l-4 border-l-primary bg-sidebar-accent border-sidebar-border"
          : "border-transparent"
      )}
    >
      {/* Overflow menu */}
      <div
        ref={menuRef}
        className="absolute top-2 right-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          aria-label="Channel options"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-2xl min-w-[140px] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
            <button
              onClick={() => { setMenuOpen(false); onDeleteClick() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete channel
            </button>
          </div>
        )}
      </div>

      {/* Row 1: rank · channel name · combined score.
          Amber dot = missing classification, needs audit. */}
      <p className="font-semibold text-sidebar-foreground truncate text-sm pr-6 flex items-center gap-1.5">
        {score && (
          <span
            className="flex-shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground"
            title={
              `Rank ${score.rank} of ${score.cohortSize} within the ` +
              `${FORMAT_TITLE[score.formatSplit.formatClass].toLowerCase()}. ` +
              "Long-form and Shorts are ranked separately, so each has its own #1."
            }
          >
            #{score.rank}
            <span className="ml-0.5 text-[9px] uppercase opacity-70">
              {FORMAT_TAG[score.formatSplit.formatClass]}
            </span>
          </span>
        )}
        {needsAudit && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
            title="Needs audit — missing niche, category or produced-by"
          />
        )}
        <span className="truncate">{channel.handle}</span>
        {score && (
          <span
            className="ml-auto flex-shrink-0 text-xs font-semibold tabular-nums text-foreground"
            title={scoreTitle(score)}
          >
            {score.combinedScore}
          </span>
        )}
      </p>

      {/* Row 2: @handle - removed as it's the same as above, showing name without @ instead */}
      <p className="text-xs text-muted-foreground mt-0.5 truncate">
        {channel.handle.replace("@", "")}
      </p>

      {/* Row 3: Type badge + Category badge */}
      <div className="flex items-center gap-2 mt-2">
        <Badge
          variant="secondary"
          className={cn(
            "text-xs px-2 py-0.5 flex-shrink-0",
            channel.type === "Shorts"
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
          )}
        >
          {channel.type}
        </Badge>
        <Badge
          variant="secondary"
          className="text-xs px-2 py-0.5 bg-primary/20 text-primary hover:bg-primary/30 flex-shrink-0"
        >
          {channel.niche}
        </Badge>
      </div>

      {/* Row 4: Category in small muted italic text */}
      <p className="text-xs text-muted-foreground italic mt-1.5">
        {channel.category}
      </p>

      {channel.nicheGroup && (
        <div className="mt-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{channel.nicheGroup}</span>
        </div>
      )}

      {/* Row 5: combined-score bar + cohort tag. Hover for the full breakdown. */}
      {score && (
        <div className="mt-2 flex items-center gap-2" title={scoreTitle(score)}>
          <div
            role="meter"
            aria-valuenow={score.combinedScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Combined score ${score.combinedScore} of 100, rank ${score.rank}`}
            className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                scoreTone(score.combinedScore),
                // A low-confidence score is real but thinly evidenced — dim it
                // rather than hide it, so the bar is never read as certain.
                score.confidence === "low" && "opacity-50"
              )}
              style={{ width: `${Math.max(2, score.combinedScore)}%` }}
            />
          </div>
        </div>
      )}

      {/* Row 6: Shared on date */}
      <p className="text-xs text-muted-foreground mt-1">
        Shared on {channel.sharedOn}
      </p>
    </div>
  )
}
