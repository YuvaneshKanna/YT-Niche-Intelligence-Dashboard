import { NextRequest, NextResponse } from 'next/server'

// Recent uploads for one channel, for the audit player.
//
// This endpoint used to fetch ten uploads and return exactly one, which made
// judging a channel's *pattern* impossible — and the classification field most
// likely to be wrong (Produced_By: Human Editor vs AI Tools vs Stock Slideshow)
// is precisely the one a single video cannot settle. It now returns all ten.
//
// Quota is unchanged, in fact one unit cheaper: `videos.list` bills per call
// rather than per id, so statistics for ten videos cost the same single unit as
// for one, and the channel id + uploads playlist are now resolved in one
// `channels.list` call instead of two.
//
//   channels.list (id + contentDetails)  1 unit   (skipped if the URL has one)
//   playlistItems.list (10 uploads)      1 unit
//   videos.list (10 ids, batched)        1 unit
//                                        -------
//                                        2-3 units, was 3-4

const UPLOAD_COUNT = 10

/** Shorts are <= 60s; used to pick a vertical player frame instead of letterboxing. */
const SHORT_MAX_SECONDS = 60

interface VideoItem {
    videoId: string
    title: string
    thumbnail: string
    publishedAt: string
    /** ISO date, for sorting — `publishedAt` is display-formatted. */
    publishedAtRaw: string
    views: string
    likes: string
    comments: string
    duration: string
    durationSeconds: number
    isShort: boolean
}

function extractFromUrl(ytUrl: string): { handle?: string; videoId?: string; channelId?: string } {
    if (!ytUrl) return {}
    const url = ytUrl.replace(/^https?:\/\//, '').replace(/^www\./, '')

    const shortsMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch) return { videoId: shortsMatch[1] }

    const watchMatch = url.match(/watch\?v=([a-zA-Z0-9_-]{11})/)
    if (watchMatch) return { videoId: watchMatch[1] }

    const shortLinkMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
    if (shortLinkMatch) return { videoId: shortLinkMatch[1] }

    const handleMatch = url.match(/@([a-zA-Z0-9_.-]+)/)
    if (handleMatch) return { handle: '@' + handleMatch[1] }

    const channelMatch = url.match(/channel\/(UC[a-zA-Z0-9_-]+)/)
    if (channelMatch) return { channelId: channelMatch[1] }

    return {}
}

const formatNum = (n: string | number) => {
    const num = typeof n === 'string' ? parseInt(n || '0') : n
    if (!Number.isFinite(num)) return '—'
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
    return num.toString()
}

const formatDate = (iso: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** ISO 8601 duration (PT#H#M#S) to seconds. */
function parseDuration(iso: string): number {
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '')
    if (!m) return 0
    return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
}

const formatDuration = (seconds: number) => {
    if (!seconds) return '—'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`
}

/** Channel id and uploads playlist in one call. */
async function resolveChannel(
    apiKey: string,
    opts: { channelId?: string; handle?: string }
): Promise<{ channelId: string; uploadsPlaylistId: string } | null> {
    const selector = opts.channelId
        ? `id=${opts.channelId}`
        : `forHandle=${encodeURIComponent((opts.handle || '').replace('@', ''))}`

    const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id,contentDetails&${selector}&key=${apiKey}`
    )
    const data = await res.json()
    const item = data.items?.[0]
    const uploads = item?.contentDetails?.relatedPlaylists?.uploads
    if (!item?.id || !uploads) return null
    return { channelId: item.id, uploadsPlaylistId: uploads }
}

