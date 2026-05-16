export type ChannelType = "Shorts" | "Long-Form"
export type ContentType = "Long-Form" | "Shorts" | "Both"
export type NicheCategory = "Tech" | "Finance" | "Gaming" | "Lifestyle" | "Education" | "Entertainment" | "Fitness" | "Food" | "Travel" | "Music"
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
  category: NicheCategory
  subCategory: string
  verified: string
  tracking: TrackingStatus
  sharedOn: string
  thumbnailUrl?: string
  isUnavailable?: boolean
  latestVideoId?: string
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

export const channels: Channel[] = [
  // Entertainment — Long-Form
  { id: "1",  handle: "@MrBeast",         fullName: "Jimmy Donaldson", ytUrl: "https://youtube.com/@MrBeast", originalHandle: "@MrBeast",         currentHandle: "@MrBeast",         type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Challenges",       verified: "", tracking: "YES", sharedOn: "May 15, 2026", thumbnailUrl: "https://picsum.photos/seed/MrBeast/320/180",        latestVideoId: "Ye5bHmvjlj8" },
  { id: "13", handle: "@DudePerfect",     fullName: "Dude Perfect",    ytUrl: "https://youtube.com/@DudePerfect", originalHandle: "@DudePerfect",     currentHandle: "@DudePerfect",     type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Sports",            verified: "", tracking: "YES", sharedOn: "May 12, 2026", thumbnailUrl: "https://picsum.photos/seed/DudePerfect/320/180",    latestVideoId: "GFyHFnHkiOg" },
  { id: "16", handle: "@MarkRober",       fullName: "Mark Rober",      ytUrl: "https://youtube.com/@MarkRober", originalHandle: "@MarkRoberOld",    currentHandle: "@MarkRober",       type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Challenges",       verified: "", tracking: "YES", sharedOn: "Nov 10, 2024", thumbnailUrl: "https://picsum.photos/seed/MarkRober/320/180",      latestVideoId: "QNGIygB0-WE" },
  { id: "17", handle: "@JimmyDonaldson",  fullName: "Jimmy Donaldson", ytUrl: "https://youtube.com/@JimmyDonaldson", originalHandle: "@JimmyDonaldson",  currentHandle: "@JimmyDonaldson",  type: "Long-Form", contentType: "Both",      category: "Entertainment", subCategory: "Commentary",       verified: "", tracking: "NO",  sharedOn: "Oct 22, 2024", thumbnailUrl: "https://picsum.photos/seed/JimmyDonaldson/320/180", latestVideoId: "Ye5bHmvjlj8", isUnavailable: true },
  // Entertainment — Shorts
  { id: "5",  handle: "@KhaibyLame",      fullName: "Khaby Lame",      ytUrl: "https://youtube.com/@KhaibyLame", originalHandle: "@KhaibyLame",      currentHandle: "@KhaibyLame",      type: "Shorts",    contentType: "Shorts",    category: "Entertainment", subCategory: "Comedy",            verified: "", tracking: "YES", sharedOn: "May 14, 2026", thumbnailUrl: "https://picsum.photos/seed/KhaibyLame/320/180",     latestVideoId: "vUKDBVRlY7A" },
  { id: "18", handle: "@ZachKing",        fullName: "Zach King",       ytUrl: "https://youtube.com/@ZachKing", originalHandle: "@ZachKingMagic",   currentHandle: "@ZachKing",        type: "Shorts",    contentType: "Shorts",    category: "Entertainment", subCategory: "Shorts Commentary", verified: "", tracking: "YES", sharedOn: "Oct 5, 2024",  thumbnailUrl: "https://picsum.photos/seed/ZachKing/320/180",       latestVideoId: "aVkMKpxFiCY" },
  // Tech — Long-Form
  { id: "2",  handle: "@MKBHD",           fullName: "Marques Brownlee", ytUrl: "https://youtube.com/@MKBHD", originalHandle: "@MKBHD",           currentHandle: "@MKBHD",           type: "Long-Form", contentType: "Long-Form", category: "Tech",          subCategory: "Reviews",           verified: "", tracking: "YES", sharedOn: "May 10, 2026", thumbnailUrl: "https://picsum.photos/seed/MKBHD/320/180",          latestVideoId: "r8NZa9wYZ_U" },
  { id: "10", handle: "@LinusTech",       fullName: "Linus Tech Tips",  ytUrl: "https://youtube.com/@LinusTech", originalHandle: "@LinusTech",       currentHandle: "@LinusTech",       type: "Long-Form", contentType: "Long-Form", category: "Tech",          subCategory: "Hardware",          verified: "", tracking: "YES", sharedOn: "May 5, 2026",  thumbnailUrl: "https://picsum.photos/seed/LinusTech/320/180",      latestVideoId: "P6AaSMfXHbA" },
  { id: "19", handle: "@UnboxTherapy",    fullName: "Unbox Therapy",    ytUrl: "https://youtube.com/@UnboxTherapy", originalHandle: "@UnboxTherapy",    currentHandle: "@UnboxTherapy",    type: "Long-Form", contentType: "Long-Form", category: "Tech",          subCategory: "Reviews",           verified: "", tracking: "YES", sharedOn: "Sep 18, 2024", thumbnailUrl: "https://picsum.photos/seed/UnboxTherapy/320/180",   latestVideoId: "Gt1QxvIBJNM" },
  { id: "20", handle: "@Mrwhosetheboss",  fullName: "Arun Maini",       ytUrl: "https://youtube.com/@Mrwhosetheboss", originalHandle: "@Mrwhosetheboss",  currentHandle: "@Mrwhosetheboss",  type: "Long-Form", contentType: "Both",      category: "Tech",          subCategory: "Reviews",           verified: "", tracking: "NO",  sharedOn: "Sep 5, 2024",  thumbnailUrl: "https://picsum.photos/seed/Mrwhosetheboss/320/180", latestVideoId: "mVe-E3BUQPU" },
  // Finance — Long-Form
  { id: "3",  handle: "@GrahamStephan",   fullName: "Graham Stephan",   ytUrl: "https://youtube.com/@GrahamStephan", originalHandle: "@GrahamStephan",   currentHandle: "@GrahamStephan",   type: "Long-Form", contentType: "Long-Form", category: "Finance",       subCategory: "Personal Finance",  verified: "", tracking: "YES", sharedOn: "May 8, 2026",  thumbnailUrl: "https://picsum.photos/seed/GrahamStephan/320/180" },
  { id: "21", handle: "@AndreJikh",       fullName: "Andrei Jikh",      ytUrl: "https://youtube.com/@AndreJikh", originalHandle: "@AndreJikh",       currentHandle: "@AndreJikh",       type: "Long-Form", contentType: "Long-Form", category: "Finance",       subCategory: "Personal Finance",  verified: "", tracking: "YES", sharedOn: "Aug 20, 2024", thumbnailUrl: "https://picsum.photos/seed/AndreJikh/320/180" },
  { id: "22", handle: "@MeetKevin",       fullName: "Meet Kevin",       ytUrl: "https://youtube.com/@MeetKevin", originalHandle: "@MeetKevin",       currentHandle: "@MeetKevin",       type: "Long-Form", contentType: "Both",      category: "Finance",       subCategory: "Commentary",        verified: "", tracking: "NO",  sharedOn: "Aug 1, 2024",  thumbnailUrl: "https://picsum.photos/seed/MeetKevin/320/180", isUnavailable: true },
  // Gaming — Long-Form / Both
  { id: "4",  handle: "@PewDiePie",       fullName: "PewDiePie",        ytUrl: "https://youtube.com/@PewDiePie", originalHandle: "@PewDiePie",       currentHandle: "@PewDiePie",       type: "Long-Form", contentType: "Both",      category: "Gaming",        subCategory: "Let's Play",        verified: "", tracking: "NO",  sharedOn: "Jan 8, 2025",  thumbnailUrl: "https://picsum.photos/seed/PewDiePie/320/180",      latestVideoId: "0BnezY5cY9U" },
  { id: "23", handle: "@Markiplier",      fullName: "Markiplier",       ytUrl: "https://youtube.com/@Markiplier", originalHandle: "@Markiplier",      currentHandle: "@Markiplier",      type: "Long-Form", contentType: "Long-Form", category: "Gaming",        subCategory: "Commentary",        verified: "", tracking: "YES", sharedOn: "Jul 14, 2024", thumbnailUrl: "https://picsum.photos/seed/Markiplier/320/180",     latestVideoId: "3_zToVNMfG4" },
  { id: "24", handle: "@jacksepticeye",   fullName: "Jacksepticeye",    ytUrl: "https://youtube.com/@jacksepticeye", originalHandle: "@jacksepticeyeOld",currentHandle: "@jacksepticeye",   type: "Long-Form", contentType: "Long-Form", category: "Gaming",        subCategory: "Let's Play",        verified: "", tracking: "YES", sharedOn: "Jul 1, 2024",  thumbnailUrl: "https://picsum.photos/seed/jacksepticeye/320/180",  latestVideoId: "TgYo5RKPKYU" },
  // Education — Long-Form
  { id: "6",  handle: "@LexFridman",      fullName: "Lex Fridman",      ytUrl: "https://youtube.com/@LexFridman", originalHandle: "@LexFridman",      currentHandle: "@LexFridman",      type: "Long-Form", contentType: "Long-Form", category: "Education",     subCategory: "Podcasts",          verified: "", tracking: "YES", sharedOn: "Jan 3, 2025",  thumbnailUrl: "https://picsum.photos/seed/LexFridman/320/180",    latestVideoId: "jNQXAC9IVRw" },
  { id: "12", handle: "@TomScott",        fullName: "Tom Scott",        ytUrl: "https://youtube.com/@TomScott", originalHandle: "@TomScott",        currentHandle: "@TomScott",        type: "Long-Form", contentType: "Long-Form", category: "Education",     subCategory: "Science",           verified: "", tracking: "YES", sharedOn: "Dec 5, 2024",  thumbnailUrl: "https://picsum.photos/seed/TomScott/320/180",      latestVideoId: "BxV14h0kFs0" },
  { id: "14", handle: "@Veritasium",      fullName: "Veritasium",       ytUrl: "https://youtube.com/@Veritasium", originalHandle: "@Veritasium",      currentHandle: "@Veritasium",      type: "Long-Form", contentType: "Long-Form", category: "Education",     subCategory: "Science",           verified: "", tracking: "YES", sharedOn: "Nov 25, 2024", thumbnailUrl: "https://picsum.photos/seed/Veritasium/320/180",    latestVideoId: "HeQX2HjkcNo" },
  // Fitness — Long-Form / Shorts
  { id: "7",  handle: "@FitnessBlender",  fullName: "Fitness Blender",  ytUrl: "https://youtube.com/@FitnessBlender", originalHandle: "@FitnessBlender",  currentHandle: "@FitnessBlender",  type: "Long-Form", contentType: "Long-Form", category: "Fitness",       subCategory: "Workouts",          verified: "", tracking: "YES", sharedOn: "Dec 28, 2024", thumbnailUrl: "https://picsum.photos/seed/FitnessBlender/320/180", latestVideoId: "dQw4w9WgXcQ" },
  { id: "11", handle: "@TheBodyCoach",    fullName: "The Body Coach",   ytUrl: "https://youtube.com/@TheBodyCoach", originalHandle: "@TheBodyCoach",    currentHandle: "@TheBodyCoach",    type: "Shorts",    contentType: "Shorts",    category: "Fitness",       subCategory: "Quick Workouts",    verified: "", tracking: "NO",  sharedOn: "Dec 10, 2024", thumbnailUrl: "https://picsum.photos/seed/TheBodyCoach/320/180", isUnavailable: true, latestVideoId: "dQw4w9WgXcQ" },
  { id: "25", handle: "@AthleanX",        fullName: "ATHLEAN-X",        ytUrl: "https://youtube.com/@AthleanX", originalHandle: "@AthleanX",        currentHandle: "@AthleanX",        type: "Long-Form", contentType: "Long-Form", category: "Fitness",       subCategory: "Workouts",          verified: "", tracking: "YES", sharedOn: "Jun 10, 2024", thumbnailUrl: "https://picsum.photos/seed/AthleanX/320/180",       latestVideoId: "dQw4w9WgXcQ" },
  // Food
  { id: "8",  handle: "@BabishCulinary",  fullName: "Babish Culinary",  ytUrl: "https://youtube.com/@BabishCulinary", originalHandle: "@BabishCulinary",  currentHandle: "@BabishCulinary",  type: "Long-Form", contentType: "Both",      category: "Food",          subCategory: "Cooking",           verified: "", tracking: "NO",  sharedOn: "Dec 25, 2024", thumbnailUrl: "https://picsum.photos/seed/BabishCulinary/320/180", latestVideoId: "dQw4w9WgXcQ" },
  { id: "26", handle: "@GordonRamsay",    fullName: "Gordon Ramsay",    ytUrl: "https://youtube.com/@GordonRamsay", originalHandle: "@GordonRamsay",    currentHandle: "@GordonRamsay",    type: "Long-Form", contentType: "Both",      category: "Food",          subCategory: "Tutorials",         verified: "", tracking: "YES", sharedOn: "May 30, 2024", thumbnailUrl: "https://picsum.photos/seed/GordonRamsay/320/180",   latestVideoId: "dQw4w9WgXcQ" },
  // Travel — Shorts / Long-Form
  { id: "9",  handle: "@NasDaily",        fullName: "Nas Daily",        ytUrl: "https://youtube.com/@NasDaily", originalHandle: "@NasDaily",        currentHandle: "@NasDaily",        type: "Shorts",    contentType: "Shorts",    category: "Travel",        subCategory: "Vlogs",             verified: "", tracking: "YES", sharedOn: "Dec 20, 2024", thumbnailUrl: "https://picsum.photos/seed/NasDaily/320/180",       latestVideoId: "dQw4w9WgXcQ" },
  { id: "27", handle: "@KaraAndNate",     fullName: "Kara and Nate",    ytUrl: "https://youtube.com/@KaraAndNate", originalHandle: "@KaraAndNate",     currentHandle: "@KaraAndNate",     type: "Long-Form", contentType: "Long-Form", category: "Travel",        subCategory: "Vlogs",             verified: "", tracking: "YES", sharedOn: "May 5, 2024",  thumbnailUrl: "https://picsum.photos/seed/KaraAndNate/320/180",    latestVideoId: "dQw4w9WgXcQ" },
  // Lifestyle
  { id: "15", handle: "@RyanTrahan",      fullName: "Ryan Trahan",      ytUrl: "https://youtube.com/@RyanTrahan", originalHandle: "@RyanTrahan",      currentHandle: "@RyanTrahan",      type: "Shorts",    contentType: "Both",      category: "Lifestyle",     subCategory: "Challenges",        verified: "", tracking: "NO",  sharedOn: "Nov 20, 2024", thumbnailUrl: "https://picsum.photos/seed/RyanTrahan/320/180",     latestVideoId: "dQw4w9WgXcQ" },
  { id: "28", handle: "@EmmaChamerlain",  fullName: "Emma Chamberlain", ytUrl: "https://youtube.com/@EmmaChamerlain", originalHandle: "@EmmaChamerlain",  currentHandle: "@EmmaChamerlain",  type: "Long-Form", contentType: "Both",      category: "Lifestyle",     subCategory: "Vlogs",             verified: "", tracking: "YES", sharedOn: "Apr 12, 2024", thumbnailUrl: "https://picsum.photos/seed/EmmaChamerlain/320/180", latestVideoId: "dQw4w9WgXcQ" },
  // Extra Entertainment
  { id: "29", handle: "@Unspeakable",     fullName: "Unspeakable",      ytUrl: "https://youtube.com/@Unspeakable", originalHandle: "@Unspeakable",     currentHandle: "@Unspeakable",     type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Challenges",        verified: "", tracking: "YES", sharedOn: "Mar 8, 2025",  thumbnailUrl: "https://picsum.photos/seed/Unspeakable/320/180",   latestVideoId: "dQw4w9WgXcQ" },
  { id: "30", handle: "@SSSniperWolf",    fullName: "SSSniperWolf",     ytUrl: "https://youtube.com/@SSSniperWolf", originalHandle: "@SSSniperWolf",    currentHandle: "@SSSniperWolf",    type: "Long-Form", contentType: "Both",      category: "Entertainment", subCategory: "Reactions",         verified: "", tracking: "YES", sharedOn: "Feb 14, 2025", thumbnailUrl: "https://picsum.photos/seed/SSSniperWolf/320/180",  latestVideoId: "dQw4w9WgXcQ" },
  { id: "31", handle: "@LankyBox",        fullName: "LankyBox",         ytUrl: "https://youtube.com/@LankyBox", originalHandle: "@LankyBox",        currentHandle: "@LankyBox",        type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Challenges",        verified: "", tracking: "NO",  sharedOn: "Feb 2, 2025",  thumbnailUrl: "https://picsum.photos/seed/LankyBox/320/180",      latestVideoId: "dQw4w9WgXcQ" },
  { id: "32", handle: "@Aphmau",          fullName: "Aphmau",           ytUrl: "https://youtube.com/@Aphmau", originalHandle: "@Aphmau",          currentHandle: "@Aphmau",          type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Vlogs",             verified: "", tracking: "YES", sharedOn: "Jan 28, 2025", thumbnailUrl: "https://picsum.photos/seed/Aphmau/320/180",        latestVideoId: "dQw4w9WgXcQ" },
  { id: "33", handle: "@NickEh30",        fullName: "Nick Eh 30",       ytUrl: "https://youtube.com/@NickEh30", originalHandle: "@NickEh30",        currentHandle: "@NickEh30",        type: "Long-Form", contentType: "Both",      category: "Entertainment", subCategory: "Commentary",        verified: "", tracking: "NO",  sharedOn: "Dec 3, 2024",  thumbnailUrl: "https://picsum.photos/seed/NickEh30/320/180",      latestVideoId: "dQw4w9WgXcQ" },
  { id: "34", handle: "@ClaytonBigsby",   fullName: "Clayton Bigsby",   ytUrl: "https://youtube.com/@ClaytonBigsby", originalHandle: "@ClaytonBigsby",   currentHandle: "@ClaytonBigsby",   type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Comedy",            verified: "", tracking: "YES", sharedOn: "Nov 15, 2024", thumbnailUrl: "https://picsum.photos/seed/ClaytonBigsby/320/180", latestVideoId: "dQw4w9WgXcQ" },
  { id: "35", handle: "@BeastReacts",     fullName: "Beast Reacts",     ytUrl: "https://youtube.com/@BeastReacts", originalHandle: "@BeastReacts",     currentHandle: "@BeastReacts",     type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Reactions",         verified: "", tracking: "YES", sharedOn: "Oct 30, 2024", thumbnailUrl: "https://picsum.photos/seed/BeastReacts/320/180",   latestVideoId: "dQw4w9WgXcQ" },
  { id: "36", handle: "@LaurenzSide",     fullName: "LaurenzSide",      ytUrl: "https://youtube.com/@LaurenzSide", originalHandle: "@LaurenzSide",     currentHandle: "@LaurenzSide",     type: "Long-Form", contentType: "Long-Form", category: "Entertainment", subCategory: "Challenges",        verified: "", tracking: "NO",  sharedOn: "Sep 12, 2024", thumbnailUrl: "https://picsum.photos/seed/LaurenzSide/320/180",   latestVideoId: "dQw4w9WgXcQ" },
]

export const videos: Video[] = [
  { id: "1",  videoId: "dQw4w9WgXcQ", title: "I Spent 50 Hours In My Backyard Building The Ultimate Challenge Course",  thumbnail: "https://picsum.photos/seed/vid1/320/180",  views: "125M views",  uploadDate: "2 weeks ago",  type: "video" },
  { id: "2",  videoId: "dQw4w9WgXcQ", title: "Testing The World's Most Expensive Tech Gadgets Worth $1 Million",        thumbnail: "https://picsum.photos/seed/vid2/320/180",  views: "89M views",   uploadDate: "1 month ago",  type: "video" },
  { id: "3",  videoId: "dQw4w9WgXcQ", title: "I Survived 100 Days On A Deserted Island - Here's What Happened",         thumbnail: "https://picsum.photos/seed/vid3/320/180",  views: "200M views",  uploadDate: "3 weeks ago",  type: "video" },
  { id: "4",  videoId: "dQw4w9WgXcQ", title: "Building A House For Someone Who Needs It Most",                          thumbnail: "https://picsum.photos/seed/vid4/320/180",  views: "67M views",   uploadDate: "5 days ago",   type: "video" },
  { id: "5",  videoId: "dQw4w9WgXcQ", title: "The Ultimate Gaming Setup Tour - Behind The Scenes",                      thumbnail: "https://picsum.photos/seed/vid5/320/180",  views: "45M views",   uploadDate: "1 week ago",   type: "video" },
  { id: "6",  videoId: "dQw4w9WgXcQ", title: "I Gave Away $1 Million To Random Strangers On The Street",                thumbnail: "https://picsum.photos/seed/vid6/320/180",  views: "156M views",  uploadDate: "2 months ago", type: "video" },
  { id: "7",  videoId: "dQw4w9WgXcQ", title: "Trying The Most Dangerous Foods In The World",                            thumbnail: "https://picsum.photos/seed/vid7/320/180",  views: "78M views",   uploadDate: "3 days ago",   type: "video" },
  { id: "8",  videoId: "dQw4w9WgXcQ", title: "Racing The World's Fastest Cars - Incredible Results",                   thumbnail: "https://picsum.photos/seed/vid8/320/180",  views: "92M views",   uploadDate: "1 month ago",  type: "video" },
  { id: "9",  videoId: "dQw4w9WgXcQ", title: "The Truth About Making Money Online In 2024",                             thumbnail: "https://picsum.photos/seed/vid9/320/180",  views: "34M views",   uploadDate: "4 days ago",   type: "video" },
  { id: "10", videoId: "dQw4w9WgXcQ", title: "I Built A Secret Underground Bunker In My Backyard",                     thumbnail: "https://picsum.photos/seed/vid10/320/180", views: "112M views",  uploadDate: "2 weeks ago",  type: "video" },
  { id: "11", videoId: "dQw4w9WgXcQ", title: "Meeting The Most Inspiring People Around The World",                      thumbnail: "https://picsum.photos/seed/vid11/320/180", views: "56M views",   uploadDate: "6 days ago",   type: "video" },
  { id: "12", videoId: "dQw4w9WgXcQ", title: "The Craziest Experiments You've Never Seen Before",                       thumbnail: "https://picsum.photos/seed/vid12/320/180", views: "83M views",   uploadDate: "1 week ago",   type: "video" },
]

export const shorts: Video[] = [
  { id: "s1",  videoId: "dQw4w9WgXcQ", title: "Wait for the ending! 🤯",                   thumbnail: "https://picsum.photos/seed/short1/320/180",  views: "50M views", uploadDate: "1 day ago",  type: "short" },
  { id: "s2",  videoId: "dQw4w9WgXcQ", title: "You won't believe this trick",               thumbnail: "https://picsum.photos/seed/short2/320/180",  views: "32M views", uploadDate: "2 days ago", type: "short" },
  { id: "s3",  videoId: "dQw4w9WgXcQ", title: "POV: You just discovered something amazing", thumbnail: "https://picsum.photos/seed/short3/320/180",  views: "78M views", uploadDate: "3 days ago", type: "short" },
  { id: "s4",  videoId: "dQw4w9WgXcQ", title: "This changed everything",                    thumbnail: "https://picsum.photos/seed/short4/320/180",  views: "45M views", uploadDate: "5 days ago", type: "short" },
  { id: "s5",  videoId: "dQw4w9WgXcQ", title: "Life hack you NEED to know",                 thumbnail: "https://picsum.photos/seed/short5/320/180",  views: "67M views", uploadDate: "1 week ago", type: "short" },
  { id: "s6",  videoId: "dQw4w9WgXcQ", title: "The secret nobody tells you",                thumbnail: "https://picsum.photos/seed/short6/320/180",  views: "29M views", uploadDate: "4 days ago", type: "short" },
  { id: "s7",  videoId: "dQw4w9WgXcQ", title: "Watch until the end 👀",                     thumbnail: "https://picsum.photos/seed/short7/320/180",  views: "88M views", uploadDate: "2 days ago", type: "short" },
  { id: "s8",  videoId: "dQw4w9WgXcQ", title: "Mind = Blown 🤯",                            thumbnail: "https://picsum.photos/seed/short8/320/180",  views: "41M views", uploadDate: "6 days ago", type: "short" },
  { id: "s9",  videoId: "dQw4w9WgXcQ", title: "Try this at home!",                          thumbnail: "https://picsum.photos/seed/short9/320/180",  views: "55M views", uploadDate: "1 day ago",  type: "short" },
  { id: "s10", videoId: "dQw4w9WgXcQ", title: "This is actually insane",                    thumbnail: "https://picsum.photos/seed/short10/320/180", views: "72M views", uploadDate: "3 days ago", type: "short" },
  { id: "s11", videoId: "dQw4w9WgXcQ", title: "No way this is real",                        thumbnail: "https://picsum.photos/seed/short11/320/180", views: "38M views", uploadDate: "5 days ago", type: "short" },
  { id: "s12", videoId: "dQw4w9WgXcQ", title: "The result will shock you",                  thumbnail: "https://picsum.photos/seed/short12/320/180", views: "63M views", uploadDate: "2 days ago", type: "short" },
]

export const liveStreams: Video[] = [
  { id: "l1",  videoId: "dQw4w9WgXcQ", title: "🔴 LIVE: 24 Hour Challenge Stream",        thumbnail: "https://picsum.photos/seed/live1/320/180",  views: "1.2M watching", uploadDate: "Live now",            type: "live" },
  { id: "l2",  videoId: "dQw4w9WgXcQ", title: "🔴 LIVE: Q&A With Special Guests",         thumbnail: "https://picsum.photos/seed/live2/320/180",  views: "890K watching", uploadDate: "Live now",            type: "live" },
  { id: "l3",  videoId: "dQw4w9WgXcQ", title: "Weekly Gaming Session - Join Us!",          thumbnail: "https://picsum.photos/seed/live3/320/180",  views: "2.1M views",    uploadDate: "Streamed 2 days ago", type: "live" },
  { id: "l4",  videoId: "dQw4w9WgXcQ", title: "Behind The Scenes Production Tour",         thumbnail: "https://picsum.photos/seed/live4/320/180",  views: "1.5M views",    uploadDate: "Streamed 1 week ago", type: "live" },
  { id: "l5",  videoId: "dQw4w9WgXcQ", title: "Charity Stream Marathon For A Good Cause",  thumbnail: "https://picsum.photos/seed/live5/320/180",  views: "3.2M views",    uploadDate: "Streamed 3 days ago", type: "live" },
  { id: "l6",  videoId: "dQw4w9WgXcQ", title: "Late Night Chill Stream With The Team",     thumbnail: "https://picsum.photos/seed/live6/320/180",  views: "780K views",    uploadDate: "Streamed 5 days ago", type: "live" },
  { id: "l7",  videoId: "dQw4w9WgXcQ", title: "Reacting To Your Best Comments",            thumbnail: "https://picsum.photos/seed/live7/320/180",  views: "1.8M views",    uploadDate: "Streamed 1 week ago", type: "live" },
  { id: "l8",  videoId: "dQw4w9WgXcQ", title: "Special Announcement Coming Soon!",         thumbnail: "https://picsum.photos/seed/live8/320/180",  views: "2.4M views",    uploadDate: "Streamed 4 days ago", type: "live" },
  { id: "l9",  videoId: "dQw4w9WgXcQ", title: "Cooking Live With Celebrity Chef",          thumbnail: "https://picsum.photos/seed/live9/320/180",  views: "950K views",    uploadDate: "Streamed 2 weeks ago",type: "live" },
  { id: "l10", videoId: "dQw4w9WgXcQ", title: "Building Something Epic Together",          thumbnail: "https://picsum.photos/seed/live10/320/180", views: "1.1M views",    uploadDate: "Streamed 6 days ago", type: "live" },
  { id: "l11", videoId: "dQw4w9WgXcQ", title: "End Of Year Celebration Stream",            thumbnail: "https://picsum.photos/seed/live11/320/180", views: "4.5M views",    uploadDate: "Streamed 1 month ago",type: "live" },
  { id: "l12", videoId: "dQw4w9WgXcQ", title: "Collaborating With Other Creators",         thumbnail: "https://picsum.photos/seed/live12/320/180", views: "1.6M views",    uploadDate: "Streamed 3 days ago", type: "live" },
]
