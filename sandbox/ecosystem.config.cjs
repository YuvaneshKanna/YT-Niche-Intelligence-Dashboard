// PM2 process file for the bridge — restarts it automatically if it crashes,
// instead of chat silently dying until someone notices and reruns
// `node server.mjs` by hand.
//
//   npm install -g pm2
//   pm2 start ecosystem.config.cjs      (run from inside sandbox/)
//   pm2 save                            (remember it across reboots)
//   pm2 logs claude-bridge              (see what it's doing)
//   pm2 restart claude-bridge           (manual restart, e.g. after rotating the token)
//
// pm2 inherits whatever environment the shell already has, so
// CLAUDE_CODE_OAUTH_TOKEN and SANDBOX_SHARED_SECRET must be set in THIS
// PowerShell window before running `pm2 start` — same as running
// `node server.mjs` directly, just supervised.
//
// This does NOT manage the cloudflared tunnel. A Cloudflare Quick Tunnel
// gets a brand-new random URL every time it restarts, so having pm2
// auto-restart it would silently break SANDBOX_CHAT_URL in Vercel instead of
// the bridge just going down loudly. Run the tunnel in its own window as
// before. For a tunnel that also survives restarts without a URL changing
// under you, see the "named tunnel" section in README.md.
module.exports = {
  apps: [
    {
      name: "claude-bridge",
      script: "server.mjs",
      cwd: __dirname,
      autorestart: true,
      // A crash loop (bad token, bad secret) should surface, not spin forever.
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 3000,
    },
  ],
}
