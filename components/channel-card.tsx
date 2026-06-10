"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { Channel } from "@/lib/constants"

interface ChannelCardProps {
  channel: Channel
  isActive: boolean
  onClick: () => void
}

export function ChannelCard({ channel, isActive, onClick }: ChannelCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-all duration-200",
        "hover:bg-sidebar-accent/50",
        isActive
          ? "border-l-4 border-l-primary bg-sidebar-accent border-sidebar-border"
          : "border-transparent"
      )}
    >
      {/* Row 1: Channel name */}
      <p className="font-semibold text-sidebar-foreground truncate text-sm">
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

      {/* Row 5: Shared on date */}
      <p className="text-xs text-muted-foreground mt-1">
        Shared on {channel.sharedOn}
      </p>
    </button>
  )
}
