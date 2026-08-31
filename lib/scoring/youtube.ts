// Real channel creation dates, batched from the YouTube Data API.
//
// Why this exists rather than reusing the Chunk 2 `MIN(videos.published_at)`
// proxy: that proxy is computed over the ~31 uploads Stage 2 scrapes per
// channel, so a high-cadence channel's sample spans a couple of months and it
// looks NEW, while a slow channel's sample spans years and it looks OLD. It
// correlates with lifetime video count at -0.388 across this roster — the wrong
// sign. Feeding it into a "recent is better" ranking would reward upload volume
// and punish exactly the lean channels the ranking is meant to surface.
//
// `channels.list` accepts up to 50 ids per request, so the whole roster costs
// four calls and four quota units.

const BATCH_SIZE = 50
const ENDPOINT = "https://www.googleapis.com/youtube/v3/channels"

export class YouTubeConfigError extends Error {}

/** Split into chunks of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Creation date (YYYY-MM-DD) per channel id.
 *
 * Ids the API does not return — deleted, private, or wrong-id channels — are
 * simply absent from the map; the scorer treats a missing date as one missing
 * component rather than as a zero.
 *
 * A failed batch is logged and skipped rather than thrown, so one bad response
 * degrades the freshness component instead of taking down the whole ranking.
 */
export async function readChannelCreatedDates(
  channelIds: string[]
): Promise<Map<string, string>> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    throw new YouTubeConfigError(
      "YOUTUBE_API_KEY is not set. Channel creation dates are unavailable, so the " +
        "freshness component of the Channel Score cannot be computed."
    )
  }

  const unique = [...new Set(channelIds.filter(Boolean))]
  const byChannelId = new Map<string, string>()

  for (const batch of chunk(unique, BATCH_SIZE)) {
    const url = `${ENDPOINT}?part=snippet&maxResults=${BATCH_SIZE}&id=${batch.join(",")}&key=${apiKey}`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.error(`channel createdAt batch failed: ${res.status} ${res.statusText}`)
        continue
      }
      const data = (await res.json()) as {
        items?: { id?: string; snippet?: { publishedAt?: string } }[]
      }
      for (const item of data.items ?? []) {
        const id = item.id
        const publishedAt = item.snippet?.publishedAt
        if (id && publishedAt) byChannelId.set(id, publishedAt.slice(0, 10))
      }
    } catch (err) {
      console.error("channel createdAt batch threw:", err)
    }
  }

  return byChannelId
}
