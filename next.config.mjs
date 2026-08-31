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
  //
  // The harness itself is a native binary that ships as a platform-specific
  // optional dependency and is resolved by the SDK's own path logic at
  // runtime — nothing imports it, so tracing cannot find it either. Vercel
  // functions run linux-x64 against glibc; without this the deployed route
  // fails with "Native CLI binary for linux-x64 not found" while the same
  // code works locally, where the win32 build happens to be installed.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./node_modules/@anthropic-ai/claude-agent-sdk/**/*",
      "./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**/*",
    ],
  },
}

export default nextConfig
