import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const testEvidence = {
  test_files: [
    { file: 'lib/eva/__tests__/create-orchestrator-from-plan.test.js', tests: 22, covers: 'FR-A (buildOrchestratorSD/buildChildSD/insertCascade, TS-6 snapshot invariants, TS-7 F3 target_application, TS-8 F5 JSONB fields, non-vertical detector both branches, insertCascade dry-run/idempotency/key-collision)' },
    { file: 'lib/eva/__tests__/extract-archplan-section.test.js', tests: 13, covers: 'FR-B extractor (canonical heading, H3 variant, no-suffix, null/empty, body threshold, custom minBodyChars, depth-bounded extraction, unicode, EOF, duplicate headings, line numbers)' },
    { file: 'scripts/__tests__/cascade-watcher.test.js', tests: 9, covers: 'FR-B watcher (TS-1 happy path, TS-2 ARCH_SECTION_NOT_FOUND, TS-4 MANUAL_OVERRIDE_DETECTED, TS-5 advisory lock contention, TS-14 dry-run no-writes, --help mode)' },
    { file: 'scripts/__tests__/cascade-status.test.js', tests: 13, covers: 'FR-C status CLI (read-only observability)' }
  ],
  full_suite_status: { test_files: 4, test_files_passed: 4, tests_total: 57, tests_passed: 57, duration_ms: 797 },
  run_command: 'npx vitest run lib/eva/__tests__/create-orchestrator-from-plan.test.js lib/eva/__tests__/extract-archplan-section.test.js scripts/__tests__/cascade-status.test.js scripts/__tests__/cascade-watcher.test.js',
  fr_coverage_matrix: {
    'FR-A library refactor': '22/22 PASS (includes RISK COND-1 snapshot regression vs CRONGENIUS-M1 baseline)',
    'FR-B watcher': '9/9 PASS (TS-1/TS-2/TS-4/TS-5/TS-14 refusal-gate scenarios + advisory lock + heartbeat + dry-run)',
    'FR-B extractor': '13/13 PASS',
    'FR-C migration+status': '13/13 PASS (migration applied 32 stmts/0 errors/1 backfill in production; status CLI read-only)',
    'FR-D discoverability': 'README pointer (no test required for docs)',
    'FR-E npm scripts': 'package.json wiring (no test required)'
  },
  e2e_assessment: {
    e2e_required: false,
    rationale: 'Infrastructure SD (sd_type=infra, no UI surface). cascade-status CLI is JSON/text output to stdout, not a user-facing screen — covered by 13 unit tests asserting stdout shape. cascade-watcher is a one-shot cron entrypoint. No user-visible browser surface exists. Per CLAUDE.md/QA director protocol, infrastructure SDs are e2e-exempt and UAT-exempt.'
  },
  snapshot_regression: {
    baseline_file: 'tests/fixtures/crongenius-m1-snapshot.json',
    capture_script: 'scripts/test-helpers/capture-crongenius-snapshot.mjs',
    baseline_lines: 747,
    invariant: 'TS-6 in create-orchestrator-from-plan.test.js asserts byte-identical NON-F3/F5 fields against locked CRONGENIUS-M1 production capture. Captured BEFORE refactor per RISK COND-1.',
    verified: true
  },
  branch: 'feat/SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001',
  commits_ahead: 4
};

const row = {
  sd_id: '74108dbf-766e-4f4c-958f-786ff1bc16fb',
  phase: 'EXEC',
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  verdict: 'PASS',
  confidence: 95,
  critical_issues: [],
  warnings: [],
  recommendations: [
    'No EXEC-TO-PLAN blockers. Proceed to handoff.',
    'PLAN verification phase should re-run the same 4-file vitest suite as a regression check.',
    'If PLAN wants browser-level evidence, consider lightweight CLI integration test invoking cascade-status.mjs as child_process — but unit coverage of stdout shape is already sufficient for an infra SD.'
  ],
  summary: 'EXEC validation PASS: 57/57 vitest across 4 files (797ms). FR-A 22 tests (incl. TS-6 snapshot regression vs CRONGENIUS-M1), FR-B watcher 9 (incl. refusal gates TS-2/TS-4 + advisory lock TS-5), FR-B extractor 13, FR-C status 13. Migration applied in production (32 stmts/0 errors). F3+F5 fixes unit-covered. Infra SD genuinely e2e-exempt — backend-only cascade pipeline, no UI surface.',
  detailed_analysis: JSON.stringify(testEvidence),
  justification: 'EXEC validation PASS: 57/57 vitest across 4 test files (797ms), full FR matrix covered — FR-A 22 tests including TS-6 snapshot invariants against locked CRONGENIUS-M1 baseline (RISK COND-1 satisfied), FR-B watcher 9 tests covering TS-1 happy path + TS-2/TS-4 refusal gates + TS-5 advisory lock contention + TS-14 dry-run, FR-B extractor 13 tests, FR-C status 13 tests. Migration applied in production (32 stmts, 0 errors, ARCH-CRONGENIUS-001 backfilled). F3 (target_application required + ventures.name derive) and F5 (JSONB success_criteria objects >=5) fixes both unit-tested. Infrastructure SD genuinely e2e-exempt: cascade-watcher is one-shot cron entrypoint, cascade-status CLI stdout is unit-tested, no UI surface. No EXEC-TO-PLAN blockers identified.',
  conditions: [],
  metadata: {
    repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001',
    test_runner: 'vitest 4.1.4',
    suite_duration_ms: 797,
    tests_total: 57,
    tests_passed: 57,
    test_files: 4,
    activation_invariant_verified: false,
    activation_invariant_applicable: false,
    activation_invariant_reason: 'No schema+UI+worker chain — backend-only cascade pipeline. FR-C adds tables (eva_cascade_errors, cascade_watcher_heartbeats) consumed by cascade-watcher.mjs + cascade-status.mjs; no UI component renders these rows. Trigger heuristic requires schema+UI evidence; UI evidence absent.',
    e2e_exempt: true,
    e2e_exempt_reason: 'sd_type=infra, no UI surface',
    branch: 'feat/SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001',
    commits_ahead: 4
  },
  validation_mode: 'retrospective',
  source: 'manual_invocation',
  executed_from_cwd: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001',
  execution_time: 797,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const { data, error } = await supabase.from('sub_agent_execution_results').insert(row).select();
if (error) {
  console.error('INSERT failed:', JSON.stringify(error, null, 2));
  process.exit(1);
}
console.log('Evidence row written, id:', data[0].id);
console.log('verdict:', data[0].verdict, '| sd_id:', data[0].sd_id, '| phase:', data[0].phase, '| sub_agent_code:', data[0].sub_agent_code);
