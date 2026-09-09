# AI providers — handoff

State of the multi-provider chat work as of **2026-09-10**. Everything described
here is live unless marked otherwise.

## Start the next session with this

> Read `AI-PROVIDERS-HANDOFF.md` at the repo root, then continue the AI provider
> work — next up is the Gemini CLI backend for the bridge, followed by automatic
> provider fallback. Don't re-explore what the doc already states.

---

## What exists now

The dashboard can chat with **four backends**, chosen from a dropdown in the
Ask AI panel:

| Provider | How it is billed | Where it runs |
| --- | --- | --- |
| Claude | Your Claude subscription | Inside the Vercel function |
| Anthropic API key | Per token, key from Settings | Direct to Anthropic |
| ChatGPT | Your ChatGPT subscription | The bridge server |
| OmniRoute | Provider keys inside the gateway | The bridge server |

**Claude and ChatGPT are verified working.** OmniRoute is running but has no
provider keys, so it cannot answer yet.

### Architecture, in one paragraph

Every backend sits behind one interface (`lib/chat/providers/types.ts`), and
`lib/chat/router.ts` decides which one answers. Claude runs inside the Vercel
function because its SDK is plain JavaScript. ChatGPT and OmniRoute cannot:
Codex is a native binary whose credentials rotate on disk, and OmniRoute is a
long-lived gateway. Both need a real machine, so they live on a small server
behind an **OpenAI-compatible** API (`bridge/`). That protocol choice is the
important one — adding another backend is a file in `bridge/lib/backends/` plus
a line in `registry.mjs`, and the dashboard needs no changes at all.

---

## Infrastructure

### The bridge server (new, dedicated)

- **Address:** <https://bridge.152-67-161-168.nip.io> (valid Let's Encrypt cert)
- **Host:** `152.67.161.168`, Oracle Always Free `VM.Standard.E2.1.Micro`,
  Ubuntu 24.04, named `ai-bridge`
- **SSH:** `ssh -i "C:\Users\yuvan\.oci\n8n_a1_ssh_key" ubuntu@152.67.161.168`
- **Deployed at:** `/opt/ai-bridge` (Docker Compose: bridge, caddy, omniroute)
- **Secrets:** `/opt/ai-bridge/.env` on the server holds `BRIDGE_TOKEN`. If it is
  ever needed again, read it from there — it is not stored anywhere locally.
- **Memory:** 954 MB total, 2 GB swap added. ~530 MB free with OmniRoute
  stopped, ~350 MB with it running. This is the tightest constraint on the box.

No DNS work was needed: the project uses **nip.io**, which maps an IP to a
hostname, so the certificate issues against the server's own address.

### Do NOT deploy to the n8n box

`129.159.236.100` (key at `E:\Mission YT Shorts\N8N\ssh-key-2026-05-19.key`) runs
production n8n and has only ~227 MB free, swap already a third used, and ports
80/443 held by its own Caddy. Installing Codex there would risk n8n. This was
checked and rejected deliberately.

### Vercel

- Project `ytnicheoverviewdashboard`, CLI at
  `C:\Users\yuvan\AppData\Roaming\npm\vercel.cmd`, logged in as
  `atlasoftimezz-2324`
- `BRIDGE_URL` and `BRIDGE_TOKEN` are set on **Production and Preview**
- Preview deployments have Vercel SSO protection, so they cannot be tested with
  curl — only in a logged-in browser

---

## Operating it

```bash
cd /opt/ai-bridge
sudo docker compose logs -f bridge          # which backend answered, and how long
sudo docker compose restart bridge          # restart
sudo docker compose --profile omniroute up -d   # start the gateway (opt-in)
sudo docker compose stop omniroute          # stop it, frees ~120MB
```

Health, without a browser:

```bash
curl -s https://bridge.152-67-161-168.nip.io/livez
curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" https://bridge.152-67-161-168.nip.io/health
```

Settings in the dashboard shows the same information, including whether the
ChatGPT login is healthy and how long since it refreshed.

### When the ChatGPT login expires

Settings shows that row red. To fix, on the server:

