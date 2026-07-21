// SD-LEO-INFRA-VENTURES-DATA-HYGIENE-001 FR-1 — the PINNED reversible archive predicate.
//
// This is the ONLY predicate the one-time soft-archive CLI
// (scripts/archive/one-time/soft-archive-fixture-ventures.mjs) may select rows by.
//
// CONTRACT: PRECISION OVER RECALL. A REAL venture row must NEVER be selected for
// archival. A missed fixture is harmless (it stays live and is sweepable later); a
// selected real row is a data-integrity incident. When a row cannot be positively
// classified as a fixture, return FALSE.
//
// It DELEGATES fixture classification to the canonical lib/governance/fixture-exclusion.mjs
// isFixtureVenture() (flag-first is_demo; FIXTURE_VENTURE_NAME_RE + EPOCH_TAIL_RE name
// backstop; fail-open on missing fields) and adds exactly ONE hard exclusion on top: the
// sanctioned live is_demo canary venture, which must never be archived even though it is
// is_demo=true. Never references is_synthetic (absent on this DB); never keys on
// status==='cancelled' alone.
//
// @wire-check-exempt: consumed only by the one-time archive CLI under
//   scripts/archive/one-time/ + its unit test; no permanent runtime entry point by design.
import { isFixtureVenture } from './fixture-exclusion.mjs';

/** The one sanctioned permanently-flagged is_demo venture — must NEVER be archived. */
export const CANARY_NAME = 'Canary Venture Probe';

/**
 * Is this ventures row an ARCHIVABLE fixture (safe to reversibly soft-archive)?
 * FALSE for the canary (checked FIRST), FALSE for anything the canonical classifier
 * cannot positively call a fixture (fail-open), TRUE only for a positively-classified
 * fixture.
 * @param {{name?: string|null, is_demo?: boolean, [k:string]: any}|null|undefined} v
 * @returns {boolean}
 */
export function isArchivableFixtureVenture(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.name === CANARY_NAME) return false; // hard exclusion, before anything else
  return isFixtureVenture(v) === true;       // delegate to the canonical classifier
}
