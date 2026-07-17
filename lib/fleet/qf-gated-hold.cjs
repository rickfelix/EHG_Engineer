// SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001: canonical chairman-gated-hold marker predicate.
//
// A QF whose APPLY is chairman-gated (the QF-508/QF-970 class — e.g. gated DDL with a
// release condition like "EU-send-planned") must not sit in the worker-facing open-QF
// lane as false open work: every idle worker re-discovers it, burns a claim/triage
// cycle, and re-concludes "blocked on chairman". The marker uses EXISTING quick_fixes
// columns (owner + release_condition — no DDL; live witness QF-20260713-970 already
// carries owner='CHAIRMAN' + a release condition):
//
//   gated  ⇔  owner ilike 'chairman'  AND  release_condition is a non-empty string
//
// This module is the SINGLE source for that predicate — both worker-lane exclusion
// sites (worker-checkin.cjs isAutoStartableQF, sd-next data-loaders loadOpenQuickFixes)
// and the coordinator dashboard surface import it, so the sites can never drift.
// Fail-open (TR-3): absent/null columns ⇒ NOT gated (normal lane behavior); exclusion
// only on a confident marker match. The hold must stay AUDITABLE — consumers that hide
// gated rows from workers must keep them visible on the coordinator/chairman surface.

/**
 * @param {{owner?: string|null, release_condition?: string|null}|null|undefined} qf
 * @returns {boolean} true iff the row carries the canonical chairman-gated-hold marker
 */
function isChairmanGatedQF(qf) {
  if (!qf || typeof qf !== 'object') return false;
  const owner = typeof qf.owner === 'string' ? qf.owner.trim().toLowerCase() : '';
  if (owner !== 'chairman') return false;
  const cond = typeof qf.release_condition === 'string' ? qf.release_condition.trim() : '';
  return cond.length > 0;
}

// Columns a caller's .select() must include for isChairmanGatedQF to evaluate — exported
// so query sites can compose their select lists without hand-typing the pair.
const GATED_HOLD_COLUMNS = Object.freeze(['owner', 'release_condition']);

module.exports = { isChairmanGatedQF, GATED_HOLD_COLUMNS };
