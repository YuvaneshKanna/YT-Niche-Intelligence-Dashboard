import { neon } from "@neondatabase/serverless"

// Single shared SQL tag for the metrics readers. Uses the pooled
// DATABASE_URL (app traffic, not migrations) — the unpooled URL is only for
// the one-off scripts in .agents/.
//
// Thrown as MetricsConfigError so the route can report a 503 "config"
// problem the same way the Sheets path already does for a missing sheet id.

export class MetricsConfigError extends Error {}

function connectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) {
    throw new MetricsConfigError(
      "DATABASE_URL is not set. Add the Neon connection string (pooled) in " +
        "Vercel → Storage, or .env.local for local dev."
    )
  }
  return url
}

let cached: ReturnType<typeof neon> | null = null

export function sql() {
  if (!cached) cached = neon(connectionString())
  return cached
}
