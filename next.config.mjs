/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // The Agent SDK starts the Claude Code harness as a child process pointed at
  // its own files on disk. Bundling it would rewrite those paths and break the
  // spawn, so leave it as a plain node_modules require.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
  // Tracing follows static imports, which never reach the file the SDK spawns.
  // Ship the whole package with the chat function instead of guessing at which
  // of its entry points get loaded at runtime.
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/@anthropic-ai/claude-agent-sdk/**/*"],
  },
}

export default nextConfig
