"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { useHorizontalWheel } from "@/lib/useHorizontalWheel"

export interface VideoItem {
  videoId: string
  title: string
  thumbnail: string
  publishedAt: string
  publishedAtRaw: string
  views: string
  likes: string
  comments: string
  duration: string
  durationSeconds: number
  isShort: boolean
}

/** Dwell before a hover preview starts, so skimming the row does not fire them all. */
const HOVER_PREVIEW_DELAY_MS = 600

/**
 * The channel's recent uploads, as a pickable row.
 *
 * This exists because one video cannot settle a classification. Produced_By in
 * particular — Human Editor against AI Tools against Stock Slideshow — is a
 * judgement about the channel's production *pattern*, and a single upload is a
 * sample of one. Seeing the row side by side usually answers it before anything
 * is played: AI-generated channels repeat a visual template, stock recompiles
 * look interchangeable, human edits vary.
 *
 * View counts sit under each thumbnail for the same reason — a channel whose
 * uploads read 2K, 3K, 1K, 400K, 2K is a very different proposition from one
 * reading 80K, 90K, 75K, and neither is visible from the newest upload alone.
 *
 * Card size, hover-to-preview and wheel-to-horizontal deliberately match what
 * Similar Channels does, since the two now share this slot behind a toggle.
 */
export function VideoStrip({
  videos,
  selectedId,
  onSelect,
}: {
  videos: VideoItem[]
  selectedId: string | null
  onSelect: (videoId: string) => void
}) {
  const { ref: scrollerRef } = useHorizontalWheel<HTMLDivElement>()
  const activeRef = useRef<HTMLButtonElement>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the playing item in view when selection changes from outside the row —
  // switching channel resets to a default that may be scrolled off.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [selectedId])

  // Never leave a preview running for a channel that is no longer shown.
  useEffect(() => {
    setPreviewId(null)
  }, [videos])

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    },
    []
  )

  const startPreview = (videoId: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setPreviewId(videoId), HOVER_PREVIEW_DELAY_MS)
  }

  const stopPreview = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setPreviewId(null)
  }

  if (videos.length === 0) {
    return <p className="text-sm italic text-muted-foreground">No uploads found for this channel.</p>
  }

  return (
    <div
      ref={scrollerRef}
      className="group/strip flex flex-nowrap items-start gap-3 overflow-x-scroll overflow-y-visible py-4 pl-2"
      onMouseLeave={stopPreview}
    >
      {videos.map((v) => {
        const isActive = v.videoId === selectedId
        const isPreviewing = v.videoId === previewId

        return (
          <button
            key={v.videoId}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onSelect(v.videoId)}
            onMouseEnter={() => startPreview(v.videoId)}
            onMouseLeave={stopPreview}
            aria-current={isActive ? "true" : undefined}
            aria-label={`Play ${v.title}. ${v.views} views, ${v.duration}, published ${v.publishedAt}`}
            title={`${v.title}\n${v.views} views · ${v.likes} likes · ${v.comments} comments\n${v.publishedAt} · ${v.duration}`}
            className={cn(
              "group relative w-[calc(25%-12px)] flex-shrink-0 scale-100 overflow-hidden rounded-xl border text-left",
              "cursor-pointer bg-muted/60 outline-none transition-all duration-200",
              "group-hover/strip:scale-95 hover:z-10 hover:!scale-105",
              "focus-visible:ring-2 focus-visible:ring-primary/70",
              isActive ? "border-primary" : "border-border"
            )}
          >
            <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
              {isPreviewing ? (
                <iframe
                  src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&controls=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  className="absolute inset-0 h-full w-full border-0"
                />
              ) : v.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbnail}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-zinc-900" />
              )}

              {!isPreviewing && (
                <>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/30">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/0 transition-all duration-200 group-hover:bg-red-600">
                      <svg
                        viewBox="0 0 24 24"
                        fill="white"
                        aria-hidden="true"
                        className="ml-0.5 h-5 w-5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>

                  {/* Duration doubles as the Shorts/long-form tell — the single
                      most useful thing for verifying the Type field. */}
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-px text-[10px] font-medium tabular-nums text-white">
                    {v.isShort ? "SHORT" : v.duration}
                  </span>
                </>
              )}

              {isActive && (
                <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
                  Playing
                </span>
              )}
            </div>

            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
                <span className="rounded-full bg-primary/20 px-2 py-0.5 font-medium text-primary">
                  {v.views} views
                </span>
                <span>{v.publishedAt}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
