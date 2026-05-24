import { NextRequest, NextResponse } from 'next/server'

const COUNTRY_NAMES: Record<string, string> = {
    US: 'United States', GB: 'United Kingdom', IN: 'India', CA: 'Canada',
    AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan', KR: 'South Korea',
    BR: 'Brazil', MX: 'Mexico', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
    SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland',
    RU: 'Russia', CN: 'China', SG: 'Singapore', MY: 'Malaysia', ID: 'Indonesia',
    TH: 'Thailand', PH: 'Philippines', PK: 'Pakistan', BD: 'Bangladesh',
    NG: 'Nigeria', ZA: 'South Africa', EG: 'Egypt', KE: 'Kenya', GH: 'Ghana',
    AR: 'Argentina', CO: 'Colombia', CL: 'Chile', PE: 'Peru', VE: 'Venezuela',
    NZ: 'New Zealand', IE: 'Ireland', PT: 'Portugal', BE: 'Belgium', CH: 'Switzerland',
    AT: 'Austria', TR: 'Turkey', SA: 'Saudi Arabia', AE: 'United Arab Emirates',
    IL: 'Israel', UA: 'Ukraine', CZ: 'Czech Republic', HU: 'Hungary', RO: 'Romania',
    VN: 'Vietnam', TW: 'Taiwan', HK: 'Hong Kong', LK: 'Sri Lanka',
    GR: 'Greece', RS: 'Serbia', HR: 'Croatia', SK: 'Slovakia', BG: 'Bulgaria', LT: 'Lithuania',
    LV: 'Latvia', EE: 'Estonia', SI: 'Slovenia', GB: "United Kingdom",
}

const formatNum = (n: string) => {
    const num = parseInt(n || '0')
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

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const handle = searchParams.get('handle')
    const ytUrl = searchParams.get('ytUrl') || ''

    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    try {
        let channelId: string | null = null

        const channelMatch = ytUrl.match(/channel\/(UC[a-zA-Z0-9_-]+)/)
        if (channelMatch) channelId = channelMatch[1]

        if (!channelId) {
            const handleMatch = ytUrl.match(/@([a-zA-Z0-9_.-]+)/)
            const h = handleMatch ? '@' + handleMatch[1] : handle
            if (h) {
                const res = await fetch(
                    `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(h.replace('@', ''))}&key=${apiKey}`
                )
                const data = await res.json()
                channelId = data.items?.[0]?.id || null
            }
        }

        if (!channelId) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`
        )
        const data = await res.json()
        const channel = data.items?.[0]
        if (!channel) return NextResponse.json({ error: 'No channel data' }, { status: 404 })

        const stats = channel.statistics
        const snippet = channel.snippet
        const countryCode = snippet.country || ''

        return NextResponse.json({
            success: true,
            channelName: snippet.title || '—',
            about: snippet.description || '—',
            subscribers: stats.hiddenSubscriberCount ? 'Hidden' : formatNum(stats.subscriberCount),
            totalVideos: formatNum(stats.videoCount),
            totalViews: formatNum(stats.viewCount),
            createdOn: formatDate(snippet.publishedAt),
            country: countryCode ? (COUNTRY_NAMES[countryCode] || countryCode) : '—',
        })

    } catch (err) {
        console.error('Channel stats error:', err)
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }
}