/** The most recent upload ids, newest first. */
async function getRecentVideoIds(playlistId: string, apiKey: string): Promise<string[]> {
    const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${UPLOAD_COUNT}&key=${apiKey}`
    )
    const data = await res.json()
    return (data.items || [])
        .map((i: { contentDetails?: { videoId?: string } }) => i.contentDetails?.videoId)
        .filter((id: string | undefined): id is string => Boolean(id))
}

/** Full detail for up to 50 ids in a single call. */
async function getVideoDetails(videoIds: string[], apiKey: string): Promise<VideoItem[]> {
    if (videoIds.length === 0) return []

    const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`
    )
    const data = await res.json()

    const byId = new Map<string, VideoItem>()
    for (const item of data.items || []) {
        const seconds = parseDuration(item.contentDetails?.duration)
        byId.set(item.id, {
            videoId: item.id,
            title: item.snippet?.title || '—',
            thumbnail:
                item.snippet?.thumbnails?.medium?.url ||
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.default?.url ||
                '',
            publishedAt: formatDate(item.snippet?.publishedAt),
            publishedAtRaw: item.snippet?.publishedAt || '',
            views: formatNum(item.statistics?.viewCount || '0'),
            likes: formatNum(item.statistics?.likeCount || '0'),
            comments: formatNum(item.statistics?.commentCount || '0'),
            duration: formatDuration(seconds),
            durationSeconds: seconds,
            isShort: seconds > 0 && seconds <= SHORT_MAX_SECONDS,
        })
    }

    // Preserve the playlist's newest-first order; videos.list does not honour
    // the order of the ids it is given.
    return videoIds.map((id) => byId.get(id)).filter((v): v is VideoItem => Boolean(v))
}

/**
 * Which upload opens first: the newest within 7 days, else within 30, else the
 * newest available. Unchanged from the previous behaviour — the difference is
 * that the other nine are now returned too instead of being discarded.
 */
function pickDefaultIndex(videos: VideoItem[]): number {
    const now = Date.now()
    const within = (days: number) =>
        videos.findIndex(
            (v) =>
                v.publishedAtRaw && new Date(v.publishedAtRaw).getTime() >= now - days * 86400000
        )

    const recent = within(7)
    if (recent !== -1) return recent
    const month = within(30)
    if (month !== -1) return month
    return 0
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const handle = searchParams.get('handle')
    const ytUrl = searchParams.get('ytUrl') || ''

    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    try {
        const parsed = extractFromUrl(ytUrl)

        // A sheet row may point at a single video rather than a channel. Fetch
        // that video first — its snippet carries the channelId, so resolving
        // the channel from it costs nothing extra.
        let seedVideo: VideoItem | null = null
        let channelId = parsed.channelId ?? null

        if (parsed.videoId) {
            const seeds = await getVideoDetails([parsed.videoId], apiKey)
            seedVideo = seeds[0] ?? null
            if (!channelId) {
                const res = await fetch(
                    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${parsed.videoId}&key=${apiKey}`
                )
                const data = await res.json()
                channelId = data.items?.[0]?.snippet?.channelId ?? null
            }
        }

        const resolved = await resolveChannel(apiKey, {
            channelId: channelId ?? undefined,
            handle: channelId ? undefined : parsed.handle || handle || undefined,
        })

        // No channel, but a direct video still gives the auditor something.
        if (!resolved) {
            if (seedVideo) {
                return NextResponse.json({ videos: [seedVideo], selectedIndex: 0, ...seedVideo })
            }
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
        }

        const ids = await getRecentVideoIds(resolved.uploadsPlaylistId, apiKey)
        const videos = await getVideoDetails(ids, apiKey)

        // Keep the sheet's own video at the front when it is not among the
        // recent uploads — it is the row's reference point.
        if (seedVideo && !videos.some((v) => v.videoId === seedVideo!.videoId)) {
            videos.unshift(seedVideo)
        }

        if (videos.length === 0) {
            return NextResponse.json({ error: 'No videos found' }, { status: 404 })
        }

        const selectedIndex = seedVideo
            ? Math.max(0, videos.findIndex((v) => v.videoId === seedVideo!.videoId))
            : pickDefaultIndex(videos)

        // The selected video is also spread at the top level so existing
        // consumers that read `videoId` / `views` / `likes` keep working.
        return NextResponse.json({
            videos,
            selectedIndex,
            channelId: resolved.channelId,
            ...videos[selectedIndex],
        })
    } catch (err) {
        console.error('YouTube API error:', err)
        return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 })
    }
}
