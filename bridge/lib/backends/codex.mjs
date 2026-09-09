import { mkdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Codex } from "@openai/codex-sdk"

/**
 * ChatGPT, billed against the subscription rather than an API key.
 *
 * The Codex CLI authenticates with the same ChatGPT account a person signs into
 * in the browser, and the SDK drives that CLI. This is why the bridge exists at
 * all: the CLI is a native binary, and its credentials are a refresh token that
 * rotates and is written back to disk. Both of those need a machine with a
 * filesystem that survives a restart, which a serverless function is not.
 *
 * Required on the host:
 *   CODEX_HOME   directory holding auth.json, created by `codex login`.
 *                Must be a persistent volume — losing it means logging in again.
 */

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex")

/**
 * An empty directory for the agent to treat as its workspace. It never writes
 * there, but the directory has to exist: the CLI resolves its working root
 * before it does anything else and exits if that path is missing.
 */
const WORK_DIR = process.env.CODEX_WORK_DIR || path.join(os.tmpdir(), "ai-bridge-work")
mkdirSync(WORK_DIR, { recursive: true })

const SESSION_TTL_MS = 60 * 60 * 1000

/** Conversations we have seen, so a follow-up resumes rather than resending everything. */
const threads = new Map()

function pruneThreads() {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, s] of threads) if (s.lastUsed < cutoff) threads.delete(id)
}

/**
 * The child gets only what it needs. A bridge process inherits the whole host
 * environment, and an unrelated variable — a proxy base URL, a stray API key —
 * could otherwise redirect billing away from the subscription this exists to use.
 *
 * Windows needs a few more before a process can be spawned at all (the command
 * interpreter and the system root, chiefly). None of them can influence which
 * account is billed, and they are passed only on that platform, so the Linux
 * host this deploys to keeps the tighter set.
 */
const WINDOWS_SPAWN_VARS = [
  "SystemRoot",
  "SystemDrive",
  "ComSpec",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
]

const childEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? os.homedir(),
  CODEX_HOME,
  ...(process.platform === "win32"
    ? Object.fromEntries(
        WINDOWS_SPAWN_VARS.filter((k) => process.env[k]).map((k) => [k, process.env[k]])
      )
    : {}),
}

const codex = new Codex({
  env: childEnv,
  ...(process.env.CODEX_PATH ? { codexPathOverride: process.env.CODEX_PATH } : {}),
})

function textOf(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.type === "text" ? part.text : ""))
      .join("")
  }
  return ""
}

/**
 * Flattens an OpenAI message list into one prompt.
 *
 * Codex has no separate system-prompt parameter — instructions and question
 * travel together — so the system messages simply lead. A resumed thread already
 * holds the earlier turns, so it is sent only the newest question rather than a
 * transcript it would pay to read again.
 */
