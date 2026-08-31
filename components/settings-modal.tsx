"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Check, Copy, Eye, EyeOff, Info, Key, RefreshCw, Sparkles, Trash2, X } from "lucide-react"
import {
  clearSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ChatMode,
  type DashboardSettings,
} from "@/lib/settings"

/** 32 random bytes as hex, from the browser's CSPRNG. */
function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

interface ChatStatus {
  oauthTokenSet: boolean
  /** Which backend a subscription-mode message actually takes. */
  subscriptionBackend: "in-function" | "bridge" | "none"
  sandboxUrlSet: boolean
  sandboxSecretSet: boolean
  bridgeReachable: boolean | null
  serverApiKeySet: boolean
  accessTokenRequired: boolean
}

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS)
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [status, setStatus] = useState<ChatStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const checkStatus = () => {
    setChecking(true)
    fetch("/api/chat/status")
      .then((r) => r.json())
      .then((j) => setStatus(j as ChatStatus))
      .catch(() => setStatus(null))
      .finally(() => setChecking(false))
  }

  useEffect(() => {
    if (open) {
      setSettings(loadSettings())
      setSaved(false)
      checkStatus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const set = <K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    const ok = saveSettings(settings)
    setStorageBlocked(!ok)
    setSaved(ok)
    if (ok) setTimeout(() => setSaved(false), 2500)
  }

  const handleClear = () => {
    clearSettings()
    setSettings({ ...DEFAULT_SETTINGS })
    setSaved(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Settings"
        className="fixed left-1/2 top-1/2 z-[70] flex max-h-[88vh] w-[680px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <Notice />

          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              Chat backend
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <ModeCard
                active={settings.chatMode === "subscription"}
                onClick={() => set("chatMode", "subscription" as ChatMode)}
                icon={<Sparkles className="h-4 w-4" />}
                title="Claude subscription"
                detail="Runs Claude Code inside the dashboard's own function. One env var, no per-message cost."
              />
              <ModeCard
                active={settings.chatMode === "api"}
                onClick={() => set("chatMode", "api" as ChatMode)}
                icon={<Key className="h-4 w-4" />}
                title="Anthropic API key"
                detail="Calls the API directly. Works without hosting anything."
              />
            </div>
          </section>

          {settings.chatMode === "subscription" && (
            <SetupChecklist status={status} checking={checking} onRecheck={checkStatus} />
          )}

          {settings.chatMode === "api" ? (
            <section className="space-y-3">
              <Field
                label="Anthropic API key"
                hint="From console.anthropic.com. Stored in this browser only and sent with each chat request."
                value={settings.anthropicApiKey}
                onChange={(v) => set("anthropicApiKey", v)}
                secret
                revealed={reveal.api}
                onToggleReveal={() => setReveal((r) => ({ ...r, api: !r.api }))}
                placeholder="sk-ant-api03-…"
              />
              <Field
                label="Model (optional)"
                hint="Leave empty for the server default (claude-opus-5)."
                value={settings.anthropicModel}
                onChange={(v) => set("anthropicModel", v)}
                placeholder="claude-opus-5"
              />
            </section>
          ) : (
            <section className="space-y-3">
              <Field
                label="Claude Code OAuth token"
                hint="From `claude setup-token`. Kept in this browser only, to fill in the command below — the copy that matters is the one you set in Vercel."
                value={settings.claudeOauthToken}
                onChange={(v) => set("claudeOauthToken", v)}
                secret
                revealed={reveal.oauth}
                onToggleReveal={() => setReveal((r) => ({ ...r, oauth: !r.oauth }))}
                placeholder="sk-ant-oat01-…"
              />
              <TokenSetup token={settings.claudeOauthToken} />
            </section>
          )}

          <section>
            <Field
              label="Chat access token (optional)"
              hint={
                settings.chatMode === "subscription"
                  ? "Gates who can use chat at all. Recommended in subscription mode: every answer spends YOUR Claude limits, so without this anyone who finds the dashboard URL can use them. Set CHAT_ACCESS_TOKEN in Vercel to the same value. Leave blank if you have not set it."
                  : "Gates who can use chat at all. Usually unnecessary in API-key mode, since each person supplies their own key — unless the deployment also sets a fallback ANTHROPIC_API_KEY. Leave blank if you have not set CHAT_ACCESS_TOKEN in Vercel."
              }
              value={settings.chatAccessToken}
              onChange={(v) => set("chatAccessToken", v)}
              secret
              revealed={reveal.access}
              onToggleReveal={() => setReveal((r) => ({ ...r, access: !r.access }))}
              placeholder="leave blank unless CHAT_ACCESS_TOKEN is set"
              onGenerate={() => {
                set("chatAccessToken", generateSecret())
                setReveal((r) => ({ ...r, access: true }))
              }}
            />
          </section>

          {storageBlocked && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              Could not write to browser storage. Settings will apply for this tab only.
            </p>
          )}
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </button>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
            <button
              onClick={handleSave}
              className="rounded-lg bg-primary px-4 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}

function Notice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Credentials stay in this browser. Nothing here is saved on the server or in the
        spreadsheet, and nothing is shared with other people using this dashboard — each person
        enters their own. Anyone with access to this browser profile can read them, so rotate
        them if the machine is shared.
      </p>
    </div>
  )
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  detail,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  detail: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-foreground">
        {icon}
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">{detail}</p>
    </button>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  secret,
  revealed,
  onToggleReveal,
  placeholder,
  onGenerate,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  secret?: boolean
  revealed?: boolean
  onToggleReveal?: () => void
  placeholder?: string
  onGenerate?: () => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      <div className="flex gap-2">
        <input
          type={secret && !revealed ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-primary/50"
        />
        {onGenerate && (
          <button
            onClick={onGenerate}
            title="Generate a random secret"
            className="flex items-center gap-1 rounded-lg border border-border px-2 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Generate
          </button>
        )}
        {secret && (
          <button
            onClick={onToggleReveal}
            aria-label={revealed ? "Hide" : "Reveal"}
            className="rounded-lg border border-border px-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * The whole of subscription setup: mint a token, put it in Vercel, redeploy.
 *
 * Chat runs inside the dashboard's own function, so there is nothing to host,
 * nothing to keep running and no tunnel to babysit. That is the entire reason
 * this component is two commands rather than the six the bridge needed.
 */
function TokenSetup({ token }: { token: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const ready = Boolean(token)

  const copy = (key: string, text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key)
        setTimeout(() => setCopied(null), 2000)
      })
      .catch(() => {
        // Clipboard can be blocked; the commands are visible for manual copying.
      })
  }

  const steps: { key: string; title: string; cmd: string; note: string }[] = [
    {
      key: "mint",
      title: "1. Mint a token",
      cmd: "claude setup-token",
      note: "Run it anywhere you are logged into Claude Code, then paste the result above.",
    },
    {
      key: "set",
      title: "2. Put it in Vercel and redeploy",
      cmd: [
        "vercel env add CLAUDE_CODE_OAUTH_TOKEN production",
        `# paste: ${token || "<paste your token above>"}`,
        "vercel --prod",
      ].join("\n"),
      note: ready
        ? "Or paste it into Vercel → Settings → Environment Variables by hand. That is the last step."
        : "Fill in the token above and this becomes ready to paste.",
    },
  ]

  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.key} className="rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">{s.title}</p>
            <button
              onClick={() => copy(s.key, s.cmd)}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied === s.key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied === s.key ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[10px] leading-relaxed text-foreground">
            <code>{s.cmd}</code>
          </pre>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{s.note}</p>
        </div>
      ))}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        The token authorises your whole Claude account and every answer spends your plan limits, so
        set a chat access token below before sharing the dashboard URL. Rotate it any time by
        running <code className="rounded bg-muted px-1">claude setup-token</code> again.
      </p>
    </div>
  )
}

