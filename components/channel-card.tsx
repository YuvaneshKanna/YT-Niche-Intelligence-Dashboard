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
      <p className="font-semibold text-sidebar-foreground truncate">
        {channel.handle}
      </p>
      <div className="flex items-center gap-2 mt-1.5">
        <Badge
          variant="secondary"
          className={cn(
            "text-xs px-2 py-0.5",
            channel.type === "Shorts"
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
          )}
        >
          {channel.type}
        </Badge>
        <Badge
          variant="secondary"
          className="text-xs px-2 py-0.5 bg-primary/20 text-primary hover:bg-primary/30"
        >
          {channel.category}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">
        Posted by {channel.postedBy}
      </p>
    </button>
  )
}
