// SD-LEO-GEN-STAGE-DECISION-RESTORE-001 (FR-1) -- pure prefix-invariant validator for future
// backup-derived decision_by restore candidates (Part B, blocked pending chairman action, see
// signal f80afeee-7a06-489d-959a-bc4d4c462100).
//
// PURE MODULE -- zero DB, zero network, zero filesystem. Imports ONLY normalizeDecisionBy from
// scripts/coordinator-ack-adam.cjs (the SAME function that produced the truncation this SD
// investigates -- reusing it, not re-implementing it, keeps the acceptance predicate and the
// damage mechanism provably in sync).
//
// NOT applied to the 4 manifest rows staged by this SD's chairman-gated migration
// (database/chairman-gated/20260821_solomon_ledger_attestations.sql) -- those 2 rows have no
// candidate value to test against (their current decision_by is already correct; there is
// nothing to restore). This validator exists for Part B, once a genuine backup-derived candidate
// value exists to check.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { normalizeDecisionBy } = require('../../scripts/coordinator-ack-adam.cjs');

/**
 * Checks whether a backup-derived restore candidate is a legitimate pre-damage value for a given
 * live row -- i.e. that normalizing the candidate reproduces the row's CURRENT (already-truncated)
 * decision_by exactly. Since the 40-char cap never fired for any of the 1212 damaged rows (LEAD-
 * phase database-agent finding, confidence 90%), a genuine pre-damage value is provably a superset
 * whose normalized form is byte-identical to what survives today -- any candidate that fails this
 * check is either mis-joined (wrong row) or fabricated, never a legitimate restore.
 *
 * @param {string} candidate - the proposed pre-damage decision_by value (from a backup extract)
 * @param {string} currentDecisionBy - the row's CURRENT (live, already-truncated) decision_by value
 * @returns {{valid: boolean, reason: string}}
 */
export function validateRestoreCandidate(candidate, currentDecisionBy) {
  if (typeof currentDecisionBy !== 'string' || currentDecisionBy.length === 0) {
    return { valid: false, reason: 'currentDecisionBy is missing or empty -- nothing to validate a candidate against' };
  }
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return { valid: false, reason: 'candidate is missing or empty' };
  }
  const normalized = normalizeDecisionBy(candidate);
  if (normalized !== currentDecisionBy) {
    return {
      valid: false,
      reason: `normalizeDecisionBy(candidate) === '${normalized}', which does not match the row's current decision_by === '${currentDecisionBy}' -- either a mis-joined row or a fabricated/incorrect candidate`,
    };
  }
  return { valid: true, reason: `candidate normalizes to '${normalized}', an exact match for the row's current decision_by -- the surviving identity prefix is confirmed consistent` };
}
