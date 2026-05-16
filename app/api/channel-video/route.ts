import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const handle = searchParams.get('handle') // e.g. "@MrBeast"

  if (!handle) {
    return NextResponse.json({ error: 'handle is required' }, { status: 400 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    // Step 1: Resolve channel handle to channel ID
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(handle.replace('@', ''))}&key=${apiKey}`
    )
    const channelData = await channelRes.json()

    if (!channelData.items || channelData.items.length === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    const channelId = channelData.items[0].id

    // Step 2: Fetch the most popular video from this channel
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id,snippet&channelId=${channelId}&order=viewCount&type=video&maxResults=1&key=${apiKey}`
    )
    const videosData = await videosRes.json()

    if (!videosData.items || videosData.items.length === 0) {
      return NextResponse.json({ error: 'No videos found' }, { status: 404 })
    }

    const topVideo = videosData.items[0]
    const videoId = topVideo.id.videoId
    const title = topVideo.snippet.title
    const thumbnail = topVideo.snippet.thumbnails?.high?.url || topVideo.snippet.thumbnails?.default?.url

    return NextResponse.json({ videoId, title, thumbnail, channelId })
  } catch (err) {
    console.error('YouTube API error:', err)
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 })
  }
}
