"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SearchableDropdown } from "@/components/searchable-dropdown"
import type { Channel, TrackingStatus } from "@/lib/constants"

const CATEGORIES = [
  "Entertainment",
  "Tech",
  "Finance",
  "Gaming",
  "Education",
  "Fitness",
  "Food",
  "Lifestyle",
  "Travel",
  "Music",
]

const SUB_CATEGORIES = [
  "Commentary",
  "Reviews",
  "Tutorials",
  "Vlogs",
  "Shorts Commentary",
  "Let's Play",
  "Comedy",
  "Podcasts",
  "Workouts",
  "Cooking",
  "Quick Workouts",
  "Science",
  "Sports",
  "Challenges",
  "Personal Finance",
  "Hardware",
]

interface ChannelSettingsProps {
  channel: Channel
  onCategoryChange: (value: string) => void
  onSubCategoryChange: (value: string) => void
  onVerifiedChange: (value: string) => void
  onTrackingChange: (value: TrackingStatus) => void
  onSave: () => void
}

export function ChannelSettings({
  channel,
  onCategoryChange,
  onSubCategoryChange,
  onVerifiedChange,
  onTrackingChange,
  onSave,
}: ChannelSettingsProps) {
  return (
    <div className="flex-shrink-0 border-b border-sidebar-border bg-sidebar p-4">
      <h3 className="font-semibold text-sidebar-foreground mb-4">
        Channel Settings
      </h3>

      <div className="space-y-3">
        {/* Category Searchable Dropdown */}
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-xs text-muted-foreground">
            Category
          </Label>
          <SearchableDropdown
            value={channel.category}
            options={CATEGORIES}
            placeholder="Select category..."
            onSelect={onCategoryChange}
          />
        </div>

        {/* Sub-Category Searchable Dropdown */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-category" className="text-xs text-muted-foreground">
            Sub-Category
          </Label>
          <SearchableDropdown
            value={channel.subCategory}
            options={SUB_CATEGORIES}
            placeholder="Select sub-category..."
            onSelect={onSubCategoryChange}
          />
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Tracking Dropdown */}
        <div className="space-y-1.5">
          <Label htmlFor="tracking" className="text-xs text-muted-foreground">
            Tracking
          </Label>
          <Select
            value={channel.tracking}
            onValueChange={(value) => onTrackingChange(value as TrackingStatus)}
          >
            <SelectTrigger
              id="tracking"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YES">YES</SelectItem>
              <SelectItem value="NO">NO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Verified / Remarks Textarea */}
        <div className="space-y-1.5">
          <Label htmlFor="verified" className="text-xs text-muted-foreground">
            Verified / Remarks
          </Label>
          <textarea
            id="verified"
            value={channel.verified}
            onChange={(e) => onVerifiedChange(e.target.value)}
            placeholder="Add any remarks or notes..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-md bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <Button
          onClick={onSave}
          className="w-full mt-3 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}

