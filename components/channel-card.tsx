"use client"

import { useState, useRef, useEffect } from "react"
import { MoreVertical, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { Channel } from "@/lib/constants"
import { ScoreHoverCard } from "@/components/score-hover-card"
import type { RankedEntry } from "@/lib/useRankings"

/** Pool tag shown beside the rank. Two pools only — never a combined bucket. */
const POOL_TAG = { LONG_FORM: "LF", SHORTS: "SH" } as const
const POOL_NAME = { LONG_FORM: "long-form", SHORTS: "Shorts" } as const

/** Score band colour for the inline bar. Always paired with the number beside it. */
function scoreTone(score: number): string {
  if (score >= 70) return "bg-emerald-400"
  if (score >= 40) return "bg-sky-400"
  return "bg-slate-500"
}

interface ChannelCardProps {
  channel: Channel
  isActive: boolean
  needsAudit?: boolean
  /** Placement for this channel. Absent when the channel is not tracked in Neon. */
  entry?: RankedEntry
  onClick: () => void
  onDeleteClick: () => void
}

export function ChannelCard({ channel, isActive, needsAudit, entry, onClick, onDeleteClick }: ChannelCardProps) {
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
        {entry && (
          <ScoreHoverCard
            entry={entry}
            ariaLabel={`Ranked ${entry.rank} of ${entry.poolSize} among ${POOL_NAME[entry.pool]} channels. Show score breakdown.`}
            className="flex-shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground hover:text-foreground"
          >
            #{entry.rank}
            <span className="ml-0.5 text-[9px] uppercase opacity-70">{POOL_TAG[entry.pool]}</span>
          </ScoreHoverCard>
        )}
        {!entry && (
          <span
            className="flex-shrink-0 text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground"
            title="Not scored — this handle has no matching row in Neon yet (not synced by Stage 2, or the handle changed and no longer matches)."
          >
            Not tracked
          </span>
        )}
        {needsAudit && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
            title="Needs audit — missing niche, category or produced-by"
          />
        )}
        <span className="truncate">{channel.handle}</span>
        {entry && (
          <ScoreHoverCard
            entry={entry}
            ariaLabel={`Combined score ${entry.cohort.combinedScore} of 100. Show score breakdown.`}
            className="ml-auto flex-shrink-0 text-xs font-semibold tabular-nums text-foreground hover:text-primary"
          >
            {entry.cohort.combinedScore}
          </ScoreHoverCard>
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

      {/* Row 5: combined-score bar + cohort tag. Hover for the full breakdown.
          Unscored channels get a dashed placeholder in the same slot, so the
          card rhythm stays constant and the gap reads as "no data" rather
          than a layout hiccup. */}
      {!entry && (
        <span
          className="mt-2 block h-1 w-full rounded-full border border-dashed border-muted-foreground/25"
          title="Not scored — no matching Neon row for this handle."
        />
      )}
      {entry && (
        <ScoreHoverCard
          entry={entry}
          ariaLabel={`Combined score ${entry.cohort.combinedScore} of 100, ranked ${entry.rank} of ${entry.poolSize} among ${POOL_NAME[entry.pool]} channels. Show score breakdown.`}
          className="mt-2 block w-full"
        >
          <span
            role="meter"
            aria-valuenow={entry.cohort.combinedScore}
            aria-valuemin={0}
            aria-valuemax={100}
            className="block h-1 w-full overflow-hidden rounded-full bg-white/10"
          >
            <span
              className={cn(
                "block h-full rounded-full transition-all duration-300",
                scoreTone(entry.cohort.combinedScore),
                // A low-confidence score is real but thinly evidenced — dim it
                // rather than hide it, so the bar is never read as certain.
                entry.score.confidence === "low" && "opacity-50"
              )}
              style={{ width: `${Math.max(2, entry.cohort.combinedScore)}%` }}
            />
          </span>
        </ScoreHoverCard>
      )}

      {/* Row 6: Shared on date */}
      <p className="text-xs text-muted-foreground mt-1">
        Shared on {channel.sharedOn}
      </p>
    </div>
  )
}
