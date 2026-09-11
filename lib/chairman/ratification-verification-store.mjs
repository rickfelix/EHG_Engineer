/**
 * lib/chairman/ratification-verification-store.mjs — the ONLY sanctioned write path for
 * chairman_ratification_verifications (INSERT-only sibling of chairman_ratifications).
 * SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3).
 *
 * The migration this table depends on is chairman-gated (database/chairman-gated/
 * 20260911_chairman_ratification_verifications.sql) and cannot self-apply. Every call through
 * this module must therefore degrade gracefully when the table does not exist yet: recording a
 * verification verdict is never allowed to block or falsify the encode decision it is merely
 * describing. A missing-table degrade is detected via a real row probe (`.select('id').limit(1)`),
 * never a `head:true` count -- a head-mode count on a missing table returns no error and reads as
 * EXISTS, which would silently swallow every recording attempt as a false "succeeded".
 */

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

const TABLE = 'chairman_ratification_verifications';
const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205']);

/** sha256(utf8) hex, or null for a nullish input -- callers never hash an absent value. */
function sha256Hex(text) {
  if (typeof text !== 'string') return null;
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * True iff the table is reachable right now. A real row select, never a head:true count (which
 * false-positives EXISTS on a missing table -- QF-class defect this repo has hit before).
 * @param {object} supabase
 * @returns {Promise<boolean>}
 */
export async function chairmanRatificationVerificationsTableExists(supabase) {
  try {
    const { error } = await supabase.from(TABLE).select('id').limit(1);
    if (error && MISSING_RELATION_CODES.has(error.code)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Record one encode ATTEMPT (verified, refused, or could-not-check) to the sibling table.
 * Never throws on a missing table or a write failure -- recording is advisory infrastructure, and
 * a failure here must never be indistinguishable from (or cause) a failure of the encode decision
 * it describes. The caller decides the encode outcome independently; this only persists evidence
 * of what was checked.
 *
 * @param {object} supabase
 * @param {object} attempt
 * @param {string} attempt.targetRatificationId
 * @param {'live_encode'|'legacy_backfill_audit'} attempt.attemptKind
 * @param {'verified'|'marker_absent'|'no_commit_pin'|'unverifiable_infrastructure'|'not_applicable'} attempt.outcome
 * @param {boolean} attempt.encodedAtPersisted
 * @param {string|null} [attempt.pinTier]
 * @param {string|null} [attempt.commitSha]
 * @param {string|null} [attempt.targetFile]
 * @param {string|null} [attempt.contentRead] - the content actually read, hashed here (never stored raw)
 * @param {number|null} [attempt.markerOffset]
 * @param {object} attempt.attemptedEncodedRef
 * @param {string} attempt.attemptedMarkerText
 * @param {string|null} [attempt.reason]
 * @param {string} attempt.producer - a code-path identity, e.g. 'lib/chairman/ratification-writer.mjs:markRatificationEncoded'
 * @param {string} [attempt.runId] - defaults to a fresh UUID when omitted
 * @param {object} [attempt.detail] - the full verifier verdict object, for full re-derivation
 * @returns {Promise<{recorded:boolean, reason?:string, row?:object}>}
 */
export async function recordVerificationAttempt(supabase, attempt = {}) {
  const {
    targetRatificationId, attemptKind, outcome, encodedAtPersisted,
    pinTier = null, commitSha = null, targetFile = null, contentRead = null, markerOffset = null,
    attemptedEncodedRef, attemptedMarkerText, reason = null,
    producer, runId = randomUUID(), detail = {},
  } = attempt;

  if (!targetRatificationId || !attemptKind || !outcome || typeof encodedAtPersisted !== 'boolean'
      || !attemptedEncodedRef || typeof attemptedMarkerText !== 'string' || !attemptedMarkerText.trim()
      || !producer) {
    // A malformed call is a caller bug, not infrastructure trouble -- surfaced, not swallowed.
    return { recorded: false, reason: 'invalid_attempt_shape' };
  }

  const row = {
    target_ratification_id: targetRatificationId,
    attempt_kind: attemptKind,
    outcome,
    encoded_at_persisted: encodedAtPersisted,
    pin_tier: pinTier,
    commit_sha: commitSha,
    target_file: targetFile,
    file_sha256: sha256Hex(contentRead),
    marker_offset: markerOffset,
    attempted_encoded_ref: attemptedEncodedRef,
    attempted_marker_text: attemptedMarkerText,
    marker_sha256: sha256Hex(attemptedMarkerText.trim()),
    reason,
    producer,
    run_id: runId,
    detail,
  };

  try {
    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (error) {
      if (MISSING_RELATION_CODES.has(error.code)) {
        return { recorded: false, reason: 'table_not_found' };
      }
      return { recorded: false, reason: `insert_failed: ${error.message}` };
    }
    return { recorded: true, row: data };
  } catch (err) {
    return { recorded: false, reason: `insert_threw: ${err && err.message}` };
  }
}

export { TABLE as CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE };
