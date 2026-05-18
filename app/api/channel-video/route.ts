import { NextRequest, NextResponse } from 'next/server'

function extractFromUrl(ytUrl: string): { handle?: string; videoId?: string; channelId?: string } {
  if (!ytUrl) return {}
  const url = ytUrl.replace(/^https?:\/\//, '').replace(/^www\./, '')

  const shortsMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shortsMatch) return { videoId: shortsMatch[1] }

  const watchMatch = url.match(/watch\?v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return { videoId: watchMatch[1] }

  const handleMatch = url.match(/@([a-zA-Z0-9_.-]+)/)
  if (handleMatch) return { handle: '@' + handleMatch[1] }

  const channelMatch = url.match(/channel\/(UC[a-zA-Z0-9_-]+)/)
  if (channelMatch) return { channelId: channelMatch[1] }

  return {}
}

async function getChannelId(handle: string, apiKey: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle.replace('@', ''))}&key=${apiKey}`
  )
  const data = await res.json()
  return data.items?.[0]?.id || null
}

async function getUploadsPlaylistId(channelId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
  )
  const data = await res.json()
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null
}

async function getBestVideoFromPlaylist(playlistId: string, apiKey: string) {
  // Fetch latest 10 videos from uploads playlist — costs 1 unit
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=10&key=${apiKey}`
  )
  const data = await res.json()
  if (!data.items?.length) return null

  const now = new Date()
  const day7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const day30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const toVideo = (item: any) => ({
    videoId: item.snippet?.resourceId?.videoId,
    title: item.snippet?.title,
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
    publishedAt: item.snippet?.publishedAt,
  })

  // Try last 7 days first
  const within7d = data.items.filter((item: any) => {
    const pub = new Date(item.snippet?.publishedAt)
    return pub >= day7ago
  })
  if (within7d.length > 0) return toVideo(within7d[0])

  // Try last 30 days
  const within30d = data.items.filter((item: any) => {
    const pub = new Date(item.snippet?.publishedAt)
    return pub >= day30ago
  })
  if (within30d.length > 0) return toVideo(within30d[0])

  // Fall back to most recent
  return toVideo(data.items[0])
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const handle = searchParams.get('handle')
  const ytUrl = searchParams.get('ytUrl') || ''

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  try {
    const parsed = extractFromUrl(ytUrl)

    // Direct video ID — costs 1 unit
    if (parsed.videoId) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${parsed.videoId}&key=${apiKey}`
      )
      const data = await res.json()
      if (data.items?.[0]) {
        const snippet = data.items[0].snippet
        return NextResponse.json({
          videoId: parsed.videoId,
          title: snippet.title,
          thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
        })
      }
    }

    // Resolve channelId
    let channelId: string | null = null
    if (parsed.channelId) {
      channelId = parsed.channelId
    } else {
      const h = parsed.handle || handle
      if (!h) return NextResponse.json({ error: 'Cannot resolve channel' }, { status: 400 })
      channelId = await getChannelId(h, apiKey)
    }

    if (!channelId) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

    // Get uploads playlist — costs 1 unit
    const playlistId = await getUploadsPlaylistId(channelId, apiKey)
    if (!playlistId) return NextResponse.json({ error: 'No uploads playlist' }, { status: 404 })

    // Get best video using 7d → 30d → most recent logic — costs 1 unit
    const video = await getBestVideoFromPlaylist(playlistId, apiKey)
    if (!video) return NextResponse.json({ error: 'No videos found' }, { status: 404 })

    return NextResponse.json(video)

  } catch (err) {
    console.error('YouTube API error:', err)
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 })
  }
}