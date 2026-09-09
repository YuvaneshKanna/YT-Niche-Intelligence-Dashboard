# AI bridge

A small service that lets the dashboard use **ChatGPT** and **OmniRoute** the
same way it already uses Claude.

## Why this exists

Claude answers from inside the dashboard itself, with nothing else running
anywhere. The other two cannot work that way:

- **ChatGPT** is reached through the Codex program, which is a real installed
  program rather than a library, and its login is a credential that gets
  rewritten on disk every so often. Both need a computer that stays on and
  remembers things between restarts.
- **OmniRoute** is a gateway that has to stay running to be useful.

So both live here, on the server, and the dashboard talks to them over the
internet through one address.

Everything speaks the standard OpenAI format. That is deliberate: adding another
AI later is a small file in `lib/backends/`, and the dashboard does not change at
all.

## What you need before starting

- The server you already run n8n on (or any Linux server with Docker).
- A domain name you control, with a subdomain pointed at that server —
  for example `ai-bridge.yourdomain.com`.
- Your ChatGPT account login.

## Setting it up

Every command below runs on the server unless it says otherwise.

### 1. Copy the files across

Put this `bridge` folder on the server at `/opt/ai-bridge`. It is a directory of
its own and does not touch the n8n installation.

### 2. Fill in the settings

```bash
cd /opt/ai-bridge
cp .env.example .env
openssl rand -base64 48        # copy the output
nano .env                      # paste it as BRIDGE_TOKEN, and set BRIDGE_DOMAIN
```

Keep that token somewhere safe — the dashboard needs the identical value later.

### 3. Start it

```bash
docker compose up -d --build
```

The first build takes a few minutes. Caddy gets a security certificate for your
domain automatically.

### 4. Sign in to ChatGPT

This is the one step that needs a browser, and it is done once.

**On your own computer**, open a terminal and connect to the server with a
tunnel, so the sign-in page can reach it:

```bash
ssh -L 1455:localhost:1455 you@your-server
```

Then, in that same connection:

```bash
cd /opt/ai-bridge
docker compose run --rm -p 127.0.0.1:1455:1455 bridge codex login
```

It prints a web address. Open it in your own browser, sign in to ChatGPT, and
the terminal will confirm. The login is stored on the server and survives
restarts and updates.

### 5. Set up OmniRoute (optional, and can wait)

OmniRoute is the backup that keeps working when the ChatGPT and Claude plans hit
their limits. It needs at least one provider key to be worth anything, so it is
useless until you configure it — and the dashboard works fine without it.

When you want it, tunnel to its admin page from your own computer:

```bash
ssh -L 20128:localhost:20128 you@your-server
```

Then open <http://localhost:20128> in your browser, set an admin password, and
add provider keys under Providers. It is deliberately not reachable from the
internet.

### 6. Point the dashboard at it

In Vercel, add two environment variables to the dashboard project and redeploy:

| Name | Value |
| --- | --- |
| `BRIDGE_URL` | `https://ai-bridge.yourdomain.com` |
| `BRIDGE_TOKEN` | the same token you put in `.env` |

## Checking it is working

```bash
curl -s https://ai-bridge.yourdomain.com/livez
```

Should print `{"ok":true}`.

For the full picture, including whether the ChatGPT login is healthy:

```bash
curl -s -H "Authorization: Bearer YOUR_TOKEN" \
  https://ai-bridge.yourdomain.com/health
```

The dashboard's Settings panel shows the same information, so you do not need to
run this by hand normally.

## Everyday operations

```bash
docker compose logs -f bridge     # watch what it is doing
docker compose restart bridge     # restart it
docker compose down               # stop everything
docker compose up -d --build      # start again after changing the files
```

Logs record which backend answered and how long it took. They never contain
questions or answers.

## When the ChatGPT login expires

Eventually the stored login stops working. You will see it two ways: the
dashboard's Settings panel shows the ChatGPT row in red, and asking a question
returns a message saying the login has expired.

The fix is step 4 again — sign in once more, then:

```bash
docker compose restart bridge
```

## Updating Codex

The Codex program and the library that drives it are released together and must
match. To update, change **both** version numbers and rebuild:

- `Dockerfile` — the `@openai/codex@…` line
- `package.json` — the `@openai/codex-sdk` line

```bash
docker compose up -d --build
```

## A note on cost

Every ChatGPT answer carries about 13,000 tokens of instructions that Codex adds
by itself, before your own question. After the first question in a conversation
most of that is cached and much cheaper, but it is why short questions are not as
cheap here as they look. It is charged against your ChatGPT plan, not a card.
