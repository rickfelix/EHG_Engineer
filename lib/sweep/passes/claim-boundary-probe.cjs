// SD-ARCH-HOTSPOT-SWEEP-001: registry wrapper for runClaimBoundaryProbe, which is
// ALREADY the target {name, run(ctx)}-adjacent shape today — the template pass this
// SD's design is modeled on (PRD FR-1). Its body is deliberately NOT relocated out of
// scripts/stale-session-sweep.cjs: it is exported there and driven directly by
// tests/integration/claim-boundary-probe.integration.test.js against real tables (no
// mocked gate) — moving it would require updating that test's import path for zero
// behavioral benefit. This wrapper collapses its 7 positional args
// (supabase, classified, telemetryMap, now, actions, warnings, opts) into the shared
// ctx bag, formalizing the contract without relocating the implementation.
//
// CIRCULAR-REQUIRE NOTE: same as intent-collision-detection.cjs / dead-letter-planning.cjs
// — require the whole module object, read runClaimBoundaryProbe lazily inside run().

const sweepModule = require('../../../scripts/stale-session-sweep.cjs');

async function run(ctx) {
  const { supabase, classified, telemetryMap, now, actions, warnings, probeOpts } = ctx;
  await sweepModule.runClaimBoundaryProbe(supabase, classified, telemetryMap, now, actions, warnings, probeOpts || {});
}

module.exports = { name: 'claim-boundary-probe', run };
