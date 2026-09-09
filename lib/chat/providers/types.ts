/**
 * One chat backend, behind one interface.
 *
 * The dashboard talks to several: Claude on the subscription (the Agent SDK
 * running inside this function), Claude on an API key, and the legacy
 * self-hosted bridge. They authenticate differently, cost differently and fail
 * differently — but the chat panel only ever sees one thing, a stream of `text`
 * events ending in `done` or `error`. Everything provider-specific stops here.
 *
 * Providers are built per request, never module-scoped: a caller can bring
 * their own API key, and that key must not outlive the request it arrived on.
 */

export type ProviderId =
  | "claude-sub"
  | "claude-api"
  | "claude-bridge"
  /** ChatGPT on the subscription, reached through the bridge's Codex backend. */
  | "codex-sub"
  /** The OmniRoute gateway, reached through the bridge. */
  | "omniroute"

/** A streaming chat turn, or one collected answer. Not every provider does both. */
export type Surface = "stream" | "once"

export interface StreamArgs {
  question: string
  /** The data this turn is grounded in. Sent once where the provider can resume a session. */
  context: string
  /** Persona + ground rules for the asking page. */
  systemRules: string
  chatId: string
  /** What the client asked for this turn. Only the subscription paths honour these — the
   *  API path is pinned to the model configured in Settings (see ProviderInit.apiModel). */
  model?: string
  effort?: string
  /** Aborted when the browser disconnects, so we stop paying for a dead request. */
  signal?: AbortSignal
}

export interface OnceArgs {
  prompt: string
  systemRules: string
  model?: string
  signal?: AbortSignal
}

/** Why a provider cannot take this turn, in the shape the routes already report. */
export interface Unavailable {
  error: string
  code: string
  status: number
}

export interface ChatProvider {
  id: ProviderId
  /** Human-readable — for the status checklist, and for saying who answered. */
  label: string
  ready(surface: Surface): boolean
  unavailable(surface: Surface): Unavailable
  stream?(args: StreamArgs): Promise<Response>
  once?(args: OnceArgs): Promise<string>
}

/**
 * Everything a provider needs that comes from the environment or the request
 * headers, and is therefore fixed for the whole request. Per-turn choices
 * travel in StreamArgs/OnceArgs instead.
 */
export interface ProviderInit {
  /** Anthropic key: the caller's header first, then the server's own. May be "". */
  apiKey: string
  /** Model for the API path — header, then env, then default. Always resolved. */
  apiModel: string

  /** The legacy self-hosted bridge in sandbox/. */
  bridgeUrl?: string
  bridgeSecret?: string

  /** The OpenAI-compatible bridge in bridge/, which fronts ChatGPT and OmniRoute. */
  aiBridgeUrl?: string
  aiBridgeToken?: string
  /** Model names in the bridge's vocabulary: "backend" or "backend/model". */
  codexModel?: string
  omnirouteModel?: string
}
