// SD-ARCH-HOTSPOT-SWEEP-001: registry wrapper for clearStaleQfClaims(), which stays
// defined in scripts/stale-session-sweep.cjs (deliberately NOT relocated — see
// claim-boundary-probe.cjs for the same rationale: avoiding a duplicate
// implementation keeps the SWEEP_PASS_REGISTRY=off kill-switch meaningful, since both
// code paths call the exact same underlying function rather than risking behavioral
// drift between two copies of live-fleet-coordination logic).
//
// EARLY pass — see pass-registry.cjs header for why this runs before main()'s
// early-return-on-empty-sessions, not alongside MAIN_PASSES.
//
// CIRCULAR-REQUIRE NOTE: same pattern as the other wrapper passes — require the whole
// module object, read clearStaleQfClaims lazily inside run().

const sweepModule = require('../../../scripts/stale-session-sweep.cjs');

async function run(ctx) {
  const { supabase, now, actions, warnings } = ctx;
  await sweepModule.clearStaleQfClaims(supabase, now, actions, warnings);
}

module.exports = { name: 'clear-stale-qf-claims', run };
