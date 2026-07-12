/**
 * Provenance-kind taxonomy — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F FR-3.
 *
 * Two kinds so the FR-2 100%-fetch-provenance guard has a precise meaning for both current
 * (manual) and future (automated) adapters:
 *   FETCHED  — URL/method + capturedAt, for automated sources (web research, store pollers).
 *   ATTESTED — chairman/analyst identity + capturedAt, for manual briefs (no URL to fetch).
 * A write with neither kind is rejected at write time (assertObservationProvenance), never
 * silently accepted — mirrors the G3 doctrine already enforced by lib/org/evidence-fabric.mjs's
 * assertProvenance (a replayed_fixture is never a real_event; here, an unfetched claim is never
 * a fetched one).
 *
 * MAPPING onto lib/org/evidence-fabric.mjs's own (frozen, upstream-owned) PROVENANCE_KINDS —
 * we do not modify that taxonomy (owned by sibling Child B); we map onto its existing values:
 *   ATTESTED -> 'attested'   (already means chairman/analyst-sourced in the fabric's own taxonomy)
 *   FETCHED  -> 'real_event' (an event genuinely observed from a real, live source)
 */

export const OBSERVATION_PROVENANCE_KINDS = Object.freeze(['FETCHED', 'ATTESTED']);

const EVIDENCE_FABRIC_PROVENANCE_BY_KIND = Object.freeze({
  FETCHED: 'real_event',
  ATTESTED: 'attested',
});

/**
 * Validate an observation carries exactly one recognized provenance kind, with the fields that
 * kind requires. Throws ObservationRejectedError (imported lazily by callers that need the typed
 * class) — this module stays dependency-light and returns a plain result so callers choose how to
 * surface the rejection.
 *
 * @param {object} obs
 * @param {string} obs.provenanceKind - must be 'FETCHED' or 'ATTESTED'
 * @param {string} [obs.url] - required when provenanceKind='FETCHED'
 * @param {string} [obs.method] - required when provenanceKind='FETCHED'
 * @param {string} [obs.attestedBy] - required when provenanceKind='ATTESTED'
 * @param {string} obs.capturedAt - required for both kinds (ISO timestamp)
 * @returns {{valid: boolean, reason?: string}}
 */
// Truthy checks alone admit a whitespace-only string as "present" — this is the FRAMEWORK-level
// guard every current and future adapter passes through, so it must not be weaker than the one
// concrete adapter's own check (adversarial review 2026-07-12).
const isBlank = (v) => typeof v !== 'string' || v.trim().length === 0;

export function validateObservationProvenance(obs = {}) {
  if (!OBSERVATION_PROVENANCE_KINDS.includes(obs.provenanceKind)) {
    return { valid: false, reason: `provenanceKind must be one of ${OBSERVATION_PROVENANCE_KINDS.join(', ')} — got ${obs.provenanceKind}` };
  }
  if (!obs.capturedAt) {
    return { valid: false, reason: 'capturedAt is required for every observation' };
  }
  if (obs.provenanceKind === 'FETCHED' && (isBlank(obs.url) || isBlank(obs.method))) {
    return { valid: false, reason: 'FETCHED observations require url and method' };
  }
  if (obs.provenanceKind === 'ATTESTED' && isBlank(obs.attestedBy)) {
    return { valid: false, reason: 'ATTESTED observations require attestedBy' };
  }
  return { valid: true };
}

/**
 * Map an observation provenance kind to the evidence-fabric provenance value it should be
 * written with. Throws if the kind is unrecognized (defensive — validateObservationProvenance
 * should already have rejected it).
 * @param {string} provenanceKind - 'FETCHED' | 'ATTESTED'
 * @returns {string} one of lib/org/evidence-fabric.mjs's PROVENANCE_KINDS
 */
export function toEvidenceFabricProvenance(provenanceKind) {
  const mapped = EVIDENCE_FABRIC_PROVENANCE_BY_KIND[provenanceKind];
  if (!mapped) throw new Error(`no evidence-fabric provenance mapping for observation kind '${provenanceKind}'`);
  return mapped;
}
