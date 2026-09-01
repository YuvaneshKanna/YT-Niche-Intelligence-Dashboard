/**
 * Fingerprint of a channel's classification, used to detect that someone
 * changed a field after it was verified.
 *
 * "Needs audit" used to mean "some field is blank", which cannot tell
 * "a human watched the videos and the AI was right" from "nobody has looked".
 * Storing who verified and when fixes the first half; storing this hash fixes
 * the second — if any classified value later differs from the one that was
 * verified, the verification is stale and the channel returns to the queue on
 * its own. That covers the case the Handle Diff feature already warns about,
 * where a channel changes underneath a verification that is still recorded.
 *
 * Shared by the client (to decide whether a channel needs audit) and the API
 * route (to stamp the sheet on save), so both must compute it identically —
 * hence one module, and hence the normalisation being explicit rather than
 * incidental.
 */

/** The classified fields, in a fixed order. Order is part of the hash. */
export const AUDIT_HASH_FIELDS = [
  "contentType",
  "niche",
  "category",
  "format",
  "producedBy",
  "nicheGroup",
  "tracking",
] as const

export type AuditHashInput = Partial<Record<(typeof AUDIT_HASH_FIELDS)[number], string>>

/**
 * FNV-1a, 32-bit, rendered base36.
 *
 * Not cryptographic and does not need to be: this only has to change when the
 * classification changes. A collision would mean an edit slipped through as
 * "still verified", which is a missed re-check rather than a wrong value.
 */
/** Unit separator: cannot occur in a sheet cell, so field boundaries are unambiguous. */
const SEPARATOR = String.fromCharCode(31)

export function auditHash(values: AuditHashInput): string {
  // Case and surrounding whitespace are not meaningful classification changes,
  // so normalise them out — otherwise "Gaming " would read as an edit.
  // Unit separator, because it cannot appear in a sheet cell and so cannot let
  // two different field splits produce the same joined string.
  const canonical = AUDIT_HASH_FIELDS.map((k) => (values[k] ?? "").trim().toLowerCase()).join(SEPARATOR)

  let hash = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i)
    // FNV prime, via shifts so this stays in 32-bit integer maths.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(36)
}

/** True when the recorded verification still describes the current values. */
export function isVerificationCurrent(
  values: AuditHashInput,
  recordedHash: string | undefined,
  auditedAt: string | undefined
): boolean {
  if (!auditedAt?.trim()) return false
  if (!recordedHash?.trim()) return false
  return auditHash(values) === recordedHash.trim()
}

/**
 * A channel needs audit until a human has confirmed its classification.
 *
 * Blank required fields still count — Niche, Category and Produced By are what
 * the Niche Breakdown page aggregates by, and Niche Group is deliberately not
 * among them, since a blank group on its own is fine.
 *
 * But emptiness alone was never the real signal: it cannot distinguish "the AI
 * filled this in and a human checked it" from "the AI filled this in and nobody
 * has looked", and the AI is not always right — which is the entire reason this
 * page exists. So a channel is only clear once someone pressed Verify AND the
 * fields still match what they verified. Edit any field afterwards and the
 * recorded hash stops matching, so it returns to the queue by itself.
 *
 * Lives here (not in the dashboard component) so any consumer — the audit
 * page, the roster chat context — computes the same answer from one place.
 */
export function needsAudit(c: {
  niche?: string
  category?: string
  producedBy?: string
  contentType?: string
  format?: string
  nicheGroup?: string
  tracking?: string
  auditHash?: string
  auditedAt?: string
}): boolean {
  if (!c.niche?.trim() || !c.category?.trim() || !c.producedBy?.trim()) return true
  return !isVerificationCurrent(
    {
      contentType: c.contentType,
      niche: c.niche,
      category: c.category,
      format: c.format,
      producedBy: c.producedBy,
      nicheGroup: c.nicheGroup,
      tracking: c.tracking,
    },
    c.auditHash,
    c.auditedAt,
  )
}
