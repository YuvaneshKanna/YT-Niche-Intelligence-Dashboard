import { NextRequest, NextResponse } from 'next/server'

function extractFromUrl(ytUrl: string): { handle?: string; videoId?: string; channelId?: string } {
  if (!ytUrl) return {}
  const url = ytUrl.replace(/^https?:\/\//, '').replace(/^www\./, '')

  // Shorts: youtube.com/shorts/xxx
  const shortsMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shortsMatch) return { videoId: shortsMatch[1] }

  // Watch: youtube.com/watch?v=xxx
  const watchMatch = url.match(/watch\?v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return { videoId: watchMatch[1] }

  // Handle: youtube.com/@handle
  const handleMatch = url.match(/@([a-zA-Z0-9_.-]+)/)
  if (handleMatch) return { handle: '@' + handleMatch[1] }

  // Channel ID: youtube.com/channel/UCxxx
  const channelMatch = url.match(/channel\/(UC[a-zA-Z0-9_-]+)/)
  if (channelMatch) return { channelId: channelMatch[1] }

  return {}
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const handle = searchParams.get('handle')
  const ytUrl = searchParams.get('ytUrl') || ''

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  try {
    let channelId: string | null = null
    let directVideoId: string | null = null

    const parsed = extractFromUrl(ytUrl)

    // If we got a direct video ID from URL, use it immediately
    if (parsed.videoId) {
      directVideoId = parsed.videoId
      // Still need channelId for fallback — get it from video
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

    // Resolve channelId from parsed.channelId or handle
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

    // Get most popular video
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id,snippet&channelId=${channelId}&order=viewCount&type=video&maxResults=1&key=${apiKey}`
    )
    const vData = await vRes.json()

    if (!vData.items?.[0]) return NextResponse.json({ error: 'No videos found' }, { status: 404 })

    const top = vData.items[0]
    return NextResponse.json({
      videoId: top.id.videoId,
      title: top.snippet.title,
      thumbnail: top.snippet.thumbnails?.high?.url,
    })

  } catch (err) {
    console.error('YouTube API error:', err)
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 })
  }
}