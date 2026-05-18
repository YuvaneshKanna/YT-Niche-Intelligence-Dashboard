"use client"

import { useState, useEffect, useRef } from "react"
import type { Channel } from "@/lib/constants"

interface SimilarChannelCardProps {
    channel: Channel
}

export function SimilarChannelCard({ channel }: SimilarChannelCardProps) {
    const [videoId, setVideoId] = useState<string | null>(null)
    const [thumbnail, setThumbnail] = useState<string | null>(null)
    const [isHovered, setIsHovered] = useState(false)
    const hoverTimer = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        const handle = channel.handle || ''
        const ytUrl = channel.ytUrl || ''
        fetch(`/api/channel-video?handle=${encodeURIComponent(handle)}&ytUrl=${encodeURIComponent(ytUrl)}`)
            .then(r => r.json())
            .then(data => {
                if (data.videoId) setVideoId(data.videoId)
                if (data.thumbnail) setThumbnail(data.thumbnail)
            })
            .catch(() => { })
    }, [channel.id])

    const handleMouseEnter = () => {
        hoverTimer.current = setTimeout(() => setIsHovered(true), 600)
    }

    const handleMouseLeave = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        setIsHovered(false)
    }

    return (
        <div
            className="flex-shrink-0 w-[280px] rounded-xl overflow-hidden bg-muted/60 border border-border cursor-pointer group relative transition-all duration-200 scale-100 group-hover/strip:scale-95 hover:!scale-105 hover:z-10"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={() => channel.ytUrl && window.open(channel.ytUrl, '_blank')}
        >
            {/* 16:9 video area */}
            <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                {isHovered && videoId ? (
                    <iframe
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&controls=0`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        className="absolute inset-0 w-full h-full border-0"
                    />
                ) : thumbnail ? (
                    <img
                        src={thumbnail}
                        alt={channel.handle}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                        <span className="text-2xl font-bold text-white/20">
                            {(channel.handle || '').replace('@', '').charAt(0).toUpperCase()}
                        </span>
                    </div>
                )}

                {/* Hover overlay when showing thumbnail */}
                {!isHovered && thumbnail && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-red-600/0 group-hover:bg-red-600 transition-all duration-200 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                )}
            </div>

            {/* Channel info */}
            <div className="px-3 py-2">
                <p className="text-sm font-semibold text-foreground truncate">{channel.handle}</p>
                <p className="text-xs text-muted-foreground truncate">{channel.handle?.replace('@', '')}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${channel.type === 'Shorts' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>{channel.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/20 text-primary">
                        {channel.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground italic">· {channel.subCategory}</span>
                </div>
            </div>
        </div>
    )
}