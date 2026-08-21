# Claude chat bridge for the Niche Breakdown dashboard.
#
# Runs `claude -p` on your Claude subscription. The OAuth token is supplied at
# RUN time, never baked into the image — do not COPY it in, and do not commit it.

FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY server.mjs ./

# Claude Code writes session state here; --resume needs it to persist for
# follow-up turns within a conversation.
ENV CLAUDE_CONFIG_DIR=/home/node/.claude
RUN mkdir -p /home/node/.claude && chown -R node:node /home/node /app
USER node

ENV PORT=8787
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
