"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Search, ExternalLink, Youtube, Pencil, Check, X, ChevronDown, Calendar, AlertCircle, GitCompare, Star } from "lucide-react"
import * as XLSX from "xlsx"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChannelCard } from "@/components/channel-card"


import {
  channels as initialChannels,
  type Channel,
  type TrackingStatus,
  type ContentType,
  type NicheCategory,
} from "@/lib/constants"

const CATEGORIES: NicheCategory[] = [
  "Entertainment", "Tech", "Finance", "Gaming",
  "Education", "Fitness", "Food", "Lifestyle", "Travel", "Music",
]

const SUB_CATEGORIES = [
  "Commentary", "Reviews", "Tutorials", "Vlogs", "Shorts Commentary",
  "Let's Play", "Comedy", "Podcasts", "Workouts", "Cooking",
  "Quick Workouts", "Science", "Sports", "Challenges", "Personal Finance", "Hardware",
]

const CONTENT_TYPES: ContentType[] = ["Long-Form", "Shorts", "Both"]
const TRACKING_STATUSES: TrackingStatus[] = ["YES", "NO"]

// Dummy channel info data per channel id
const CHANNEL_INFO: Record<string, {
  about: string
  createdOn: string
  subscribers: string
  totalVideos: string
  totalViews: string
  country: string
}> = {
  "1": { about: "Stunts, philanthropy and large-scale challenges that push the limits of creativity and generosity.", createdOn: "Feb 19, 2012", subscribers: "290M", totalVideos: "780", totalViews: "42B", country: "🇺🇸 United States" },
  "2": { about: "In-depth consumer tech reviews, smartphone comparisons and cutting-edge gadget coverage.", createdOn: "Jan 21, 2009", subscribers: "18.5M", totalVideos: "1.4K", totalViews: "4.2B", country: "🇺🇸 United States" },
  "3": { about: "Personal finance, real estate investing and wealth-building strategies for everyday people.", createdOn: "Aug 4, 2016", subscribers: "5.1M", totalVideos: "520", totalViews: "890M", country: "🇺🇸 United States" },
  "4": { about: "Gaming commentary, Let's Play series and long-running variety content across genres.", createdOn: "Apr 29, 2010", subscribers: "111M", totalVideos: "4.8K", totalViews: "28B", country: "🇸🇪 Sweden" },
  "5": { about: "Viral short-form comedy and relatable everyday moments reaching hundreds of millions.", createdOn: "Jul 31, 2018", subscribers: "162M", totalVideos: "1.1K", totalViews: "15B", country: "🇩🇿 Algeria" },
  "6": { about: "Long-form conversations on science, AI, philosophy and the future of humanity.", createdOn: "Aug 17, 2018", subscribers: "4.3M", totalVideos: "380", totalViews: "650M", country: "🇺🇸 United States" },
  "7": { about: "Free, professional-grade workout routines for all fitness levels — no gym required.", createdOn: "Jan 21, 2009", subscribers: "7.6M", totalVideos: "680", totalViews: "1.2B", country: "🇺🇸 United States" },
  "8": { about: "Culinary adventures recreating iconic dishes from TV, movies and pop culture.", createdOn: "Aug 5, 2016", subscribers: "10.2M", totalVideos: "330", totalViews: "2.1B", country: "🇺🇸 United States" },
  "9": { about: "One-minute travel stories that capture culture, humanity and hidden corners of the world.", createdOn: "Apr 1, 2016", subscribers: "18M", totalVideos: "1.2K", totalViews: "5.3B", country: "🇮🇱 Israel" },
  "10": { about: "PC hardware reviews, tech builds and in-depth analysis of consumer and enterprise tech.", createdOn: "Aug 24, 2008", subscribers: "15.8M", totalVideos: "5.7K", totalViews: "8.9B", country: "🇨🇦 Canada" },
  "11": { about: "Short daily workout sessions designed to be quick, effective and accessible to everyone.", createdOn: "Jan 28, 2019", subscribers: "3.2M", totalVideos: "290", totalViews: "480M", country: "🇬🇧 United Kingdom" },
  "12": { about: "Fascinating science facts, curious geography and the quirky side of the world around us.", createdOn: "Nov 26, 2008", subscribers: "6.7M", totalVideos: "220", totalViews: "560M", country: "🇬🇧 United Kingdom" },
  "13": { about: "Epic sports trick shots, team challenges and outrageous stunts with world-class athletes.", createdOn: "Mar 16, 2009", subscribers: "60M", totalVideos: "410", totalViews: "18B", country: "🇺🇸 United States" },
  "14": { about: "Science education that makes complex ideas accessible through experiments and storytelling.", createdOn: "Sep 23, 2011", subscribers: "15.9M", totalVideos: "320", totalViews: "1.6B", country: "🇦🇺 Australia" },
  "15": { about: "Lifestyle challenges, creative experiments and entertaining content for Gen Z audiences.", createdOn: "Aug 14, 2018", subscribers: "8.4M", totalVideos: "740", totalViews: "2.3B", country: "🇺🇸 United States" },
  "16": { about: "Science-based engineering stunts, viral contraptions and mind-bending experiments for all ages.", createdOn: "Mar 26, 2011", subscribers: "48M", totalVideos: "140", totalViews: "5.8B", country: "🇺🇸 United States" },
  "17": { about: "Commentary, challenges and behind-the-scenes content from the creator behind MrBeast.", createdOn: "Jan 1, 2012", subscribers: "22M", totalVideos: "210", totalViews: "3.1B", country: "🇺🇸 United States" },
  "18": { about: "Magic illusion videos and jaw-dropping visual effects that fool the eye and stun audiences.", createdOn: "Oct 31, 2013", subscribers: "82M", totalVideos: "970", totalViews: "9.4B", country: "🇺🇸 United States" },
  "19": { about: "Product unboxings, comparisons and hands-on impressions of the latest consumer gadgets.", createdOn: "Dec 11, 2010", subscribers: "22.8M", totalVideos: "850", totalViews: "3.8B", country: "🇨🇦 Canada" },
  "20": { about: "Tech reviews, flagship device showdowns and deep-dives into mobile and consumer electronics.", createdOn: "Nov 17, 2014", subscribers: "15.3M", totalVideos: "1.1K", totalViews: "2.4B", country: "🇮🇳 India" },
  "21": { about: "Investing, dividend strategies and building wealth through passive income and smart finance.", createdOn: "Mar 5, 2016", subscribers: "2.7M", totalVideos: "410", totalViews: "320M", country: "🇺🇸 United States" },
  "22": { about: "Real estate, stocks and economic commentary from a serial entrepreneur and investor.", createdOn: "Jun 27, 2015", subscribers: "2.1M", totalVideos: "3.8K", totalViews: "780M", country: "🇺🇸 United States" },
  "23": { about: "Horror games, comedy playthroughs and emotional storytelling across all game genres.", createdOn: "May 26, 2012", subscribers: "35.6M", totalVideos: "5.4K", totalViews: "19.4B", country: "🇺🇸 United States" },
  "24": { about: "High-energy gaming content, vlogs and charity livestreams with infectious personality.", createdOn: "Feb 7, 2012", subscribers: "30.8M", totalVideos: "4.9K", totalViews: "14.7B", country: "🇮🇪 Ireland" },
  "25": { about: "Science-backed strength and athletic training to help anyone build a better physique.", createdOn: "Jan 17, 2006", subscribers: "13.4M", totalVideos: "1.2K", totalViews: "1.9B", country: "🇺🇸 United States" },
  "26": { about: "Cooking tutorials, restaurant-quality recipes and culinary masterclasses from a Michelin chef.", createdOn: "Jun 28, 2012", subscribers: "20.7M", totalVideos: "720", totalViews: "4.1B", country: "🇬🇧 United Kingdom" },
  "27": { about: "Full-time travel couple documenting life on the road across every continent.", createdOn: "Oct 1, 2015", subscribers: "1.4M", totalVideos: "1.1K", totalViews: "260M", country: "🇺🇸 United States" },
  "28": { about: "Relatable lifestyle vlogs, coffee shop adventures and honest conversations with Gen Z.", createdOn: "Nov 7, 2017", subscribers: "12.2M", totalVideos: "560", totalViews: "1.8B", country: "🇺🇸 United States" },
}

