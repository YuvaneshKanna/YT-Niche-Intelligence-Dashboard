import { createClaudeApi } from "./providers/claude-api"
import { createClaudeBridge } from "./providers/claude-bridge"
import { createClaudeSub } from "./providers/claude-sub"
import { createOpenAiCompatible } from "./providers/openai-compatible"
import type { ChatProvider, ProviderInit, Surface, Unavailable } from "./providers/types"

/**
 * Which backend answers a turn.
 *
 * A mode names an ordered chain rather than a single provider, and the first
 * one that is configured takes the turn. Today that only expresses what the
 * routes already did — the in-function subscription wins, the self-hosted
 * bridge picks up whatever is left — but it is the seam the ChatGPT and
 * OmniRoute backends plug into, and where failure-driven fallback will live.
 */

export type ChatMode = "api" | "subscription" | "chatgpt" | "gateway"

const MODES: ChatMode[] = ["api", "subscription", "chatgpt", "gateway"]

/** Subscription is the default: an unrecognised header must never spend a key. */
export function readChatMode(header: string | null): ChatMode {
  return MODES.includes(header as ChatMode) ? (header as ChatMode) : "subscription"
}

/**
 * Credentials and endpoints for one request, read once so the two routes cannot
 * drift apart on which env var means what.
 *
 * Bring-your-own-key: a key supplied by the caller is used for that request only
 * and never stored. The bridge's own token is server-side only — it is not
 * something a browser should ever hold.
 */
export function readProviderInit(headers: Headers): ProviderInit {
  return {
    apiKey: headers.get("x-anthropic-key")?.trim() || process.env.ANTHROPIC_API_KEY || "",
    apiModel:
      headers.get("x-anthropic-model")?.trim() || process.env.ANTHROPIC_MODEL || "claude-opus-5",
    bridgeUrl: process.env.SANDBOX_CHAT_URL,
    bridgeSecret: process.env.SANDBOX_SHARED_SECRET,
    aiBridgeUrl: process.env.BRIDGE_URL,
    aiBridgeToken: process.env.BRIDGE_TOKEN,
    codexModel: process.env.BRIDGE_CODEX_MODEL,
    omnirouteModel: process.env.BRIDGE_OMNIROUTE_MODEL,
  }
}

const BRIDGE_NOT_CONFIGURED: Unavailable = {
  error:
    "The AI bridge is not configured. Set BRIDGE_URL and BRIDGE_TOKEN in Vercel to the address " +
    "and token of your bridge server (see bridge/README.md), then redeploy.",
  code: "NO_BRIDGE",
  status: 503,
}

function createCodexSub(init: ProviderInit): ChatProvider {
  return createOpenAiCompatible({
    id: "codex-sub",
    label: "ChatGPT subscription",
    backend: "codex",
    baseUrl: init.aiBridgeUrl ?? "",
    apiKey: init.aiBridgeToken ?? "",
    // A bare backend name lets the bridge pick the account's default model.
    model: init.codexModel || "codex",
    unavailable: BRIDGE_NOT_CONFIGURED,
  })
}

function createOmniroute(init: ProviderInit): ChatProvider {
  return createOpenAiCompatible({
    id: "omniroute",
    label: "OmniRoute gateway",
    backend: "omniroute",
    baseUrl: init.aiBridgeUrl ?? "",
    apiKey: init.aiBridgeToken ?? "",
    model: init.omnirouteModel || "omniroute",
    unavailable: BRIDGE_NOT_CONFIGURED,
  })
}

/**
 * Each mode names an ordered chain, and the first configured provider takes the
 * turn. Chains do not cross modes: choosing ChatGPT and silently getting Claude
 * would spend the wrong subscription without saying so. Falling back when a
 * backend *fails* rather than when it is *absent* is a separate change, and the
 * point at which crossing modes becomes correct — because by then it is a
 * reaction to something going wrong rather than a quiet substitution.
 */
export function buildChain(mode: ChatMode, init: ProviderInit): ChatProvider[] {
  switch (mode) {
    case "api":
      return [createClaudeApi(init)]
    case "chatgpt":
      return [createCodexSub(init)]
    case "gateway":
      return [createOmniroute(init)]
    case "subscription":
    default:
      return [createClaudeSub(init), createClaudeBridge(init)]
  }
}

export type StreamProvider = ChatProvider & { stream: NonNullable<ChatProvider["stream"]> }
export type OnceProvider = ChatProvider & { once: NonNullable<ChatProvider["once"]> }

export type Selection<P> = { ok: true; provider: P } | { ok: false; unavailable: Unavailable }

const NO_PROVIDER: Unavailable = {
  error: "No chat provider is configured for this request.",
  code: "NO_PROVIDER",
  status: 503,
}

function pick<P extends ChatProvider>(
  chain: ChatProvider[],
  surface: Surface,
  supports: (p: ChatProvider) => p is P
): Selection<P> {
  const capable = chain.filter(supports)
  const ready = capable.find((p) => p.ready(surface))
  if (ready) return { ok: true, provider: ready }

  // Nothing is configured, so report the chain's first choice rather than its
  // last: that is the backend the user meant to use, and the one whose fix
  // instructions are worth printing.
  return { ok: false, unavailable: capable[0]?.unavailable(surface) ?? NO_PROVIDER }
}

export function selectStreamProvider(chain: ChatProvider[]): Selection<StreamProvider> {
  return pick(chain, "stream", (p): p is StreamProvider => typeof p.stream === "function")
}

export function selectOnceProvider(chain: ChatProvider[]): Selection<OnceProvider> {
  return pick(chain, "once", (p): p is OnceProvider => typeof p.once === "function")
}
