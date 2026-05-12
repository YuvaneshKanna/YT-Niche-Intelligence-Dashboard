"use client"

import { Play } from "lucide-react"
import type { Video } from "@/lib/constants"

interface VideoCardProps {
  video: Video
  onClick: () => void
}

export function VideoCard({ video, onClick }: VideoCardProps) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg overflow-hidden transition-all duration-200 hover:scale-[1.02]"
    >
      <div className="relative aspect-video bg-zinc-800 rounded-lg overflow-hidden flex items-center justify-center">
        <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center group-hover:bg-primary/90 transition-colors duration-200">
          <Play className="w-6 h-6 text-zinc-400 group-hover:text-primary-foreground fill-current ml-0.5 transition-colors duration-200" />
        </div>
        {video.type === "live" && video.uploadDate === "Live now" && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-medium rounded">
            LIVE
          </div>
        )}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-xs font-medium rounded">
          {video.type === "short" ? "0:60" : video.type === "live" ? "LIVE" : "12:34"}
        </div>
      </div>
      <div className="mt-2">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
          {video.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {video.views} • {video.uploadDate}
        </p>
      </div>
    </button>
  )
}
