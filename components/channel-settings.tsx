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
import type { Channel, VerifiedStatus, TrackingStatus } from "@/lib/constants"

interface ChannelSettingsProps {
  channel: Channel
  onVerifiedChange: (value: VerifiedStatus) => void
  onTrackingChange: (value: TrackingStatus) => void
  onSave: () => void
}

export function ChannelSettings({
  channel,
  onVerifiedChange,
  onTrackingChange,
  onSave,
}: ChannelSettingsProps) {
  return (
    <div className="border-t border-sidebar-border bg-sidebar p-4">
      <h3 className="font-semibold text-sidebar-foreground mb-3">
        Channel Settings
      </h3>
      
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Sub-Category</Label>
          <p className="text-sm text-sidebar-foreground mt-0.5">
            {channel.subCategory}
          </p>
        </div>

        <Separator className="bg-sidebar-border" />

        <div className="space-y-1.5">
          <Label htmlFor="verified" className="text-xs text-muted-foreground">
            Verified
          </Label>
          <Select
            value={channel.verified}
            onValueChange={(value) => onVerifiedChange(value as VerifiedStatus)}
          >
            <SelectTrigger
              id="verified"
              className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

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

        <Button
          onClick={onSave}
          className="w-full mt-2 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}
