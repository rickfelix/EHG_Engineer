/**
 * Adam-contract recurrence guard — SD-LEO-FIX-RESOLVE-ADAM-CONTRACT-001.
 *
 * Flags the specific conflict this SD resolved: the Adam role contract's ACTIVE "Proactivity is
 * PROPOSE, not auto-execute" clause must NOT list sourcing/filing SDs inside its coordinator-GO-gated
 * enumeration — that contradicts the chairman-canonical NEVER HOLD SOURCING override (sourcing/filing
 * a DRAFT SD is a CONST-002-safe proposal, not a dispatch) and caused a LIVE misfire (Adam withheld an
 * already-RCA'd DRAFT SD citing CONST-002).
 *
 * PURE (text in -> finding out), so it is unit-testable and can run in a doc-audit pass over the
 * generated CLAUDE_ADAM.md (or the leo_protocol_sections id=601 source) without DB/network.
 *
 * Precision note: it keys on the ACTIVE directive sentence only —
 *   "Adam does **NOT** autonomously *begin* self-generated proactive work — <enum> — without the
 *    coordinator's confirmation"
 * — so it does NOT false-positive on dated historical changelog entries (which use a different
 * "(…) without the coordinator's go" phrasing) that merely RECORD the original 2026-06-08 clause.
 *
 * @module lib/governance/adam-contract-audit
 */

// The active gated-enumeration directive. Capture group 1 = the enumeration of GO-gated work.
export const ACTIVE_GATE_RE = /autonomously \*begin\* self-generated proactive work\s*[—-]\s*(.*?)\s*[—-]\s*without the coordinator's confirmation/i;
// Tokens that must NOT appear inside the gated enumeration (sourcing/filing is EXEMPT per NEVER HOLD SOURCING).
export const FORBIDDEN_IN_GATE = /sourc|filing/i;

/**
 * Audit an Adam-contract text for the sourcing-in-the-gated-bucket conflict. PURE.
 * @param {string} text - CLAUDE_ADAM.md (generated) or the id=601 source content
 * @returns {{conflict: boolean, reason: string, enumeration: string|null}}
 */
export function auditSourcingGateConflict(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { conflict: false, reason: 'no contract text supplied (fail-open)', enumeration: null };
  }
  const m = text.match(ACTIVE_GATE_RE);
  if (!m) {
    // The active gated-directive sentence is absent — nothing to re-gate. Not a conflict.
    return { conflict: false, reason: 'no active GO-gated proactivity directive found', enumeration: null };
  }
  const enumeration = m[1].trim();
  if (FORBIDDEN_IN_GATE.test(enumeration)) {
    return {
      conflict: true,
      reason: `sourcing/filing is listed inside the coordinator-GO-gated enumeration ("${enumeration}") — it must be EXEMPT per NEVER HOLD SOURCING (a DRAFT SD is a proposal, not a dispatch)`,
      enumeration,
    };
  }
  return { conflict: false, reason: 'sourcing/filing is not gated (correct)', enumeration };
}
