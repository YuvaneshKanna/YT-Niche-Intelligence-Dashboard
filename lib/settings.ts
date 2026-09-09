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

/**
 * Which backend answers.
 *
 * "subscription" and "api" are Claude, and need nothing running anywhere.
 * "chatgpt" and "gateway" are reached through the bridge server, so they are
 * only available once that is deployed and BRIDGE_URL is set in Vercel — see
 * bridge/README.md.
 */
export type ChatMode = "subscription" | "api" | "chatgpt" | "gateway"

export interface DashboardSettings {
  /** Which backend the chat panel should use. */
  chatMode: ChatMode
  /** Anthropic API key, used when chatMode is "api". Stays in this browser. */
  anthropicApiKey: string
  /** Model override for the API path. Empty means the server default. */
  anthropicModel: string
  /** Model for ChatGPT mode. Empty means whatever the account defaults to. */
  chatgptModel: string
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
  /** Model for subscription mode (--model on the CLI). Empty means the CLI's own default. */
  chatModel: string
  /** Effort level for subscription mode (--effort on the CLI). Empty means the CLI's own default. */
  chatEffort: string
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  chatMode: "subscription",
  anthropicApiKey: "",
  anthropicModel: "",
  chatgptModel: "",
  claudeOauthToken: "",
  bridgeSecret: "",
  chatAccessToken: "",
  chatModel: "",
  chatEffort: "",
}

/** Models the subscription-mode picker offers, in the order shown. */
export const CHAT_MODELS = [
  { id: "claude-opus-5", label: "Opus 5" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-fable-5", label: "Fable 5" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
] as const

/** Effort levels the CLI's --effort flag accepts, low to max. */
export const CHAT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const

/** The backends the chat panel offers, in the order shown. */
export const CHAT_PROVIDERS: { id: ChatMode; label: string }[] = [
  { id: "subscription", label: "Claude subscription" },
  { id: "api", label: "Anthropic API key" },
  { id: "chatgpt", label: "ChatGPT subscription" },
  { id: "gateway", label: "OmniRoute gateway" },
]

/**
 * Models a ChatGPT plan exposes through Codex.
 *
 * Taken from the account's own model list, minus two that are not chat models:
 * a reserve-capacity entry and the automated review model. Leaving the picker
 * on "Default model" lets the account choose, which is the safest option when
 * this list drifts.
 */
export const CHATGPT_MODELS = [
  { id: "gpt-6-astra", label: "GPT-6 Astra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "gpt-5.5", label: "GPT-5.5" },
] as const

/** Which models the model picker should offer for a backend. */
export function modelsFor(mode: ChatMode): readonly { id: string; label: string }[] {
  if (mode === "chatgpt") return CHATGPT_MODELS
  // The gateway's models depend on which providers were configured inside it,
  // which the browser has no way to know. It uses BRIDGE_OMNIROUTE_MODEL.
  if (mode === "gateway") return []
  return CHAT_MODELS
}

/** Effort only means anything where the backend exposes a reasoning setting. */
export function supportsEffort(mode: ChatMode): boolean {
  return mode === "subscription" || mode === "chatgpt"
}

/**
 * The model chosen for one backend.
 *
 * Kept per backend rather than as a single value: the names do not transfer, so
 * switching provider and back should not leave a Claude model selected on a
 * ChatGPT request.
 */
export function modelFor(s: DashboardSettings, mode: ChatMode): string {
  if (mode === "api") return s.anthropicModel
  if (mode === "chatgpt") return s.chatgptModel
  if (mode === "gateway") return ""
  return s.chatModel
}

export function withModel(
  s: DashboardSettings,
  mode: ChatMode,
  value: string
): DashboardSettings {
  if (mode === "api") return { ...s, anthropicModel: value }
  if (mode === "chatgpt") return { ...s, chatgptModel: value }
  if (mode === "gateway") return s
  return { ...s, chatModel: value }
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
