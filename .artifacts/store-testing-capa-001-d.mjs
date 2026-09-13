import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';

const SD_ID = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RESULTS_FILE = '.artifacts/testing-capa-001-d-results.json';
const raw = fs.readFileSync(new URL('./testing-capa-001-d-results.json', import.meta.url));
const contentHash = crypto.createHash('sha256').update(raw).digest('hex');
const j = JSON.parse(raw.toString());

const { data: sa } = await supabase.from('leo_sub_agents').select('*').eq('code', 'TESTING').maybeSingle();

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });
console.log('resolution:', JSON.stringify(resolution));

let results = {
  verdict: 'PASS',
  confidence: 88,
  execution_time_ms: 17370,
  summary: `Post-implementation TESTING for ${SD_ID}: runner-measured 1892/1904 passed, 0 failed, 12 skipped across 124 files (123 passed, 1 skipped). 3 SD-specific files: 70/70 passed. Wiring probed live: gauge registry entry enabled + tripWhen correct, gauge-runner resolver key present, CANDIDATE_GATE_STRINGS stage-15 entry {stage_number:15,gate_string:'design fidelity reviewed'} present, GATE_VERIFIERS entry present and resolveVerifier returns a function.`,
  recommendations: [
    'Add a registry<->runner resolver-map wiring test covering ALL enabled gauges (current parity test at gauge-registry.test.js:400 is scoped to only the 3 self-score ids); this SD is the CAPA for root-cause class B (producer/reader split with no wiring gate) and its own new gauge has no such guard.',
    "Assert the stage-15 CANDIDATE_GATE_STRINGS entry's stage_number explicitly; bind-criterion-checker.test.js:145 asserts groups.size === CANDIDATE_GATE_STRINGS.length, which is length-derived and self-adjusts to a wrong stage_number.",
    'The 3 SQL migrations have no automated test (idempotency / jsonb-merge-safety verified only by manual live probes). Consider a migration-parity or re-apply test for 20260913_stage15_design_fidelity_exit_observe.sql.',
    'CLI wrappers untested: scripts/eva/run-wireframe-fidelity-qa.mjs and scripts/gauges/experience-review-coverage-check.mjs runCheck() query shape (column names status/current_lifecycle_stage/venture_id are unverified by any test; a rename throws rather than false-clears, which is the safe direction).',
    "Executor's ventures query and the .in(venture_id, ...) lookup are unbounded (no explicit range) — currently safe at 56 ventures at stage>=20, but subject to the PostgREST 1000-row cap per SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001.",
  ],
  metadata: {
    test_execution: buildTestExecution({ executed: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, skipped: j.numPendingTests, artifactSha: contentHash, runner: 'vitest@4.1.4', artifactPath: RESULTS_FILE, source: 'measured', mappedCandidates: 4, foundFiles: j.numTotalTestSuites }),
    phase: 'EXEC-TO-PLAN',
    mode: 'post-implementation',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D',
    pr: 8913,
    commits: ['efb9afd5fb8', 'a3caa4b0b9c'],
    producer: 'vitest@4.1.4',
    run_command: 'npx vitest run tests/unit/eva/lifecycle/ tests/unit/governance/ tests/unit/eva/bind-criterion-checker.test.js tests/unit/eva/qa/stitch-wireframe-qa.test.js --reporter=json',
    results_file: RESULTS_FILE,
    content_hash: contentHash,
    test_totals: { total: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, skipped: j.numPendingTests, files_total: j.numTotalTestSuites, success: j.success },
    sd_specific_files: {
      'tests/unit/eva/lifecycle/exit-gate-verifiers-design-fidelity.test.js': 'passed',
      'tests/unit/governance/experience-review-coverage-guard.test.js': 'passed',
      'tests/unit/governance/gauge-registry.test.js': 'passed (pinned counts 42 total / 30 enabled)',
    },
    wiring_probe: {
      registry_entry_enabled: true,
      tripWhen_alarmed_true: true,
      tripWhen_alarmed_false: false,
      gauge_runner_resolver_key_present: true,
      candidate_gate_string: { stage_number: 15, gate_string: 'design fidelity reviewed' },
      gate_verifiers_entry_present: true,
      resolveVerifier_returns_function: true,
    },
    coverage_gaps: [
      'no registry<->gauge-runner resolver-map regression test for the new gauge',
      'stage-15 CANDIDATE_GATE_STRINGS entry not asserted by stage_number',
      'SQL migrations untested (manual live verification only)',
      'run-wireframe-fidelity-qa.mjs / experience-review-coverage-check.mjs CLI wrappers untested',
      'gather-context.mjs + record-review.mjs pipeline untested end-to-end',
      'unbounded PostgREST selects in the executor (safe at current 56-row scale)',
    ],
  },
};

results = applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('TESTING', SD_ID, sa, results, { sdKey: SD_ID, phase: 'EXEC-TO-PLAN' });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'repo_path=', stored?.metadata?.repo_path, 'executed_from_cwd=', stored?.metadata?.executed_from_cwd);
