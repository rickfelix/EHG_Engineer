// SD-LEARN-FIX-LEARNING-IMPROVEMENT-005 — Explore sub-agent evidence writer (LEAD phase).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Full discovery of metadata.test_execution consumers and the artifact-path call chain, ahead of PRD authoring. ' +
    'CORRECTION to the LEAD-phase TESTING prospective review (evidence 9704fb03): the report path is NOT stripped ' +
    'from the persisted row -- results-storage.js:578 stores results.findings verbatim (metadata.findings), so ' +
    'phase3.report_url IS already persisted, just nested at metadata.findings.phase3_execution.report_url, never ' +
    'at metadata.test_execution.artifact_path where the guard/gate look. This changes the FR from "add a new field ' +
    'and thread a value that has nowhere to live" to "read an already-persisted nested path and copy/normalize it ' +
    'into the canonical test_execution shape" -- a smaller, more precise fix.',
  findings: [
    { id: 'consumers-enumerated', severity: 'info', note: 'Writer: index.js:191-192/474/520/529-535/566-568 via buildTestExecution(). Guard: testing-verdict-guard.js (results-storage.js:727-729). Gate reader: mandatory-testing-validation.js:304-305. Tests: test-execution-record.test.js, mainline-test-execution.test.js, testing-verdict-guard.test.js.' },
    { id: 'report-path-already-persisted-but-misplaced', severity: 'critical', note: 'phase3-execution.js:215 sets report_url on phase3; index.js:185 nests it under results.findings.phase3_execution; results-storage.js:578 persists results.findings verbatim as metadata.findings (NOT stripped, contra the TESTING sub-agent LEAD review). buildMainlinePhase3TestExecution (index.js:396-404) never reads report_url or the reuse-path artifact_sha (phase3.artifact_sha, set at index.js:682/770/827) and never forwards them to buildTestExecution()\'s artifactSha/runner args.' },
    { id: 'artifact-verification-callsites', severity: 'info', note: 'computeArtifactSha (artifact-verification.js:121-125) has zero callers outside its own test file. verifyArtifact (index.js:646-653) is called only from the two evidence-REUSE fast paths (checkTestEvidence :672, checkApiTestEvidence :759) -- not from the real-execution path.' },
    { id: 'no-existing-path-column-on-target-table', severity: 'info', note: 'sub_agent_execution_results has no path/sha column (JSONB metadata/test_execution only). test_runs has report_hash/report_file_path (test-evidence-ingest.js:235-236) as a reusable NAMING precedent on a different table.' },
    { id: 'vitest-scraper-fragility', severity: 'high', note: 'complete-quick-fix/test-runner.js extractTestSummary() (:144-173) regex-scrapes vitest stdout text-summary lines. A future JSON-reporter addition for provenance must not alter that text-summary output format, or scripts/modules/complete-quick-fix/index.js breaks silently.' },
  ],
  metadata: {
    consumers: ['lib/sub-agents/testing/index.js', 'lib/sub-agent-executor/testing-verdict-guard.js', 'scripts/modules/handoff/executors/exec-to-plan/gates/mandatory-testing-validation.js'],
    correction_of_evidence: '9704fb03-dd89-4f43-a8c5-f32dd2e2185f',
  },
  execution_time_ms: 90000,
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
