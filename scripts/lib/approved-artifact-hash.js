/**
 * approved-artifact-hash — LF-normalised digest for comparing an approved migration artifact
 * against what is live. SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-6 (parent FR-5).
 *
 * Parent FR-5 AC-1: "Hash comparison normalises CRLF to LF before digesting."
 * Parent FR-5 AC-2: "A byte-identical file differing only in line endings compares EQUAL."
 *
 * WHY THIS IS DERIVED RATHER THAN IMPORTED — parent FR-5 AC-3 requires stating the honest
 * reason, and records it: computePlanContentHash (lib/sd-creation/source-adapters/plan.js:32-36)
 * DOES exist and IS CRLF-equivalence tested. It is not imported because it ALSO strips trailing
 * whitespace per line and drags in Supabase wiring — not because nothing exists.
 *
 * Both of those matter here specifically:
 *   - Trailing-whitespace stripping is WRONG for this use. SQL bodies round-tripped through
 *     pg_get_functiondef / pg_get_constraintdef carry pg's own formatting; silently rewriting
 *     it would make a real divergence compare EQUAL, which is the exact false-APPLIED direction
 *     docs/reference/ddl-approval-record-definition.md forbids.
 *   - Supabase wiring in a pure hash helper would make it unusable from a probe path that
 *     already holds a pg client and needs no second dependency.
 *
 * Normalises CRLF and lone CR to LF. Nothing else. A digest that "helpfully" normalised more
 * would hide divergence, which is the failure this SD exists to end.
 */
import crypto from 'crypto';

/** Normalise line endings to LF. CRLF and lone CR both become LF; no other rewriting. */
export function normaliseLineEndings(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * SHA-256 of the LF-normalised content.
 * @param {string} content
 * @returns {string} hex digest
 */
export function approvedArtifactHash(content) {
  return crypto.createHash('sha256').update(normaliseLineEndings(content), 'utf8').digest('hex');
}

/**
 * Compare two artifacts on the LF-normalised digest.
 * @returns {{equal: boolean, approvedHash: string, liveHash: string}}
 */
export function compareArtifacts(approvedContent, liveContent) {
  const approvedHash = approvedArtifactHash(approvedContent);
  const liveHash = approvedArtifactHash(liveContent);
  return { equal: approvedHash === liveHash, approvedHash, liveHash };
}
