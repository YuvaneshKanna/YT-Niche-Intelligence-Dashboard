import dynamic from 'next/dynamic'

const Dashboard = dynamic(
  () => import('@/components/dashboard').then(mod => ({ default: mod.Dashboard })),
  { ssr: false }
)

export default function Page() {
  return <Dashboard />
}