import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { resolveSubAgentRepo, applySubAgentRepoVerdict } = await import('../lib/sub-agents/resolve-repo.js');
const { storeSubAgentResults } = await import('../lib/sub-agent-executor/results-storage.js');
const { buildTestExecution } = await import('../lib/sub-agents/testing/test-execution-record.js');

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';
const { data: sd } = await sb.from('strategic_directives_v2').select('id,sd_key,target_application').eq('sd_key', SD_KEY).single();
const { data: subAgent } = await sb.from('leo_sub_agents').select('*').eq('code', 'TESTING').single();

const hash = (p) => ({ file: p, sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'), bytes: fs.statSync(p).size });
const runnerFiles = [hash('.artifacts/testing-run/full-unit.json'), hash('.artifacts/testing-run/targeted.json')];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,

  execution_time_ms: 0,
  summary: 'Full unit sweep 50938/51152 pass (3 failures proven environmental flakes, 0 branch regressions). Targeted sweep of all affected areas 2044/2044 pass. Core SD objective LIVE-PROVEN: assertOutreachAuthorized() refuses the two real below-go-live ventures (AltifyAI S23/simulated, ApexNiche AI S21/simulated) against production rows. CONDITIONAL on 3 findings: (1) the chairman-override escape hatch is dead by construction (chairman_decisions.override_key missing, migration 20260825 never applied) and FR-2 AC-4 passes green only because the unit mock fabricates the absent column; (2) TS-5 / FR-4 AC-2+AC-3 have zero coverage, the mock/real ledger discriminator is entirely inert; (3) publisher/index.js mode producer contract is untested while its consumers are tested.',
  conditions: [
    'HIGH: chairman_decisions.override_key does not exist in the live schema (verified: 817 rows, 37 columns, column absent; quick_fixes.venture_id also absent, so migration database/migrations/20260825_stage_gate_predicate_additive_columns.sql from SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 was never applied). hasActiveOverride() therefore errors and returns false on EVERY call. Direction is fail-closed (refuses more, never wrongly authorizes) and zero stage_gate_override rows exist, so this is NOT a live security hole. But FR-2 names the override the sole chairman touchpoint for this gate, making a dead path load-bearing, and FR-2 AC-4 (a chairman override authorizes mode:live) is unachievable in production. PLAN must either apply the 20260825 migration or restate FR-2 AC-4 as deferred.',
    'MEDIUM: TS-5 and FR-4 AC-2/AC-3 are uncovered. evaluateGraduation() was not modified by this SD; venture_channel_publish_ledger.execution_mode is not applied (verified missing); recordPublishOutcome() still has zero production callers; all 3 live ledger rows sit at outcome=unknown. No mixed-fixture test (older real shipped_clean rows plus newer mock rows) exists. This matches the PRD FR-4 sequencing note (land the discriminator with FR-3 recordPublishOutcome wiring) but that wiring did not land either, so the discriminator is inert end to end.',
    'MEDIUM: publisher/index.js mode propagation (FR-3 AC-2 and AC-3) has no direct assertion. Consumers (content-pipeline.js, owned-audience-content-loop.js) ARE tested for mode:real gating, but the producer is not: publisher.test.js only updates its venture fixture to the authorized shape and never asserts result.mode. A regression hardcoding mode:real on the credential-dry-run path would reopen the exact mock-laundering vector this SD exists to close, with no failing test.',
    'LOW: FR-4 and FR-5 DB artifacts are written and dry-run-proven but NOT applied (chairman-gated, by design). The outbound-ledger trigger (SD acceptance criterion 3, all 5 mirror sites independently refuse) provides zero runtime enforcement today: 4 of 5 mirror sites are live, the DB trigger is not.',
    'INFO: the integration tier cannot execute in this environment (vitest db project, SD-LEO-INFRA-VITEST-TIER-REAL-001 designated-target gate): 28 suites fail at collection, 1452 tests skipped, 0 executed, pre-existing and unrelated to this branch. TS-1, TS-2 and TS-6 are declared test_type=integration but are proven only at the mocked-unit level.'
  ],
  justification: 'CONDITIONAL_PASS rather than PASS because three PRD acceptance criteria are not met by the shipped code (FR-2 AC-4 unachievable against the live schema, FR-4 AC-2/AC-3 uncovered and inert, FR-3 AC-2/AC-3 unasserted), and rather than FAIL because the SD delivers its core objective with zero regressions and live production proof. The fail-closed refusal path, the entire point of the SD, is verified against real production venture rows and not only mocks: AltifyAI (S23, simulated) and ApexNiche AI (S21, simulated) both return authorized=false/mode=mock, and shouldEnforceBlock() returns true for both. Unit coverage of the shipped paths is genuinely strong (14 new assertOutreachAuthorized tests, 5 non-quarantinable paired CI controls whose fixtures match the live venture shapes exactly, 3 new sendEmail gating tests, 2 new mode-consumption tests). Every finding above is a gap in an UNSHIPPED or UNAPPLIED part of the design, not a defect in shipped behavior.',
  findings: {
    full_unit_sweep: { total: 51152, passed: 50938, failed: 3, pending: 209, suites_total: 17266, suites_failed: 4 },
    targeted_sweep: { scope: 'tests/unit/governance, tests/unit/marketing, tests/unit/email-campaigns-db.test.js, lib/creative/asset-view-gate.test.js', total: 2056, passed: 2044, failed: 0, pending: 12 },
    flake_adjudication: {
      files: ['tests/unit/eva/complexity-scorer.test.js', 'scripts/modules/shipping/__tests__/post-merge-worktree-cleanup-claim-protect.test.js'],
      verdict: 'environmental, not branch-caused',
      evidence: 'neither file is in git diff main...HEAD; neither transitively imports any changed module; both PASS in isolation in the worktree (23/23) AND on main in the shared root (23/23). Failures appear only under the 51k-test parallel run with a bare STACK_TRACE_ERROR (timeout shape) on two suites that take 6-10s each.'
    },
    live_probe: {
      method: 'assertOutreachAuthorized() + checkStageGate(armed:true) + shouldEnforceBlock() invoked against real production venture rows with a synthetic actorId (cannot collide with any real override row)',
      AltifyAI: { stage: 23, launch_mode: 'simulated', status: 'active', is_demo: false, authorized: false, mode: 'mock', reason: 'below_stage', shouldEnforceBlock: true },
      ApexNicheAI: { stage: 21, launch_mode: 'simulated', status: 'active', is_demo: false, authorized: false, mode: 'mock', reason: 'below_stage', shouldEnforceBlock: true },
      live_authorized_ventures_in_prod: 0,
      note: 'zero ventures currently satisfy the positive predicate, so the mode:live path has no production instance and is exercised only by fixtures'
    },
    dead_code_path: {
      symptom: 'stage-gate-predicate override atomic-claim update failed: column chairman_decisions.override_key does not exist',
      emitted_on: 'every assertOutreachAuthorized() / checkStageGate() call that reaches the override lookup',
      why_tests_miss_it: 'the unit mocks implement .eq() as an arg-ignoring passthrough, so a column that does not exist is indistinguishable from one that does',
      also_affects: 'lib/creative/asset-view-gate.js uses the same chairman_decisions.override_key pattern (its own test file documents the column as pending migration apply)'
    },
    test_scenario_coverage: {
      'TS-1': 'PARTIAL - publisher.test.js fixture updated to the authorized shape; no assertion on result.mode===real; integration tier inert',
      'TS-2': 'PARTIAL - autonomy-gate.test.js and honesty-invariants.test.js prove refusal before the autonomy_state/ledger logic; integration tier inert',
      'TS-3': 'COVERED - stage-gate-predicate.test.js FR-2 plus FR-2 is_demo regression; paired-controls FR-2 launch_mode control',
      'TS-4': 'COVERED - new negative tests in content-pipeline-budget.test.js and owned-audience-content-loop.test.js',
      'TS-5': 'NOT COVERED - no mixed-fixture graduation-streak test; discriminator inert',
      'TS-6': 'COVERED at unit level - 3 new sendEmail tests (throws without ventureId, refuses below-go-live with zero Resend calls, sends when authorized)',
      'TS-7': 'COVERED - pre-existing flag-missing fail-safe tests; now moot for the outreach path since armed is forced true'
    },
    sd_acceptance_criteria: {
      'AC-1 shouldEnforceBlock true for live AltifyAI': 'MET (live-probed true); note STAGE_GATE_PREDICATE_ARMED remains is_enabled=false, but the outreach path no longer reads the flag',
      'AC-2 mock never counted real and never in streak': 'HALF MET - never counted real is tested; never in streak is inert and untested',
      'AC-3 all 5 mirror sites refuse': '4 of 5 - DB trigger written but not applied',
      'AC-4 green CI negative job covering AltifyAI and ApexNiche': 'MET - non-quarantinable paired controls, fixtures match live shapes exactly',
      'AC-5 FR-7 obligation and Part B SD': 'PARTIAL - Part B SD exists (SD-LEO-INFRA-DEMAND-ENGINE-PART-001, draft); the two HIGH_CONSEQUENCE flags remain is_enabled=true and undischarged, but arming was correctly not performed'
    },
    verified_db_state: {
      'leo_feature_flags.STAGE_GATE_PREDICATE_ARMED': 'exists, is_enabled=false (correct, arming gated on FR-7)',
      'venture_channel_publish_ledger.execution_mode': 'NOT APPLIED (column missing)',
      'chairman_decisions.override_key': 'NOT APPLIED (column missing)',
      'quick_fixes.venture_id': 'NOT APPLIED (column missing)',
      'Part B SD': 'SD-LEO-INFRA-DEMAND-ENGINE-PART-001 (draft) exists'
    }
  },
  metadata: {
    evidence_provenance: {
      producer: 'vitest 4.1.4 --project unit, runner-written JSON reporter output',
      runner_files: runnerFiles,
      run_cwd: process.cwd(),
      branch: 'feat/SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001',
      head_commit: '21b794eec2f',
      baseline_ref: 'main @ 2c5794c6b38 (shared root, used for the flake baseline measurement)'
    },
    commands_run: [
      'npx vitest run tests/unit/governance tests/unit/marketing tests/unit/email-campaigns-db.test.js lib/creative/asset-view-gate.test.js',
      'npx vitest run --project unit (full sweep, 51152 tests)',
      'npx vitest run --project db tests/integration/ (tier inert: 0 executed)',
      'live probe of assertOutreachAuthorized/checkStageGate/shouldEnforceBlock against production venture rows'
    ]
  }
};

results.metadata.test_execution = buildTestExecution({
  executed: 51152,
  passed: 50938,
  failed: 3,
  skipped: 209,
  artifactSha: runnerFiles[0].sha256,
  runner: 'vitest@4.1.4 run --project unit',
  artifactPath: '.artifacts/testing-run/full-unit.json',
  source: 'sub_agent_code_path'
});
results.metadata.measured = true;

const resolution = await resolveSubAgentRepo({ sdId: sd.id, targetApplication: sd.target_application || 'EHG_Engineer', subAgentCode: 'TESTING', supabase: sb });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', sd.id, subAgent, results, { sdKey: SD_KEY, phase: 'EXEC' });
console.log('\nSTORED ROW: ' + JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase, sd_id: stored?.sd_id, repo: stored?.metadata?.repo_path }, null, 2));
