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
      <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-5 h-5 text-primary-foreground fill-current ml-0.5" />
          </div>
        </div>
        {video.type === "live" && video.uploadDate === "Live now" && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-medium rounded">
            LIVE
          </div>
        )}
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
