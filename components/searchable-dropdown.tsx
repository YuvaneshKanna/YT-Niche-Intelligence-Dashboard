"use client"

import { useState, useMemo } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SearchableDropdownProps {
  value: string
  options: string[]
  placeholder: string
  onSelect: (value: string) => void
}

export function SearchableDropdown({
  value,
  options,
  placeholder,
  onSelect,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options
    const query = searchQuery.toLowerCase()
    return options.filter((opt) => opt.toLowerCase().includes(query))
  }, [options, searchQuery])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-sidebar border-sidebar-border">
        <div className="p-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-muted-foreground h-9"
            />
          </div>
          <ScrollArea className="h-[200px] border border-sidebar-border rounded-md bg-sidebar-accent">
            <div className="p-2 space-y-1">
              {filteredOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    onSelect(option)
                    setOpen(false)
                    setSearchQuery("")
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    value === option
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-border"
                  }`}
                >
                  {option}
                </button>
              ))}
              {filteredOptions.length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-4">
                  No options found
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}
