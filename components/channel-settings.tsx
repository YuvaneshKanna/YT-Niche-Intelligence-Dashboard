"use client"

import { useState } from "react"
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
import type { Channel, TrackingStatus, ContentType } from "@/lib/constants"

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

const CONTENT_TYPES: ContentType[] = ["Long-Form", "Shorts", "Both"]

interface ChannelSettingsProps {
  channel: Channel
  onCategoryChange: (value: string) => void
  onSubCategoryChange: (value: string) => void
  onContentTypeChange: (value: ContentType) => void
  onVerifiedChange: (value: string) => void
  onTrackingChange: (value: TrackingStatus) => void
  onSave: () => void
}

export function ChannelSettings({
  channel,
  onCategoryChange,
  onSubCategoryChange,
  onContentTypeChange,
  onVerifiedChange,
  onTrackingChange,
  onSave,
}: ChannelSettingsProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [tempValues, setTempValues] = useState({
    category: channel.category,
    subCategory: channel.subCategory,
    contentType: channel.contentType || "Long-Form",
    tracking: channel.tracking,
    verified: channel.verified,
  })

  const handleEdit = () => {
    setTempValues({
      category: channel.category,
      subCategory: channel.subCategory,
      contentType: channel.contentType || "Long-Form",
      tracking: channel.tracking,
      verified: channel.verified,
    })
    setIsEditMode(true)
  }

  const handleCancel = () => {
    setTempValues({
      category: channel.category,
      subCategory: channel.subCategory,
      contentType: channel.contentType || "Long-Form",
      tracking: channel.tracking,
      verified: channel.verified,
    })
    setIsEditMode(false)
  }

  const handleSave = () => {
    onCategoryChange(tempValues.category)
    onSubCategoryChange(tempValues.subCategory)
    onContentTypeChange(tempValues.contentType as ContentType)
    onTrackingChange(tempValues.tracking as TrackingStatus)
    onVerifiedChange(tempValues.verified)
    onSave()
    setIsEditMode(false)
  }

  const displayValue = (value: string) => value || "-"

  if (!isEditMode) {
    // VIEW MODE
    return (
      <div className="flex-shrink-0 border-b border-sidebar-border bg-sidebar px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-sidebar-foreground">
            Channel Settings
          </h3>
          <Button
            onClick={handleEdit}
            variant="outline"
            size="sm"
            className="border-primary text-primary hover:bg-primary/10 h-7 text-xs px-2"
          >
            Edit
          </Button>
        </div>

        <div className="space-y-1.5">
          {/* Category - Read Only */}
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Category</Label>
            <p className="text-xs text-sidebar-foreground py-1 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.category)}
            </p>
          </div>

          {/* Sub-Category - Read Only */}
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Sub-Category</Label>
            <p className="text-xs text-sidebar-foreground py-1 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.subCategory)}
            </p>
          </div>

          {/* Type - Read Only */}
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Type</Label>
            <p className="text-xs text-sidebar-foreground py-1 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.contentType || "Long-Form")}
            </p>
          </div>

          <Separator className="bg-sidebar-border my-1" />

          {/* Tracking - Read Only */}
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Tracking</Label>
            <p className="text-xs text-sidebar-foreground py-1 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.tracking)}
            </p>
          </div>

          {/* Verified / Remarks - Read Only */}
          <div className="space-y-0.5">
            <Label className="text-[11px] text-muted-foreground">Verified / Remarks</Label>
            <p className="text-xs text-sidebar-foreground py-1 px-2 bg-sidebar-accent rounded min-h-[28px] flex items-start pt-1">
              {displayValue(channel.verified)}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // EDIT MODE
  return (
    <div className="flex-shrink-0 border-b border-sidebar-border bg-sidebar px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-sidebar-foreground">
          Channel Settings
        </h3>
      </div>

      <div className="space-y-1.5">
        {/* Category Searchable Dropdown */}
        <div className="space-y-0.5">
          <Label htmlFor="category" className="text-[11px] text-muted-foreground">
            Category
          </Label>
          <SearchableDropdown
            value={tempValues.category}
            options={CATEGORIES}
            placeholder="Select category..."
            onSelect={(value) =>
              setTempValues((prev) => ({ ...prev, category: value }))
            }
          />
        </div>

        {/* Sub-Category Searchable Dropdown */}
        <div className="space-y-0.5">
          <Label htmlFor="sub-category" className="text-[11px] text-muted-foreground">
            Sub-Category
          </Label>
          <SearchableDropdown
            value={tempValues.subCategory}
            options={SUB_CATEGORIES}
            placeholder="Select sub-category..."
            onSelect={(value) =>
              setTempValues((prev) => ({ ...prev, subCategory: value }))
            }
          />
        </div>

        {/* Type Dropdown */}
        <div className="space-y-0.5">
          <Label htmlFor="type" className="text-[11px] text-muted-foreground">
            Type
          </Label>
          <Select
            value={tempValues.contentType}
            onValueChange={(value) =>
              setTempValues((prev) => ({ ...prev, contentType: value as ContentType }))
            }
          >
            <SelectTrigger
              id="type"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground h-7 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-sidebar-border my-1" />

        {/* Tracking Dropdown */}
        <div className="space-y-0.5">
          <Label htmlFor="tracking" className="text-[11px] text-muted-foreground">
            Tracking
          </Label>
          <Select
            value={tempValues.tracking}
            onValueChange={(value) =>
              setTempValues((prev) => ({ ...prev, tracking: value as TrackingStatus }))
            }
          >
            <SelectTrigger
              id="tracking"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground h-7 text-xs"
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
        <div className="space-y-0.5">
          <Label htmlFor="verified" className="text-[11px] text-muted-foreground">
            Verified / Remarks
          </Label>
          <textarea
            id="verified"
            value={tempValues.verified}
            onChange={(e) =>
              setTempValues((prev) => ({ ...prev, verified: e.target.value }))
            }
            placeholder="Add any remarks or notes..."
            rows={2}
            className="w-full px-2 py-1 text-xs rounded-md bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex gap-1.5 mt-2">
          <Button
            onClick={handleSave}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-7 text-xs"
          >
            Save
          </Button>
          <Button
            onClick={handleCancel}
            variant="outline"
            className="flex-1 border-muted text-muted-foreground hover:bg-muted/10 h-7 text-xs"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

