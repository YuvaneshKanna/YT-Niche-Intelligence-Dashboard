"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Eye, EyeOff, Info, Key, RefreshCw, Sparkles, Trash2, X } from "lucide-react"
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

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS)
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [storageBlocked, setStorageBlocked] = useState(false)

  useEffect(() => {
    if (open) {
      setSettings(loadSettings())
      setSaved(false)
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
                detail="Runs the Claude CLI on a bridge you host. No per-message cost."
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
                hint="From `claude setup-token`. Used only to build the command below — it is never sent to the server, because Vercel cannot run the CLI."
                value={settings.claudeOauthToken}
                onChange={(v) => set("claudeOauthToken", v)}
                secret
                revealed={reveal.oauth}
                onToggleReveal={() => setReveal((r) => ({ ...r, oauth: !r.oauth }))}
                placeholder="sk-ant-oat01-…"
              />
              <Field
                label="Bridge shared secret"
                hint="A password you invent, so only your dashboard can talk to the bridge. Click Generate, then set the SAME value as SANDBOX_SHARED_SECRET in Vercel — if they differ, the bridge returns 401."
                value={settings.bridgeSecret}
                onChange={(v) => set("bridgeSecret", v)}
                secret
                revealed={reveal.bridge}
                onToggleReveal={() => setReveal((r) => ({ ...r, bridge: !r.bridge }))}
                placeholder="click Generate"
                onGenerate={() => {
                  set("bridgeSecret", generateSecret())
                  setReveal((r) => ({ ...r, bridge: true }))
                }}
              />
              {settings.bridgeSecret && <VercelEnvHint secret={settings.bridgeSecret} />}
              <BridgeCommand token={settings.claudeOauthToken} secret={settings.bridgeSecret} />
            </section>
          )}

          <section>
            <Field
              label="Chat access token (optional)"
              hint="Only needed if the deployment sets CHAT_ACCESS_TOKEN."
              value={settings.chatAccessToken}
              onChange={(v) => set("chatAccessToken", v)}
              secret
              revealed={reveal.access}
              onToggleReveal={() => setReveal((r) => ({ ...r, access: !r.access }))}
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

/** Builds the exact command to start the bridge, with the entered values filled in. */
function BridgeCommand({ token, secret }: { token: string; secret: string }) {
  const [copied, setCopied] = useState(false)
  const ready = Boolean(token && secret)

  const cmd = [
    "npm install -g @anthropic-ai/claude-code",
    "cd sandbox",
    `$env:CLAUDE_CODE_OAUTH_TOKEN="${token || "<paste your token above>"}"`,
    `$env:SANDBOX_SHARED_SECRET="${secret || "<paste your secret above>"}"`,
    "node server.mjs",
  ].join("\n")

  const copy = () => {
    navigator.clipboard
      .writeText(cmd)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Clipboard can be blocked; the command is visible for manual copying.
      })
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Start the bridge (PowerShell)</p>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[10px] leading-relaxed text-foreground">
        <code>{cmd}</code>
      </pre>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {ready
          ? "Run this in the repo root. Then expose it over HTTPS and set SANDBOX_CHAT_URL and SANDBOX_SHARED_SECRET in Vercel."
          : "Fill in both fields above and this command becomes ready to paste."}{" "}
        No Docker needed — it is a plain Node process.
      </p>
    </div>
  )
}

/** Shows the exact Vercel variable to create, with a copy button. */
function VercelEnvHint({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      .writeText(secret)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Clipboard blocked — the value is visible above for manual copying.
      })
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
      <p className="text-[10px] leading-relaxed text-amber-200/90">
        Also add this in Vercel as <code className="rounded bg-muted px-1">SANDBOX_SHARED_SECRET</code>,
        then redeploy. It must match exactly.
      </p>
      <button
        onClick={copy}
        className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy value"}
      </button>
    </div>
  )
}
