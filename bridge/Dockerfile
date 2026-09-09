# The bridge, plus the Codex CLI it drives.
#
# The CLI and the SDK are released together and exchange a versioned event
# stream, so both are pinned to the same version. Move them in step.
FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

RUN npm install -g @openai/codex@0.153.4

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY lib ./lib

# /data holds the ChatGPT login and must be a volume: the refresh token rotates
# and is written back, so a container-local copy would be lost on every restart.
# /work is the empty directory the agent treats as its workspace.
RUN useradd --create-home --uid 10001 bridge \
    && mkdir -p /data/codex /work \
    && chown -R bridge:bridge /data /work /app

USER bridge

ENV CODEX_HOME=/data/codex \
    CODEX_WORK_DIR=/work \
    PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
