"use client"

interface VideoPlayerProps {
  videoId: string
}

export function VideoPlayer({ videoId }: VideoPlayerProps) {
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?rel=0`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}
