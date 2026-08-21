"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, Lock, Sparkles, Square, X } from "lucide-react"
import type { RangeKey } from "@/lib/metrics/types"
import { chatHeaders, loadSettings } from "@/lib/settings"

interface Turn {
  role: "user" | "assistant"
  content: string
  error?: boolean
}

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  range: RangeKey
  nicheGroup: string | null
}

const SUGGESTIONS = [
  "Which niche group has the strongest momentum right now, and is it one channel carrying it?",
  "Compare Shorts and long-form across the groups — where is the gap widest?",
  "What do the BREAKOUT videos have in common?",
  "Which group is most worth investing in next month, and why?",
]

/**
 * Chat over the niche metrics.
 *
 * The browser talks to /api/chat, which forwards to the sandbox bridge running
 * `claude -p` on your subscription token. No model credentials exist in this
 * component or anywhere else in the deployed app.
 */
export function ChatPanel({ open, onClose, range, nicheGroup }: ChatPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [accessToken, setAccessToken] = useState("")
  const [needsAccess, setNeedsAccess] = useState(false)
  const chatIdRef = useRef<string>("")
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chatIdRef.current) {
      chatIdRef.current =
        globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random()}`
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, busy, onClose])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [turns])

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }

  const send = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return

    setInput("")
    setTurns((t) => [...t, { role: "user", content: q }, { role: "assistant", content: "" }])
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller

    const appendToLast = (text: string, isError = false) =>
      setTurns((t) => {
        const next = [...t]
        const last = next[next.length - 1]
        next[next.length - 1] = {
          ...last,
          content: last.content + text,
          error: isError || last.error,
        }
        return next
      })

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Read at send time so a Settings change applies without a reload.
          ...chatHeaders(loadSettings()),
          ...(accessToken ? { "x-chat-access": accessToken } : {}),
        },
        body: JSON.stringify({ question: q, chatId: chatIdRef.current, range }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        if (err.code === "LOCKED") {
          setNeedsAccess(true)
          appendToLast("This dashboard requires a chat access token.", true)
        } else {
          appendToLast(err.error || `Request failed (${res.status})`, true)
        }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith("data:")) continue
          let evt: { type?: string; text?: string; error?: string }
          try {
            evt = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }
          if (evt.type === "text" && evt.text) appendToLast(evt.text)
          else if (evt.type === "error") appendToLast(`\n\n${evt.error ?? "Error"}`, true)
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        appendToLast(`\n\n${err instanceof Error ? err.message : "Network error"}`, true)
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const saveAccess = (token: string) => {
    setAccessToken(token)
    setNeedsAccess(false)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Chat with Claude about these metrics"
        className="fixed right-0 top-0 z-50 flex h-screen w-[560px] max-w-[94vw] flex-col border-l border-border bg-card shadow-2xl"
      >
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Ask Claude</h2>
            <span className="text-[11px] text-muted-foreground">
              {nicheGroup ? `${nicheGroup} · ${range}` : range}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {needsAccess && <AccessPrompt onSave={saveAccess} />}

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ask anything about the tracked niche groups. Claude sees the same aggregated
                metrics this page renders — groups, channels, daily trends and top videos by
                views/day.
              </p>
              <div className="mt-3 space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, i) => (
            <div
              key={i}
              className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[92%] rounded-xl px-3 py-2 ${
                  turn.role === "user"
                    ? "bg-primary/15 text-foreground"
                    : turn.error
                      ? "border border-destructive/30 bg-destructive/5"
                      : "bg-background"
                }`}
              >
                {turn.role === "assistant" && turn.content === "" && busy ? (
                  <span className="inline-flex gap-1" aria-label="Thinking">
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </span>
                ) : (
                  <MessageBody text={turn.content} error={turn.error} />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-shrink-0 border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={2}
              placeholder="Ask about a niche group, a channel, or what to make next…"
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
            />
            {busy ? (
              <button
                onClick={stop}
                aria-label="Stop"
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={!input.trim()}
                aria-label="Send"
                className="rounded-lg bg-primary p-2 text-primary-foreground transition-opacity disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Enter to send, Shift+Enter for a new line. Backend is chosen in Settings.
          </p>
        </div>
      </aside>
    </>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  )
}

/** Plain text with bullet awareness. Never renders HTML from the model. */
function MessageBody({ text, error }: { text: string; error?: boolean }) {
  const lines = text.split(/\r?\n/)
  return (
    <div className={`space-y-1 ${error ? "text-destructive" : "text-foreground"}`}>
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1" />
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
        if (bullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
              <p className="text-xs leading-relaxed">{bullet[1]}</p>
            </div>
          )
        }
        return (
          <p key={i} className="text-xs leading-relaxed">
            {line}
          </p>
        )
      })}
    </div>
  )
}

function AccessPrompt({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState("")
  return (
    <div className="flex-shrink-0 border-b border-amber-500/25 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-amber-400" />
        <p className="text-xs font-medium text-foreground">Chat access token</p>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
        This dashboard is public, so chat is gated to stop strangers spending your Claude
        limits. Enter the value of <code className="rounded bg-muted px-1">CHAT_ACCESS_TOKEN</code>.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onSave(value.trim())}
          className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        />
        <button
          onClick={() => value.trim() && onSave(value.trim())}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground"
        >
          Save
        </button>
      </div>
    </div>
  )
}