/**
 * Live view of what still has to happen before subscription chat works.
 *
 * Everything here is server-side, from /api/chat/status. Without it the only
 * feedback was a failed message, which does not say WHICH piece is missing.
 *
 * Deployments still on the old self-hosted bridge get its rows instead, so an
 * existing setup keeps a checklist that matches what it actually runs.
 */
function SetupChecklist({
  status,
  checking,
  onRecheck,
}: {
  status: ChatStatus | null
  checking: boolean
  onRecheck: () => void
}) {
  const onBridge = status?.subscriptionBackend === "bridge"

  const rows: { label: string; done: boolean | null; note: string }[] = onBridge
    ? [
        {
          label: "SANDBOX_CHAT_URL set in Vercel",
          done: status.sandboxUrlSet,
          note: "legacy bridge backend",
        },
        {
          label: "SANDBOX_SHARED_SECRET set in Vercel",
          done: status.sandboxSecretSet,
          note: "legacy bridge backend",
        },
        {
          label: "Bridge running and reachable",
          done: status.bridgeReachable,
          note:
            status.bridgeReachable === false
              ? "Vercel cannot reach it — is `node server.mjs` running, and the tunnel up?"
              : "Set CLAUDE_CODE_OAUTH_TOKEN in Vercel to retire this entirely.",
        },
      ]
    : [
        {
          label: "CLAUDE_CODE_OAUTH_TOKEN set in Vercel",
          done: status ? status.oauthTokenSet : null,
          note: status?.oauthTokenSet
            ? "chat runs inside this deployment — nothing else to start"
            : "the only variable subscription chat needs",
        },
        {
          label: "Deployed since setting it",
          done: status ? status.oauthTokenSet : null,
          note: "env vars only reach the function after a redeploy",
        },
        {
          label: "Chat gated with CHAT_ACCESS_TOKEN",
          done: status ? status.accessTokenRequired : null,
          note: status?.accessTokenRequired
            ? "the dashboard has no login, so this is what protects your plan limits"
            : "optional, but anyone with the URL can spend your Claude limits without it",
        },
      ]

  const blocked = rows.some((r) => r.done === false || r.done === null)

  return (
    <section className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Setup status</p>
        <button
          onClick={onRecheck}
          disabled={checking}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
          Re-check
        </button>
      </div>

      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-2">
            {r.done === true ? (
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
            ) : r.done === false ? (
              <X className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p
                className={`text-[11px] ${r.done === true ? "text-muted-foreground" : "text-foreground"}`}
              >
                {r.label}
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">{r.note}</p>
            </div>
          </li>
        ))}
      </ul>

      {blocked && (
        <p className="mt-2 border-t border-border pt-2 text-[10px] leading-relaxed text-amber-200/90">
          {onBridge
            ? "This deployment still routes chat through the self-hosted bridge. Setting CLAUDE_CODE_OAUTH_TOKEN in Vercel takes over from it, and then the bridge, its tunnel and both SANDBOX_ variables can go."
            : "Entering the token above does not deploy it — Vercel needs its own copy. Chat works once every row is green. To use chat right now without that, switch to API-key mode."}
        </p>
      )}
    </section>
  )
}
