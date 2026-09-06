import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A';
const WT = process.cwd();

// Provenance: hash of the RUNNER-WRITTEN vitest json results file (not hand-authored prose).
const artifactRelPath = '.artifacts/testing-record-truth-001A-plan.json';
const artifactPath = `${WT}/${artifactRelPath}`;
const buf = fs.readFileSync(artifactPath);
const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
const runnerJson = JSON.parse(buf);
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WT, encoding: 'utf8' }).trim();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 92,
  phase: 'PLAN',
  summary: 'PLAN-TO-EXEC TESTING analysis for the claim_sd() RETURNING-ordering fix (database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql). Ran tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js via vitest --reporter=json: 12/12 hermetic source-assertion tests pass, 0 failed, 0 skipped. Covers PRD TS-1 (SELECT-before-UPDATE capture ordering asserted by index position + a negative regression assertion that RETURNING sd_key INTO v_evicted_sd_key no longer appears on the claim-switch statement itself), TS-2 (a dedicated test loads the PRE-FIX migration 20260712_claim_sd_claim_switch_clobber_guard.sql and asserts the same regression check genuinely FAILS against it, proving the guard discriminates rather than vacuously passing), TS-3 (asserts the INSERT INTO session_lifecycle_events with event_type=CLAIM_SWITCH_EVICTED_CLEARED and evicted_sd_key metadata inside the v_evicted_sd_key IS NOT NULL block), and TS-4 (dedicated tests assert every pre-existing guard survived byte-for-byte: phantom_session, sd_terminal_status, claimed_by_live_peer, claimed_by_silenced_peer, blocking_conflict, the QF live-foreign-peer guard + started_at COALESCE stamp, and claim_gate_client_version). TS-5 (production e2e smoke test) and TS-6 (overload-count guard) are correctly out of scope for this pre-deploy hermetic unit-test file: TS-5 requires a live post-deploy claim-switch and is covered by the SD\'s documented smoke_test_steps instead, and TS-6 is enforced by the migration\'s own DO $$ block (`SELECT count(*) FROM pg_proc WHERE proname = \'claim_sd\'`) at apply-time, not by vitest. Both are expected/acceptable gaps in this file, not coverage defects. Breadth search across tests/ found ~45 other files referencing claim_sd/claim-switch generally (guard-specific unit/integration/e2e suites for phantom-session, terminal-status, live-peer, silenced-peer, gate-version, etc.) but grep for the bug-specific tokens (RETURNING sd_key, v_evicted_sd_key, CLAIM_SWITCH_EVICTED_CLEARED) returns ONLY this one test file -- no stale or conflicting test elsewhere asserts the old (buggy) RETURNING pattern or duplicates this fix\'s assertions.',
  critical_issues: [],
  warnings: [],
  recommendations: [
    'Post-deploy: run the SD\'s documented smoke_test_steps to confirm a real claim-switch populates session_lifecycle_events with CLAIM_SWITCH_EVICTED_CLEARED (TS-5, not automatable pre-deploy).',
  ],
  detailed_analysis: {
    test_run: {
      command: 'npx vitest run tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js --reporter=json --outputFile=.artifacts/testing-record-truth-001A-plan.json',
      result: `${runnerJson.numPassedTests} passed / ${runnerJson.numFailedTests} failed / ${runnerJson.numPendingTests} skipped (numTotalTests=${runnerJson.numTotalTests})`,
    },
    prd_scenario_coverage: {
      'TS-1': 'covered — SELECT-before-UPDATE ordering assertion + RETURNING-absence negative assertion on the claim-switch statement',
      'TS-2': 'covered — dedicated negative-proof test fails against the pre-fix migration text',
      'TS-3': 'covered — session_lifecycle_events INSERT with CLAIM_SWITCH_EVICTED_CLEARED asserted',
      'TS-4': 'covered — phantom-session, terminal-status, live-peer (SD+QF), silenced-peer, blocking-conflict, claim_gate_client_version, started_at stamp all asserted preserved',
      'TS-5': 'out of scope for this file (production e2e smoke test, manual post-deploy per SD smoke_test_steps) — expected, not a gap',
      'TS-6': 'out of scope for this file (migration DO $$ block overload-count guard, not a vitest test) — expected, not a gap',
    },
    conflicting_test_scan: 'grep for RETURNING sd_key|v_evicted_sd_key|CLAIM_SWITCH_EVICTED_CLEARED across tests/ returns only tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js — no stale/conflicting test found',
  },
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: runnerJson.numTotalTests,
      passed: runnerJson.numPassedTests,
      failed: runnerJson.numFailedTests,
      skipped: runnerJson.numPendingTests,
      artifactSha: contentHash,
      runner: 'vitest@4.1.4 --reporter=json',
      artifactPath: artifactRelPath,
      source: 'fresh',
    }),
    evidence_provenance: {
      producer: 'vitest v4.1.4 --reporter=json (runner-written, not hand-authored)',
      artifact_path: artifactRelPath,
      content_sha256: contentHash,
      run_commit_sha: headSha,
      num_total_tests: runnerJson.numTotalTests,
      num_passed_tests: runnerJson.numPassedTests,
      num_failed_tests: runnerJson.numFailedTests,
      runner_success: runnerJson.success,
    },
    test_file: 'tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js',
    migration_under_test: 'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql',
    unit_tests_passed: true,
    e2e_applicable: false,
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
