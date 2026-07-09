// SD-ARCH-HOTSPOT-SWEEP-001: registry wrapper for splitCollidingSessions(), which
// stays defined in scripts/stale-session-sweep.cjs (deliberately NOT relocated —
// same rationale as claim-boundary-probe.cjs / clear-stale-qf-claims.cjs: a single
// underlying implementation keeps SWEEP_PASS_REGISTRY=off meaningful without risking
// two copies of live-fleet-coordination logic drifting apart).
//
// collisions itself is computed EARLY in main() via detectIdentityCollisions() (a
// synchronous, local marker-file read — stays inline in main(), feeds aliveMarkers
// used by classification's PID-liveness cross-reference before this pass ever runs).
// ctx.collisions is that pre-computed list, threaded through.
//
// CIRCULAR-REQUIRE NOTE: same pattern as the other wrapper passes — require the whole
// module object, read splitCollidingSessions lazily inside run().

const sweepModule = require('../../../scripts/stale-session-sweep.cjs');

async function run(ctx) {
  const { supabase, actions, warnings, collisions } = ctx;
  if (!collisions || collisions.length === 0) return;
  await sweepModule.splitCollidingSessions(supabase, collisions, actions, warnings);
}

// critical: in the pre-refactor main(), a splitCollidingSessions() throw aborted the
// entire tick — downstream claim mutation (conflict eviction, CLAIM_FIX) never ran
// against unsplit identity-collided sessions. Fail-open isolation here would widen
// that safety property (adversarial-review fix, PR #5755), so runPasses() rethrows.
module.exports = { name: 'identity-collision-split', run, critical: true };
