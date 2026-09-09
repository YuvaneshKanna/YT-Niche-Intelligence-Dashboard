import { timingSafeEqual } from "node:crypto"

/**
 * Who is allowed to spend the subscriptions behind this service.
 *
 * Today that is a single bearer token shared with the dashboard. It is
 * deliberately isolated in this one function because the intended replacement
 * is different in kind, not in degree: Vercel signs every deployment's requests
 * with an OIDC token, which the bridge could verify against Vercel's public
 * keys. That removes the shared secret entirely — nothing to rotate, and access
 * is tied to the deployment rather than to a string. Swapping this function is
 * then the whole change.
 */

function safeEqual(a, b) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Compare lengths first and always run the comparison.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function createBearerAuth(expectedToken) {
  if (!expectedToken || expectedToken.length < 32) {
    throw new Error(
      "BRIDGE_TOKEN must be set to a random string of at least 32 characters. " +
        "Generate one with: openssl rand -base64 48"
    )
  }

  return function authorize(req) {
    const header = req.headers.authorization || ""
    const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
    if (!presented) return { ok: false, reason: "Missing Authorization: Bearer <token> header." }
    if (!safeEqual(presented, expectedToken)) return { ok: false, reason: "Token rejected." }
    return { ok: true }
  }
}
