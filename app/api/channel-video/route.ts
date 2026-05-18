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

function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

async function fetchTopVideo(channelId: string, apiKey: string, publishedAfter?: string) {
  const afterParam = publishedAfter ? `&publishedAfter=${publishedAfter}` : ''
  const order = publishedAfter ? 'viewCount' : 'date'
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=id,snippet&channelId=${channelId}&order=${order}&type=video&maxResults=1${afterParam}&key=${apiKey}`
  )
  const data = await res.json()
  return data.items?.[0] || null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const handle = searchParams.get('handle')
  const ytUrl = searchParams.get('ytUrl') || ''

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  try {
    let channelId: string | null = null
    const parsed = extractFromUrl(ytUrl)

    // Direct video ID from URL
    if (parsed.videoId) {
      const vRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${parsed.videoId}&key=${apiKey}`
      )
      const vData = await vRes.json()
      if (vData.items?.[0]) {
        const snippet = vData.items[0].snippet
        return NextResponse.json({
          videoId: parsed.videoId,
          title: snippet.title,
          thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
        })
      }
    }

    // Resolve channelId
    if (parsed.channelId) {
      channelId = parsed.channelId
    } else {
      const h = parsed.handle || handle
      if (!h) return NextResponse.json({ error: 'Cannot resolve channel' }, { status: 400 })
      const cRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(h.replace('@', ''))}&key=${apiKey}`
      )
      const cData = await cRes.json()
      channelId = cData.items?.[0]?.id || null
    }

    if (!channelId) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

    // Try last 7 days → last 30 days → most recent
    let video = await fetchTopVideo(channelId, apiKey, daysAgoISO(7))
    if (!video) video = await fetchTopVideo(channelId, apiKey, daysAgoISO(30))
    if (!video) video = await fetchTopVideo(channelId, apiKey)

    if (!video) return NextResponse.json({ error: 'No videos found' }, { status: 404 })

    return NextResponse.json({
      videoId: video.id.videoId,
      title: video.snippet.title,
      thumbnail: video.snippet.thumbnails?.high?.url,
    })

  } catch (err) {
    console.error('YouTube API error:', err)
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 })
  }
}