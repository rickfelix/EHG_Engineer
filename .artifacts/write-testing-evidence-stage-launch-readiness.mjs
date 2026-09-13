import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_KEY = 'SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001';
const RESULTS_FILE = '.artifacts/testing-evidence-SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001-exec.json';
const RESULTS_SHA256 = '7902f493233a315228de5153bb5d76d211aee9c56c62d710337ed0894505f857';

const supabase = createSupabaseServiceClient();
const { data: sd } = await supabase.from('strategic_directives_v2')
  .select('id, sd_key, target_application').eq('sd_key', SD_KEY).single();

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application,
  subAgentCode: 'TESTING',
  probeExistsRelative: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
  supabase,
});

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary: 'EXEC-phase TESTING review of SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 (FR-1/2/4/5/6/7; FR-3 HELD). Full tests/unit/eva suite: 8075 tests, 7992 passed, 0 failed, 83 skipped; 1 suite-level failure (path-integrity-flags-live-defaults.db.test.js) is pre-existing and environmental (DB_TIER_BLOCKED, file untouched by this branch, needs VITEST_DB_ALLOW_REF). New and changed coverage genuinely exercises the changed paths, including negative cases. No existing test was weakened. FR-3 HELD status verified intact.',
  justification: 'CONDITIONAL_PASS rather than PASS: all acceptance-criteria-bearing tests pass and the FR-7 live dry-run artifact independently corroborates FR-1 against the real AltifyAI venture (code_quality warn, marketing 8 assets, distribution deploy_ready_not_deployed, legal fail) - measured behavior, not happy-path theater. Five non-blocking gaps remain: (1) FR-2 try/catch throw branch in stage-23-dedicated-venture-uat.js has zero coverage; (2) FR-4 emitFeedback-throws branch (routed:false) has zero coverage; (3) TS-5 specifies stage range 1-26 but the implemented guard covers 2-26 (stage 1 unreachable via the targetStage>1 guard - defensible, undocumented deviation); (4) the FR-7 dry-run guard is a single-table allowlist (blocks only eva_orchestration_events), so it silently stops being read-only if the analyzer ever gains another write - deny-by-default would fail safe; (5) FR-6 migration SQL is well-formed and idempotent but NOT YET APPLIED, so FR-6 AC-2 (two tables in agreement) is unverified live.',
  findings: [
    { severity: 'info', category: 'test_execution', finding: 'tests/unit/eva: 8075 tests / 7992 passed / 0 failed / 83 skipped. 1 pre-existing environmental suite failure (DB_TIER_BLOCKED) unrelated to this changeset.' },
    { severity: 'info', category: 'test_integrity', finding: 'No existing test was weakened. The 4 modified test files migrate fixtures from the removed stage20Data/stage21Data/stage22Data params to artifact_data keyed by artifact_type; all prior assertions (readiness_pct 83, total_categories 6, verdict READY/HOLD) are preserved. The stage-23-launch-readiness-fr1-4-6.test.js HOLD case was STRENGTHENED (legalDocsPresent forced true so code_quality is the isolated cause, plus a new explicit per-entry status assertion).' },
    { severity: 'info', category: 'scope_compliance', finding: 'FR-3 HELD verified: zero writes to venture_stages.required_artifacts anywhere in the changeset, and no new stage-25-entry-condition code path. The only required_artifacts write is the FR-6 migration into the LEGACY MIRROR table stage_artifact_requirements. TS-7 satisfied.' },
    { severity: 'medium', category: 'blast_radius', finding: 'FR-5 is not scope-neutral: importing the canonical CROSS_STAGE_DEPS changes validateContracts requiredStages for roughly 24 of 27 stages (e.g. stage 4 goes [3] to [1,3]; stage 24 goes [23] to [1,21,22,23]). This is the PRD-intended fix, but it makes contract validation STRICTER pipeline-wide, not just at stage 24. The new regression guard pins the wiring; it does not establish that live ventures still pass the widened deps. Recommend PLAN confirm no in-flight venture regresses.' },
    { severity: 'low', category: 'coverage_gap', finding: 'FR-2 defensive try/catch in stage-23-dedicated-venture-uat.js (legalDocsResult = {ok:false, reason:"threw"}) has no test. One mockRejectedValue case would close it.' },
    { severity: 'low', category: 'coverage_gap', finding: 'FR-4 routeGateOutcome harness_backlog error branch (emitFeedback throws, returns {routed:false, path:"harness_backlog", error}) has no test, and neither does the empty/undefined reasons array guard.' },
    { severity: 'low', category: 'test_infrastructure', finding: 'lib/eva/gate-failure-recovery.js is the module FR-4 changes, and its own primary suite tests/unit/eva/gate-failure-recovery.test.js is QUARANTINED (tests/quarantine-manifest.json:669) and excluded from the unit project. The FR-4 change therefore has no regression coverage from the module pre-existing suite - only from the two new files. EXEC correctly worked around this and documented it in a file header; flagging so PLAN knows the safety net is thinner than the pass rate implies.' },
    { severity: 'low', category: 'fail_safe_design', finding: 'scripts/eva/dry-run-stage24-checklist.mjs withReadOnlyEventsGuard is an allowlist keyed on the single table name eva_orchestration_events. Any future write the analyzer gains passes straight through to the real service-role client and the run is no longer read-only, silently. A deny-by-default proxy (block insert/update/upsert/delete on every table) fails safe instead.' },
    { severity: 'low', category: 'consistency', finding: 'The FR-7 CLI calls createClient(...) directly from @supabase/supabase-js rather than the repo-canonical createSupabaseServiceClient from lib/supabase-client.js, so it carries none of the shared client DB-tier guards and can be pointed at production. Read-only mitigates the risk but the inconsistency is real.' },
    { severity: 'low', category: 'ac_deviation', finding: 'FR-5 AC-2 / TS-5 specify "every stage 1-26"; the implemented guard loops 2-26. Stage 1 is structurally unreachable through the requiredStages fallback (guarded by targetStage > 1), so the deviation is correct but undocumented in the test.' },
    { severity: 'low', category: 'stale_artifact', finding: 'UPSTREAM_REQUIREMENTS stage labels are inverted post-resequence (declares stage 21 to visual_*, stage 22 to distribution_*, while the 21/22 swap made Distribution 21 and Visual 22). Pre-existing, and only read for the stage_skipped event payload - not for the 3 categories FR-1 fixed - so FR-1 AC-5 is still literally satisfied. Diagnostic-only inaccuracy.' },
    { severity: 'low', category: 'behavior_note', finding: 'FR-4 redirects the escalation destination but does NOT change outcome: attemptGateRecovery still calls markKilledAtGate unconditionally on critical severity, so the venture is still killed at the gate - only the record moves from chairman_decisions to harness_backlog. The FR-7 regression test asserts recovery.killed === true, so this is known and pinned, not an oversight. Noting it because a harness_backlog row has no route back to unblock the venture.' },
    { severity: 'low', category: 'branch_hygiene', finding: 'Branch base is stale: merge-base 3ec19e2 vs main tip b659d12. A two-dot diff main..HEAD shows 39 files (including unrelated reverts); the true changeset is the 18-file three-dot diff. Rebase before PR so reviewers and CI see only this SD changes.' },
    { severity: 'info', category: 'lint', finding: 'npx eslint on lib/eva/contract-validator.js reports 3 no-unused-vars errors (ensureOutputSchema, extractOutputSchema, stageNumber). Verified identical on main - pre-existing, not introduced. The flat-config lint run is not wired into blocking CI, so this is informational.' }
  ],
  recommendations: [
    'Optional before PLAN accepts: add the two missing negative-branch tests (FR-2 producer-throws, FR-4 emitFeedback-throws) - roughly 20 LOC total.',
    'PLAN should explicitly accept FR-5 pipeline-wide widening of contract validation, or scope it to stage 24 only.',
    'Harden withReadOnlyEventsGuard to deny-by-default before anyone runs the dry-run CLI against a production venture again.',
    'Apply the FR-6 migration and re-run node scripts/validate-stage-contract-connectivity.mjs to close FR-6 AC-2 with live evidence.',
    'Rebase onto current main before opening the PR.'
  ],
  metadata: {
    phase: 'EXEC',
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001',
    merge_base: '3ec19e2d7a7345a319a14da95e8df620206af108',
    commits_reviewed: ['fc76042f016', '57af60009d6', '854284c3d0c', 'e30b8abfec2'],
    test_command: 'npx vitest run tests/unit/eva --reporter=json',
    results_file: RESULTS_FILE,
    results_file_sha256: RESULTS_SHA256,
    tests_total: 8075,
    tests_passed: 7992,
    tests_failed: 0,
    tests_skipped: 83,
    pass_rate_pct: 100,
    preexisting_suite_failures: ['tests/unit/eva/path-integrity-flags-live-defaults.db.test.js (DB_TIER_BLOCKED, environmental)'],
    frs_reviewed: ['FR-1', 'FR-2', 'FR-4', 'FR-5', 'FR-6', 'FR-7'],
    frs_held_verified: ['FR-3'],
    reviewer_model: 'claude-opus-5[1m]',
    test_execution: buildTestExecution({
      executed: 8075,
      passed: 7992,
      failed: 0,
      skipped: 83,
      artifactSha: RESULTS_SHA256,
      runner: 'vitest',
      artifactPath: RESULTS_FILE,
      source: 'measured'
    })
  },
  execution_time_ms: 0
};

applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('TESTING', sd.id, { code: 'TESTING', name: 'QA Engineering Director' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
console.log('STORED:', JSON.stringify(stored));
console.log('FINAL VERDICT:', results.verdict, '| repo_path:', results.metadata.repo_path, '| repo_resolved:', results.metadata.repo_resolved);
