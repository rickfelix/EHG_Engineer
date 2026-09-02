// SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 — Explore sub-agent evidence writer (LEAD phase).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'Verified all mechanism claims against the actual codebase before build. CONFIRMED: ' +
    'lib/sub-agents/testing/test-execution-record.js:20-29 exports buildTestExecution() returning ' +
    '{tests_executed, tests_passed, tests_failed, tests_skipped, artifact_sha, runner}; :41-44 exports ' +
    'isMeasuredExecution() (tests_executed>0). scripts/modules/handoff/executors/exec-to-plan/gates/' +
    'mandatory-testing-validation.js:304-305 reads result.metadata.test_execution via isMeasuredExecution ' +
    'as the primary path -- PARTIALLY confirmed only, since one ad-hoc fallback key (metadata.measured) ' +
    'intentionally remains for pre-existing rows (not the ~300-key prose problem this SD targets, which is ' +
    'a WRITER-side defect, not a reader-side one). scripts/lib/test-evidence-ingest.js writes only to ' +
    'test_runs/test_results/story_test_mappings -- confirmed it never touches sub_agent_execution_results, ' +
    'so it is NOT itself the fix site despite being named in the SD spine; the real fix site is the writer ' +
    'choke point. lib/sub-agent-executor/results-storage.js:414 storeSubAgentResults() IS the choke point ' +
    'for the two invocation patterns this SD is scoped to (execute-subagent.js CLI + scripts/one-off/*.mjs ' +
    'ad-hoc scripts) -- confirmed live via store-testing-evidence-fdbk-security.mjs, which wrote a TESTING ' +
    'CONDITIONAL_PASS row with rich prose and no test_execution field, succeeding with zero validation. ' +
    'A separate legacy insert path (lib/tasks/subagent-orchestrator.js:619-640, agent_code column, LEO 5.0 ' +
    'subsystem) also writes to the table but is out of this SD\'s scope (not the source=manual pattern named). ' +
    '50+ scripts/one-off/*testing-evidence* files confirm the ad-hoc pattern is real and recurring, not ' +
    'hypothetical. No validation of missing/malformed test_execution exists anywhere in storeSubAgentResults ' +
    'today -- confirmed absent by full read of the function body.',
  findings: [
    { id: 'fix-site-is-results-storage-not-evidence-ingest', severity: 'critical', note: 'The SD spine names scripts/lib/test-evidence-ingest.js as a fix site, but it writes to test_runs/test_results, never sub_agent_execution_results. The real fix site for the manual/worker-authored TESTING-row defect is lib/sub-agent-executor/results-storage.js storeSubAgentResults() -- the single choke point for execute-subagent.js CLI runs and the 50+ scripts/one-off/*testing-evidence* ad-hoc scripts.' },
    { id: 'legacy-second-insert-path-out-of-scope', severity: 'info', note: 'lib/tasks/subagent-orchestrator.js:619-640 (_createExecution) is a separate legacy LEO 5.0 insert path using agent_code (not sub_agent_code). Confirmed out of this SD\'s scope (not the source=manual worker-authored pattern named in the SD) -- noted so the EXEC implementer does not assume storeSubAgentResults is the table\'s only writer.' },
    { id: 'gate-fallback-key-is-intentional-not-the-300-key-problem', severity: 'info', note: 'mandatory-testing-validation.js retains exactly ONE ad-hoc fallback (metadata.measured) for pre-PR#7955 rows, by design per its own inline comment. This is not the ~300-ad-hoc-key writer-side problem the SD targets -- the gate reader is already correctly scoped; the fix belongs entirely on the writer side.' },
    { id: 'live-proof-of-defect', severity: 'info', note: 'scripts/one-off/store-testing-evidence-fdbk-security.mjs is a live, already-committed example of the exact defect: a TESTING CONDITIONAL_PASS row with prose metadata (tests_run, tests_result, mutation_score_current) and no test_execution field, written successfully with zero validation.' },
  ],
  metadata: {
    build_test_execution: 'lib/sub-agents/testing/test-execution-record.js:20-29',
    is_measured_execution: 'lib/sub-agents/testing/test-execution-record.js:41-44',
    gate_reader: 'scripts/modules/handoff/executors/exec-to-plan/gates/mandatory-testing-validation.js:304-305',
    fix_site: 'lib/sub-agent-executor/results-storage.js:414',
    test_evidence_ingest_writes_to: ['test_runs', 'test_results', 'story_test_mappings'],
    legacy_second_insert_path: 'lib/tasks/subagent-orchestrator.js:619-640',
    live_defect_example: 'scripts/one-off/store-testing-evidence-fdbk-security.mjs',
    adhoc_testing_evidence_script_count: '50+',
  },
  execution_time_ms: 150000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
