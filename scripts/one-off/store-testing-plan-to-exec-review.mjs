// PLAN-TO-EXEC TESTING sub-agent review for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001.
// Pre-implementation review of the PRD/test-scenario design (no code written yet).
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '0667ff2f-c224-4359-92a7-d156a0a414b1';
const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

const detailedAnalysis = `PLAN-TO-EXEC TESTING sub-agent review (pre-implementation, no code written yet) of
PRD-SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001. Reviewed the full PRD content, the current
lib/agents/venture-ceo-factory.js (instantiateVenture() lines 260-437, instantiateSharedOperators()
maybeSingle precedent at line 481), lib/creative/creative-brief.js lines 1-100 (the VentureNotFoundError/
defaultVentureExists precedent this PRD mirrors), tests/unit/venture-ceo-factory.test.js in full, both
real call sites (lib/agents/eva-coo-integration.js:319-362 onboardVenture(), scripts/harness/spine-verify-first-run.mjs:90-160),
and every other instantiateVenture() call site found via repo-wide grep (e2e specs, mocked unit tests).

REAL GAPS FOUND AND FIXED DIRECTLY IN THE PRD (both scripts/one-off/instantiate-venture-refuses-prd-content.json
and the product_requirements_v2 DB row):

1. Export gap (FR-1): creative-brief.js's defaultVentureExists is a PRIVATE, unexported module function
   (verified: creative-brief.js exports only VentureNotFoundError/CreativeAssetsTableNotLiveError/
   QualityGateRejectedError/requestCreativeAsset; no creative-brief test file exists to show how its 22P02
   path is tested without a direct export). The PRD's own TS-3/TS-4 call defaultVentureExists(mockSupabase, ...)
   directly, which is only possible if it is exported. Fixed: added FR-1 AC-4 requiring both
   VentureNotFoundError and defaultVentureExists to be named exports of venture-ceo-factory.js.

2. Missing falsy-ventureId short-circuit (FR-2): creative-brief.js's actual precedent puts the
   "if (!ventureId || !(await ventureExistsFn(...)))" check in the CALLER (requestCreativeAsset), not
   inside defaultVentureExists. The PRD's original system_architecture.data_flow only said "awaits
   ventureExistsFn(...)" with no falsy pre-check, so a missing/undefined ventureId would rely on an
   accidental DB-side 22P02 rather than mirroring the precedent. Fixed: FR-2 requirement and data_flow
   now explicitly specify the "!ventureId ||" short-circuit before any DB call; added FR-2 AC-4 and a new
   TS-7 test scenario proving ventureExistsFn is never invoked for a missing ventureId.

3. Ordering ambiguity (FR-2 AC-2): confirmed via direct read that the CURRENT instantiateVenture() code
   has two console.log calls (lines 282-283) BEFORE the _getTemplate() call (line 286) -- so the original
   requirement text "before the _getTemplate() call" under-specified placement and could be satisfied by
   inserting the guard between the console.logs and _getTemplate(), violating AC-2's own "before any
   console.log" claim. Fixed: FR-2 requirement now names the exact insertion point (immediately after
   destructuring options at line 280, before both console.log calls at 282-283).

VERIFIED SAFE, NO PRD CHANGE NEEDED:

4. Signature mismatch risk: grepped every instantiateVenture( call site repo-wide (excluding archive/).
   Both real call sites (eva-coo-integration.js:356, spine-verify-first-run.mjs:128) and every test/e2e
   call site (tests/unit/venture-ceo-factory.test.js, tests/e2e/agents/venture-ceo-verify-first.spec.ts,
   tests/e2e/agents/shared-operators-arming.spec.ts) pass exactly ONE argument (an options object).
   tests/unit/agents/eva-coo-integration-onboard-email.test.js fully mocks the VentureFactory class with
   an instantiateVenture(...args) rest-param stub, forward-compatible regardless of arg count. Adding an
   optional second deps={} parameter is fully backward-compatible; noted in TR-2's rationale as
   verified evidence.

5. Mock chaining/state-bleed: traced the shared mockSupabase fixture in tests/unit/venture-ceo-factory.test.js
   precisely. .from()/.select()/.eq() are simple pass-through vi.fn()s returning mockSupabase regardless of
   arguments; .single() and .maybeSingle() are two SEPARATE vi.fn() terminal resolvers on the same object,
   each independently configurable/mockable. The new guard's .maybeSingle() call is the ONLY .maybeSingle()
   call reached during instantiateVenture() (instantiateSharedOperators()'s existing .maybeSingle() use is a
   different method, never invoked by these 2 tests) -- so there is no call-order or return-value bleed
   between .single() (used by _createAgent) and .maybeSingle() (used by the new guard) within a single test.

6. TS-3 (22P02) reachability: confirmed the existing synthetic ids ('test-venture-id-123'/'test-venture-id-456')
   are non-UUID strings; against a real @supabase/supabase-js/PostgREST client with a UUID-typed ventures.id
   column, .eq('id', 'not-a-uuid') is NOT validated client-side -- it reaches Postgres and returns 22P02.
   TS-3's premise is reachable in practice, not merely a mock fiction.

7. Scope check: confirmed no OTHER test file needs touching beyond the 2 named in FR-5 AC-1 -- the e2e specs
   already pass real, pre-inserted venture ids (unaffected by the guard), and the onboard-email unit test
   fully mocks the factory class (forward-compatible). Supports FR-5 AC-1's "touches only 2 files" claim.

All fixes were applied directly to scripts/one-off/instantiate-venture-refuses-prd-content.json and the
product_requirements_v2 DB row (functional_requirements, technical_requirements, test_scenarios,
acceptance_criteria, system_architecture) -- not merely listed. PRD is now internally consistent and
implementation-ready for EXEC.`;

