'use strict';
/**
 * unfit-triage.cjs — SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-5)
 *
 * PROPOSE-ONLY partial-block triage. When an SD is code-buildable HERE but its RUN is blocked (e.g.
 * a missing input-data precondition — the live YOUTUBE-STRATEGY-EXTRACTION case: the code exists,
 * only the extraction RUN needs an absent ledger file), propose splitting it into a buildable code
 * child + a blocked run child so the coordinator can route the buildable half NOW and gate the run
 * half until the precondition is met.
 *
 * PROPOSE-NOT-EXECUTE BOUNDARY: this module NEVER creates or executes children (it does not import or
 * call lib/eva insertCascade). It returns the proposed child SPECS — shaped to be fed to
 * lib/eva/create-orchestrator-from-plan.js buildChildSD by a coordinator/chairman who decides whether
 * to materialize them — plus the typed unfit-signal command to file. Pure + synchronous + testable.
 *
 * A repo_mismatch or premise_closed verdict is NOT a partial block — those are whole-SD reroutes /
 * closures, not splits — so proposeUnfitDecomposition returns { propose:false } for them.
 */

// Only these block classes warrant a code/run SPLIT (the code is buildable here; the run is gated).
const PARTIAL_BLOCK_CLASSES = Object.freeze(['missing_precondition']);

/**
 * @param {{sd_key?:string, title?:string}} sd  the unfit SD
 * @param {{blockClass?:string, reasons?:string[]}} verdict  the isSdExecutableHere verdict
 * @returns {{propose:boolean, parent:string|null, blockClass?:string, reason?:string, children?:Array, signal?:string}}
 */
function proposeUnfitDecomposition(sd, verdict) {
  const row = sd || {};
  const v = verdict || {};
  const parent = row.sd_key || null;
  if (!v.blockClass || !PARTIAL_BLOCK_CLASSES.includes(v.blockClass)) {
    return { propose: false, parent, reason: `blockClass '${v.blockClass || 'none'}' is a whole-SD reroute/closure, not a partial block — no split proposed` };
  }
  const parentKey = parent || 'SD-UNKNOWN';
  const baseTitle = row.title || parentKey;
  const why = (v.reasons || []).join('; ');
  const children = [
    {
      suffix: 'CODE',
      role: 'code',
      blocked: false,
      title: `${baseTitle} — buildable code`,
      description: `Code-buildable slice of ${parentKey} (no blocked run dependency). Split-proposed by claim-time triage because the parent's run is blocked: ${why}.`,
    },
    {
      suffix: 'RUN',
      role: 'run',
      blocked: true,
      title: `${baseTitle} — blocked run`,
      description: `Run/execution slice of ${parentKey}, BLOCKED on a missing precondition (${why}). Unblock the precondition, then execute.`,
    },
  ];
  return {
    propose: true,
    parent: parentKey,
    blockClass: v.blockClass,
    children, // buildChildSD-compatible specs — materialized only by an explicit coordinator/chairman action
    signal: `node scripts/worker-signal.cjs unfit "${v.blockClass}: ${parentKey} — proposing code/run split" --block-class ${v.blockClass}`,
  };
}

module.exports = { proposeUnfitDecomposition, PARTIAL_BLOCK_CLASSES };
