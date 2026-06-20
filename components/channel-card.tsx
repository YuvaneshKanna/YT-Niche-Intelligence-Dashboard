"use client"

import { useState, useRef, useEffect } from "react"
import { MoreVertical, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { Channel } from "@/lib/constants"

interface ChannelCardProps {
  channel: Channel
  isActive: boolean
  onClick: () => void
  onDeleteClick: () => void
}

export function ChannelCard({ channel, isActive, onClick, onDeleteClick }: ChannelCardProps) {
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

      {/* Row 1: Channel name */}
      <p className="font-semibold text-sidebar-foreground truncate text-sm pr-6">
        {channel.handle}
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

      {/* Row 5: Shared on date */}
      <p className="text-xs text-muted-foreground mt-1">
        Shared on {channel.sharedOn}
      </p>
    </div>
  )
}
