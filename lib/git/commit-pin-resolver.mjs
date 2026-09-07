/**
 * commit-pin-resolver — classify a (path, optional recorded commit sha, optional recorded
 * timestamp) tuple into a verified, shape-safe commit-pin string. SD-LEO-ORCH-CAPA-DURABILITY-
 * AUDIT-001-B, FR-2.
 *
 * Reuses lib/chairman/pinned-contract-read.mjs's git-object verification primitives
 * (isCommitObject, lastCommitTouchingBefore) rather than reimplementing them — that module is
 * already DB-agnostic (zero supabase imports) with only its own chairman-domain callers, so
 * importing its exports here carries no risk to that domain's behavior. TR-1: verification uses
 * `git cat-file -t` exclusively, never inferred from sha string shape/length — that module's own
 * header documents the exact false-positive class (16-char section_digest values that look
 * sha-shaped but are not git objects) this reuse avoids repeating.
 *
 * THREE TIERS, DELIBERATELY NAMED/SHAPED DIFFERENTLY FROM THE CHAIRMAN MODULE'S OWN TIER enum:
 *   TIER.EXACT       - "<path>@<sha>", sha verified as a real commit object.
 *   TIER.APPROXIMATE - "<path>@<sha>~asof:<iso>", sha is the last commit touching path at or
 *                       before the recorded timestamp.
 *   TIER.HISTORICAL  - "HISTORICAL:<path>", no sha was ever recorded and none could be
 *                       reconstructed — never fabricated.
 * (The chairman module's third tier is TIER.DB — "read leo_protocol_sections.content instead",
 * an option that makes sense only for a single rendered file with a DB-stored body. It has no
 * analog for a worktree directory reference, which is why this module's fallback tier is named
 * HISTORICAL rather than reusing TIER.DB's name or meaning.)
 *
 * Zero imports of @supabase/supabase-js or any database client — callers own persistence.
 */

import { isCommitObject, lastCommitTouchingBefore } from '../chairman/pinned-contract-read.mjs';

export const TIER = Object.freeze({
  EXACT: 'exact',
  APPROXIMATE: 'approximate',
  HISTORICAL: 'historical',
});

/**
 * Shapes the chairman-gated CHECK constraint (FR-1) also enforces at the DB layer — kept here
 * as the single source the resolver, the reconciliation script, and the constraint's own tests
 * can all cite, so the two layers (app-layer substance verification vs. DB-layer shape-only
 * backstop, per TR-2: a CHECK constraint cannot invoke `git cat-file`) never drift apart.
 */
export const SHAPE = Object.freeze({
  EXACT: /^.+@[0-9a-f]{7,40}$/,
  APPROXIMATE: /^.+@[0-9a-f]{7,40}~asof:\d{4}-\d{2}-\d{2}T/,
  HISTORICAL: /^HISTORICAL:.+$/,
});

/**
 * Classify a worktree path reference into the ratified 3-tier shape.
 *
 * @param {object} input
 * @param {string} input.path - the raw path. A directory, not a single file — git history is
 *   still meaningful for it via `git log -- <path>`, which matches any commit that touched that
 *   path prefix.
 * @param {string|null} [input.recordedSha] - a previously-recorded commit sha, if any.
 * @param {string|null} [input.recordedAt] - an ISO-8601 timestamp the row was last known-good
 *   at, if any (used only as the APPROXIMATE fallback's search bound).
 * @param {object} [opts]
 * @param {string} [opts.repoRoot] - passed through to the underlying git primitives.
 * @returns {Promise<{tier: string, value: string, approximate: boolean, reason?: string}>}
 */
export async function resolveWorktreePathTier({ path, recordedSha = null, recordedAt = null }, { repoRoot } = {}) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('resolveWorktreePathTier: path must be a non-empty string');
  }

  if (recordedSha && await isCommitObject(recordedSha, { repoRoot })) {
    return { tier: TIER.EXACT, value: `${path}@${recordedSha.trim()}`, approximate: false };
  }

  if (recordedAt) {
    const sha = await lastCommitTouchingBefore(path, recordedAt, { repoRoot });
    if (sha) {
      return {
        tier: TIER.APPROXIMATE,
        value: `${path}@${sha}~asof:${recordedAt}`,
        approximate: true,
        reason: `recordedSha ${recordedSha ? `'${recordedSha}'` : '(absent)'} is not a verifiable commit ` +
          `object; reconstructed from the last commit touching '${path}' at or before ${recordedAt}.`,
      };
    }
  }

  return {
    tier: TIER.HISTORICAL,
    value: `HISTORICAL:${path}`,
    approximate: false,
    reason: `no commit pin available — recordedSha ${recordedSha ? `'${recordedSha}'` : '(absent)'} is not a ` +
      'verifiable commit object and no commit was found touching this path at or before recordedAt (or ' +
      'recordedAt was absent). Never fabricated: this is a genuine "no provenance ever captured" state.',
  };
}
