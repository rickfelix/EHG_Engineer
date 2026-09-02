import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = 'SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 85,
  summary:
    'Fix shape is genuinely testable but needs TWO tests in two vitest lanes (unit: import-shape; ' +
    'db: RLS-effect) -- folding into one would either not run against real credentials (tests/setup.unit.js ' +
    'sentinels out all four Supabase env vars) or miss the pure-ESM import-failure assertion. Independently ' +
    're-measured the incident premise LIVE (not assumed): leo_feature_flags anon=0/service=25/error=null RIGHT ' +
    'NOW -- the silent-zero shape is real and reproducible today, not historical. Confirmed the ESM failure ' +
    'mode empirically: a bare default import of a module with no default export throws a link-time SyntaxError ' +
    'before any code runs -- removal (not repoint-to-service) is the correct fix direction, since repointing ' +
    'would silently grant service-role access to an unknown caller (a security-direction regression).',
  critical_issues: [
    'PREMISE GAP: scripts/modules/sd-creation/supabase-client.js:40 has a MORE LITERAL version of the described bug -- an actual env-driven service->anon fallback (getSupabaseClient() resolves SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY), eagerly evaluated at module load, plus its own `export default supabase` and a shadowing 2-arg createSupabaseClient(url, key). Zero current importers (dead-but-loaded), but this matches the SD title more literally than lib/supabase-client.js. Must be explicitly in-scope or explicitly deferred in the PRD, not left unmentioned.',
  ],
  warnings: [
    'strategic_directives_v2 is NOT a witness table for the RLS-filtered-empty shape (measured anon=6002, service=6002, identical). Only leo_feature_flags (of two probed) exhibits the incident shape -- the PRD test must target it, not an arbitrary governance table.',
    'The unit vitest project cannot prove the "0 rows" half of the fix -- tests/setup.unit.js unconditionally overwrites all Supabase credential vars with test.invalid.local sentinels. The RLS-effect assertion must be a *.db.test.js in the db project (precedent: tests/integration/creative-asset-variant-scores-rls.db.test.js).',
    'A related but genuinely separate gap (read-side blind spot in lib/supabase-client.cjs wrapAnonClientWithGovernanceGuard, and a GOVERNANCE_TABLES list not derived from measured RLS posture) was found and logged as harness-backlog (feedback row 3aaea676-3db0-40d6-a852-8774449800e6) -- out of scope for this SD, which closes the client-construction landmine, not read-time governance coverage.',
  ],
  recommendations: [
    'Unit test: a planted-violation fixture doing the bare default import, asserting `import(fixture)` rejects with the SyntaxError, plus `import * as mod` -> `mod.default` is undefined. No network/mocking needed (precedent: tests/fixtures/golden-references/planted-violation.mjs).',
    'DB test: skip-loudly if service count is 0 (never assert a literal stale row count -- LEAD\'s "23 rows" was already stale, measured 25 live), else assert anonCount===0 && anonError===null && serviceCount>0 against leo_feature_flags specifically.',
    'PLAN must explicitly rule scripts/modules/sd-creation/supabase-client.js:40 in or out of scope with a stated reason -- silently omitting it re-derives the same defect class LEAD already found once via naive census.',
  ],
  detailed_analysis: {
    live_premise_reproduction: { table: 'leo_feature_flags', anon_count: 0, service_count: 25, anon_error: null, measured_now: true },
    esm_failure_mode_confirmed: "bare default import of a module with no default export throws SyntaxError: ... does not provide an export named 'default' at link time",
    second_landmine_found: {
      file: 'scripts/modules/sd-creation/supabase-client.js',
      line: 40,
      mechanism: "export default supabase, where supabase = getSupabaseClient() resolves SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY (env-driven, eager, silent)",
      current_importers: 0,
    },
    unit_project_credential_sentinel: 'tests/setup.unit.js overwrites SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY with test.invalid.local',
  },
  metadata: {
    validation_mode: 'prospective',
    // Prospective review: no code/PRD exists yet to execute tests against. Zero-executed
    // shape is the correct, honest representation (isMeasuredExecution() === false) --
    // never a fabricated pass count for a review that ran no tests. measured:false is the
    // explicit "nothing to measure yet" declaration the writer guard requires.
    measured: false,
    test_execution: buildTestExecution({}),
  },
  execution_time_ms: 181696,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director (prospective)' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
