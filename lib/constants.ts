export type ChannelType = "Shorts" | "Long-Form"
export type ContentType = "Long-Form" | "Shorts" | "Both"
export type TrackingStatus = "YES" | "NO"

export interface Channel {
  id: string
  handle: string
  originalHandle: string
  currentHandle: string
  fullName?: string
  ytUrl?: string
  type: ChannelType
  contentType?: ContentType
  niche: string
  category: string
  format: string
  producedBy: string
  nicheGroup: string
  verified: string
  tracking: TrackingStatus
  sharedOn: string
  thumbnailUrl?: string
  isUnavailable?: boolean
  latestVideoId?: string
  hasHandleDiff?: boolean
}

export interface Video {
  id: string
  videoId: string
  title: string
  thumbnail: string
  views: string
  uploadDate: string
  type: "video" | "short" | "live"
}

export const channels: Channel[] = []

export const videos: Video[] = [
  { id: "1", videoId: "dQw4w9WgXcQ", title: "I Spent 50 Hours In My Backyard Building The Ultimate Challenge Course", thumbnail: "https://picsum.photos/seed/vid1/320/180", views: "125M views", uploadDate: "2 weeks ago", type: "video" },
  { id: "2", videoId: "dQw4w9WgXcQ", title: "Testing The World's Most Expensive Tech Gadgets Worth $1 Million", thumbnail: "https://picsum.photos/seed/vid2/320/180", views: "89M views", uploadDate: "1 month ago", type: "video" },
  { id: "3", videoId: "dQw4w9WgXcQ", title: "I Survived 100 Days On A Deserted Island - Here's What Happened", thumbnail: "https://picsum.photos/seed/vid3/320/180", views: "200M views", uploadDate: "3 weeks ago", type: "video" },
  { id: "4", videoId: "dQw4w9WgXcQ", title: "Building A House For Someone Who Needs It Most", thumbnail: "https://picsum.photos/seed/vid4/320/180", views: "67M views", uploadDate: "5 days ago", type: "video" },
  { id: "5", videoId: "dQw4w9WgXcQ", title: "The Ultimate Gaming Setup Tour - Behind The Scenes", thumbnail: "https://picsum.photos/seed/vid5/320/180", views: "45M views", uploadDate: "1 week ago", type: "video" },
  { id: "6", videoId: "dQw4w9WgXcQ", title: "I Gave Away $1 Million To Random Strangers On The Street", thumbnail: "https://picsum.photos/seed/vid6/320/180", views: "156M views", uploadDate: "2 months ago", type: "video" },
  { id: "7", videoId: "dQw4w9WgXcQ", title: "Trying The Most Dangerous Foods In The World", thumbnail: "https://picsum.photos/seed/vid7/320/180", views: "78M views", uploadDate: "3 days ago", type: "video" },
  { id: "8", videoId: "dQw4w9WgXcQ", title: "Racing The World's Fastest Cars - Incredible Results", thumbnail: "https://picsum.photos/seed/vid8/320/180", views: "92M views", uploadDate: "1 month ago", type: "video" },
  { id: "9", videoId: "dQw4w9WgXcQ", title: "The Truth About Making Money Online In 2024", thumbnail: "https://picsum.photos/seed/vid9/320/180", views: "34M views", uploadDate: "4 days ago", type: "video" },
  { id: "10", videoId: "dQw4w9WgXcQ", title: "I Built A Secret Underground Bunker In My Backyard", thumbnail: "https://picsum.photos/seed/vid10/320/180", views: "112M views", uploadDate: "2 weeks ago", type: "video" },
  { id: "11", videoId: "dQw4w9WgXcQ", title: "Meeting The Most Inspiring People Around The World", thumbnail: "https://picsum.photos/seed/vid11/320/180", views: "56M views", uploadDate: "6 days ago", type: "video" },
  { id: "12", videoId: "dQw4w9WgXcQ", title: "The Craziest Experiments You've Never Seen Before", thumbnail: "https://picsum.photos/seed/vid12/320/180", views: "83M views", uploadDate: "1 week ago", type: "video" },
]

