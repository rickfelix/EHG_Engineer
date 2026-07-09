/**
 * Pseudonymize-not-redact verification gate (FR-4, SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-C).
 *
 * Binding rule (Adam co-reviewed, docs/design/deploy-pipeline-architecture.md
 * §3): seeding a replay branch from captured production state MUST pass the
 * APA §11.3 pseudonymize-not-redact contract before the branch is created —
 * deterministic substitutes preserve replayability while raw PII never lands
 * in an ephemeral branch. Callers (Child B's preview primitive, wired in
 * Child D) MUST call this gate before requesting branch creation from
 * captured state.
 *
 * @module lib/deploy/pseudonymize-not-redact-gate
 */

const RECOGNIZED_PSEUDONYMIZATION_METHODS = new Set(['deterministic-substitution', 'format-preserving-hash']);

/**
 * @param {{pseudonymized?: boolean, pseudonymization_method?: string}} snapshot captured-state snapshot metadata
 * @returns {{allowed: boolean, reason: string}}
 */
export function verifyPseudonymized(snapshot) {
  if (!snapshot || snapshot.pseudonymized !== true) {
    return { allowed: false, reason: 'snapshot has not been pseudonymized (pseudonymized !== true) — raw PII may be present' };
  }
  if (!RECOGNIZED_PSEUDONYMIZATION_METHODS.has(snapshot.pseudonymization_method)) {
    return {
      allowed: false,
      reason: `snapshot.pseudonymization_method "${snapshot.pseudonymization_method}" is not a recognized method`,
    };
  }
  return { allowed: true, reason: 'snapshot passed pseudonymize-not-redact verification' };
}