const results = {
  verdict: 'PASS',
  confidence: 85,
  summary: 'PLAN-phase pre-implementation TESTING review of PRD-SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001. Found and fixed 3 real gaps directly in the PRD (missing export requirement for defaultVentureExists/VentureNotFoundError blocking TS-3/TS-4; missing falsy-ventureId short-circuit mirroring the creative-brief.js precedent; an ordering ambiguity in FR-2 vs the current console.log placement). Verified 4 other suspected risks (signature-mismatch, mock state-bleed, TS-3 reachability, test-file scope) as NOT real issues, with evidence. PRD is now implementation-ready.',
  detailed_analysis: detailedAnalysis,
  warnings: [],
  metadata: {
    // Honest "nothing to measure": this is a PLAN-phase prospective PRD/design review — no code
    // exists yet for this SD, so there is no test suite to run. tests_executed=0 is genuine, not
    // an unmeasured/skipped run.
    measured: false,
    test_execution: buildTestExecution({
      executed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      runner: 'N/A (PLAN-phase prospective review, no code written yet)',
      source: 'Reviewed PRD-SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 (full DB row) against lib/agents/venture-ceo-factory.js (instantiateVenture() lines 260-437, instantiateSharedOperators() lines 448-529), lib/creative/creative-brief.js lines 1-100, tests/unit/venture-ceo-factory.test.js (full), lib/agents/eva-coo-integration.js lines 300-369, scripts/harness/spine-verify-first-run.mjs lines 75-175, tests/unit/agents/eva-coo-integration-onboard-email.test.js, tests/e2e/agents/venture-ceo-verify-first.spec.ts, plus a repo-wide grep for every instantiateVenture( call site.'
    })
  }
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('TESTING', SD_ID, { code: 'TESTING', name: 'Testing' }, results, {
    sdKey: SD_KEY,
    phase: 'PLAN-TO-EXEC',
  });

  console.log('Stored TESTING sub-agent results:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict }, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED to store TESTING results:', err);
    process.exit(1);
  });
}
