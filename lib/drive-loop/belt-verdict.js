/**
 * BELT CAPACITY VERDICT — SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001, FR-3.
 *
 * The verdict ladder lived inside scripts/coordinator-capacity-forecast.mjs main() (~:384-388),
 * unreachable to any importer. scripts/cron/drive-report-sweep.mjs:159 marks leg4 unavailable saying
 * it needs "coordinator-capacity-forecast's computeVerdict" — AND THAT FILE EXPORTS NO SUCH FUNCTION.
 * That half-true pointer is plausibly why FR-2 clause 1 went unbuilt through an entire SD: anyone
 * following it finds nothing and concludes the writer does not exist.
 *
 * ⚠️ THERE IS A DIFFERENT computeVerdict AT lib/eva/capacity-governor.js:191 AND IT IS A NAME
 * COLLISION, NOT THIS ONE. That function emits a different vocabulary — grep it for DEFICIT-URGENT,
 * DEFICIT, TIGHT or SURPLUS and you get zero hits. Wiring it into leg4 would throw at
 * lib/drive-loop/score/leg4-capacity.js:66 on the first call, because leg4 rejects any verdict
 * outside its frozen four. I reached for it once and had to retract; the check that settled it was
 * reading the OUTPUT DOMAIN, not matching the name. A matching name is provenance, not behaviour.
 *
 * WHY A SEPARATE MODULE rather than exporting from the forecast script: the sweep would otherwise
 * have to import a CLI entrypoint, pulling its argv handling and side effects into a cron job. Both
 * callers import this instead, and neither depends on the other.
 *
 * PURE BY CONSTRUCTION — no I/O, no clock, no client. The caller supplies the counts it already has,
 * which is what lets leg4 inject it as computeVerdict and what lets this be tested without a fleet.
 */

'use strict';

import { VERDICTS } from './score/leg4-capacity.js';

/**
 * Decide the belt capacity verdict.
 *
 * Returns the exact shape lib/drive-loop/score/leg4-capacity.js:50 documents for its injected
 * computeVerdict — {verdict, beltDepth, demandSoon, deficit} — so no adapter sits between producer
 * and consumer. An adapter is where the two ends drift.
 *
 * @param {object} o
 * @param {number} o.idleNow        - workers idle right now
 * @param {number} o.freeingSoon    - workers expected to free up shortly
 * @param {number} o.claimableCount - claimable SDs
 * @param {number} o.openQfCount    - open quick-fixes (also worker-claimable)
 * @param {number} o.buffer         - BELT_BUFFER. REQUIRED, no default: the caller owns this
 *   calibration, and a default here would be an uncalibrated number in the one place nobody
 *   would look at again.
 * @returns {{verdict: string, beltDepth: number, demandSoon: number, deficit: number}}
 */
export function computeBeltVerdict({ idleNow, freeingSoon, claimableCount, openQfCount, buffer } = {}) {
  for (const [name, v] of Object.entries({ idleNow, freeingSoon, claimableCount, openQfCount, buffer })) {
    // Fail loudly on a missing input rather than coercing undefined to 0. A silent zero here would
    // produce a confident verdict from absent data — beltDepth 0 with idleNow 0 reads SURPLUS, which
    // is the most reassuring answer available and would be built on nothing.
    if (!Number.isFinite(v)) {
      throw new Error(`computeBeltVerdict(): ${name} must be a finite number, got ${JSON.stringify(v)}`);
    }
  }

  const demandSoon = idleNow + freeingSoon;
  const beltDepth = claimableCount + openQfCount;
  const deficit = (demandSoon + buffer) - beltDepth;

  // Ladder transcribed verbatim from the forecast script. Order matters: an empty belt with idle
  // workers is URGENT regardless of what the arithmetic says, because there is nothing to hand out.
  let verdict;
  if (beltDepth === 0 && idleNow > 0) verdict = 'DEFICIT-URGENT';
  else if (deficit > 0) verdict = 'DEFICIT';
  else if (deficit === 0) verdict = 'TIGHT';
  else verdict = 'SURPLUS';

  // Belt-and-braces against a future edit to the ladder that emits something leg4 would reject at
  // :66. Cheap here, and the failure it prevents is a runtime throw inside a cron job.
  if (!VERDICTS.includes(verdict)) {
    throw new Error(`computeBeltVerdict(): produced ${verdict}, which is outside the frozen set ${VERDICTS.join(', ')}`);
  }

  return { verdict, beltDepth, demandSoon, deficit };
}
