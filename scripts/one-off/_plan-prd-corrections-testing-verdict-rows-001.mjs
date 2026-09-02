import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001';

const { data: prd, error: fetchErr } = await sb
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, metadata')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) throw fetchErr;

const fr = [...prd.functional_requirements];
const tr = [...prd.technical_requirements];
const ts = [...prd.test_scenarios];

// TESTING sub-agent (evidence 42436060) found the PRD's premise false in two ways:
// (a) sub_agent_execution_results.source has column_default='manual' and is NEVER set by
//     storeSubAgentResults -- 675/677 TESTING rows already read source='manual' regardless of
//     writer identity, so "source==='manual'" cannot discriminate manual-authored from
//     sub-agent-code-path writes.
// (b) lib/sub-agents/testing/index.js's MAINLINE executed-test branch (real E2E runs) stores
//     counts in results.findings.phase3_execution, which is NEVER translated into
//     metadata.test_execution anywhere (confirmed: zero hits for phase3_execution/
//     test_execution in lib/sub-agent-executor/executor.js). Only the "policy_non_applicable_*"
//     early-exit branches call buildTestExecution(). PR #7955's "sub-agent path already fixed"
//     claim holds only for early-exits, not for genuine executed runs -- the case that matters most.
fr[0] = {
  ...fr[0],
  title: 'storeSubAgentResults refuses a PASS/CONDITIONAL_PASS TESTING write missing a valid test_execution block',
  description: 'lib/sub-agent-executor/results-storage.js\'s storeSubAgentResults(code, sdId, subAgent, results, options) gains a validation check: when code===\'TESTING\' AND the resolved verdict is PASS or CONDITIONAL_PASS (NOT other verdicts -- error/failure evidence must still be storable per this file\'s existing fail-soft doctrine, TESTING sub-agent evidence 42436060), require results.metadata.test_execution to be a well-formed object (tests_executed/passed/failed/skipped present as real numbers, not merely coerced strings). CORRECTED DISCRIMINATOR (evidence 42436060): there is no reliable source=manual vs sub-agent-path flag today -- the source column defaults to \'manual\' in Postgres and storeSubAgentResults never sets it, so 675/677 existing TESTING rows already read source=manual regardless of writer. The guard therefore applies UNCONDITIONALLY to every TESTING PASS/CONDITIONAL_PASS write reaching storeSubAgentResults (both the INSERT path ~line 735 and the 5-minute dedup UPDATE path), not conditioned on a source flag. This is simpler and more robust than threading a new discriminator, and matches the chairman-ratified gate-evidence-provenance principle (CLAUDE.md, ratification 6c263823) that a completion gate must not accept evidence lacking real structure. The guard must sit ABOVE both the insert (~:735) and dedup-update (~:761) branches so neither bypasses it.',
  acceptance_criteria: [
    'Calling storeSubAgentResults(\'TESTING\', sdId, subAgent, {verdict:\'PASS\', ...no metadata.test_execution...}, {}) throws/rejects naming the missing field, on BOTH the insert path and the dedup-update path, and no row is written/updated',
    'Calling storeSubAgentResults(\'TESTING\', sdId, subAgent, {verdict:\'PASS\', metadata:{test_execution: buildTestExecution({executed:10,passed:10,failed:0})}}, {}) succeeds and the stored row\'s metadata.test_execution matches exactly',
    'A verdict OTHER than PASS/CONDITIONAL_PASS (e.g. an error-path write from executor.js:597, or FAIL) is NEVER refused for a missing test_execution -- preserves the file\'s existing fail-soft doctrine for failure evidence',
    'The existing live defect example (scripts/one-off/store-testing-evidence-fdbk-security.mjs, a real CONDITIONAL_PASS TESTING write with prose and no test_execution) now fails when re-run, proving the guard fires on real historical code',
    'A non-TESTING sub-agent code (e.g. VALIDATION, SECURITY) writing any verdict is completely unaffected by this new check',
  ],
};

fr.push({
  id: 'FR-4',
  title: 'Close the sub-agent mainline execution gap (phase3_execution -> metadata.test_execution)',
  description: 'lib/sub-agents/testing/index.js\'s MAINLINE executed-test branch (the code around processPhase3Results/results.findings.phase3_execution=phase3, the real E2E-run case, NOT the policy_non_applicable_* early-exits which already call buildTestExecution()) must ALSO populate results.metadata.test_execution via the SAME canonical buildTestExecution() builder (reused, TR-1), using phase3.tests_executed/tests_passed/tests_failed/tests_skipped. This closes the single most consequential gap found during PLAN verification: without it, FR-1\'s new guard on storeSubAgentResults would refuse the sub-agent\'s OWN real, successful E2E runs, since they currently never populate metadata.test_execution at all -- only 9 of 3039 table-wide TESTING rows carry it today (TESTING sub-agent evidence 42436060). This is closing existing wiring PR #7955 left incomplete for the dominant case, not re-implementing the sub-agent half (TR-2 still holds: no change to the EARLY-EXIT branches, which are already correct).',
  priority: 'critical',
  acceptance_criteria: [
    'After a real scoped/E2E test run through lib/sub-agents/testing/index.js\'s mainline path, the returned results.metadata.test_execution is populated via buildTestExecution() with the actual executed/passed/failed/skipped counts from phase3',
    'The existing policy_non_applicable_* early-exit branches (which already call buildTestExecution()) are unchanged',
    'A unit test confirms a mainline-path result object now satisfies isMeasuredExecution() when real tests executed',
  ],
});