```bash
cd /opt/ai-bridge
sudo docker compose run --rm --entrypoint codex bridge login --device-auth
```

It prints a code and a URL. Enter the code at that URL in any browser. **No SSH
tunnel is needed** — the device-code flow avoids the browser-callback approach
the documentation leads with.

---

## Outstanding work

### 1. Gemini CLI backend (recommended next)

The user has a **Gemini Pro plan via Jio, free from April 2026 for 18 months**
(so until roughly October 2027). That is a consumer subscription — it does not
produce an API key — but Gemini CLI signs in with a Google account and runs
headless, exactly like Codex. Free tier alone is 60 requests/min and 1,000/day;
the Pro plan raises it.

Build `bridge/lib/backends/gemini.mjs` on the pattern of `codex.mjs`, register
it, done. The dashboard needs no changes. Verify first whether Gemini CLI's
sign-in supports a device-code flow on a headless server, as Codex does.

### 2. Automatic provider fallback

Currently the chain never crosses modes: pick ChatGPT and only ChatGPT answers.
The intended behaviour is Claude → ChatGPT → OmniRoute on **failure** (rate
limit, auth rejection, 5xx, timeout), never as a silent substitution, and only
before any text has reached the browser. `lib/chat/router.ts` already has the
seam; `claude-subscription.ts` already has the "don't fall back mid-answer"
guard to copy.

This was deliberately deferred until the bridge was real, so fallback would
react to actual failures rather than guessed ones. It is real now.

### 3. OmniRoute provider keys

Blocked on the user. Two options:

- Add keys in OmniRoute's admin page: tunnel with
  `ssh -i "C:\Users\yuvan\.oci\n8n_a1_ssh_key" -L 20128:localhost:20128 ubuntu@152.67.161.168`
  then open <http://localhost:20128>
- Or copy `~/.omniroute/{.env,storage.sqlite}` from the PC to the server volume.
  **The agent cannot do this** — the safety classifier blocks copying credential
  files to a remote host, correctly. The user must run it.

The PC's OmniRoute has **OpenRouter** and **NVIDIA** keys configured, both
currently showing `test_status: error` with a network error, so neither is
confirmed working.

**Recommended first key: a free Google AI Studio API key** (1,000 requests/day
across Gemini 3 Flash and Pro). One Gemini key is more useful for this work than
every free OpenRouter model combined — it is the only one that watches video
natively.

`OMNIROUTE_MODELS` in `/opt/ai-bridge/.env` pins which models appear in the
dropdown; it currently lists five free OpenRouter models chosen before the
Gemini plan came up. **Re-pick it once real keys are in.**

---

## Things learned today, worth not rediscovering

**ChatGPT answers arrive whole, not streamed.** Codex emits a finished message
rather than token deltas, so there is a 13–22 second silence and then the entire
reply. This is not a hang and cannot be fixed from our side; the UI says so.

**Each ChatGPT turn carries ~13,000 tokens of Codex's own instructions** before
your question. After the first turn in a conversation most of it is cached
(12,800 of 13,000 observed). It makes ChatGPT better for considered questions
than rapid back-and-forth.

**Claude remains the better default.** Faster, streams properly, cheaper per
turn. ChatGPT is the second opinion and the fallback.

**Free is not free in OmniRoute.** OmniRoute is a router; every token bills the
user's own provider account. Only 21 of OpenRouter's 430 models are genuinely
zero-cost, and they are small and rate-limited.

**A model list must come from the live service, not from memory.** The catalogue
moves faster than any training cutoff — most of the strong models found on
2026-09-10 were released after May 2026. Read
`https://openrouter.ai/api/v1/models` rather than recalling names.

**Verify a tool's auth options before designing the human's part.** The plan was
an SSH tunnel plus two commands for the ChatGPT login; `codex login --help`
revealed a device-code flow needing no terminal at all.

**A dead local watcher says nothing about the remote job.** A background SSH
watcher was killed by local memory pressure mid-build; the build finished fine
on the server. Re-query remote state before concluding anything.

**Bare 401s look like outages.** The bridge answering `401` on `/` for an
anonymous browser was correct behaviour that cost a round of debugging, so `/`
now returns a plain explanation instead.
