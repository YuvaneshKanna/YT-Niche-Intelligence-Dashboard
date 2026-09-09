import { codexBackend } from "./codex.mjs"
import { omnirouteBackend } from "./omniroute.mjs"

/**
 * Every backend the bridge can route to, and how a caller names one.
 *
 * A model is written `backend/model` — `codex/gpt-5.1-codex`,
 * `omniroute/openai/gpt-4o`. Only the first segment is the backend; the rest is
 * handed through untouched, because gateway model ids contain slashes of their
 * own. A name with no slash uses DEFAULT_BACKEND, which keeps a bare
 * `model: "codex"` working.
 *
 * This is the whole cost of adding a backend later: write the module, add it
 * here. Nothing in the dashboard changes.
 */

export const backends = new Map([
  [codexBackend.id, codexBackend],
  [omnirouteBackend.id, omnirouteBackend],
])

const DEFAULT_BACKEND = process.env.DEFAULT_BACKEND || "codex"

export function resolveModel(requested) {
  const raw = String(requested || "").trim()
  if (!raw) return { backend: backends.get(DEFAULT_BACKEND), model: undefined, name: DEFAULT_BACKEND }

  const slash = raw.indexOf("/")
  const head = slash === -1 ? raw : raw.slice(0, slash)
  const tail = slash === -1 ? "" : raw.slice(slash + 1)

  if (backends.has(head)) {
    return { backend: backends.get(head), model: tail || undefined, name: raw }
  }

  // Not a backend name, so treat the whole string as a model for the default
  // backend rather than rejecting it — an OpenAI client that has never heard of
  // this service still works.
  return { backend: backends.get(DEFAULT_BACKEND), model: raw, name: raw }
}

export async function healthReport() {
  const entries = await Promise.all(
    [...backends.values()].map(async (b) => [b.id, { label: b.label, ...(await b.health()) }])
  )
  return Object.fromEntries(entries)
}
