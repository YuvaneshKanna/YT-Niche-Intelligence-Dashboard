"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Search, ExternalLink, Youtube, Pencil, Check, X, ChevronDown, Calendar, AlertCircle, GitCompare, Star } from "lucide-react"
import * as XLSX from "xlsx"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { DayPicker } from "react-day-picker"
import "react-day-picker/style.css"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChannelCard } from "@/components/channel-card"
import { SimilarChannelCard } from "@/components/similar-channel-card"
import { UserSelectModal } from "@/components/user-select-modal"

import {
  type Channel,
  type TrackingStatus,
  type ContentType,
  type NicheCategory,
} from "@/lib/constants"
import { useChannels } from "@/lib/useChannels"



// Date filter options
const DATE_FILTER_OPTIONS = ["All Time", "This Week", "This Month", "Custom Range"] as const
type DateFilterOption = typeof DATE_FILTER_OPTIONS[number]

function parseDateStr(str: string): Date | null {
  try { return new Date(str) } catch { return null }
}

function isInDateRange(sharedOn: string, filter: DateFilterOption, customRange?: DateRange): boolean {
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
  if (filter === "Custom Range") {
    const from = customRange?.from ?? null
    const to = customRange?.to ?? null
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }
  return true
}

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChannelId, setSelectedChannelId] = useState<string>("")
  const { channels: initialChannels, loading, setChannels: setChannelsState } = useChannels()
  const [channelsState, setChannelsState2] = useState<Channel[]>([])

  const CATEGORIES = useMemo(() =>
    [...new Set(channelsState.map(c => c.category).filter(Boolean))].sort(),
    [channelsState]
  )

  const SUB_CATEGORIES = useMemo(() =>
    [...new Set(channelsState.map(c => c.subCategory).filter(Boolean))].sort(),
    [channelsState]
  )

  const CONTENT_TYPES = useMemo(() =>
    [...new Set(channelsState.map(c => c.type).filter(Boolean))].sort(),
    [channelsState]
  )

  const TRACKING_STATUSES = useMemo(() =>
    [...new Set(channelsState.map(c => c.tracking).filter(Boolean))].sort(),
    [channelsState]
  )

  useEffect(() => {
    if (initialChannels.length > 0) {
      setChannelsState2(initialChannels)
      if (!selectedChannelId) setSelectedChannelId(initialChannels[0].id)
    }
  }, [initialChannels])
  const [isEditMode, setIsEditMode] = useState(false)
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [showHandleDiff, setShowHandleDiff] = useState(false)
  const [channelIsUnavailable, setChannelIsUnavailable] = useState(false)
  const [channelHasHandleDiff, setChannelHasHandleDiff] = useState(false)
  const [handleDiffInfo, setHandleDiffInfo] = useState<{ previousHandle: string; currentHandle: string } | null>(null)
  const [handleDiffEdits, setHandleDiffEdits] = useState<{ previousHandle: string; currentHandle: string }>({ previousHandle: "", currentHandle: "" })
  const [resolvedHandle, setResolvedHandle] = useState("")
  const [dateFilter, setDateFilter] = useState<DateFilterOption>("All Time")
  const [showDateDropdown, setShowDateDropdown] = useState(false)
  // Applied custom range (used for filtering)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  // Draft range (in-picker, before Apply)
  const [rangeDraft, setRangeDraft] = useState<DateRange | undefined>(undefined)
  // Dual-calendar navigation: left panel month
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d
  })
  const [showMonthPicker, setShowMonthPicker] = useState<0 | 1 | null>(null)
  const dateDropdownRef = useRef<HTMLDivElement>(null)
  const settingsBarRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [openField, setOpenField] = useState<"category" | "subCategory" | "contentType" | "tracking" | null>(null)
  const [fieldSearch, setFieldSearch] = useState("")

  // Filter mode state — empty string = "All" (no filter)
  const [filterValues, setFilterValues] = useState({
    category: "",
    subCategory: "",
    contentType: "",
    tracking: "",
  })
  const activeFilterCount = Object.values(filterValues).filter(v => v !== "").length

  const [favourites, setFavourites] = useState<string[]>([])
  const [currentUser, setCurrentUser] = useState<string>("")
  const [favouriteFilter, setFavouriteFilter] = useState<string>("All")
  const [favouriteData, setFavouriteData] = useState<{ ytUrl: string; addedBy: string; addedAt: string }[]>([])
  const [isFavouritesOpen, setIsFavouritesOpen] = useState(false)
  const [hoveredSimilarId, setHoveredSimilarId] = useState<string | null>(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoData, setVideoData] = useState<{ videoId: string; title: string; thumbnail: string; publishedAt?: string; views?: string; likes?: string; comments?: string } | null>(null)
  const [videoLoading, setVideoLoading] = useState(false)

  useEffect(() => {
    fetch('/api/favourites')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setFavouriteData(data.favourites)
          setFavourites(data.favourites.map((f: any) => f.ytUrl))
        }
      })
      .catch(() => { })
  }, [])

  const toggleFavourite = async (id: string) => {
    const channel = channelsState.find(c => c.id === id)
    if (!channel || !currentUser) return
    const ytUrl = channel.ytUrl
    const isCurrentlyFav = favouriteData.some(f => f.ytUrl === ytUrl && f.addedBy === currentUser)

    if (isCurrentlyFav) {
      // Remove
      setFavouriteData(prev => prev.filter(f => !(f.ytUrl === ytUrl && f.addedBy === currentUser)))
      setFavourites(prev =>
        prev.filter(url => url !== ytUrl)
      )
      await fetch('/api/favourites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ytUrl, addedBy: currentUser }),
      })
    } else {
      // Add
      const newFav = { ytUrl: ytUrl as string, addedBy: currentUser as string, addedAt: new Date().toISOString() }
      setFavouriteData((prev: { ytUrl: string; addedBy: string; addedAt: string }[]) => [...prev, newFav])
      setFavourites((prev: string[]) => [...prev, ytUrl as string])
      await fetch('/api/favourites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ytUrl, addedBy: currentUser }),
      })
    }
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
    category: "" as string,
    subCategory: "",
    contentType: "Long-Form" as string,
    tracking: "NO" as string,
    verified: "",
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
      // Toggle filters
      const unavailableMatch = showUnavailable && channel.isUnavailable === true
      const diffMatch = showHandleDiff && channel.hasHandleDiff === true
      if (showUnavailable || showHandleDiff) {
        if (!unavailableMatch && !diffMatch) return false
      }
      if (!isInDateRange(channel.sharedOn, dateFilter, customRange)) return false
      // Dropdown filters (AND logic — only applied in filter mode)
      if (!isEditMode) {
        if (filterValues.category && channel?.category !== filterValues.category) return false
        if (filterValues.subCategory && channel?.subCategory !== filterValues.subCategory) return false
        if (filterValues.contentType && channel?.type !== filterValues.contentType) return false
        if (filterValues.tracking && channel?.tracking !== filterValues.tracking) return false
      }
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return (
        channel?.handle?.toLowerCase().includes(query) ||
        channel?.category?.toLowerCase().includes(query) ||
        channel?.type?.toLowerCase().includes(query)
      )
    })
  }, [channelsState, searchQuery, showUnavailable, showHandleDiff, dateFilter, customRange, filterValues, isEditMode])

  const selectedChannel = channelsState.find(c => c.id === selectedChannelId) ?? channelsState[0]
  const [channelInfo, setChannelInfo] = useState({
    channelName: "—", about: "—", createdOn: "—", subscribers: "—",
    totalVideos: "—", totalViews: "—", country: "—",
  })

  // Fetch most popular video when selected channel changes
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setChannelInfo({
      channelName: "—", about: "—", createdOn: "—", subscribers: "—",
      totalVideos: "—", totalViews: "—", country: "—",
    })
    const ch = channelsState.find(c => c.id === selectedChannelId)
    if (!ch?.handle || ch.handle.toLowerCase().includes('unavailable')) return
    fetch(`/api/channel-stats?handle=${encodeURIComponent(ch.handle)}&ytUrl=${encodeURIComponent(ch.ytUrl || '')}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setChannelInfo({
            channelName: data.channelName || '—',
            about: data.about || '—',
            subscribers: data.subscribers || '—',
            totalVideos: data.totalVideos || '—',
            totalViews: data.totalViews || '—',
            createdOn: data.createdOn || '—',
            country: data.country || '—',
          })
        }
      })
      .catch(() => { })
  }, [selectedChannelId, channelsState])
  useEffect(() => {
    const handle = channelsState.find(c => c.id === selectedChannelId)?.handle
    if (!handle) return
    setVideoData(null)
    setVideoPlaying(false)
    setVideoLoading(true)
    const ch = channelsState.find(c => c.id === selectedChannelId)
    fetch(`/api/channel-video?handle=${encodeURIComponent(handle)}&ytUrl=${encodeURIComponent(ch?.ytUrl || '')}`)
      .then(r => r.json())
      .then(data => {
        if (data.videoId) setVideoData(data)
      })
      .catch(() => { })
      .finally(() => setVideoLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId])
  useEffect(() => {
    const selectedCh = channelsState.find(c => c.id === selectedChannelId)
    if (!selectedCh) { setHandleDiffInfo(null); return }
    const normHandle = (h: string) => (h || '').trim().toLowerCase().replace(/^@/, '')
    const selHandle = normHandle(selectedCh.handle || '')
    if (!selHandle || selHandle.includes('unavailable')) { setHandleDiffInfo(null); return }
    fetch('/api/handle-diff')
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.diffs)) {
          const found = data.diffs.find((d: any) =>
            normHandle(d.previousHandle) === selHandle ||
            normHandle(d.currentHandle) === selHandle
          )
          if (found) {
            setHandleDiffInfo({ previousHandle: found.previousHandle, currentHandle: found.currentHandle })
            setHandleDiffEdits({ previousHandle: found.previousHandle, currentHandle: found.currentHandle })
          } else {
            setHandleDiffInfo(null)
          }
        } else {
          setHandleDiffInfo(null)
        }
      })
      .catch(() => setHandleDiffInfo(null))
  }, [selectedChannelId, channelsState])

  const handleSelectChannel = (id: string) => {
    const ch = channelsState.find((c) => c.id === id)!
    setSelectedChannelId(id)
    setChannelIsUnavailable(ch.isUnavailable === true)
    setChannelHasHandleDiff(ch.hasHandleDiff === true)
    setResolvedHandle("")
    setHandleDiffInfo(null)
    setVideoPlaying(false)
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
      category: selectedChannel?.category,
      subCategory: selectedChannel?.subCategory,
      contentType: selectedChannel?.contentType || "Long-Form",
      tracking: selectedChannel?.tracking,
      verified: selectedChannel?.verified,
    })
    setIsEditMode(true)
  }

  const handleSave = async () => {
    // Update local state immediately
    setChannelsState2((prev) =>
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

    // Write back to Google Sheets
    try {
      await fetch('/api/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ytUrl: selectedChannel?.ytUrl,
          type: tempValues.contentType,
          nicheCategory: tempValues.category,
          subCategory: tempValues.subCategory,
          verified: tempValues.verified,
          tracking: tempValues.tracking,
        }),
      })
    } catch (err) {
      console.error('Failed to save to Sheets:', err)
    }
    // Save resolved handle to Manual Sheet column B
    if (channelIsUnavailable && resolvedHandle.startsWith('@') && resolvedHandle.trim() !== '') {
      try {
        await fetch('/api/channels', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ytUrl: selectedChannel?.ytUrl,
            handle: resolvedHandle.trim(),
          }),
        })
        setChannelsState2(prev => prev.map(c =>
          c.id === selectedChannelId
            ? { ...c, handle: resolvedHandle.trim(), isUnavailable: false }
            : c
        ))
        setChannelIsUnavailable(false)
      } catch (err) {
        console.error('Failed to save resolved handle:', err)
      }
    }

    // Save handle diff edits to Handle Diff sheet
    if ((channelHasHandleDiff || showHandleDiff) && handleDiffInfo) {
      try {
        await fetch('/api/handle-diff', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ytUrl: selectedChannel?.ytUrl,
            previousHandle: handleDiffEdits.previousHandle,
            currentHandle: handleDiffEdits.currentHandle,
          }),
        })
        setHandleDiffInfo({ ...handleDiffEdits })
      } catch (err) {
        console.error('Failed to save handle diff:', err)
      }
    }
  }

  const handleCancel = () => {
    setTempValues({
      category: selectedChannel?.category,
      subCategory: selectedChannel?.subCategory,
      contentType: selectedChannel?.contentType || "Long-Form",
      tracking: selectedChannel?.tracking,
      verified: selectedChannel?.verified,
    })
    setIsEditMode(false)
  }

  // Edit mode: update temp value
  const handleFieldChange = (field: "category" | "subCategory" | "contentType" | "tracking", value: string) => {
    setTempValues((p) => ({ ...p, [field]: value }))
    setOpenField(null)
  }

  // Filter mode: update filter value (empty = All)
  const handleFilterChange = (field: "category" | "subCategory" | "contentType" | "tracking", value: string) => {
    setFilterValues((p) => ({ ...p, [field]: value }))
    setOpenField(null)
  }

  const similarChannels = useMemo(() =>
    channelsState.filter(
      (c) =>
        c.id !== selectedChannelId &&
        c.type === selectedChannel?.type &&
        c.category === selectedChannel?.category
    ),
    [channelsState, selectedChannelId, selectedChannel]
  )

  if (loading || channelsState.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading channels...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-[320px] flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden">
        {/* Logo */}
        <div className="flex-shrink-0 h-14 flex items-center px-5 border-b border-sidebar-border">
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
        <div className="flex-shrink-0 h-14 px-5 border-b border-border bg-muted/20">
          <div className="flex items-center h-full gap-0 flex-nowrap">

            {/* Toggle 1: Unavailable Handle (red when ON) */}
            <div
              onClick={() => setShowUnavailable((v) => !v)}
              className="flex items-center gap-2 px-4 cursor-pointer flex-shrink-0 select-none"
            >
              <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${channelIsUnavailable || showUnavailable ? "text-red-400" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium whitespace-nowrap ${channelIsUnavailable || showUnavailable ? "text-foreground" : "text-muted-foreground"}`}>
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
              <GitCompare className={`w-3.5 h-3.5 flex-shrink-0 ${channelHasHandleDiff || showHandleDiff ? "text-amber-400" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium whitespace-nowrap ${channelHasHandleDiff || showHandleDiff ? "text-foreground" : "text-muted-foreground"}`}>
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
                  onClick={() => { setRangeDraft(customRange); setShowDateDropdown((v) => !v) }}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:text-purple-400 transition-colors"
                >
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  {dateFilter === "Custom Range" && customRange?.from
                    ? customRange.to
                      ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
                      : format(customRange.from, "MMM d")
                    : dateFilter}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
              {showDateDropdown && (
                <div className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-xl shadow-2xl py-1.5 overflow-hidden">
                  {/* Preset options */}
                  <div className="min-w-[200px]">
                    {DATE_FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setDateFilter(opt)
                          if (opt !== "Custom Range") setShowDateDropdown(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors ${dateFilter === opt
                          ? "text-purple-400 font-semibold bg-purple-500/10"
                          : "text-foreground hover:bg-purple-500/10 hover:text-purple-300"
                          }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>

                  {/* Dual-month calendar — shown only for Custom Range */}
                  {dateFilter === "Custom Range" && (() => {
                    // Right panel is always one month ahead of left
                    const rightMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1)
                    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
                    const thisYear = new Date().getFullYear()
                    const years = Array.from({ length: 10 }, (_, i) => thisYear - 5 + i)

                    const navMonth = (delta: number) => {
                      setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
                      setShowMonthPicker(null)
                    }
                    const jumpTo = (year: number, month: number) => {
                      setCalMonth(new Date(year, month, 1))
                      setShowMonthPicker(null)
                    }

                    return (
                      <div className="border-t border-border pt-3 pb-2 px-3">
                        {/* Dual-panel header with arrows */}
                        <div className="flex gap-5 mb-2">
                          {([calMonth, rightMonth] as const).map((m, panelIdx) => (
                            <div key={panelIdx} className="flex-1 flex items-center justify-between">
                              {/* prev arrow — only on left panel */}
                              {panelIdx === 0 ? (
                                <button onClick={() => navMonth(-1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M15 18l-6-6 6-6" /></svg>
                                </button>
                              ) : <div className="w-6" />}

                              {/* Clickable month/year header */}
                              <div className="relative">
                                <button
                                  onClick={() => setShowMonthPicker(p => p === panelIdx ? null : panelIdx as 0 | 1)}
                                  className="text-[13px] font-semibold text-foreground hover:text-purple-400 transition-colors flex items-center gap-1"
                                >
                                  {format(m, "MMMM yyyy")}
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-3 h-3 transition-transform ${showMonthPicker === panelIdx ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                                </button>
                                {showMonthPicker === panelIdx && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[60] bg-popover border border-border rounded-xl shadow-2xl p-2 w-52 max-h-64 overflow-y-auto">
                                    {years.map(yr => (
                                      <div key={yr}>
                                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest px-2 pt-2 pb-1">{yr}</p>
                                        <div className="grid grid-cols-3 gap-1">
                                          {MONTHS.map((mn, mi) => {
                                            const target = new Date(yr, panelIdx === 1 ? mi - 1 : mi, 1)
                                            const isSel = target.getMonth() === calMonth.getMonth() && target.getFullYear() === calMonth.getFullYear()
                                            return (
                                              <button
                                                key={mn}
                                                onClick={() => jumpTo(yr, panelIdx === 1 ? mi - 1 : mi)}
                                                className={`text-[11px] py-1 px-1 rounded-md transition-colors ${isSel ? "bg-purple-600 text-white font-semibold" : "text-foreground hover:bg-purple-500/20 hover:text-purple-300"
                                                  }`}
                                              >{mn.slice(0, 3)}</button>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* next arrow — only on right panel */}
                              {panelIdx === 1 ? (
                                <button onClick={() => navMonth(1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M9 18l6-6-6-6" /></svg>
                                </button>
                              ) : <div className="w-6" />}
                            </div>
                          ))}
                        </div>

                        {/* DayPicker — controlled month, no built-in nav */}
                        <DayPicker
                          mode="range"
                          numberOfMonths={2}
                          month={calMonth}
                          onMonthChange={setCalMonth}
                          selected={rangeDraft}
                          onSelect={setRangeDraft}
                          hideNavigation
                          classNames={{
                            root: "text-foreground text-xs",
                            months: "flex gap-5",
                            month: "flex flex-col gap-1",
                            month_caption: "hidden",
                            weekdays: "flex",
                            weekday: "flex-1 text-center text-[10px] text-muted-foreground font-normal py-1 uppercase",
                            week: "flex w-full mt-0.5",
                            day: "flex-1 flex items-center justify-center",
                            day_button: "w-7 h-7 text-xs rounded-md hover:bg-purple-500/20 hover:text-purple-300 transition-colors font-normal text-foreground",
                            range_start: "bg-purple-600 rounded-l-md [&>button]:text-white [&>button]:font-semibold",
                            range_middle: "bg-purple-500/20 rounded-none",
                            range_end: "bg-purple-600 rounded-r-md [&>button]:text-white [&>button]:font-semibold",
                            today: "[&>button]:font-bold [&>button]:text-purple-400",
                            outside: "opacity-30",
                            disabled: "opacity-20 cursor-not-allowed",
                          }}
                        />

                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
                          <p className="text-[11px] text-muted-foreground">
                            {rangeDraft?.from
                              ? rangeDraft.to
                                ? `${format(rangeDraft.from, "MMM d")} – ${format(rangeDraft.to, "MMM d, yyyy")}`
                                : `${format(rangeDraft.from, "MMM d, yyyy")} – pick end date`
                              : "Pick start date"}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setRangeDraft(undefined); setCustomRange(undefined) }}
                              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                            >Clear</button>
                            <button
                              disabled={!rangeDraft?.from}
                              onClick={() => { setCustomRange(rangeDraft); setShowDateDropdown(false) }}
                              className="h-6 px-3 text-[11px] bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
                            >Apply</button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            <div className="w-px self-stretch bg-border flex-shrink-0" />

            {/* Inline searchable dropdowns — FILTER MODE or EDIT MODE */}
            <div className="flex items-stretch flex-nowrap flex-1" ref={settingsBarRef}>
              {([
                { key: "category" as const, label: "Category", options: CATEGORIES as readonly string[] },
                { key: "subCategory" as const, label: "Sub-Category", options: SUB_CATEGORIES as readonly string[] },
                { key: "contentType" as const, label: "Type", options: CONTENT_TYPES as readonly string[] },
                { key: "tracking" as const, label: "Tracking", options: TRACKING_STATUSES as readonly string[] },
              ]).map(({ key, label, options }, idx, arr) => {
                const isOpen = openField === key

                // In edit mode: show / edit channel's tempValues
                // In filter mode: show current filter value ("" = All)
                const editValue = tempValues[key as keyof typeof tempValues] as string
                const filterValue = filterValues[key as keyof typeof filterValues]

                const channelValue = key === "category" ? selectedChannel?.category
                  : key === "subCategory" ? selectedChannel?.subCategory
                    : key === "contentType" ? (selectedChannel?.contentType || selectedChannel?.type)
                      : key === "tracking" ? selectedChannel?.tracking
                        : ""

                const displayValue = isEditMode
                  ? editValue || "—"
                  : filterValue || channelValue || "All"


                const isActive = !isEditMode && filterValue !== ""

                const filtered = options.filter((o) =>
                  o.toLowerCase().includes(isOpen ? fieldSearch.toLowerCase() : "")
                )

                const dotColor = (k: string, opt: string): string => {
                  if (k === "contentType") {
                    if (opt === "Long-Form") return "bg-blue-400"
                    if (opt === "Shorts") return "bg-red-400"
                    return "bg-purple-400"
                  }
                  if (k === "tracking") return opt === "YES" ? "bg-green-400" : "bg-zinc-500"
                  const palette = ["bg-purple-400", "bg-blue-400", "bg-amber-400", "bg-emerald-400", "bg-pink-400", "bg-cyan-400", "bg-orange-400", "bg-rose-400", "bg-teal-400", "bg-violet-400", "bg-lime-400", "bg-indigo-400", "bg-sky-400", "bg-fuchsia-400", "bg-green-400", "bg-yellow-400"]
                  return palette[options.indexOf(opt) % palette.length]
                }

                return (
                  <div key={key} className="flex-1 flex items-stretch">
                    <div className="relative flex-1 px-3 flex flex-col justify-center">
                      <span className={`text-[10px] uppercase tracking-widest mb-0.5 ${isActive ? "text-purple-400" : "text-muted-foreground"}`}>{label}</span>
                      <button
                        onClick={() => { setOpenField(isOpen ? null : key); setFieldSearch("") }}
                        className={`flex items-center gap-1.5 text-[13px] font-medium transition-colors w-full text-left rounded px-1 py-0.5 -mx-1 ${isOpen
                          ? "text-purple-400 bg-white/5 ring-1 ring-purple-500/40"
                          : isActive
                            ? "text-purple-300 hover:text-purple-400 hover:bg-white/5"
                            : "text-foreground hover:text-purple-400 hover:bg-white/5"
                          }`}
                      >
                        <span className={
                          isEditMode && key === "tracking"
                            ? (editValue === "YES" ? "text-green-400" : "text-red-400")
                            : ""
                        }>
                          {displayValue}
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
                            {/* "All" option — only for category & subCategory in filter mode */}
                            {!isEditMode && (key === "category" || key === "subCategory") && (
                              <button
                                onClick={() => handleFilterChange(key, "")}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${filterValue === "" ? "bg-purple-500/10" : "hover:bg-white/5"
                                  }`}
                              >
                                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-muted-foreground/40" />
                                <span className={filterValue === "" ? "text-purple-300 font-medium" : "text-muted-foreground"}>
                                  All
                                </span>
                                {filterValue === "" && <span className="ml-auto text-purple-400 text-xs">✓</span>}
                              </button>
                            )}
                            {filtered.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-4 py-2">No results</p>
                            ) : filtered.map((opt) => {
                              const isSelected = isEditMode ? opt === editValue : opt === filterValue
                              return (
                                <button
                                  key={opt}
                                  onClick={() => isEditMode ? handleFieldChange(key, opt) : handleFilterChange(key, opt)}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${isSelected ? "bg-purple-500/10" : "hover:bg-white/5"
                                    }`}
                                >
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(key, opt)}`} />
                                  <span className={isSelected ? "text-purple-300 font-medium" : "text-foreground"}>
                                    {opt}
                                  </span>
                                  {isSelected && <span className="ml-auto text-purple-400 text-xs">✓</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    {idx < arr.length - 1 && <div className="w-px self-stretch bg-border flex-shrink-0" />}
                  </div>
                )
              })}

            </div>

            {/* Edit / Save / Cancel + active filter badge */}
            <div className="flex items-center gap-2 px-4 flex-shrink-0">
              {!isEditMode && activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex-shrink-0">
                  {activeFilterCount}
                </span>
              )}
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
          <div className="w-[60%] flex flex-col min-h-0 overflow-y-auto">
            <div className="w-full rounded-xl overflow-hidden bg-black relative" style={{ aspectRatio: '16/9' }}>
              <div className="absolute inset-0">
                {videoLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900">
                    <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-white/60 text-sm">Loading {selectedChannel?.handle}&apos;s top video…</p>
                  </div>
                ) : videoData ? (
                  <iframe
                    key={videoData.videoId}
                    src={`https://www.youtube.com/embed/${videoData.videoId}?autoplay=0&rel=0&modestbranding=1`}
                    title={videoData.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900">
                    <Youtube className="w-10 h-10 text-white/30" />
                    <p className="text-white/50 text-sm">No video found</p>
                  </div>
                )}
              </div>
            </div>
            {videoData && (videoData.publishedAt || videoData.views || videoData.likes || videoData.comments) && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {videoData.publishedAt && (
                  <div className="flex flex-col gap-0.5 bg-muted/60 border border-border rounded-lg px-3 py-2 flex-1 min-w-[80px]">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Published</span>
                    <span className="text-xs font-semibold text-foreground">{videoData.publishedAt}</span>
                  </div>
                )}
                {videoData.views && (
                  <div className="flex flex-col gap-0.5 bg-muted/60 border border-border rounded-lg px-3 py-2 flex-1 min-w-[60px]">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Views</span>
                    <span className="text-xs font-semibold text-foreground">{videoData.views}</span>
                  </div>
                )}
                {videoData.likes && (
                  <div className="flex flex-col gap-0.5 bg-muted/60 border border-border rounded-lg px-3 py-2 flex-1 min-w-[60px]">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Likes</span>
                    <span className="text-xs font-semibold text-foreground">{videoData.likes}</span>
                  </div>
                )}
                {videoData.comments && (
                  <div className="flex flex-col gap-0.5 bg-muted/60 border border-border rounded-lg px-3 py-2 flex-1 min-w-[60px]">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Comments</span>
                    <span className="text-xs font-semibold text-foreground">{videoData.comments}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — Info Cards stacked vertically, fills height of left column */}
          <div className="w-[40%] flex flex-col h-full min-h-0 gap-3 overflow-y-auto pr-2">

            {/* Channel Identity Card — @handle, badges, YouTube link */}
            <div className="flex flex-col gap-2 bg-muted/60 border border-border rounded-xl px-4 py-3 flex-shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-foreground leading-tight">
                      {selectedChannel?.handle}
                    </h2>
                    {channelInfo.channelName !== '—' && (
                      <span className="text-lg font-bold text-foreground leading-tight">· {channelInfo.channelName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${selectedChannel?.type === "Shorts" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                      }`}>{selectedChannel?.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/20 text-primary">
                      {selectedChannel?.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground italic">{selectedChannel?.subCategory}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleFavourite(selectedChannel?.id)}
                    className="flex items-center justify-center transition-colors hover:scale-110"
                    title={favouriteData.some(f => f.ytUrl === selectedChannel?.ytUrl && f.addedBy === currentUser) ? "Remove from Favourites" : "Add to Favourites"}
                  >
                    <Star
                      className={`w-5 h-5 transition-colors ${favouriteData.some(f => f.ytUrl === selectedChannel?.ytUrl && f.addedBy === currentUser) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
                    />
                  </button>
                  {selectedChannel?.ytUrl ? (
                    <button
                      onClick={() => window.open(selectedChannel?.ytUrl, "_blank")}
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
            {/* Handle Diff Card */}
            {(channelHasHandleDiff || showHandleDiff) && handleDiffInfo && (
              <div className="flex flex-col gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex-shrink-0">
                <span className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Handle Change Detected</span>
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">Previous Handle</label>
                    {isEditMode ? (
                      <input
                        value={handleDiffEdits.previousHandle}
                        onChange={e => setHandleDiffEdits(p => ({ ...p, previousHandle: e.target.value }))}
                        className="w-full px-2 py-1 text-sm rounded-md bg-background border border-amber-500/40 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      <p className="text-sm font-medium text-foreground">{handleDiffInfo.previousHandle || "—"}</p>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">Current Handle</label>
                    {isEditMode ? (
                      <input
                        value={handleDiffEdits.currentHandle}
                        onChange={e => setHandleDiffEdits(p => ({ ...p, currentHandle: e.target.value }))}
                        className="w-full px-2 py-1 text-sm rounded-md bg-background border border-amber-500/40 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      <p className="text-sm font-medium text-foreground">{handleDiffInfo.currentHandle || "—"}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Unavailable Handle Card */}
            {channelIsUnavailable && (
              <div className="flex flex-col gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex-shrink-0">
                <span className="text-[10px] text-red-400 uppercase tracking-wide font-semibold">
                  {channelIsUnavailable ? "Resolve Handle" : "Unavailable Handle"}
                </span>
                {isEditMode ? (
                  <input
                    value={resolvedHandle}
                    onChange={e => setResolvedHandle(e.target.value)}
                    placeholder="@newhandle"
                    className="w-full px-2 py-1 text-sm rounded-md bg-background border border-red-500/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                ) : (
                  <p className="text-sm font-medium text-foreground">
                    {selectedChannel?.handle && !selectedChannel.handle.toLowerCase().includes('unavailable')
                      ? selectedChannel.handle
                      : "Not resolved yet"}
                  </p>
                )}
              </div>
            )}
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
                    {selectedChannel?.verified || "—"}
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
              className="group/strip flex flex-nowrap pl-2 items-start overflow-x-scroll overflow-y-visible gap-3 py-4"
              onMouseLeave={() => setHoveredSimilarId(null)}
            >
              {similarChannels.slice(0, 6).map(ch => (
                <SimilarChannelCard
                  key={ch.id}
                  channel={ch}
                  onSelect={(id) => handleSelectChannel(id)}
                />
              ))}
            </div>
          )}
        </div>

      </main >

      {/* ── FAVOURITES PANEL & TOGGLE ── */}
      < button
        onClick={() => setIsFavouritesOpen(!isFavouritesOpen)
        }
        className={`fixed top-1/2 -translate-y-1/2 bg-sidebar border border-border text-sidebar-foreground py-3 px-1 rounded-l-lg shadow-xl z-40 flex items-center justify-center transition-all duration-300 hover:bg-sidebar-accent ${isFavouritesOpen ? 'right-[280px]' : 'right-0 border-r-0'}`}
      >
        <span className="text-lg font-bold leading-none select-none">{isFavouritesOpen ? "»" : "«"}</span>
      </button >

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
          {favouriteData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-4">
              No favourites yet. Click <Star className="w-3 h-3 inline mx-1" /> to add channels.
            </p>
          ) : (
            <>
              {/* Filter pills by user */}
              {(() => {
                const favouriteUsers = ["All", ...new Set(favouriteData.map(f => f.addedBy))]
                return (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {favouriteUsers.map(user => (
                      <button
                        key={user}
                        onClick={() => setFavouriteFilter(user)}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${favouriteFilter === user
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-muted/60 text-muted-foreground border border-border hover:text-foreground"
                          }`}
                      >
                        {user}
                      </button>
                    ))}
                  </div>
                )
              })()}

              {/* Favourite channel cards */}
              {channelsState
                .filter(ch => favouriteData.some(f => f.ytUrl === ch.ytUrl && (favouriteFilter === "All" || f.addedBy === favouriteFilter)))
                .map(ch => {
                  const addedBy = favouriteData.find(f => f.ytUrl === ch.ytUrl)?.addedBy
                  return (
                    <div key={ch.id} className="flex items-center justify-between bg-background border border-border p-2 rounded-lg group cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { handleSelectChannel(ch.id); setIsFavouritesOpen(false); }}>
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                          {ch.handle.replace("@", "").charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-bold truncate text-foreground">{ch.handle}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{ch.category}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">Added by {addedBy}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavourite(ch.id); }}
                        className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })
              }
            </>
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
      <UserSelectModal onSelect={(user) => setCurrentUser(user)} />
    </div >
  )
}
