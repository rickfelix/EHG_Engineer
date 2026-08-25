// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C -- PRD correction after real TESTING sub-agent
// scrutiny (evidence row 00ebf55d-1894-49f8-bd2b-5304c3280053, CONDITIONAL_PASS). The gate scored
// testingStrategyValidation 100% but the sub-agent found 6 concrete blocking gaps in the PRD's own
// test strategy -- fixing the PRD content itself before proceeding to EXEC, not just satisfying the gate.
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, risks, technical_requirements, metadata')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) { console.error('FETCH_ERR', fetchErr.message); process.exit(1); }

// --- FR-3: correct the factual claim about fallbackExecutor ---
const frs = prd.functional_requirements.map(fr => {
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      description: 'CORRECTED per TESTING sub-agent scrutiny (row 00ebf55d): lib/apa/venture-step-executors.js\'s buildStepExecutor fallbackExecutor unconditionally THROWS for any step without an explicit stepOverride (lines 111/116/139/165) -- it does not "force a sign-in as the first action of every step"; the /register + ctx.authenticated guard is dead code, since ctx.authenticated is never set true (fallbackExecutor never returns ctxUpdates before throwing). Today NO persona -- signed-in or signed-out -- completes a walked step for any venture except where explicit stepOverrides exist (currently none are registered for any venture). This FR must build real step->DOM stepOverrides for at least one signed-out journey against AltifyAI specifically (the /register + "Already have an account? Sign in" strings at line 133 are hardcoded/Clerk-specific) -- multi-venture generalization of the fallback executor is explicitly OUT OF SCOPE for this child.',
      acceptance_criteria: [
        'At least one signed-out journey against AltifyAI is exercised via a real stepOverride (not the fallbackExecutor) in a recorded UAT run, producing an actual completed step trace rather than a thrown error',
        'Existing signed-in stepOverrides (if any are added for FR-1/FR-2 validation) are unaffected by the signed-out persona addition',
        'The PRD explicitly scopes this to AltifyAI only -- no claim is made that signed-out coverage works for any other venture without its own stepOverrides'
      ]
    };
  }
  if (fr.id === 'FR-4') {
    return {
      ...fr,
      description: fr.description + ' CORRECTED per TESTING sub-agent scrutiny (row 00ebf55d): the existing GAP_CLASS taxonomy (lib/eva/findings/gap-class.js) is exclusively factory-defect-scoped -- all 8 ratified values describe factory-instrument pathologies, recordFactoryDefect() throws on any unratified value, and gap-class.test.js pins exactly 8 entries. GAP_CLASS cannot express "venture-defect" as-is. This FR must EXTEND the taxonomy with a new ratified venture-defect category (or introduce an explicitly separate, minimal venture-defect classification alongside GAP_CLASS) as NEW work -- this is not pure reuse.',
      acceptance_criteria: [
        'A test run demonstrates at least one failure classified factory-defect using the EXISTING GAP_CLASS taxonomy, and at least one classified venture-defect using a newly-ratified category or an explicitly separate venture-defect classification introduced by this SD',
        'Exceeding the failure ceiling produces a root-fix SD record with chairman-visible metadata, not a silent retry',
        'gate_type is verified as \'promotion\' wherever this stage\'s gate is registered, never \'kill\' -- verifiable only once child B has landed the stage row; until then this criterion is checked against a staged/test venture_stages row'
      ]
    };
  }
  return fr;
});

// --- test_scenarios: fix TS-2, add TS-6/7/8, retype live-venture scenarios as e2e ---
const TS = [
  {
    id: 'TS-1',
    scenario: 'Canary mutation control fires (e2e, live venture)',
    type: 'e2e',
    expected: 'A UAT run seeded with a deliberately-broken canary journey, executed against the live AltifyAI venture (not a mocked transport), fails the overall run on that journey while real journeys pass -- run must NOT be scorable as UNEXPLAINED_RED (i.e. real journeys must independently be proven reachable, not all failing for the same reason as the canary)'
  },
  {
    id: 'TS-2',
    scenario: 'Run-unique evidence + deployment binding (e2e, live venture)',
    type: 'e2e',
    expected: 'CORRECTED: two consecutive runs produce artifact hashes that differ ONLY when substantive fields (executed results, deployment sha, nonce value) differ -- pack_id and generated_at are EXCLUDED from the hash-uniqueness comparison, since manifest-generator.js otherwise makes uniqueness trivially satisfiable by timestamp/random-id alone. A POSITIVE control also confirms identical substantive inputs (same results, same sha) yield an identical hash when pack_id/generated_at are excluded. Deployment sha is corroborated against the venture repo\'s actual head_sha, not merely "most recent completed run on default branch" (synthetic-actor-guard.js:68-72\'s existing inference is insufficient alone)'
  },
  {
    id: 'TS-3',
    scenario: 'Signed-out journey walked via a real stepOverride',
    type: 'integration',
    expected: 'A signed-out persona journey against AltifyAI executes via an explicit stepOverride and records a completed (non-thrown) result'
  },
  {
    id: 'TS-4',
    scenario: 'Binding enforcement blocks advancement (e2e, live venture)',
    type: 'e2e',
    expected: 'With the feature flag enabled, a failing live UAT run against AltifyAI sets advanced:false for the target stage transition, and the failure reason is the UAT verdict itself -- NOT an unrelated fail-closed condition such as a missing LEO_ALTIFYAI_UAT_READ_TOKEN or missing VENTURE_UAT_TEST_ACCOUNT credentials (those must be present and verified before this scenario is considered to demonstrate the FR)'
  },
  {
    id: 'TS-5',
    scenario: 'Venture-vs-factory classification',
    type: 'unit',
    expected: 'Failures are classified using the existing GAP_CLASS taxonomy (factory side) plus the new venture-defect category/classification introduced by FR-4, and routed accordingly, with an N-failure ceiling escalating to a root-fix SD'
  },
  {
    id: 'TS-6',
    scenario: 'Negative control -- clean run must not false-positive',
    type: 'integration',
    expected: 'A UAT run with no seeded defects and no broken canary produces overall PASS and creates ZERO factory-defect or venture-defect records -- proves the control pack does not fire on a genuinely clean run (a pack hardwired to always report FAIL would pass every other scenario in this list but fail this one)'
  },
  {
    id: 'TS-7',
    scenario: 'Manifest-coverage / renamed-journey guard',
    type: 'integration',
    expected: 'A minimum-assertion manifest entry referencing a journey_id/label that does NOT match any executed journey (e.g. because the journey was renamed or regenerated, per venture-step-executors.js\'s known per-run step_id/journey_id regeneration) causes the run to FAIL rather than silently skip that manifest entry as satisfied-by-absence'
  },
  {
    id: 'TS-8',
    scenario: 'Anti-mock guard -- stubbed transport is refused',
    type: 'integration',
    expected: 'Attempting to complete a session with a null/placeholder deployment sha or a nonce that was not actually echoed back from the live origin causes the run to FAIL closed, rather than accepting a stubbed/mocked transport as evidence of a live-app exercise'
  }
];