// Date filter options
const DATE_FILTER_OPTIONS = ["All Time", "This Week", "This Month", "Last Month", "Last 3 Months", "Custom Range"] as const
type DateFilterOption = typeof DATE_FILTER_OPTIONS[number]

function parseDateStr(str: string): Date | null {
  try { return new Date(str) } catch { return null }
}

function isInDateRange(sharedOn: string, filter: DateFilterOption, customFrom?: string, customTo?: string): boolean {
  if (filter === "All Time") return true
  const d = parseDateStr(sharedOn)
  if (!d) return true
  const now = new Date()
  if (filter === "This Week") {
    const cutoff = new Date(now)
    cutoff.setDate(now.getDate() - 7)
    return d >= cutoff
  }
  if (filter === "This Month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }
  if (filter === "Last Month") {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear()
  }
  if (filter === "Last 3 Months") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    return d >= cutoff
  }
  if (filter === "Custom Range") {
    const from = customFrom ? new Date(customFrom) : null
    const to = customTo ? new Date(customTo) : null
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }
  return true
}

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChannelId, setSelectedChannelId] = useState(initialChannels[0].id)
  const [channelsState, setChannelsState] = useState<Channel[]>(initialChannels)
  const [isEditMode, setIsEditMode] = useState(false)
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [showHandleDiff, setShowHandleDiff] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilterOption>("All Time")
  const [showDateDropdown, setShowDateDropdown] = useState(false)
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const dateDropdownRef = useRef<HTMLDivElement>(null)
  const settingsBarRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [openField, setOpenField] = useState<"category" | "subCategory" | "contentType" | "tracking" | null>(null)
  const [fieldSearch, setFieldSearch] = useState("")

  const [favourites, setFavourites] = useState<string[]>([])
  const [isFavouritesOpen, setIsFavouritesOpen] = useState(false)
  const [hoveredSimilarId, setHoveredSimilarId] = useState<string | null>(null)

  const toggleFavourite = (id: string) => {
    setFavourites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  const exportFavouritesToExcel = () => {
    const favChannels = channelsState.filter(c => favourites.includes(c.id))
    const data = favChannels.map(c => ({
      Handle: c.handle,
      "Channel Name": c.fullName || "",
      Category: c.category,
      "Sub-Category": c.subCategory,
      Type: c.type,
      Tracking: c.tracking,
      "Verified/Remarks": c.verified || "",
      "YT URL": c.ytUrl || "",
      "Shared On": c.sharedOn,
    }))

    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Favourites")
    XLSX.writeFile(workbook, "YT-Niche-Favourites.xlsx")
  }

  const [tempValues, setTempValues] = useState({
    category: initialChannels[0].category as string,
    subCategory: initialChannels[0].subCategory,
    contentType: (initialChannels[0].contentType || "Long-Form") as string,
    tracking: initialChannels[0].tracking as string,
    verified: initialChannels[0].verified,
  })

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setShowDateDropdown(false)
      }
      if (settingsBarRef.current && !settingsBarRef.current.contains(e.target as Node)) {
        setOpenField(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Mouse wheel horizontal scroll for Similar Channels
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      el.scrollLeft += e.deltaY * 2
    }
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [scrollContainerRef.current])

  const filteredChannels = useMemo(() => {
    return channelsState.filter((channel) => {
      // Toggle filters: union mode — if either ON, show only matching channels
      const unavailableMatch = showUnavailable && channel.isUnavailable === true
      const diffMatch = showHandleDiff && channel.originalHandle !== channel.currentHandle
      if (showUnavailable || showHandleDiff) {
        if (!unavailableMatch && !diffMatch) return false
      }
      if (!isInDateRange(channel.sharedOn, dateFilter, customFrom, customTo)) return false
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return (
        channel.handle.toLowerCase().includes(query) ||
        channel.category.toLowerCase().includes(query) ||
        channel.type.toLowerCase().includes(query)
      )
    })
  }, [channelsState, searchQuery, showUnavailable, showHandleDiff, dateFilter, customFrom, customTo])

  const selectedChannel = channelsState.find((c) => c.id === selectedChannelId)!
  const channelInfo = CHANNEL_INFO[selectedChannelId] ?? {
    about: "—", createdOn: "—", subscribers: "—",
    totalVideos: "—", totalViews: "—", country: "—",
  }

  const handleSelectChannel = (id: string) => {
    const ch = channelsState.find((c) => c.id === id)!
    setSelectedChannelId(id)
    setIsEditMode(false)
    setTempValues({
      category: ch.category,
      subCategory: ch.subCategory,
      contentType: ch.contentType || "Long-Form",
      tracking: ch.tracking,
      verified: ch.verified,
    })
  }

  const handleEdit = () => {
    setTempValues({
      category: selectedChannel.category,
      subCategory: selectedChannel.subCategory,
      contentType: selectedChannel.contentType || "Long-Form",
      tracking: selectedChannel.tracking,
      verified: selectedChannel.verified,
    })
    setIsEditMode(true)
  }

  const handleSave = () => {
    setChannelsState((prev) =>
      prev.map((c) =>
        c.id === selectedChannelId
          ? {
            ...c,
            category: tempValues.category as NicheCategory,
            subCategory: tempValues.subCategory,
            contentType: tempValues.contentType as ContentType,
            tracking: tempValues.tracking as TrackingStatus,
            verified: tempValues.verified,
          }
          : c
      )
    )
    setIsEditMode(false)
  }

  const handleCancel = () => {
    setTempValues({
      category: selectedChannel.category,
      subCategory: selectedChannel.subCategory,
      contentType: selectedChannel.contentType || "Long-Form",
      tracking: selectedChannel.tracking,
      verified: selectedChannel.verified,
    })
    setIsEditMode(false)
  }

  // Instantly persist a single field change without entering edit mode
  const handleFieldChange = (field: "category" | "subCategory" | "contentType" | "tracking", value: string) => {
    setChannelsState((prev) =>
      prev.map((c) =>
        c.id === selectedChannelId
          ? {
            ...c,
            ...(field === "category" ? { category: value as NicheCategory } : {}),
            ...(field === "subCategory" ? { subCategory: value } : {}),
            ...(field === "contentType" ? { contentType: value as ContentType } : {}),
            ...(field === "tracking" ? { tracking: value as TrackingStatus } : {}),
          }
          : c
      )
    )
    setTempValues((p) => ({ ...p, [field]: value }))
    setOpenField(null)
  }

  const similarChannels = useMemo(() =>
    channelsState.filter(
      (c) =>
        c.id !== selectedChannelId &&
        c.type === selectedChannel.type &&
        c.category === selectedChannel.category
    ),
    [channelsState, selectedChannelId, selectedChannel]
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-[320px] flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden">
        {/* Logo */}
        <div className="flex-shrink-0 p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Youtube className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-sidebar-foreground">
              YT Niche Overview
            </h1>
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 p-3 border-b border-sidebar-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Channel List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            {filteredChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isActive={channel.id === selectedChannelId}
                onClick={() => handleSelectChannel(channel.id)}
              />
            ))}
            {filteredChannels.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No channels found
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* ── RIGHT PANEL ── */}
      <main className="flex-1 flex flex-col h-full bg-background overflow-hidden">

        {/* A) CHANNEL SETTINGS HORIZONTAL BAR — redesigned, full-width */}
        <div className="flex-shrink-0 px-5 border-b border-border bg-muted/20" style={{ minHeight: "56px" }}>
          <div className="flex items-center h-full gap-0 flex-nowrap" style={{ minHeight: "56px" }}>

            {/* Toggle 1: Unavailable Handle (red when ON) */}
            <div
              onClick={() => setShowUnavailable((v) => !v)}
              className="flex items-center gap-2 px-4 cursor-pointer flex-shrink-0 select-none"
            >
              <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${showUnavailable ? "text-red-400" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium whitespace-nowrap ${showUnavailable ? "text-foreground" : "text-muted-foreground"}`}>
                Unavailable Handle
              </span>
              <span className={`relative inline-flex w-8 h-4 rounded-full flex-shrink-0 transition-colors duration-200 ${showUnavailable ? "bg-red-600" : "bg-muted-foreground/30"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-200 ${showUnavailable ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
            </div>

            <div className="w-px self-stretch bg-border flex-shrink-0" />

            {/* Toggle 2: Handle Diff (amber when ON) */}
            <div
              onClick={() => setShowHandleDiff((v) => !v)}
              className="flex items-center gap-2 px-4 cursor-pointer flex-shrink-0 select-none"
            >
              <GitCompare className={`w-3.5 h-3.5 flex-shrink-0 ${showHandleDiff ? "text-amber-400" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium whitespace-nowrap ${showHandleDiff ? "text-foreground" : "text-muted-foreground"}`}>
                Handle Diff
              </span>
              <span className={`relative inline-flex w-8 h-4 rounded-full flex-shrink-0 transition-colors duration-200 ${showHandleDiff ? "bg-amber-500" : "bg-muted-foreground/30"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-200 ${showHandleDiff ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
            </div>

            <div className="w-px self-stretch bg-border flex-shrink-0" />

            {/* Calendar Filter */}
            <div className="relative flex-shrink-0 px-3" ref={dateDropdownRef}>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Date Added</span>
                <button
                  onClick={() => setShowDateDropdown((v) => !v)}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:text-purple-400 transition-colors"
                >
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  {dateFilter}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
              {showDateDropdown && (
                <div className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-2xl min-w-[200px] py-1.5 overflow-hidden">
                  {DATE_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setDateFilter(opt); if (opt !== "Custom Range") setShowDateDropdown(false) }}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors ${dateFilter === opt
                        ? "text-purple-400 font-semibold bg-purple-500/10"
                        : "text-foreground hover:bg-purple-500/10 hover:text-purple-300"
                        }`}
                    >
                      {opt}
                    </button>
                  ))}
                  {dateFilter === "Custom Range" && (
                    <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
                      <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                        className="h-7 text-xs bg-background border border-border rounded-lg px-2 text-foreground w-full focus:outline-none focus:ring-1 focus:ring-purple-500" />
                      <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                        className="h-7 text-xs bg-background border border-border rounded-lg px-2 text-foreground w-full focus:outline-none focus:ring-1 focus:ring-purple-500" />
                      <button onClick={() => setShowDateDropdown(false)}
                        className="h-7 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg font-medium transition-colors">Apply</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="w-px self-stretch bg-border flex-shrink-0" />

            {/* Inline searchable dropdowns — always active */}
            <div className="flex items-stretch flex-nowrap flex-1" ref={settingsBarRef}>
              {([
                { key: "category" as const, label: "Category", options: CATEGORIES, value: selectedChannel.category || "—" },
                { key: "subCategory" as const, label: "Sub-Category", options: SUB_CATEGORIES, value: selectedChannel.subCategory || "—" },
                { key: "contentType" as const, label: "Type", options: CONTENT_TYPES, value: selectedChannel.contentType || "—" },
                { key: "tracking" as const, label: "Tracking", options: TRACKING_STATUSES, value: selectedChannel.tracking || "—" },
              ]).map(({ key, label, options, value }, idx, arr) => {
                const isOpen = openField === key
                const filtered = (options as readonly string[]).filter((o) =>
                  o.toLowerCase().includes(isOpen ? fieldSearch.toLowerCase() : "")
                )
                // Dot colors per option
                const dotColor = (k: string, opt: string): string => {
                  if (k === "contentType") {
                    if (opt === "Long-Form") return "bg-blue-400"
                    if (opt === "Shorts") return "bg-red-400"
                    return "bg-purple-400"
                  }
                  if (k === "tracking") return opt === "YES" ? "bg-green-400" : "bg-zinc-500"
                  const palette = ["bg-purple-400", "bg-blue-400", "bg-amber-400", "bg-emerald-400", "bg-pink-400", "bg-cyan-400", "bg-orange-400", "bg-rose-400", "bg-teal-400", "bg-violet-400", "bg-lime-400", "bg-indigo-400", "bg-sky-400", "bg-fuchsia-400", "bg-green-400", "bg-yellow-400"]
                  return palette[(options as readonly string[]).indexOf(opt) % palette.length]
                }
                return (
                  <>
                    <div key={key} className="relative flex-1 px-3 flex flex-col justify-center">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">{label}</span>
                      <button
                        onClick={() => { setOpenField(isOpen ? null : key); setFieldSearch("") }}
                        className={`flex items-center gap-1.5 text-[13px] font-medium transition-colors w-full text-left rounded px-1 py-0.5 -mx-1 ${isOpen ? "text-purple-400 bg-white/5 ring-1 ring-purple-500/40" : "text-foreground hover:text-purple-400 hover:bg-white/5"
                          }`}
                      >
                        <span className={key === "tracking" ? (value === "YES" ? "text-green-400" : "text-red-400") : ""}>
                          {value}
                        </span>
                        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${isOpen ? "rotate-180 text-purple-400" : "text-muted-foreground"}`} />
                      </button>
                      {isOpen && (
                        <div className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-2xl min-w-[200px] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
                          <div className="p-2 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                              <input
                                autoFocus
                                value={fieldSearch}
                                onChange={(e) => setFieldSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full h-7 text-xs bg-background border border-border rounded-lg pl-7 pr-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto py-1">
                            {filtered.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-4 py-2">No results</p>
                            ) : filtered.map((opt) => (
                              <button
                                key={opt}
                                onClick={() => handleFieldChange(key, opt)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${opt === value ? "bg-purple-500/10" : "hover:bg-white/5"
                                  }`}
                              >
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(key, opt)}`} />
                                <span className={opt === value ? "text-purple-300 font-medium" : "text-foreground"}>
                                  {opt}
                                </span>
                                {opt === value && (
                                  <span className="ml-auto text-purple-400 text-xs">✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {idx < arr.length - 1 && <div className="w-px self-stretch bg-border flex-shrink-0" />}
                  </>
                )
              })}
            </div>

            {/* Edit / Save / Cancel only — Verified/Remarks moved to info column */}
            <div className="flex items-center gap-2 px-4 flex-shrink-0">
              {isEditMode ? (
                <>
                  <Button size="sm" onClick={handleSave}
                    className="h-7 px-3 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1 rounded-lg">
                    <Check className="w-3 h-3" />Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancel}
                    className="h-7 px-3 text-xs gap-1 rounded-lg">
                    <X className="w-3 h-3" />Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={handleEdit}
                  className="h-7 px-3 text-xs gap-1.5 border-purple-500/50 text-purple-400 hover:bg-purple-500/10 rounded-lg flex-shrink-0">
                  <Pencil className="w-3 h-3" />Edit
                </Button>
              )}
            </div>

          </div>
        </div>


        {/* C+D) TWO-COLUMN: VIDEO PLAYER (left 60%) + INFO CARDS (right 40%) */}
        <div className="flex flex-1 min-h-0 px-5 pt-4 pb-4 gap-4 overflow-hidden">

          {/* LEFT — Video Player */}
          <div className="w-[60%] flex flex-col min-h-0">
            <div className="w-full h-full rounded-xl overflow-hidden bg-muted">
              <iframe
                key={selectedChannel.id}
                src={`https://www.youtube.com/embed/${selectedChannel.latestVideoId || 'dQw4w9WgXcQ'}?rel=0&autoplay=0`}
                title="YouTube video player"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>

          {/* RIGHT — Info Cards stacked vertically, fills height of left column */}
          <div className="w-[40%] flex flex-col h-full min-h-0 gap-3 overflow-y-auto pr-2">

            {/* Channel Identity Card — @handle, badges, YouTube link */}
            <div className="flex flex-col gap-2 bg-muted/60 border border-border rounded-xl px-4 py-3 flex-shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-foreground leading-tight">
                    {selectedChannel.handle}
                    {selectedChannel.fullName && ` · ${selectedChannel.fullName}`}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${selectedChannel.type === "Shorts" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                      }`}>{selectedChannel.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/20 text-primary">
                      {selectedChannel.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground italic">{selectedChannel.subCategory}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleFavourite(selectedChannel.id)}
                    className="flex items-center justify-center transition-colors hover:scale-110"
                    title={favourites.includes(selectedChannel.id) ? "Remove from Favourites" : "Add to Favourites"}
                  >
                    <Star
                      className={`w-5 h-5 transition-colors ${favourites.includes(selectedChannel.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
                    />
                  </button>
                  {selectedChannel.ytUrl ? (
                    <button
                      onClick={() => window.open(selectedChannel.ytUrl, "_blank")}
                      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors flex-shrink-0"
                    >
                      <ExternalLink className="w-3 h-3" />
                      YouTube
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium flex-shrink-0 cursor-not-allowed">
                      <ExternalLink className="w-3 h-3 opacity-50" />
                      No URL
                    </span>
                  )}
                </div>
              </div>
              <div className="h-px bg-border" />
            </div>

            {/* About card */}
            <div className="flex flex-col gap-1.5 bg-muted/60 border border-border rounded-xl px-4 py-3 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">About</span>
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {channelInfo.about}
              </p>
            </div>

            {/* Subscribers + Total Videos side by side */}
            <div className="flex gap-3 flex-shrink-0">
              <div className="flex-1 flex flex-col gap-1.5 bg-muted/60 border border-border rounded-xl px-4 py-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Subscribers</span>
                <span className="text-lg font-bold text-foreground">{channelInfo.subscribers}</span>
              </div>
              <div className="flex-1 flex flex-col gap-1.5 bg-muted/60 border border-border rounded-xl px-4 py-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Videos</span>
                <span className="text-lg font-bold text-foreground">{channelInfo.totalVideos}</span>
              </div>
            </div>

            {/* Total Views + Created On side by side */}
            <div className="flex gap-3 flex-shrink-0">
              <div className="flex-1 flex flex-col gap-1.5 bg-muted/60 border border-border rounded-xl px-4 py-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Views</span>
                <span className="text-lg font-bold text-foreground">{channelInfo.totalViews}</span>
              </div>
              <div className="flex-1 flex flex-col gap-1.5 bg-muted/60 border border-border rounded-xl px-4 py-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Created On</span>
                <span className="text-sm font-bold text-foreground">{channelInfo.createdOn}</span>
              </div>
            </div>

            {/* Country — full width */}
            <div className="flex flex-col gap-1.5 bg-muted/60 border border-border rounded-xl px-4 py-3 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Country</span>
              <span className="text-sm font-bold text-foreground">{channelInfo.country}</span>
            </div>

            {/* Verified / Remarks card */}
            <div className="flex flex-col gap-1.5 bg-muted/60 border border-border rounded-xl px-4 py-3 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Verified / Remarks</span>
              {isEditMode ? (
                <textarea
                  value={tempValues.verified}
                  onChange={(e) => setTempValues((p) => ({ ...p, verified: e.target.value }))}
                  placeholder="Add verification notes or remarks…"
                  className="flex-1 w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none min-h-[72px]"
                />
              ) : (
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {selectedChannel.verified || "—"}
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Spacer to push Similar Channels to the bottom */}
        <div className="flex-none h-4" />

        {/* E) SIMILAR CHANNELS STRIP — 16:9 thumbnail cards */}
        <div className="flex-shrink-0 px-5 pb-4 overflow-visible relative z-10">
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-3">
            Similar Channels
          </p>
          {similarChannels.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No similar channels found.</p>
          ) : (
            <div
              ref={scrollContainerRef}
              className="flex flex-nowrap items-start overflow-x-scroll overflow-y-visible gap-3 py-4"
              onMouseLeave={() => setHoveredSimilarId(null)}
            >
              {similarChannels.slice(0, 4).map((ch) => {
                const thumbUrl = ch.thumbnailUrl || `https://picsum.photos/seed/${ch.id}/480/270`
                return (
                  <button
                    key={ch.id}
                    onClick={() => handleSelectChannel(ch.id)}
                    onMouseEnter={() => setHoveredSimilarId(ch.id)}
                    className={`group bg-muted/60 border border-border rounded-xl overflow-visible text-left transition-all duration-200 cursor-pointer flex-shrink-0 min-w-[280px] ${hoveredSimilarId === null
                      ? "scale-100 opacity-100"
                      : hoveredSimilarId === ch.id
                        ? "scale-105 z-10 shadow-xl border-primary/60"
                        : "scale-95 opacity-70"
                      }`}
                  >
                    {/* 16:9 Thumbnail */}
                    <div className="w-full aspect-video relative overflow-hidden rounded-t-xl bg-zinc-900">
                      {/* Letter fallback always rendered underneath */}
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                        <span className="text-3xl font-bold text-white/30">
                          {ch.handle.replace("@", "").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      {/* YouTube thumbnail on top — hides via onError if unavailable */}
                      <img
                        src={thumbUrl}
                        alt={ch.handle}
                        className="absolute inset-0 w-full aspect-video object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 ml-0.5">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-3">
                      <p className="font-bold text-white text-sm truncate">{ch.handle}</p>
                      <p className="text-xs text-muted-foreground truncate mb-2">{ch.fullName || ch.handle.replace("@", "")}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ch.type === "Shorts" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                          }`}>{ch.type}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/20 text-primary">
                          {ch.category}
                        </span>
                        <span className="text-xs italic text-muted-foreground">· {ch.subCategory}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

      </main>

      {/* ── FAVOURITES PANEL & TOGGLE ── */}
      <button
        onClick={() => setIsFavouritesOpen(!isFavouritesOpen)}
        className={`fixed top-1/2 -translate-y-1/2 bg-sidebar border border-border text-sidebar-foreground py-3 px-1 rounded-l-lg shadow-xl z-40 flex items-center justify-center transition-all duration-300 hover:bg-sidebar-accent ${isFavouritesOpen ? 'right-[280px]' : 'right-0 border-r-0'}`}
      >
        <span className="text-lg font-bold leading-none select-none">{isFavouritesOpen ? "»" : "«"}</span>
      </button>

      <div
        className={`fixed top-0 right-0 h-full w-[280px] bg-sidebar border-l border-border shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isFavouritesOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-bold text-sidebar-foreground flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            Favourites
          </h2>
          <button onClick={() => setIsFavouritesOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {favourites.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-4">
              No favourites yet. Click <Star className="w-3 h-3 inline mx-1" /> to add channels.
            </p>
          ) : (
            channelsState.filter(c => favourites.includes(c.id)).map(ch => (
              <div key={ch.id} className="flex items-center justify-between bg-background border border-border p-2 rounded-lg group cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { handleSelectChannel(ch.id); setIsFavouritesOpen(false); }}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    {ch.handle.replace("@", "").charAt(0).toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold truncate text-foreground">{ch.handle}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{ch.category}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavourite(ch.id); }}
                  className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border flex-shrink-0">
          <Button
            onClick={exportFavouritesToExcel}
            disabled={favourites.length === 0}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 font-medium"
          >
            Export as Excel
          </Button>
        </div>
      </div>
    </div>
  )
}