export const shorts: Video[] = [
  { id: "s1", videoId: "dQw4w9WgXcQ", title: "Wait for the ending! 🤯", thumbnail: "https://picsum.photos/seed/short1/320/180", views: "50M views", uploadDate: "1 day ago", type: "short" },
  { id: "s2", videoId: "dQw4w9WgXcQ", title: "You won't believe this trick", thumbnail: "https://picsum.photos/seed/short2/320/180", views: "32M views", uploadDate: "2 days ago", type: "short" },
  { id: "s3", videoId: "dQw4w9WgXcQ", title: "POV: You just discovered something amazing", thumbnail: "https://picsum.photos/seed/short3/320/180", views: "78M views", uploadDate: "3 days ago", type: "short" },
  { id: "s4", videoId: "dQw4w9WgXcQ", title: "This changed everything", thumbnail: "https://picsum.photos/seed/short4/320/180", views: "45M views", uploadDate: "5 days ago", type: "short" },
  { id: "s5", videoId: "dQw4w9WgXcQ", title: "Life hack you NEED to know", thumbnail: "https://picsum.photos/seed/short5/320/180", views: "67M views", uploadDate: "1 week ago", type: "short" },
  { id: "s6", videoId: "dQw4w9WgXcQ", title: "The secret nobody tells you", thumbnail: "https://picsum.photos/seed/short6/320/180", views: "29M views", uploadDate: "4 days ago", type: "short" },
  { id: "s7", videoId: "dQw4w9WgXcQ", title: "Watch until the end 👀", thumbnail: "https://picsum.photos/seed/short7/320/180", views: "88M views", uploadDate: "2 days ago", type: "short" },
  { id: "s8", videoId: "dQw4w9WgXcQ", title: "Mind = Blown 🤯", thumbnail: "https://picsum.photos/seed/short8/320/180", views: "41M views", uploadDate: "6 days ago", type: "short" },
  { id: "s9", videoId: "dQw4w9WgXcQ", title: "Try this at home!", thumbnail: "https://picsum.photos/seed/short9/320/180", views: "55M views", uploadDate: "1 day ago", type: "short" },
  { id: "s10", videoId: "dQw4w9WgXcQ", title: "This is actually insane", thumbnail: "https://picsum.photos/seed/short10/320/180", views: "72M views", uploadDate: "3 days ago", type: "short" },
  { id: "s11", videoId: "dQw4w9WgXcQ", title: "No way this is real", thumbnail: "https://picsum.photos/seed/short11/320/180", views: "38M views", uploadDate: "5 days ago", type: "short" },
  { id: "s12", videoId: "dQw4w9WgXcQ", title: "The result will shock you", thumbnail: "https://picsum.photos/seed/short12/320/180", views: "63M views", uploadDate: "2 days ago", type: "short" },
]

export const liveStreams: Video[] = [
  { id: "l1", videoId: "dQw4w9WgXcQ", title: "🔴 LIVE: 24 Hour Challenge Stream", thumbnail: "https://picsum.photos/seed/live1/320/180", views: "1.2M watching", uploadDate: "Live now", type: "live" },
  { id: "l2", videoId: "dQw4w9WgXcQ", title: "🔴 LIVE: Q&A With Special Guests", thumbnail: "https://picsum.photos/seed/live2/320/180", views: "890K watching", uploadDate: "Live now", type: "live" },
  { id: "l3", videoId: "dQw4w9WgXcQ", title: "Weekly Gaming Session - Join Us!", thumbnail: "https://picsum.photos/seed/live3/320/180", views: "2.1M views", uploadDate: "Streamed 2 days ago", type: "live" },
  { id: "l4", videoId: "dQw4w9WgXcQ", title: "Behind The Scenes Production Tour", thumbnail: "https://picsum.photos/seed/live4/320/180", views: "1.5M views", uploadDate: "Streamed 1 week ago", type: "live" },
  { id: "l5", videoId: "dQw4w9WgXcQ", title: "Charity Stream Marathon For A Good Cause", thumbnail: "https://picsum.photos/seed/live5/320/180", views: "3.2M views", uploadDate: "Streamed 3 days ago", type: "live" },
  { id: "l6", videoId: "dQw4w9WgXcQ", title: "Late Night Chill Stream With The Team", thumbnail: "https://picsum.photos/seed/live6/320/180", views: "780K views", uploadDate: "Streamed 5 days ago", type: "live" },
  { id: "l7", videoId: "dQw4w9WgXcQ", title: "Reacting To Your Best Comments", thumbnail: "https://picsum.photos/seed/live7/320/180", views: "1.8M views", uploadDate: "Streamed 1 week ago", type: "live" },
  { id: "l8", videoId: "dQw4w9WgXcQ", title: "Special Announcement Coming Soon!", thumbnail: "https://picsum.photos/seed/live8/320/180", views: "2.4M views", uploadDate: "Streamed 4 days ago", type: "live" },
  { id: "l9", videoId: "dQw4w9WgXcQ", title: "Cooking Live With Celebrity Chef", thumbnail: "https://picsum.photos/seed/live9/320/180", views: "950K views", uploadDate: "Streamed 2 weeks ago", type: "live" },
  { id: "l10", videoId: "dQw4w9WgXcQ", title: "Building Something Epic Together", thumbnail: "https://picsum.photos/seed/live10/320/180", views: "1.1M views", uploadDate: "Streamed 6 days ago", type: "live" },
  { id: "l11", videoId: "dQw4w9WgXcQ", title: "End Of Year Celebration Stream", thumbnail: "https://picsum.photos/seed/live11/320/180", views: "4.5M views", uploadDate: "Streamed 1 month ago", type: "live" },
  { id: "l12", videoId: "dQw4w9WgXcQ", title: "Collaborating With Other Creators", thumbnail: "https://picsum.photos/seed/live12/320/180", views: "1.6M views", uploadDate: "Streamed 3 days ago", type: "live" },
]
