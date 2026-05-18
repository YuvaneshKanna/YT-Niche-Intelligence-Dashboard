import { useEffect, useState } from 'react'
import type { Channel, ChannelType, ContentType, NicheCategory, TrackingStatus } from './constants'

export function useChannels() {
    const [channels, setChannels] = useState<Channel[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/channels')
            .then((res) => res.json())
            .then((data) => {
                if (!data.success) throw new Error(data.error)

                const mapped: Channel[] = data.channels.map((c: any) => ({
                    id: c.ytUrl,
                    handle: c.handle || '',
                    originalHandle: c.handle || '',
                    currentHandle: c.handle || '',
                    ytUrl: c.ytUrl,
                    type: (c.type === 'Shorts' ? 'Shorts' : 'Long-Form') as ChannelType,
                    contentType: (c.type || 'Long-Form') as ContentType,
                    category: (c.nicheCategory || '') as NicheCategory,
                    subCategory: c.subCategory || '',
                    verified: c.verified || '',
                    tracking: (c.tracking?.toUpperCase() === 'YES' ? 'YES' : 'NO') as TrackingStatus,
                    sharedOn: c.sharedOn || '',
                    isUnavailable: !c.handle,
                    hasHandleDiff: c.hasHandleDiff,
                }))

                setChannels(mapped)
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false))
    }, [])

    return { channels, loading, error, setChannels }
}