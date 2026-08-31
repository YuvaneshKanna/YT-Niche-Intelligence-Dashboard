# Claude chat bridge — legacy

> **Superseded.** Subscription chat now runs inside the dashboard's own Vercel
> function — see [`docs/subscription-chat.md`](../docs/subscription-chat.md).
> Setup is one environment variable: no bridge process, no pm2, no tunnel, no
> shared secret, no always-on machine.
>
> This directory is kept so existing deployments keep working. `/api/chat` falls
> back to it only when `CLAUDE_CODE_OAUTH_TOKEN` is not set. Everything below
> describes that older setup.


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

**Recommended — supervised with pm2, so it restarts itself if it crashes**
instead of chat just going quiet until someone notices:

```bash
npm i -g @anthropic-ai/claude-code pm2

# in this window, with your real values:
$env:CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat..."      # PowerShell; CMD: set VAR=value (no quotes)
$env:SANDBOX_SHARED_SECRET="..."

pm2 start ecosystem.config.cjs
pm2 save
```

`pm2 logs claude-bridge` shows what it's doing; `pm2 restart claude-bridge`
restarts it by hand (e.g. after rotating the token). See the comments in
`ecosystem.config.cjs` for what pm2 does and does not cover — notably, it
does not manage the tunnel (see [Reliability](#reliability-what-still-needs-you) below).

**Quick one-off test, no supervision:**
`npm i -g @anthropic-ai/claude-code` then
`CLAUDE_CODE_OAUTH_TOKEN=... SANDBOX_SHARED_SECRET=... node server.mjs`
— dies the moment the window closes or the process crashes.

**Docker**, if you'd rather run it in a container:

```bash
docker build -t niche-chat-bridge .

docker run -d --name niche-chat \
  --restart unless-stopped \
  -p 8787:8787 \
  -e CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat..." \
  -e SANDBOX_SHARED_SECRET="$(openssl rand -hex 32)" \
  niche-chat-bridge
```

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

## Reliability: what still needs you

pm2 (step 2) fixes the bridge dying. It does **not** fix the tunnel, and the
tunnel is the more common failure:

**If you're using a Cloudflare Quick Tunnel** (`cloudflared tunnel --url
http://localhost:8787`), it hands out a brand-new random
`https://<four-words>.trycloudflare.com` address every single time that
process starts — there is no way to keep the same one. So even with pm2
keeping the bridge alive forever, if the tunnel window closes or crashes and
you (or a supervisor) restart it, `SANDBOX_CHAT_URL` in Vercel now points at a
dead URL and chat breaks with a 530 until you notice, grab the new URL, and
update + redeploy. This is inherent to Quick Tunnels, not a bug — Cloudflare
designed them to be throwaway.

**Fix: a named tunnel**, which gets a fixed URL that survives restarts
(requires a free Cloudflare account, no domain purchase needed):

```bash
cloudflared tunnel login                       # opens a browser to authorise
cloudflared tunnel create niche-chat-bridge     # prints a tunnel ID
cloudflared tunnel route dns niche-chat-bridge chat.yourdomain.com
# no domain of your own? Cloudflare also lets you skip `route dns` and use
# the auto-generated <tunnel-id>.cfargotunnel.com hostname instead.
cloudflared tunnel run --url http://localhost:8787 niche-chat-bridge
```

Now `SANDBOX_CHAT_URL` is set **once**, permanently — restarting the tunnel
(including via pm2, if you add it to `ecosystem.config.cjs` once it's named)
never changes it again. Until you do this, treat "chat suddenly 530s" as
routine and check the tunnel window first, not the bridge.

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
