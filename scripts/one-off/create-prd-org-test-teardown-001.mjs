#!/usr/bin/env node
// SD-LEO-INFRA-ORG-TEST-TEARDOWN-001 -- PLAN phase PRD creation.
// Uses the canonical createPRDWithValidatedContent() helper (scripts/prd/prd-creator.js)
// per CLAUDE_PLAN.md's "generate first, then insert" inline-mode pattern, built from a
// dedicated LEAD-phase Explore investigation (sub_agent_execution_results id d896b6a6,
// recorded via scripts/record-explore-evidence.js).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createPRDWithValidatedContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ORG-TEST-TEARDOWN-001';
const SD_UUID = 'b92e721f-0d7d-49db-aec8-a9e7732f7525';
const PRD_ID = 'PRD-SD-LEO-INFRA-ORG-TEST-TEARDOWN-001';
const PRD_TITLE = 'Org test teardown removes every org row the test created';

const llmContent = {
  executive_summary: 'The real-DB org e2e test suites (tests/e2e/agents/venture-ceo-verify-first.spec.ts, shared-operators-arming.spec.ts) create org_agent_identities rows via recordIdentityForAgent() but the shared teardownRun() helper never deletes them, so every run of the org test suite permanently grows the table (measured live: 18,467 rows, ~18,340 TEST-prefixed orphans). This SD adds the missing per-venture delete to teardownRun(), keyed on the same manifest.ventureId it already tracks, plus a bounded crashed-run residue sweep and a CI count-parity assertion -- draining the existing 18k-row backlog is an explicit reserved decision (R4) and is out of scope.',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'teardownRun() (scripts/harness/spine-verify-first-run.mjs:61-84) deletes org_agent_identities rows created by the run it is tearing down',
      description: 'org_agent_identities is uniquely keyed by (venture_id, role_key) (database/migrations/20260712_spine_core_identity_registry_fabric.sql:26-37) and has no FK to ventures, so deleting the ventures row (already done at teardownRun():~line 80) does not cascade. Add results.org_agent_identities = await supabase.from(\'org_agent_identities\').delete().eq(\'venture_id\', manifest.ventureId) alongside the existing per-table deletes, using the manifest.ventureId the function already receives -- no new parameter, no new call-site change required in either spec file (both already call teardownRun(supabase, manifest) in their finally blocks).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: teardownRun() issues a delete on org_agent_identities scoped to eq(\'venture_id\', manifest.ventureId), added to the same results object every other per-table delete already populates',
        'AC-2: Running venture-ceo-verify-first.spec.ts (TS-1..TS-4) or shared-operators-arming.spec.ts TS-5 leaves zero org_agent_identities rows for that run\'s ventureId after teardown, verified by a direct post-teardown COUNT',
        'AC-3: No other venture\'s org_agent_identities rows are touched -- the delete predicate is scoped to exactly one venture_id per call'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'shared-operators-arming.spec.ts:79\'s existing venture_id IS NULL / role_key-scoped holdco cleanup is preserved unchanged',
      description: 'The holdco (shared-operator, venture_id IS NULL) cleanup path already correctly deletes only the specific role_keys that test run created (createdRoleKeys), never touching the 5 real holdco operator rows. FR-1 only adds the missing per-venture path; this FR is a regression guard making explicit that the holdco path is not touched by this SD\'s change.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: The 5 real null-venture holdco operator rows (Finance/Billing, Legal/Compliance, Security-Posture, Data-Platform, Research-Intelligence) are never deleted by any code this SD adds or modifies',
        'AC-2: shared-operators-arming.spec.ts TS-1/TS-2\'s existing finally-block cleanup logic is unchanged (byte-identical diff outside the FR-1 teardownRun() call it already makes)'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'A bounded, name-prefix-scoped residue sweep runs at beforeAll in both real-DB org e2e suites, reusing the established purgeStaleRealDbResidue() pattern',
      description: 'FR-1 handles the clean-exit case; a crashed test process (before its own afterAll/finally runs) still leaks one run\'s worth of org_agent_identities rows, same as the pre-existing, already-solved problem for ventures rows one level up (lib/governance/fixture-producer-guard.mjs:162-196, wired into 3 real-DB suites\' beforeAll today). Add an equivalent sweep for org_agent_identities: at beforeAll, delete any org_agent_identities row whose display_name matches this suite\'s own TEST- name prefix (the same prefix teardownRun()\'s own fixture venture names already use) AND whose venture_id has no corresponding live ventures row (i.e., already orphaned by a crashed prior run) -- bounding accumulation to at most one crashed run\'s worth, never touching a currently-in-progress concurrent run\'s rows.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: The sweep only deletes org_agent_identities rows matching this run\'s own TEST-<prefix> AND with a venture_id that no longer resolves in ventures (orphaned), never a row belonging to a currently-live venture',
        'AC-2: The sweep is wired into beforeAll for both venture-ceo-verify-first.spec.ts and shared-operators-arming.spec.ts',
        'AC-3: A simulated crashed-run fixture (an org_agent_identities row with a TEST-prefixed display_name and a venture_id pointing at a since-deleted venture) is removed by the next suite run\'s beforeAll sweep'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'A CI-exercised test asserts org_agent_identities row count is unchanged after running the org e2e suite twice',
      description: 'Directly implements the SD\'s own stated success criterion. Capture SELECT COUNT(*) FROM org_agent_identities before the org e2e suites run, run the real-DB org suites (venture-ceo-verify-first.spec.ts + shared-operators-arming.spec.ts), capture the count again, run the same suites a second time, capture the count a third time -- assert count(before) === count(after-run-1) === count(after-run-2). This is the closest-fit shape from the two established sibling precedents (scripts/sweep-fixture-residue.mjs + venture-fixture-sweep.yml\'s "scheduled CI sweep+assert" for ventures) adapted to a direct before/after count comparison rather than a sweep, since FR-1/FR-3 already make the count self-correcting -- this test is the proof, not a new cleanup mechanism.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: The test is skipped (not failed) when SUPABASE_URL/SUPABASE_KEY are absent, matching the existing real-DB test skip convention in both org e2e spec files',
        'AC-2: The test runs the real org e2e suites (not a mock), invoking the actual teardownRun() and FR-3 sweep code paths',
        'AC-3: The assertion fails loudly (not silently) if the count grows by even 1 row after either run',
        'AC-4: The test is wired into the standard CI test run (not a manual-only script) so a future regression in FR-1/FR-3 is caught automatically'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'No change to the existing backlog of ~18,340 pre-existing orphaned org_agent_identities rows',
      description: 'Explicitly reserved decision R4 per the SD\'s own scope text -- this SD stops the leak going forward; draining the existing pool is a separate, chairman-reserved decision. FR-1/FR-3/FR-4 must be verifiably correct without touching any row that predates this SD\'s own test runs.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: SELECT COUNT(*) FROM org_agent_identities immediately before and immediately after this SD\'s own EXEC-phase implementation work (excluding this SD\'s own test-run residue, which FR-1/FR-3 clean up) shows no reduction in the pre-existing backlog count',
        'AC-2: No migration, script, or code path added by this SD issues a DELETE against org_agent_identities without a venture_id or role_key scope tied to a specific test run'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'The FR-1 delete is scoped by venture_id, never by display_name pattern-matching alone',
      rationale: 'venture_id is the exact, non-heuristic key the manifest already carries and org_agent_identities is uniquely indexed on; a display_name TEST- prefix match is the correct discriminant ONLY for the FR-3 crashed-run sweep (where no live manifest exists to key off), never for the FR-1 clean-exit path, where the precise key is already available and should always be preferred.'
    },
    {
      id: 'TR-2',
      requirement: 'FR-3\'s sweep reuses purgeStaleRealDbResidue() (lib/governance/fixture-producer-guard.mjs:162-196) or extends it with a second table argument, rather than hand-rolling a parallel implementation',
      rationale: 'This exact "sweep your own prior crashed run by name-prefix at beforeAll" shape is already implemented, unit-tested (tests/unit/governance/purge-stale-realdb-residue.test.js), and wired into 3 live suites for the sibling ventures-residue problem -- reusing it keeps the bounding-argument and orphan-detection logic in one place instead of a second, divergent copy.'
    },
    {
      id: 'TR-3',
      requirement: 'The FR-4 CI test uses the already-established fixture venture name prefix (TEST-) and does not introduce a second naming convention',
      rationale: 'lib/governance/fixture-exclusion.mjs:81 FIXTURE_VENTURE_NAME_RE is documented as "THE CANONICAL union" for fixture-venture naming across the repo; a new or divergent prefix for this SD\'s own test fixtures would fragment that convention and make future sweeps/audits miss this SD\'s own residue.'
    }
  ],

  system_architecture: {
    overview: 'Two org e2e test suites already create org_agent_identities rows via one production write path (recordIdentityForAgent) and already call a shared teardown helper (teardownRun) in their cleanup blocks. This SD closes the one missing delete in that shared helper, adds a bounded crashed-run sweep reusing an already-shipped sibling mechanism, and adds a CI-exercised count-parity assertion that proves both fixes hold under a real double-run.',
    components: [
      {
        name: 'teardownRun() org_agent_identities delete',
        responsibility: 'Deletes exactly the org_agent_identities rows created for one test run\'s venture_id, on clean exit',
        technology: 'scripts/harness/spine-verify-first-run.mjs, Supabase client (existing function, additive change)'
      },
      {
        name: 'Crashed-run residue sweep',
        responsibility: 'At beforeAll, removes any org_agent_identities row matching this suite\'s own TEST- prefix whose venture_id no longer resolves (orphaned by a prior crashed run), bounding unbounded accumulation',
        technology: 'lib/governance/fixture-producer-guard.mjs purgeStaleRealDbResidue() (reused/extended), wired into tests/e2e/agents/*.spec.ts beforeAll'
      },
      {
        name: 'CI count-parity assertion',
        responsibility: 'Runs the real org e2e suites twice and asserts org_agent_identities row count is unchanged after each run',
        technology: 'A new real-DB test file under tests/e2e/agents/ or tests/integration/org/, standard vitest/playwright CI run'
      }
    ],
    data_flow: 'An org e2e test calls VentureFactory.instantiateVenture()/instantiateSharedOperators() -> lib/agents/venture-ceo-factory.js _createAgent() -> lib/org/factory-identity-fold.cjs recordIdentityForAgent() writes/upserts an org_agent_identities row keyed on (venture_id, role_key) -> the test\'s finally block calls teardownRun(supabase, manifest), which (after this SD) also deletes that venture_id\'s org_agent_identities rows -> beforeAll on the NEXT suite run additionally sweeps any TEST-prefixed row left behind by a crashed prior run -> the FR-4 CI test runs this whole cycle twice and asserts the table\'s row count returns to its starting value both times.',
    integration_points: [
      'scripts/harness/spine-verify-first-run.mjs teardownRun() (FR-1)',
      'lib/governance/fixture-producer-guard.mjs purgeStaleRealDbResidue() (FR-3, reused)',
      'tests/e2e/agents/venture-ceo-verify-first.spec.ts and shared-operators-arming.spec.ts (beforeAll wiring, FR-3; existing finally-block teardownRun() calls, FR-1 covers both files with zero call-site changes)',
      'lib/org/factory-identity-fold.cjs recordIdentityForAgent() (the sole production write path -- read-only reference, no change)'
    ]
  },

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'Single test run leaves zero org_agent_identities residue for its own venture',
      test_type: 'integration',
      given: 'A real-DB org e2e test (venture-ceo-verify-first.spec.ts TS-1) creates a venture with CEO + VPs + crew',
      when: 'The test completes and its finally block calls teardownRun(supabase, manifest)',
      then: 'SELECT COUNT(*) FROM org_agent_identities WHERE venture_id = manifest.ventureId returns 0'
    },
    {
      id: 'TS-2',
      scenario: 'Holdco (shared-operator) rows are never touched by the new per-venture delete',
      test_type: 'integration',
      given: 'The 5 real null-venture holdco operator rows exist',
      when: 'A per-venture teardownRun() call (FR-1) runs for an unrelated venture',
      then: 'All 5 holdco rows are present and unchanged, verified by role_key + display_name before/after'
    },
    {
      id: 'TS-3',
      scenario: 'Crashed-run residue is swept on the next run, bounding accumulation',
      test_type: 'integration',
      given: 'A simulated crashed-run fixture: an org_agent_identities row with a TEST-prefixed display_name and a venture_id pointing at a since-deleted ventures row',
      when: 'The next real-DB org suite run executes its beforeAll',
      then: 'The orphaned fixture row is deleted; a row belonging to a currently-live (not orphaned) venture with a similar TEST- prefix is NOT deleted'
    },
    {
      id: 'TS-4',
      scenario: 'Double-run count parity -- the SD\'s own stated success criterion',
      test_type: 'e2e',
      given: 'The current org_agent_identities row count is captured',
      when: 'The real org e2e suites (venture-ceo-verify-first.spec.ts + shared-operators-arming.spec.ts) run, count is captured, then run a second time, count is captured again',
      then: 'count(before) === count(after-run-1) === count(after-run-2); the test fails loudly on any growth'
    },
    {
      id: 'TS-5',
      scenario: 'Existing pre-SD backlog is untouched',
      test_type: 'integration',
      given: 'The live ~18,340-row TEST- orphan backlog and 5 real holdco rows, captured as a baseline count before this SD\'s own test runs',
      when: 'This SD\'s own FR-1/FR-3/FR-4 test runs execute (creating and tearing down their own rows)',
      then: 'The pre-existing backlog count (rows created before this SD\'s test runs began) is unchanged -- only rows created and torn down by this SD\'s own runs are affected'
    },
    {
      id: 'TS-6',
      scenario: 'A test process that genuinely crashes mid-run (never reaches its finally block) leaks bounded, not unbounded, residue',
      test_type: 'integration',
      given: 'A test run is force-terminated after creating org_agent_identities rows but before teardownRun() executes',
      when: 'The next suite invocation runs its beforeAll sweep (FR-3)',
      then: 'The leaked rows from the crashed run are swept before the next run begins, so at most one crashed run\'s worth of residue can exist at any time, matching purgeStaleRealDbResidue()\'s documented bounding guarantee for the sibling ventures case'
    }
  ],

  acceptance_criteria: [
    'Running the real org e2e test suite twice leaves the org_agent_identities row count unchanged, verified by a CI-exercised test (FR-4) -- the SD\'s own literal success criterion',
    'teardownRun() deletes org_agent_identities rows scoped to exactly the venture_id it tears down, for every real-DB org test that creates a venture-scoped roster',
    'The 5 real null-venture holdco operator rows are never deleted by any code this SD adds or modifies',
    'A crashed test run leaks at most one run\'s worth of org_agent_identities residue, swept by the next run\'s beforeAll',
    'The pre-existing ~18,340-row backlog is untouched by this SD (reserved decision R4, explicitly out of scope)'
  ],

  risks: [
    {
      risk: 'A delete scoped incorrectly (e.g. missing the venture_id filter, or filtering on a stale/shared value) could delete another test\'s in-flight rows during concurrent CI runs',
      probability: 'LOW',
      impact: 'HIGH',
      mitigation: 'FR-1\'s delete is scoped to exactly manifest.ventureId, a fresh UUID generated per test run (never shared or reused across concurrent runs); FR-3\'s sweep additionally requires the venture_id to be orphaned (no live ventures row), which cannot be true for a currently-in-progress run\'s venture',
      rollback_plan: 'Revert the teardownRun() and beforeAll-sweep changes independently -- both are additive changes isolated to their respective files with no signature change to teardownRun()\'s existing callers'
    },
    {
      risk: 'The FR-4 CI test running the full org e2e suite twice increases CI wall-clock time and, if flaky, could produce false-positive count mismatches unrelated to this SD\'s fix',
      probability: 'MEDIUM',
      impact: 'LOW',
      mitigation: 'The test is real-DB-only (skipped when SUPABASE_URL/SUPABASE_KEY are absent, matching the existing skip convention), isolated to its own venture_id per run so it cannot collide with concurrent CI jobs, and asserts count parity rather than an absolute value, so any count drift is immediately attributable to a teardown regression, not environmental noise',
      rollback_plan: 'The FR-4 test can be marked skip/quarantined independently without affecting the FR-1/FR-3 production fixes it is verifying'
    },
    {
      risk: 'Reusing/extending purgeStaleRealDbResidue() for a second table (org_agent_identities, in addition to its existing ventures scope) could regress its existing, already-shipped ventures-sweep behavior for the 3 suites that already depend on it',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'The existing unit test suite (tests/unit/governance/purge-stale-realdb-residue.test.js) is run as a regression gate before and after this SD\'s change; if extension risks existing behavior, a parallel sibling function scoped to org_agent_identities is used instead, keeping the ventures path byte-identical',
      rollback_plan: 'Revert to a table-specific sweep function if the shared-extension approach shows any regression in the existing ventures-sweep tests'
    }
  ],

  implementation_approach: {
    phases: [
      { phase: 'Phase 1: Root-cause fix', description: 'Add the org_agent_identities delete to teardownRun() (FR-1), scoped to manifest.ventureId. No call-site changes needed in either spec file.' },
      { phase: 'Phase 2: Bounded crashed-run sweep', description: 'Reuse or extend purgeStaleRealDbResidue() for org_agent_identities, wired into beforeAll in both real-DB org e2e suites (FR-2, FR-3).' },
      { phase: 'Phase 3: CI proof', description: 'Add the double-run count-parity test (FR-4), wired into standard CI so a future regression is caught automatically.' }
    ],
    testing_strategy: 'Real-DB integration tests only (this problem is inherently about live-DB residue and cannot be meaningfully verified against a mocked Supabase client); existing mocked unit tests (tests/unit/venture-ceo-factory.test.js, tests/unit/org/factory-identity-fold-canonical-title.test.mjs) are unaffected and serve as a regression guard that this SD does not change recordIdentityForAgent()\'s write behavior.',
    deployment_strategy: 'Standard PR merge; no migration required (no schema change) and no chairman ceremony required (test-infrastructure-only change, no production data path touched beyond the test suites\' own residue).'
  },

  exploration_summary: 'LEAD-phase Explore investigation (sub_agent_execution_results d896b6a6) confirmed org_agent_identities has exactly one production write site (lib/org/factory-identity-fold.cjs recordIdentityForAgent) and exactly one existing (partial, holdco-only) delete site (shared-operators-arming.spec.ts:79); the shared teardownRun() helper used by every real-DB org test omits this table entirely from its otherwise-thorough per-table delete list. Two directly-reusable sibling precedents were found for the sweep/assert shapes this SD needs: purgeStaleRealDbResidue() (crashed-run bounding) and scripts/sweep-fixture-residue.mjs + its CI workflow (scheduled sweep+assert), both already shipped for the sibling ventures-residue problem and neither currently touching org_agent_identities.'
};

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: sdData, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, scope, sd_type')
    .eq('id', SD_UUID)
    .single();
  if (sdErr) throw new Error(`fetch SD failed: ${sdErr.message}`);

  const stakeholderPersonas = ['Chairman (Solo Entrepreneur)', 'EVA (AI Chief of Staff)', 'DevOps Engineer'];

  const prd = await createPRDWithValidatedContent(
    supabase,
    PRD_ID,
    SD_KEY,
    SD_UUID,
    PRD_TITLE,
    sdData,
    llmContent,
    stakeholderPersonas
  );

  console.log('PRD created/updated:', prd.id, '| status:', prd.status, '| progress:', prd.progress);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
