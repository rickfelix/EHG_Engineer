/**
 * Witness taxonomy constants for SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001 (Solomon G1).
 * Single source of truth for Child B (inventory), Child C (integrity check), and
 * Child D (enforcement rung) so the taxonomy is never re-derived or drifted.
 */

export const CLASSIFICATION = Object.freeze({
  ALREADY_WITNESSED: 'already_witnessed',
  SELF_EVIDENCE_ONLY: 'self_evidence_only',
  NOT_CONSEQUENTIAL_EXEMPT: 'not_consequential_exempt',
});

export const WITNESS_MECHANISM = Object.freeze({
  CROSS_ACTOR: 'cross_actor',
  EXTERNAL_SYSTEM: 'external_system',
  REPLAY: 'replay',
});

export const ENFORCEMENT_STRENGTH = Object.freeze({
  STRUCTURAL: 'structural',
  CONVENTION: 'convention',
});

/**
 * external_system is the only mechanism categorically unforgeable by a Supabase-credentialed
 * process, because every worker session and CI workflow share the same
 * SUPABASE_SERVICE_ROLE_KEY (verified during LEAD-phase investigation, feedback signal
 * c54d463f). cross_actor/replay rows stored in Supabase are convention-strength until a
 * follow-on SD introduces per-actor-scoped credentials or signed attestations.
 */
export function expectedEnforcementStrength(mechanism) {
  return mechanism === WITNESS_MECHANISM.EXTERNAL_SYSTEM
    ? ENFORCEMENT_STRENGTH.STRUCTURAL
    : ENFORCEMENT_STRENGTH.CONVENTION;
}

export function isValidClassification(value) {
  return Object.values(CLASSIFICATION).includes(value);
}

export function isValidWitnessMechanism(value) {
  return Object.values(WITNESS_MECHANISM).includes(value);
}