function renderPrompt(messages, { resumed }) {
  const system = messages.filter((m) => m.role === "system").map((m) => textOf(m.content))
  const turns = messages.filter((m) => m.role !== "system")

  if (resumed) {
    const last = turns[turns.length - 1]
    return textOf(last?.content ?? "")
  }

  const body =
    turns.length <= 1
      ? textOf(turns[0]?.content ?? "")
      : turns
          .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${textOf(m.content)}`)
          .join("\n\n")

  return system.length ? `${system.join("\n\n")}\n\n${body}` : body
}

/** Reasoning efforts the current models accept. "minimal" is rejected by the default model. */
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"])

function threadOptions({ model, reasoningEffort }) {
  return {
    ...(model ? { model } : {}),
    ...(EFFORTS.has(reasoningEffort) ? { modelReasoningEffort: reasoningEffort } : {}),
    // The agent is here to reason over text it was handed, not to act. Nothing
    // it decides to do should be able to touch the host or the network.
    sandboxMode: "read-only",
    networkAccessEnabled: false,
    webSearchMode: "disabled",
    approvalPolicy: "never",
    workingDirectory: WORK_DIR,
    skipGitRepoCheck: true,
  }
}

async function runTurn(thread, prompt, { signal, onReasoning }) {
  let content = ""
  let usage = null
  let failure = null

  const { events } = await thread.runStreamed(prompt, signal ? { signal } : undefined)

  for await (const event of events) {
    switch (event.type) {
      case "item.completed":
        // Codex delivers a finished message rather than a token stream, so this
        // is where the whole answer arrives at once.
        if (event.item.type === "agent_message") content += event.item.text
        // Reasoning summaries arrive earlier and are the only progress signal
        // there is. They are forwarded so a caller can show something is happening.
        else if (event.item.type === "reasoning" && onReasoning) onReasoning(event.item.text)
        else if (event.item.type === "error") failure = event.item.message ?? "Codex reported an error."
        break
      case "turn.completed":
        usage = event.usage
        break
      case "turn.failed":
        failure = event.error?.message ?? "The turn failed."
        break
      case "error":
        failure = event.message ?? "The stream failed."
        break
      default:
        break
    }
  }

  return { content, usage, failure }
}

export const codexBackend = {
  id: "codex",
  label: "ChatGPT subscription (Codex)",

  async health() {
    try {
      const raw = await readFile(path.join(CODEX_HOME, "auth.json"), "utf8")
      const auth = JSON.parse(raw)
      const lastRefresh = auth.last_refresh ? new Date(auth.last_refresh) : null
      const ageDays = lastRefresh
        ? Math.floor((Date.now() - lastRefresh.getTime()) / 86_400_000)
        : null

      // Reported so a token going stale is visible in the dashboard before it
      // turns into a confusing 401 in the middle of someone's question.
      return {
        ready: Boolean(auth.tokens?.refresh_token) || Boolean(auth.OPENAI_API_KEY),
        authMode: auth.auth_mode ?? "unknown",
        lastRefresh: auth.last_refresh ?? null,
        refreshAgeDays: ageDays,
        codexHome: CODEX_HOME,
        detail:
          auth.auth_mode === "chatgpt"
            ? "Signed in with a ChatGPT account."
            : "Signed in, but not with a ChatGPT account — turns may be billed to an API key.",
      }
    } catch (err) {
      return {
        ready: false,
        codexHome: CODEX_HOME,
        // The path is reported in its own field rather than in the message,
        // because the dashboard shows the message to whoever opens Settings and
        // that page has no login.
        detail:
          `No usable auth.json in CODEX_HOME (${err.code || err.message}). ` +
          "Run `codex login` on the bridge server — see bridge/README.md, step 4.",
      }
    }
  },

  /**
   * One turn. Text is handed to onDelta as it becomes available — which, for
   * this backend, means once at the end.
   */
  async run({ model, messages, chatId, reasoningEffort, signal, onDelta, onReasoning }) {
    pruneThreads()

    const options = threadOptions({ model, reasoningEffort })
    const known = chatId ? threads.get(chatId) : null

    const attempt = async (resumeId) => {
      const thread = resumeId ? codex.resumeThread(resumeId, options) : codex.startThread(options)
      const prompt = renderPrompt(messages, { resumed: Boolean(resumeId) })
      const result = await runTurn(thread, prompt, { signal, onReasoning })
      return { ...result, threadId: thread.id }
    }

    let result
    if (known) {
      try {
        result = await attempt(known.threadId)
        if (result.failure && !result.content) throw new Error(result.failure)
      } catch {
        // A thread can disappear — the volume was replaced, the host was rebuilt,
        // the id expired. Falling back to a fresh thread costs the earlier
        // conversation, not the answer.
        threads.delete(chatId)
        result = await attempt(null)
      }
    } else {
      result = await attempt(null)
    }

    if (result.failure && !result.content) {
      const err = new Error(explain(result.failure))
      err.statusCode = /401|unauthor|invalid.*token|login/i.test(result.failure) ? 401 : 502
      throw err
    }

    if (chatId && result.threadId) {
      threads.set(chatId, { threadId: result.threadId, lastUsed: Date.now() })
    }

    if (result.content && onDelta) onDelta(result.content)

    return {
      content: result.content,
      finishReason: "stop",
      usage: result.usage
        ? {
            prompt_tokens: result.usage.input_tokens,
            completion_tokens: result.usage.output_tokens,
            total_tokens: result.usage.input_tokens + result.usage.output_tokens,
            prompt_tokens_details: { cached_tokens: result.usage.cached_input_tokens ?? 0 },
            completion_tokens_details: {
              reasoning_tokens: result.usage.reasoning_output_tokens ?? 0,
            },
          }
        : null,
    }
  },
}

/** The two failures worth naming precisely, because each has a specific fix. */
function explain(message) {
  const text = String(message)
  if (/401|unauthor|invalid.*token|not logged in/i.test(text)) {
    return `${text} — the ChatGPT login on the bridge has expired. Run \`codex login\` on the host and restart the service.`
  }
  if (/unsupported_value.*reasoning|'minimal'/i.test(text)) {
    return `${text} — that reasoning effort is not supported by this model. Use low, medium or high.`
  }
  return text
}
