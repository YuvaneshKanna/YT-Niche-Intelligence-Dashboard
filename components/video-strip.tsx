"use client"

import { useEffect, useRef } from "react"
import { Play } from "lucide-react"

import { cn } from "@/lib/utils"

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

/**
 * The channel's recent uploads, as a pickable strip under the player.
 *
 * This exists because one video cannot settle a classification. Produced_By in
 * particular — Human Editor against AI Tools against Stock Slideshow — is a
 * judgement about the channel's production *pattern*, and a single upload is a
 * sample of one. Seeing ten thumbnails side by side usually answers it before
 * anything is even played: AI-generated channels repeat a visual template,
 * stock recompiles look interchangeable, human edits vary.
 *
 * View counts sit under each thumbnail for the same reason — a channel whose
 * uploads read 2K, 3K, 1K, 400K, 2K is a very different proposition from one
 * reading 80K, 90K, 75K, and neither is visible from the newest upload alone.
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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Keep the playing item in view when selection changes from outside the
  // strip — switching channel resets to a default that may be scrolled off.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [selectedId])

  if (videos.length === 0) return null

  return (
    <section className="mt-3" aria-label="Recent uploads">
      <div className="mb-1.5 flex items-baseline justify-between px-0.5">
        <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Recent uploads
        </h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {videos.length} shown
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-2 overflow-x-auto pb-1.5"
        // Horizontal wheel scrolling is handled by the browser for this axis;
        // the container is a plain scroller so keyboard focus moves it too.
        tabIndex={-1}
      >
        {videos.map((v) => {
          const isActive = v.videoId === selectedId
          return (
            <button
              key={v.videoId}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSelect(v.videoId)}
              aria-current={isActive ? "true" : undefined}
              aria-label={`Play ${v.title}. ${v.views} views, ${v.duration}, published ${v.publishedAt}`}
              title={`${v.title}\n${v.views} views · ${v.likes} likes · ${v.comments} comments\n${v.publishedAt} · ${v.duration}`}
              className={cn(
                "group relative w-[112px] flex-shrink-0 rounded-md border text-left outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-primary/70",
                isActive
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:border-border hover:bg-muted/40"
              )}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-t-[5px] bg-black">
                {v.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumbnail}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "h-full w-full object-cover transition-opacity",
                      isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                    )}
                  />
                ) : (
                  <div className="h-full w-full bg-zinc-800" />
                )}

                {/* Duration doubles as the Shorts/long-form tell — the single
                    most useful thing for verifying the Type field. */}
                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[9px] font-medium tabular-nums text-white">
                  {v.isShort ? "SHORT" : v.duration}
                </span>

                {isActive && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Play className="h-4 w-4 fill-white text-white" aria-hidden="true" />
                  </span>
                )}
              </div>

              <div className="px-1.5 py-1">
                <p className="truncate text-[10px] leading-tight text-foreground">{v.title}</p>
                <p className="mt-0.5 flex items-baseline gap-1 text-[9px] tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground/80">{v.views}</span>
                  <span className="truncate">{v.publishedAt}</span>
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
