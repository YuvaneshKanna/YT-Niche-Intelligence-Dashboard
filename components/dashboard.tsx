"use client"

import { useState, useMemo } from "react"
import { Search, ExternalLink, Youtube, Pin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChannelCard } from "@/components/channel-card"
import { ChannelSettings } from "@/components/channel-settings"
import { VideoPlayer } from "@/components/video-player"
import { VideoCard } from "@/components/video-card"
import {
  channels as initialChannels,
  videos,
  shorts,
  liveStreams,
  type Channel,
  type TrackingStatus,
  type ContentType,
} from "@/lib/constants"

export function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChannelId, setSelectedChannelId] = useState(initialChannels[0].id)
  const [channelsState, setChannelsState] = useState<Channel[]>(initialChannels)
  const [currentVideoId, setCurrentVideoId] = useState("dQw4w9WgXcQ")
  const [activeTab, setActiveTab] = useState("videos")
  const [isPlayerFrozen, setIsPlayerFrozen] = useState(false)

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channelsState
    const query = searchQuery.toLowerCase()
    return channelsState.filter(
      (channel) =>
        channel.handle.toLowerCase().includes(query) ||
        channel.category.toLowerCase().includes(query) ||
        channel.type.toLowerCase().includes(query)
    )
  }, [channelsState, searchQuery])

  const selectedChannel = channelsState.find((c) => c.id === selectedChannelId)!

  const handleCategoryChange = (value: string) => {
    setChannelsState((prev) =>
      prev.map((c) =>
        c.id === selectedChannelId ? { ...c, category: value as any } : c
      )
    )
  }

  const handleSubCategoryChange = (value: string) => {
    setChannelsState((prev) =>
      prev.map((c) =>
        c.id === selectedChannelId ? { ...c, subCategory: value } : c
      )
    )
  }

  const handleContentTypeChange = (value: ContentType) => {
    setChannelsState((prev) =>
      prev.map((c) =>
        c.id === selectedChannelId ? { ...c, contentType: value } : c
      )
    )
  }

  const handleVerifiedChange = (value: string) => {
    setChannelsState((prev) =>
      prev.map((c) =>
        c.id === selectedChannelId ? { ...c, verified: value } : c
      )
    )
  }

  const handleTrackingChange = (value: TrackingStatus) => {
    setChannelsState((prev) =>
      prev.map((c) =>
        c.id === selectedChannelId ? { ...c, tracking: value } : c
      )
    )
  }

  const handleSave = () => {
    // In a real app, this would save to a backend
    console.log("Saving channel settings:", selectedChannel)
  }

  const currentVideos = useMemo(() => {
    switch (activeTab) {
      case "shorts":
        return shorts
      case "live":
        return liveStreams
      default:
        return videos
    }
  }, [activeTab])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left Sidebar */}
      <aside className="w-[360px] flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden">
        {/* Sidebar Header - FIXED */}
        <div className="flex-shrink-0 p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Youtube className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-sidebar-foreground">
              YT Niche Intelligence
            </h1>
          </div>
        </div>

        {/* Channel Settings - FIXED */}
        <div className="flex-shrink-0">
          <ChannelSettings
            channel={selectedChannel}
            onCategoryChange={handleCategoryChange}
            onSubCategoryChange={handleSubCategoryChange}
            onContentTypeChange={handleContentTypeChange}
            onVerifiedChange={handleVerifiedChange}
            onTrackingChange={handleTrackingChange}
            onSave={handleSave}
          />
        </div>

        {/* Search Bar - FIXED */}
        <div className="flex-shrink-0 p-4 border-b border-sidebar-border">
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

        {/* Channel List - SCROLLABLE ONLY */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-2 space-y-1">
            {filteredChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isActive={channel.id === selectedChannelId}
                onClick={() => setSelectedChannelId(channel.id)}
              />
            ))}
            {filteredChannels.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No channels found
              </p>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-background overflow-hidden">
        {/* Channel Header - FIXED */}
        <div className="flex-shrink-0 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-foreground">
                {selectedChannel.handle}
              </h2>
              <Badge
                variant="secondary"
                className={
                  selectedChannel.type === "Shorts"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-blue-500/20 text-blue-400"
                }
              >
                {selectedChannel.type}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-primary/20 text-primary"
              >
                {selectedChannel.category}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-border text-foreground hover:bg-muted"
              onClick={() =>
                window.open(
                  `https://youtube.com/${selectedChannel.handle}`,
                  "_blank"
                )
              }
            >
              <ExternalLink className="w-4 h-4" />
              Open on YouTube
            </Button>
          </div>
        </div>

        {/* Video Player Section */}
        <div className={isPlayerFrozen ? "flex-shrink-0 px-6 pt-4 sticky top-0 z-10 bg-background pb-4" : "flex-shrink-0 px-6 pt-4"}>
          <div className="relative">
            <VideoPlayer videoId={currentVideoId} />
            <Button
              onClick={() => setIsPlayerFrozen(!isPlayerFrozen)}
              size="sm"
              className="absolute top-3 right-3 gap-1.5 bg-black/60 hover:bg-black/80 text-white border-0 rounded-full h-8 px-3 text-xs"
            >
              <Pin className={`w-3 h-3 ${isPlayerFrozen ? "fill-current" : ""}`} />
              {isPlayerFrozen ? "Unfreeze" : "Freeze"}
            </Button>
          </div>
        </div>

        {/* Video Tabs - FIXED */}
        <div className="flex-shrink-0 px-6 pt-4 border-b border-border">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabsList className="bg-muted border border-border">
              <TabsTrigger
                value="videos"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Videos
              </TabsTrigger>
              <TabsTrigger
                value="shorts"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Shorts
              </TabsTrigger>
              <TabsTrigger
                value="live"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Live
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Video Grid - SCROLLABLE ONLY */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 max-w-6xl mx-auto">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <TabsContent value="videos" className="mt-0">
                <div className="grid grid-cols-3 gap-3">
                  {videos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onClick={() => setCurrentVideoId(video.videoId)}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="shorts" className="mt-0">
                <div className="grid grid-cols-3 gap-3">
                  {shorts.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onClick={() => setCurrentVideoId(video.videoId)}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="live" className="mt-0">
                <div className="grid grid-cols-3 gap-3">
                  {liveStreams.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onClick={() => setCurrentVideoId(video.videoId)}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}
