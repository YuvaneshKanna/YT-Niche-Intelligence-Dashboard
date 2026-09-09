import {
  runSubscriptionOnce,
  streamFromSubscription,
  subscriptionChatReady,
} from "@/lib/chat/claude-subscription"
import type { ChatProvider, OnceArgs, ProviderInit, StreamArgs, Surface, Unavailable } from "./types"

/**
 * Claude billed against the subscription, run inside this function.
 *
 * The transport lives in lib/chat/claude-subscription.ts — sessions, resume,
 * the locked-down Agent SDK options. This file is only the adapter that puts it
 * behind the ChatProvider interface, so the routes stop knowing which backend
 * they are talking to.
 */

const NO_TOKEN_STREAM: Unavailable = {
  error:
    "Subscription chat is not configured. Run `claude setup-token`, then set the token " +
    "as CLAUDE_CODE_OAUTH_TOKEN in Vercel (Settings has the exact command) and redeploy. " +
    "Or switch to API-key mode in Settings.",
  code: "NO_TOKEN",
  status: 503,
}

const NO_TOKEN_ONCE: Unavailable = {
  error:
    "Subscription mode is not configured. Run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN, " +
    "or switch to API mode in Settings.",
  code: "NO_SUBSCRIPTION",
  status: 503,
}

export function createClaudeSub(_init: ProviderInit): ChatProvider {
  return {
    id: "claude-sub",
    label: "Claude subscription",

    // One token configures both surfaces; there is nothing else to check.
    ready: () => subscriptionChatReady(),

    // The two surfaces are reached from different pages and have different
    // fixes on offer, so they say different things.
    unavailable: (surface: Surface) => (surface === "once" ? NO_TOKEN_ONCE : NO_TOKEN_STREAM),

    async stream(args: StreamArgs) {
      return streamFromSubscription({
        question: args.question,
        context: args.context,
        systemRules: args.systemRules,
        chatId: args.chatId,
        model: args.model,
        effort: args.effort,
        signal: args.signal,
      })
    },

    once(args: OnceArgs) {
      return runSubscriptionOnce({
        prompt: args.prompt,
        systemRules: args.systemRules,
        model: args.model,
        signal: args.signal,
      })
    },
  }
}
