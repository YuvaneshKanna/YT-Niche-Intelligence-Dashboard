# Subscription chat

Ask Claude questions about your niche metrics, billed against your **Claude
subscription** rather than an Anthropic API key.

```
browser → /api/chat (Vercel) → Claude Code, in the same function
                                CLAUDE_CODE_OAUTH_TOKEN
```

There is no second service. The Claude Agent SDK ships the Claude Code harness
as plain JavaScript — no native binary, nothing downloaded at install time — so
it runs inside the Vercel function the same way it runs on a laptop.

## Setup

**1. Mint a token.** On any machine where you are logged into Claude Code:

```bash
claude setup-token
```

It prints a `sk-ant-oat01-…` value. Treat it like a password — it authorises
your whole Claude account.

**2. Give it to Vercel and redeploy.**

```bash
vercel env add CLAUDE_CODE_OAUTH_TOKEN production
# paste the token when prompted
vercel --prod
```

Or paste it into Vercel → Settings → Environment Variables by hand. Either way
the variable only reaches the function after a deploy.

That is the whole setup. Settings → Chat backend → *Claude subscription* shows a
live checklist if something is missing.

## Gate it

**The dashboard has no login and is publicly reachable.** Every answer spends
your Claude plan limits, so without a gate anyone who finds the URL can spend
them.

Set `CHAT_ACCESS_TOKEN` in Vercel to any long random string. The chat panel then
prompts for it once and stores it in the browser. It is a shared password, not
real authentication — if this dashboard ever holds anything sensitive, put
proper auth in front of the whole site.

## Environment variables

| Key | Required | What it does |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | yes | From `claude setup-token`. The only thing subscription chat needs. |
| `CHAT_ACCESS_TOKEN` | recommended | Password the chat panel must present. See above. |
| `CLAUDE_TIMEOUT_MS` | no | Per-turn timeout, default `120000`. |
| `ANTHROPIC_API_KEY` | no | Only for API-key mode, which is a separate backend. |
| `METRICS_SOURCE` | no | `sheets` reads the metrics context from Google Sheets. Defaults to Neon, same as the dashboard. |

## Notes

- **No tools.** The harness runs with `permissionMode: "dontAsk"` and no allowed
  tools, so Claude gets no filesystem, shell or network access. It reads the
  metrics text the route sends and replies.
- **Fresh slate.** `settingSources: []` means no `CLAUDE.md`, project settings or
  user settings are read from the deployment.
- **Follow-ups resume.** The first turn carries the metrics; later turns resume
  the session instead of resending ~100KB every message. Transcripts live in
  `/tmp`, which belongs to one function instance — if a follow-up lands on a
  different instance the route silently replays the context, so you lose the
  earlier conversation but never the answer.
- **Plan usage.** The panel's usage meter comes from the same rate-limit numbers
  `/usage` shows interactively.
- **Rotation.** Run `claude setup-token` again and update the Vercel variable.

## The old bridge

`sandbox/` holds the previous design: a Node process you hosted yourself,
exposed over a Cloudflare tunnel, reached with a shared secret. It still works
and the route still falls back to it, but only when `CLAUDE_CODE_OAUTH_TOKEN`
is **not** set — otherwise a leftover `SANDBOX_CHAT_URL` would keep routing chat
at a machine you thought you had retired.

To retire it: set the token, redeploy, confirm chat works, then delete
`SANDBOX_CHAT_URL` and `SANDBOX_SHARED_SECRET` from Vercel and stop the bridge
and its tunnel.
