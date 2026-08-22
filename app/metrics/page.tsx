"use client"

import dynamic from "next/dynamic"

const NicheMetrics = dynamic(
  () => import("@/components/metrics/niche-metrics").then((m) => ({ default: m.NicheMetrics })),
  { ssr: false }
)

export default function MetricsPage() {
  return <NicheMetrics />
}
