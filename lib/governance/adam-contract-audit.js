// @wire-check-exempt: recurrence-guard detector for the Adam role contract. Verified-correct by its
// 11-test suite (incl. a real-file assertion on the shipped CLAUDE_ADAM.md) but its RUNTIME consumer —
// a doc-audit pass / CI step that imports auditSourcingGateConflict and runs it over CLAUDE_ADAM.md —
// is a tracked follow-up (the existing scripts/eva/doc-health-audit.mjs is a coverage scorer, not a
// rule registry, so wiring it cleanly is its own change). REMOVE this marker when a doc-audit/CI path
// imports auditSourcingGateConflict. Coordinator-sanctioned exemption pattern for an intentionally
// unreferenced governance-guard module (same as break-class-taxonomy / alert-writer this session).
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
// Hardened (adversarial review w22s1wray) so a re-gating cannot silently evade the guard via:
//   - dash variants: [‐-―−-] covers hyphen/non-breaking-hyphen/figure/en/em/horizontal-bar/minus/ASCII-hyphen
//     (en-dash U+2013 is the most common autocorrect substitution and previously slipped past);
//   - a reworded trailing clause: (confirmation|go|approval|sign-?off);
//   - a curly apostrophe in coordinator's; and multi-line enumerations ([\s\S]*?).
// Changelog-safe: the dated 2026-06-08 changelog mention delimits its enumeration with PARENS
// (not a dash) after "proactive work", so a dash-delimited match never fires on it (regression-tested).
export const ACTIVE_GATE_RE = /self-generated proactive work\s*[‐-―−-]\s*([\s\S]*?)\s*[‐-―−-]\s*without the coordinator['’]s (?:confirmation|go|approval|sign-?off)/i;
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
