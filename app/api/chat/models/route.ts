import { NextRequest } from "next/server"

// Models a bridge-hosted backend can actually reach.
//
// Claude and ChatGPT have fixed model lists the browser already knows, so this
// route exists for the gateway, whose models are whichever providers someone
// configured inside it. Asking the running service is the only way to find out.
//
// The bridge's token is server-side only, which is why this is a route rather
// than the browser calling the bridge directly.

export const dynamic = "force-dynamic"

/** Bridge backend ids, keyed by the provider name the chat panel uses. */
const BACKEND_FOR: Record<string, string> = {
  gateway: "omniroute",
  chatgpt: "codex",
}

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") ?? ""
  const backend = BACKEND_FOR[provider]

  if (!backend) {
    return Response.json({ models: [], error: `No bridge backend for "${provider}".` }, { status: 400 })
  }

  const url = (process.env.BRIDGE_URL || "").replace(/\/$/, "")
  const token = process.env.BRIDGE_TOKEN || ""
  if (!url || !token) {
    // Not an error: the bridge simply is not set up yet. The picker falls back
    // to its default entry, and Settings is where the missing setup is reported.
    return Response.json({ models: [], configured: false })
  }

  try {
    const res = await fetch(`${url}/v1/models?backend=${encodeURIComponent(backend)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    })

    if (!res.ok) {
      return Response.json({ models: [], configured: true, error: `The bridge answered ${res.status}.` })
    }

    const body = (await res.json()) as { data?: Array<{ id?: string }> }
    const models = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)

    return Response.json({ models, configured: true })
  } catch {
    return Response.json({ models: [], configured: true, error: "Could not reach the bridge." })
  }
}