// FR-4 (originally FR-2, census script) sizing correction.
const censusIdx = fr.findIndex((f) => f.id === 'FR-2');
if (censusIdx !== -1) {
  fr[censusIdx] = {
    ...fr[censusIdx],
    description: fr[censusIdx].description +
      ' SIZING CORRECTION (TESTING sub-agent evidence 42436060, live measurement): TESTING rows table-wide carry 5,937 distinct top-level metadata keys, ~1,490 matching an execution-related regex heuristic -- not ~300 as the original witness estimated over a narrower 14-day window. The script must state its own ordering (e.g. by occurrence count, descending) and support a --limit cap so the output stays reviewable regardless of the true count. "No mutations" must be proven structurally (a source-grep of the script for insert|update|delete|upsert, asserted in its own test), not merely by observing one run.',
  };
}

tr.push({
  id: 'TR-4',
  title: 'Guard fires on verdict PASS/CONDITIONAL_PASS only, preserving fail-soft doctrine',
  description: 'The FR-1 guard must NOT throw for non-accepting verdicts (ERROR, FAIL, WARNING, etc.) -- results-storage.js has a thrice-stated fail-soft doctrine (the readback checker, executor.js\'s own error-path write at :597 inside try/catch) that a hard-refuse on every verdict would break, silently losing failure evidence exactly when it is most needed. TESTING sub-agent evidence 42436060.',
});
tr.push({
  id: 'TR-5',
  title: 'Other sub_agent_execution_results writers are explicitly out of scope',
  description: 'scripts/modules/orchestrator/subagent-execution.js (safeInsert, 243 live TESTING rows), lib/sub-agents/regression.js, and lib/sub-agents/vision-fidelity/index.js write directly to sub_agent_execution_results, bypassing storeSubAgentResults entirely. This SD does not touch them -- fixing every writer is a larger, separately-scoped effort. TS-7\'s original "no code path can produce..." framing is corrected to be honest about this: the guarantee holds only for writes reaching storeSubAgentResults, not table-wide.',
});

// Correct TS-5 and TS-7, add TS-8 (dedup branch), TS-9 (mainline gap).
const ts5Idx = ts.findIndex((t) => t.id === 'TS-5');
if (ts5Idx !== -1) {
  ts[ts5Idx] = {
    ...ts[ts5Idx],
    scenario: 'Sub-agent mainline path (after FR-4) is unaffected by FR-1\'s guard',
    expected: 'After FR-4 lands, a real sub-agent-path E2E-executed PASS result already carries metadata.test_execution, so FR-1\'s guard never fires for it. tests/unit/sub-agent-executor/results-storage-payload-fidelity.test.js (the correct existing suite, not lib/sub-agents/testing\'s own tests) continues to pass unmodified.',
  };
}
const ts7Idx = ts.findIndex((t) => t.id === 'TS-7');
if (ts7Idx !== -1) {
  ts[ts7Idx] = {
    ...ts[ts7Idx],
    scenario: 'PASS-implies-measured is enforced by construction FOR WRITES REACHING storeSubAgentResults',
    expected: 'No PASS/CONDITIONAL_PASS TESTING row written THROUGH storeSubAgentResults can have an absent/empty test_execution. This guarantee explicitly does NOT extend to the other direct-insert writers named in TR-5 (out of scope).',
  };
}
ts.push({
  id: 'TS-8',
  scenario: 'The dedup/UPDATE path (5-minute re-run window) is also guarded',
  type: 'unit',
  expected: 'A second storeSubAgentResults call within the 5-minute dedup window for the same (sd_id, code, phase), missing test_execution, is refused on the UPDATE branch exactly like the INSERT branch',
});
ts.push({
  id: 'TS-9',
  scenario: 'FR-4: mainline phase3-executed path populates metadata.test_execution',
  type: 'unit',
  expected: 'Given a mocked real test run (phase3.tests_executed=10, tests_passed=10, tests_failed=0), the returned results.metadata.test_execution matches buildTestExecution({executed:10,passed:10,failed:0,...}) and isMeasuredExecution(...) is true',
});

const newMetadata = {
  ...prd.metadata,
  plan_phase_corrections: {
    evidence_id: '42436060-81d0-42e1-a2e2-b3112abd2a04',
    applied_at: new Date().toISOString(),
    corrections: [
      'source=manual is not a usable discriminator -- column defaults to manual, writer never sets it',
      'FR-1 rescoped to apply unconditionally to PASS/CONDITIONAL_PASS TESTING writes (not source-conditioned)',
      'FR-4 added: sub-agent mainline phase3_execution -> metadata.test_execution gap was NOT actually closed by PR #7955',
      'TR-4 added: guard must not break fail-soft error-path evidence',
      'TR-5 added: other direct-insert writers (safeInsert, regression.js, vision-fidelity) explicitly out of scope',
      'Census key count corrected from ~300 to ~1,490 (live measurement); ordering/cap required',
      'TS-8 (dedup branch) and TS-9 (mainline gap) added',
    ],
  },
};

const { error } = await sb
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, technical_requirements: tr, test_scenarios: ts, metadata: newMetadata })
  .eq('id', PRD_ID);
if (error) throw error;

console.log('PRD corrected: FR-1 rescoped, FR-4 added, TR-4/TR-5 added, TS-5/TS-7 corrected, TS-8/TS-9 added.');
