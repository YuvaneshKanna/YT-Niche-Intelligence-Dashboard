"use client"

import dynamic from "next/dynamic"
import { Suspense } from "react"

const NichePerformance = dynamic(
  () =>
    import("@/components/niche/niche-performance").then((m) => ({ default: m.NichePerformance })),
  { ssr: false }
)

/**
 * The page reads its niche group and range from the query string, so it needs a
 * Suspense boundary around the `useSearchParams` consumer.
 */
export default function NichePage() {
  return (
    <Suspense fallback={<div className="h-screen bg-background" />}>
      <NichePerformance />
    </Suspense>
  )
}
