// SD-ARCH-HOTSPOT-SWEEP-001: ordered pass-registry for scripts/stale-session-sweep.cjs.
//
// Shape follows the {name, run()} convention already proven in
// scripts/breakage/active-breakage-canary.mjs (see its `const probes = [...]` block) —
// adopted here rather than inventing a new registry pattern.
//
// Each pass exports {name: string, run(ctx): Promise<void>}. ctx is the shared bag
// defined in lib/sweep/ctx.cjs.
//
// TWO ordered arrays, not one, because of a load-bearing early-exit-gap constraint in
// main(): clearStaleQfClaims (and cancelStaleTestFixtures, left inline in main() —
// out of this SD's scope) must run and complete even when zero SD-claiming sessions
// exist, i.e. BEFORE main()'s early-return on empty `sessions`. The remaining passes
// only make sense once `classified` exists (post-classification), so they run after
// gather+classify. Collapsing these into one array would either delay
// clearStaleQfClaims's early-exit-gap execution (regression: stale QF claims never
// reaped while the fleet is fully idle) or force every MAIN pass to run on an empty
// classified list (harmless but wasteful, and papers over a real ordering fact).
//
// ORDERING WITHIN EARLY_PASSES IS LOAD-BEARING:
//   clearStaleQfClaims MUST complete before dispatchWorkAssignmentsIfAllowed (called
//   later in main(), well after MAIN_PASSES) observes claim availability — a claim
//   released this tick must be visible to dispatch in the SAME tick.
//
// ORDERING WITHIN MAIN_PASSES is NOT currently load-bearing between passes (each
// mutates a disjoint slice of state — claim-boundary release vs. intent-collision
// warnings vs. dead-letter message updates vs. coordination-detector event rows) but
// is preserved in the original main() source order for behavioral parity.

const identityCollisionSplit = require('./passes/identity-collision-split.cjs');
const claimBoundaryProbe = require('./passes/claim-boundary-probe.cjs');
const intentCollisionDetection = require('./passes/intent-collision-detection.cjs');
const deadLetterPlanning = require('./passes/dead-letter-planning.cjs');
const coordinationDetectors = require('./passes/coordination-detectors.cjs');

const EARLY_PASSES = [
  require('./passes/clear-stale-qf-claims.cjs'),
];

// Order matches the original main() source sequence (behavioral parity):
// identity-split -> claim-boundary-probe -> ... -> intent-collision -> ... ->
// dead-letter -> ... -> coordination-detectors. The "..." gaps are inline main()
// blocks not extracted in this SD (npm lock, worktree conflict, dup-claim reminders,
// etc.) — untouched, still running between these passes in main()'s own body.
const MAIN_PASSES = [
  identityCollisionSplit,
  claimBoundaryProbe,
  intentCollisionDetection,
  deadLetterPlanning,
  coordinationDetectors,
];

/**
 * Run an ordered list of passes with per-pass try/catch isolation — a single pass
 * throwing must never abort the sweep tick. Matches the ad-hoc pattern main() already
 * applies to several blocks today (formalized here, not invented).
 *
 * EXCEPTION — `critical: true` passes rethrow instead of isolating: the pre-refactor
 * main() intentionally aborted the whole tick when such a block failed (e.g.
 * identity-collision-split, whose failure means downstream claim mutation would run
 * against unsplit sessions). Isolation for those would silently widen fail-open
 * behavior the original code never had (adversarial-review fix, PR #5755).
 */
async function runPasses(passes, ctx) {
  for (const pass of passes) {
    try {
      await pass.run(ctx);
    } catch (err) {
      if (pass.critical) throw err;
      ctx.warnings.push('PASS_FAILED(' + pass.name + '): ' + (err && err.message ? err.message : String(err)));
    }
  }
}

module.exports = { EARLY_PASSES, MAIN_PASSES, runPasses };
