// SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 — SECURITY sub-agent evidence writer (EXEC-TO-PLAN phase).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001';
const PHASE = 'EXEC-TO-PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  justification:
    'Adversarial review of PR #7961 at commit 7c9c4285edf found no exploitable vulnerability and confirmed ' +
    'the D1 measured:false exemption cannot bypass evidence validation (mandatory-testing-validation.js:304-305 ' +
    'independently re-derives measured from test_execution, never trusting the caller flag -- verified empirically ' +
    'via an 8-shape abuse matrix, not just by reading). SEC-4 (the one concrete code-level condition: an unbounded, ' +
    'exception-unsafe JSON.stringify() echo of caller-supplied test_execution values in the guard error message) ' +
    'was fixed in commit 9706ba02f3a via safeEchoValue() (200-char truncation, try/catch). Remaining conditions ' +
    '(SEC-1: keep TR-5\'s narrowed "for writes reaching storeSubAgentResults" claim un-broadened in the retro; ' +
    'SEC-3: state plainly that artifact_sha/runner provenance, ratification 6c263823\'s "runner-written results ' +
    'file with its hash" arm, is NOT implemented by this SD) are documentation obligations for the retro/handoff ' +
    'narrative, not code defects -- tracked here so PLAN carries them forward.',
  conditions: [
    'Retro/completion summary must state TR-5\'s writer-choke-point guarantee narrowly (storeSubAgentResults only), not table-wide -- 115 of 907 live TESTING PASS/CONDITIONAL_PASS rows (12.9%) reach the table via direct-insert writers (scripts/modules/orchestrator/subagent-execution.js safeInsert and others) this SD does not touch.',
    'Retro/completion summary must state that artifact_sha/runner provenance (ratification 6c263823) is not implemented by this SD -- the guard raises the bar from prose to structured numbers, not to producer/hash provenance.',
    'Non-blocking follow-up (not required for this SD to complete): a Postgres CHECK/trigger on the jsonb shape would cover every writer at once, including the direct-insert bypasses SEC-1 names.',
  ],
  critical_issues: [],
  warnings: [
    'metadata.measured is a caller-writable field the gate happens to re-derive independently today (mandatory-testing-validation.js:305) -- that independent re-derivation is load-bearing for this SD\'s safety and should not be "simplified" to trust the caller flag directly in a future change.',
    'No cross-field consistency check exists (e.g. tests_passed+tests_failed+tests_skipped <= tests_executed, or non-negative counts) -- a fabricated-but-well-typed test_execution block still passes. Recommended, not required, per this SD\'s PRD scope.',
  ],
  recommendations: [
    { severity: 'LOW', issue: 'No cross-field numeric consistency check on test_execution counts', recommendation: 'Consider adding >=0 and passed+failed+skipped<=executed validation in a follow-up SD, plus a test for the measured:false + nonzero-counts contradiction.' },
  ],
  detailed_analysis: {
    diff_reviewed: '2 commits at review time (2948473c178, 7c9c4285edf), 16 files, +718/-22; zero .sql/migration/policy/grant/RLS files touched',
    bypass_analysis: 'Built an 8-shape abuse matrix (prose-only PASS, measured:false+no test_execution, measured:false+zero-run, measured:false+fabricated counts, no-measured-key+fabricated counts, measured as string, test_execution as empty array, circular/huge malformed values) and ran each through both the guard and a byte-copy of the gate\'s derivation logic. The exemption cannot skip validation: the missing-check and malformed-numeric check both run BEFORE the measured:false exemption is consulted (testing-verdict-guard.js:41-56 precede :58-65).',
    live_coverage_measurement: '30-day live query: 907 TESTING PASS/CONDITIONAL_PASS rows; 87.1% (790/907) route through the guarded storeSubAgentResults choke point; 12.9% (117) reach the table via direct-insert writers this SD explicitly scopes out (TR-5).',
    injection_check: 'scripts/census-testing-execution-keys.mjs uses only the PostgREST builder (.from/.select/.eq/.gte), no raw SQL, no rpc(); --days/--limit pass Number.isFinite before use.',
    dos_check: 'validateTestExecutionShape iterates a fixed 4-element constant, never Object.keys(metadata) -- no traversal of caller-controlled structure. Deep-nesting/huge-value input is only reachable via the (now-fixed, SEC-4) error-message echo.',
    access_control_check: 'Pure application-layer validation; zero migration/policy files; same service-role credential path as before (lib/sub-agent-executor/supabase-client.js) -- who may write is unchanged, only whether a given write\'s shape is accepted.',
  },
  execution_time_ms: 486349,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'SECURITY',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD_ID, { name: 'Security Sub-Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
