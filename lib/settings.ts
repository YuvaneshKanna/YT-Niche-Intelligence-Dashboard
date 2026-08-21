// Client-side settings, stored per browser.
//
// Credentials entered here are kept in localStorage and sent with each chat
// request. They are never persisted on the server, never written to the
// spreadsheet, and never shared between users — each person brings their own.
//
// That is deliberate: this dashboard is publicly reachable and has no login,
// so a server-held key would let anyone who finds the URL spend it. Bring your
// own key means an unconfigured visitor simply cannot use chat.
//
// Trade-off to be aware of: localStorage is readable by anything running on
// this origin, so an XSS bug on this page could exfiltrate a key. Treat these
// as revocable credentials and rotate them if the machine is shared.

export type ChatMode = "subscription" | "api"

export interface DashboardSettings {
  /** Which backend the chat panel should use. */
  chatMode: ChatMode
  /** Anthropic API key, used when chatMode is "api". Stays in this browser. */
  anthropicApiKey: string
  /** Model override for the API path. Empty means the server default. */
  anthropicModel: string
  /**
   * Claude Code OAuth token from `claude setup-token`.
   *
   * Stored only so the settings panel can generate a ready-to-run command for
   * the local bridge. It is NOT sent to the server: Vercel cannot run the
   * Claude CLI, so a token here would have nowhere to go.
   */
  claudeOauthToken: string
  /** Shared secret the local bridge expects. Also only used to build the command. */
  bridgeSecret: string
  /** Access token for a server that has CHAT_ACCESS_TOKEN set. */
  chatAccessToken: string
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  chatMode: "subscription",
  anthropicApiKey: "",
  anthropicModel: "",
  claudeOauthToken: "",
  bridgeSecret: "",
  chatAccessToken: "",
}

const STORAGE_KEY = "yt-dashboard-settings"

export function loadSettings(): DashboardSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<DashboardSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    // Blocked storage, private browsing, or corrupt JSON — defaults are fine.
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: DashboardSettings): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

export function clearSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do — the caller resets in-memory state either way.
  }
}

/** Headers the chat route understands. Only what the server can actually use. */
export function chatHeaders(s: DashboardSettings): Record<string, string> {
  const headers: Record<string, string> = { "x-chat-mode": s.chatMode }
  if (s.chatMode === "api" && s.anthropicApiKey) {
    headers["x-anthropic-key"] = s.anthropicApiKey
    if (s.anthropicModel) headers["x-anthropic-model"] = s.anthropicModel
  }
  if (s.chatAccessToken) headers["x-chat-access"] = s.chatAccessToken
  return headers
}

/** Masks a credential for display: keeps enough to recognise, hides the rest. */
export function maskSecret(value: string): string {
  if (!value) return ""
  if (value.length <= 12) return "•".repeat(value.length)
  return `${value.slice(0, 8)}${"•".repeat(12)}${value.slice(-4)}`
}
