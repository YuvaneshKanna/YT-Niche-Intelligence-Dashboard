"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Check, ChevronDown, LayoutGrid, type LucideIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface DashboardPage {
  href: string
  label: string
  icon: LucideIcon
}

/**
 * Every page in the dashboard, in nav order. Add a row here and it shows up
 * in the picker on both pages — nothing else to wire up. Built as a dropdown
 * (not a row of tabs) because this is headed for 5-8 pages, and a tab strip
 * that wide stops being readable well before that.
 */
export const DASHBOARD_PAGES: DashboardPage[] = [
  { href: "/", label: "YT Niche Overview", icon: LayoutGrid },
  { href: "/metrics", label: "Niche Breakdown", icon: BarChart3 },
]

/**
 * Page picker used in both headers. Shows the current page's icon + label
 * and opens a dropdown to jump to any other page.
 */
export function PageNav({ className = "" }: { className?: string }) {
  const pathname = usePathname()
  const current = DASHBOARD_PAGES.find((p) => p.href === pathname) ?? DASHBOARD_PAGES[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch page"
          className={`flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 ${className}`}
        >
          <CurrentIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {current.label}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {DASHBOARD_PAGES.map((page) => {
          const Icon = page.icon
          const active = page.href === current.href
          return (
            <DropdownMenuItem key={page.href} asChild>
              <Link href={page.href} className="flex items-center gap-2 text-xs">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1">{page.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