// --- risks: add the environmental-blocker + fixture-corpus risks ---
const newRisks = [
  ...prd.risks,
  {
    risk: 'Environmental blockers (LEO_ALTIFYAI_UAT_READ_TOKEN and VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_* credentials are not currently set) would cause FR-1\'s demo to show advanced:false for reason=synthetic_actor_fencing_unmet (a missing-token fail-closed) rather than for an actual failing UAT verdict -- a false PASS of FR-1\'s acceptance criterion for the wrong reason',
    severity: 'high',
    mitigation: 'Provision and verify both credential sets BEFORE running the FR-1/TS-1/TS-4 demo; explicitly confirm the block reason in the recorded evidence is the UAT verdict, not a credential/token failure'
  },
  {
    risk: 'tests/e2e/templates/venture-smoke.template.ts (listed as a reuse asset) currently contains 9 test.skip() calls (including one that aborts the whole happy-path on first 401), tests that assert nothing when a DOM element is absent, and 2 unconditionally-true tautologies (expect(count).toBeGreaterThanOrEqual(0)) -- reusing it as-is would import the exact blind-guard failure mode this SD exists to eliminate',
    severity: 'high',
    mitigation: 'Do NOT reuse venture-smoke.template.ts as a passing test asset. Invert it into the fixture corpus that the new control pack (FR-2) must be proven to CATCH failing -- i.e. it becomes a negative test fixture, not a reused passing implementation'
  },
  {
    risk: 'lib/agents/testing-agent/quality-analyzer.js\'s assertion-density check counts assertions via regex over file SOURCE TEXT, not executed assertions -- it reads identically whether a test ran or was skipped, so it cannot alone satisfy FR-2(i)\'s per-journey minimum-EXECUTED-assertion manifest',
    severity: 'medium',
    mitigation: 'FR-2(i)\'s manifest check must count assertions actually executed at runtime (e.g. via the test/UAT run\'s own result recording), using quality-analyzer.js only as a secondary/static cross-check, never as the sole enforcement mechanism'
  }
];

// --- technical_requirements: add scope-correction TRs ---
const newTRs = [
  ...prd.technical_requirements,
  {
    id: 'TR-4',
    title: 'Venture-defect classification is new work, not reuse',
    description: 'GAP_CLASS (lib/eva/findings/gap-class.js) is factory-defect-only by ratified design (8 fixed values, test-pinned). FR-4\'s venture-defect side requires either a new ratified GAP_CLASS category or a separate minimal venture-defect classification -- do not assume the existing taxonomy already covers it.'
  },
  {
    id: 'TR-5',
    title: 'AltifyAI-scoped for this child; multi-venture generalization out of scope',
    description: 'FR-3\'s signed-out stepOverrides and the /register + Clerk-specific sign-in string are built and proven against AltifyAI only. Generalizing the fallback executor to work across ventures without explicit stepOverrides is explicitly out of scope for this child.'
  }
];

const updatedMetadata = {
  ...prd.metadata,
  testing_gate_correction: {
    corrected_at: new Date().toISOString(),
    testing_evidence_row: '00ebf55d-1894-49f8-bd2b-5304c3280053',
    gaps_fixed: ['FR-3_factual_correction', 'FR-4_gap_class_scope_correction', 'TS-2_unfalsifiability_fixed', 'TS-6_negative_control_added', 'TS-7_manifest_coverage_added', 'TS-8_anti_mock_guard_added', 'e2e_scenarios_added', 'venture_smoke_template_reclassified_as_fixture', 'environmental_blocker_risk_added']
  }
};

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: frs,
    test_scenarios: TS,
    risks: newRisks,
    technical_requirements: newTRs,
    metadata: updatedMetadata
  })
  .eq('id', PRD_ID);
if (updateErr) { console.error('UPDATE_ERR', updateErr.message); process.exit(1); }
console.log('PRD_CORRECTED=true');
