# Claude chat bridge

Runs `claude -p` inside a container on **your Claude subscription**, and streams
answers back to the dashboard. No Anthropic API key.

```
browser → /api/chat (Vercel)  →  this bridge  →  claude -p
          shared secret           OAuth token stays here
```

The subscription token exists only in this container. Vercel never sees it, and
neither does the browser.

## 1. Create the token

On a machine where you are logged into Claude Code:

```bash
claude setup-token
```

Copy the `CLAUDE_CODE_OAUTH_TOKEN` it prints. Treat it like a password — it
authorises your whole Claude account.

## 2. Run the bridge

```bash
docker build -t niche-chat-bridge .

docker run -d --name niche-chat \
  -p 8787:8787 \
  -e CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat..." \
  -e SANDBOX_SHARED_SECRET="$(openssl rand -hex 32)" \
  niche-chat-bridge
```

Without Docker: `npm i -g @anthropic-ai/claude-code` then
`CLAUDE_CODE_OAUTH_TOKEN=... SANDBOX_SHARED_SECRET=... node server.mjs`.

Check it: `curl localhost:8787/health` → `{"ok":true,...}`

The bridge refuses to start if either variable is missing, so it can never come
up unauthenticated.

## 3. Expose it

Vercel must be able to reach it over HTTPS. Any of: a small VPS behind a
reverse proxy with TLS, Fly.io / Railway / Render, or a Cloudflare Tunnel to a
machine you already run.

It must NOT be an open endpoint: the shared secret is the only thing between
the public internet and your Claude account.

## 4. Point the dashboard at it

In Vercel → Settings → Environment Variables:

| Key | Value |
|---|---|
| `SANDBOX_CHAT_URL` | `https://your-bridge.example.com` |
| `SANDBOX_SHARED_SECRET` | the same secret you passed to the container |
| `CHAT_ACCESS_TOKEN` | any long random string — see below |

Redeploy.

## Why CHAT_ACCESS_TOKEN matters

**The dashboard has no login and is publicly reachable.** Without a gate,
anyone who finds the URL can send messages that spend your Claude subscription
limits. When `CHAT_ACCESS_TOKEN` is set, the chat panel prompts for it once and
stores it in the browser.

It is not real authentication — it is a shared password. If this dashboard ever
holds anything sensitive, put proper auth in front of the whole site.

## Notes

- `--bare` is deliberately not used. Bare mode never reads OAuth credentials
  and would force an API key.
- The bridge runs with `--permission-mode dontAsk` and `--allowedTools ""`, so
  Claude gets no filesystem, shell or network tools. It only reads the metrics
  text the dashboard sends and replies.
- The first turn carries the metrics context; follow-ups `--resume` the session
  so the context is not resent every message.
- Sessions expire after an hour of inactivity.
- Rotate the token with `claude setup-token` if it is ever exposed.
