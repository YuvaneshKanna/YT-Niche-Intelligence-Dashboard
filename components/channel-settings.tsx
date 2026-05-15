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
      <div className="flex-shrink-0 border-b border-sidebar-border bg-sidebar p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sidebar-foreground">
            Channel Settings
          </h3>
          <Button
            onClick={handleEdit}
            variant="outline"
            size="sm"
            className="border-primary text-primary hover:bg-primary/10 h-8"
          >
            Edit
          </Button>
        </div>

        <div className="space-y-3">
          {/* Category - Read Only */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <p className="text-sm text-sidebar-foreground py-1.5 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.category)}
            </p>
          </div>

          {/* Sub-Category - Read Only */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sub-Category</Label>
            <p className="text-sm text-sidebar-foreground py-1.5 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.subCategory)}
            </p>
          </div>

          {/* Type - Read Only */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <p className="text-sm text-sidebar-foreground py-1.5 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.contentType || "Long-Form")}
            </p>
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Tracking - Read Only */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tracking</Label>
            <p className="text-sm text-sidebar-foreground py-1.5 px-2 bg-sidebar-accent rounded">
              {displayValue(channel.tracking)}
            </p>
          </div>

          {/* Verified / Remarks - Read Only */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Verified / Remarks</Label>
            <p className="text-sm text-sidebar-foreground py-1.5 px-2 bg-sidebar-accent rounded min-h-[48px] flex items-start pt-2">
              {displayValue(channel.verified)}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // EDIT MODE
  return (
    <div className="flex-shrink-0 border-b border-sidebar-border bg-sidebar p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sidebar-foreground">
          Channel Settings
        </h3>
        <Button
          onClick={handleCancel}
          variant="outline"
          size="sm"
          className="border-muted text-muted-foreground hover:bg-muted/10 h-8"
        >
          Cancel
        </Button>
      </div>

      <div className="space-y-3">
        {/* Category Searchable Dropdown */}
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-xs text-muted-foreground">
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
        <div className="space-y-1.5">
          <Label htmlFor="sub-category" className="text-xs text-muted-foreground">
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
        <div className="space-y-1.5">
          <Label htmlFor="type" className="text-xs text-muted-foreground">
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
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
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

        <Separator className="bg-sidebar-border" />

        {/* Tracking Dropdown */}
        <div className="space-y-1.5">
          <Label htmlFor="tracking" className="text-xs text-muted-foreground">
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
            value={tempValues.verified}
            onChange={(e) =>
              setTempValues((prev) => ({ ...prev, verified: e.target.value }))
            }
            placeholder="Add any remarks or notes..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-md bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <Button
          onClick={handleSave}
          className="w-full mt-3 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}

