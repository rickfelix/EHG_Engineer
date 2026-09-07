#!/usr/bin/env node
/**
 * RE-VERIFICATION TESTING evidence for SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F, EXEC-TO-PLAN.
 * Supersedes a9bac2fa-d404-4c0a-bc55-e61143237904 (CONDITIONAL_PASS, 2 blocking conditions).
 * Counts read programmatically from a vitest --reporter=json artifact whose sha256 is on the row.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F';
const SD_UUID = '6a9c6fe0-7a94-4437-b8bb-48f136e3b400';
const ARTIFACT_REL = '.artifacts/testing-SD-F-exec-rev2.json';
const RUN_COMMAND = 'npx vitest run tests/unit/fleet/ --project unit --reporter=json';
const SCRIPT_PATH = 'scripts/verify-quick-fixes-metadata-activation.mjs';
const TEST_PATH = 'tests/unit/fleet/verify-quick-fixes-metadata-activation.test.js';
const PRIOR_ROW = 'a9bac2fa-d404-4c0a-bc55-e61143237904';

const raw = readFileSync(ARTIFACT_REL, 'utf8');
const sha = createHash('sha256').update(raw).digest('hex');
const j = JSON.parse(raw);
const target = j.testResults.find((r) => r.name.includes('verify-quick-fixes-metadata-activation'));
const run = {
  executed: j.numTotalTests,
  passed: j.numPassedTests,
  failed: j.numFailedTests,
  skipped: (j.numPendingTests || 0) + (j.numTodoTests || 0),
  success: j.success,
  targetFileTests: target ? target.assertionResults.length : 0,
  targetFilePassed: target ? target.assertionResults.filter((a) => a.status === 'passed').length : 0,
};

const findings = [
  {
    id: 'RESOLVED-blocking-target-application',
    severity: 'INFO',
    summary: 'BLOCKING CONDITION 1 FROM ROW ' + PRIOR_ROW + ' IS RESOLVED, and verified END-TO-END against the live schema rather than by reading the diff. Commit 932d3923fd4 extracts the payload into an exported buildScratchQfInsertPayload() (' + SCRIPT_PATH + ':179-190) that now includes target_application: "EHG_Engineer", and realInsertScratchQf (:192-195) calls that exact builder, so the tested payload and the deployed payload cannot diverge. PROOF OF SCHEMA-LEGALITY (the check whose absence caused the original defect): I imported the REAL exported builder and drove its output through a live INSERT against the engineer database inside a transaction that was ALWAYS rolled back. Result: INSERT_ACCEPTED=true (every BEFORE-INSERT trigger, including trg_quick_fixes_validate_target_application, passed), the stored row read back as status=in_progress / claiming_session_id set / target_application=EHG_Engineer / pr_url NULL / commit_sha NULL, and then ROLLBACK left REMAINING_ROWS=0. Zero durable writes to production.',
  },
  {
    id: 'RESOLVED-blocking-insert-error-swallow',
    severity: 'INFO',
    summary: 'The second half of blocking condition 1 is also RESOLVED. realInsertScratchQf (' + SCRIPT_PATH + ':192-195) now destructures { error } from the supabase-js insert and throws on it, and resolveActivationState wraps the insert call in its own inner try/catch (:121-133) that classifies ANY insert failure as INDETERMINATE with the detail "environmental/setup problem, not a code defect" -- never REGRESSED. This is behaviourally pinned, not merely structural: the new TS-6b test (' + TEST_PATH + ':138-152) injects an insertScratchQfFn that throws the exact "null value in column target_application" error, and asserts state===INDETERMINATE, exitCode===2, the detail text, AND that cleanup still ran. The false-REGRESSED-to-the-chairman failure mode from the prior row is closed.',
  },
  {
    id: 'RESOLVED-ts6-now-asserts-the-real-payload',
    severity: 'INFO',
    summary: 'BLOCKING CONDITION 2 (the HIGH TS-6 gap) IS RESOLVED. ' + TEST_PATH + ':127-136 no longer injects a test double: it imports buildScratchQfInsertPayload from the script and asserts the REAL returned object -- status !== "open", claiming_session_id === "sess-1", target_application === "EHG_Engineer", id matching /^QF-/. Because realInsertScratchQf at ' + SCRIPT_PATH + ':193 inserts precisely this builder output, the guard is now load-bearing by construction: removing target_application, or flipping status to "open", fails TS-6. That is the specific mutation that previously passed all 12 tests. The zero-yield guard is gone.',
  },
  {
    id: 'measured-target-suite-rev2',
    severity: 'INFO',
    summary: 'MEASURED RUN against the current working tree: the target file is now ' + run.targetFilePassed + '/' + run.targetFileTests + ' passing, 0 failed. All 14 named tests enumerated from the runner artifact, including the three new/changed guards: "TS-6: the REAL scratch-row payload (buildScratchQfInsertPayload) is born claimed, non-open, and carries target_application", "TS-6b: an insert failure ... classifies INDETERMINATE, never REGRESSED", and "SEC-F2: a cleanup (delete) failure is surfaced in result.detail, verdict/state left unchanged".',
  },
  {
    id: 'measured-regression-fleet-tier-rev2',
    severity: 'INFO',
    summary: 'REGRESSION SWEEP re-run: "' + RUN_COMMAND + '" -> ' + run.executed + ' tests executed, ' + run.passed + ' passed, ' + run.failed + ' FAILED, ' + run.skipped + ' skipped (pre-existing) across 213 test files; success=' + run.success + '. Zero collateral failures from either the fix commit or the uncommitted SEC-F2 delta. Counts read programmatically from ' + ARTIFACT_REL + ' (sha256 ' + sha + '), not restated by hand.',
  },
  {
    id: 'ac1-live-still-passes',
    severity: 'INFO',
    summary: 'AC-1 RE-VERIFIED LIVE after the fix: "node ' + SCRIPT_PATH + '" still prints "NOT_YET_APPLIED: quick_fixes.metadata does not exist yet (chairman-gated migration unapplied). Zero writes made." with a real exit code of 0, measured without a pipe. The fix did not regress the only currently-reachable live path, and the NOT_YET_APPLIED branch still returns at :105 before any insert hook is invoked.',
  },
  {
    id: 'WARNING-uncommitted-sec-f2-delta-not-pushed',
    severity: 'HIGH',
    summary: 'PROCESS FINDING, NOT A CODE DEFECT, but it must be closed before merge. The team lead asked me to re-verify "the pushed commit 932d3923fd4". HEAD does equal origin/feat/SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F (both 932d3923fd4353ad48fd9b434a4b1401b5449a38) -- but the WORKING TREE DIVERGES from it: "git status" shows BOTH files modified, and "git diff HEAD --stat" reports 39 insertions / 9 deletions still UNCOMMITTED. That delta is a separate SECURITY-sub-agent fix (labelled SEC-F2, evidence d0d0aaa7): a "let result" refactor at ' + SCRIPT_PATH + ':119, realDeleteScratchQf now checking its own { error } (:196-199), the finally block appending "[CLEANUP FAILED: ...]" to result.detail instead of an empty catch (:153-167), plus the SEC-F2 test at ' + TEST_PATH + ':154-168. CONSEQUENCE: the pushed commit contains 13 tests; the working tree I measured contains 14. My 14/14 and 2638/2639 numbers describe the WORKING TREE, not what is currently on origin. Both of MY blocking conditions are satisfied by the pushed commit alone, so this does not reopen them -- but if the SEC-F2 delta is never committed, it is silently lost on merge and this row overstates what ships. ACTION: commit and push the SEC-F2 delta before EXEC-TO-PLAN is accepted.',
  },
  {
    id: 'sec-f2-cleanup-surfacing-reviewed',
    severity: 'LOW',
    summary: 'REVIEW OF THE UNCOMMITTED SEC-F2 DELTA (correct, with one narrow gap). The "let result" mechanism is sound and the subtlety is handled correctly: the finally block MUTATES result.detail rather than reassigning result, and since "return result" yields the object reference, a property mutation in finally IS visible to the caller (a reassignment would not have been). Verified by the passing SEC-F2 test, which sees both "CLEANUP FAILED" and "RLS denied" in the returned detail while state stays ACTIVATED. GAP: the finally guard is "if (result)", and result stays undefined whenever the probe exits by THROWING (e.g. stampClaimFn throws) rather than returning. In that path a simultaneous cleanup failure is still silently swallowed -- the same class SEC-F2 set out to close, now much narrower (needs a throw AND a failing delete). The existing "cleans up ... even when stampClaimFn throws" test covers the throw path only with a SUCCEEDING delete, so nothing pins this. Non-blocking; worth a follow-up that logs to stderr when result is undefined.',
  },
  {
    id: 'carried-pick-reason-presence-not-value',
    severity: 'LOW',
    summary: 'CARRIED FORWARD, unchanged by the fix. ' + SCRIPT_PATH + ':137 still decides ACTIVATED via Object.prototype.hasOwnProperty.call(entry, "pick_reason") -- key presence, not value. lib/fleet/claim-stamp.cjs:136 assigns entry.pick_reason unconditionally, so on the real chain the key is always present and the paired REGRESSED sub-branch is unreachable except under an injected fake. If buildPickReason ever returned undefined, the script would still report ACTIVATED. Advisory only.',
  },
  {
    id: 'carried-activated-does-not-read-back',
    severity: 'LOW',
    summary: 'CARRIED FORWARD, unchanged by the fix. FR-1 prose describes ACTIVATED as "read back and verified"; the script still performs no independent read-back SELECT, inferring success from mergeQfMetadataKeys rowCount>0 on a server-side atomic jsonb_set UPDATE plus the in-memory entry. Arguably stronger than a client-side read-then-check (no TOCTOU window) and the output string is honest. PRD-prose overstatement, not a code defect. Separately confirmed during the live rolled-back probe that the CAS predicate mergeQfMetadataKeys uses (id = $1 AND claiming_session_id = $2) matches the scratch row exactly once, so no false cas_lost awaits once the column lands.',
  },
  {
    id: 'unchanged-checks-still-pass',
    severity: 'INFO',
    summary: 'RE-CONFIRMED unchanged by the fix commit: the raw-pg schema probe (no supabase-js/PostgREST in the probe path), the try/finally cleanup structure, the /^QF-/ scratch id matching claim-stamp.cjs:96 QF_ID_RE, and the mergeQfMetadataFn wrapper capturing {merged, reason}. The belt auto-start predicate remains unsatisfiable, now proven against the live table rather than only by reading source: the rolled-back probe queried lib/fleet/belt-depth.cjs:227 predicate verbatim (status=open AND pr_url IS NULL AND commit_sha IS NULL AND claiming_session_id IS NULL) against the inserted row and got 0 matches. FR-2 (-E activation_test_id) and FR-3 (runbook header) also unchanged and still verified.',
  },
];

const results = {
  verdict: 'PASS',
  confidence: 90,
  findings,
  warnings: [
    {
      severity: 'HIGH',
      issue: 'The working tree diverges from the pushed commit by 39 uncommitted insertions (the SEC-F2 security delta across both files). HEAD == origin at 932d3923fd4, but the 14-test measurement on this row describes the working tree; the pushed commit has 13 tests.',
      recommendation: 'Commit and push the SEC-F2 delta before EXEC-TO-PLAN is accepted, otherwise it is lost on merge and this evidence row overstates what actually ships. Both blocking conditions from row ' + PRIOR_ROW + ' are satisfied by the pushed commit alone, so this is a completeness issue, not a reopening.',
    },
    {
      severity: 'LOW',
      issue: 'SEC-F2 cleanup surfacing is guarded by "if (result)", so when resolveActivationState exits by throwing (stampClaimFn throws) result is undefined and a simultaneous cleanup failure is still silently swallowed.',
      recommendation: 'Log to stderr when result is undefined so an orphaned scratch row is never silent on the exceptional path. Follow-up, not a blocker.',
    },
    {
      severity: 'LOW',
      issue: 'Carried forward: ACTIVATED is gated on pick_reason key presence rather than value, and ACTIVATED does not literally read the row back despite FR-1 prose saying so.',
      recommendation: 'Optional polish; neither affects correctness of the shipped classification today.',
    },
  ],
  recommendations: [
    'PROCEED to PLAN verification once the uncommitted SEC-F2 delta is committed and pushed. Both blocking conditions from row ' + PRIOR_ROW + ' are genuinely resolved in the pushed commit.',
    'The strongest evidence on this row is the live rolled-back INSERT: the REAL exported buildScratchQfInsertPayload() output was accepted by every live quick_fixes trigger, read back with the expected column values, matched the belt auto-start predicate 0 times and the CAS predicate exactly once, then rolled back leaving 0 rows. That closes the exact verification gap that let the original defect ship -- unit tests structurally cannot catch a schema/trigger violation.',
    'Treat the two LOW advisories (SEC-F2 throw-path gap, pick_reason presence-vs-value) as follow-ups rather than handoff blockers.',
    'Reviewer note: I did not stash, revert, or otherwise touch the uncommitted SEC-F2 work belonging to the security review; I measured it as found and reported the divergence.',
  ],
  summary: 'RE-VERIFICATION of ' + SD_KEY + ' at EXEC-TO-PLAN after fix commit 932d3923fd4: PASS (90). Supersedes row ' + PRIOR_ROW + '; BOTH of its blocking conditions are RESOLVED. Condition 1 (missing target_application + silently swallowed insert error): the payload is now an exported buildScratchQfInsertPayload() carrying target_application "EHG_Engineer" and realInsertScratchQf inserts that exact builder output, checks { error }, and any insert failure is classified INDETERMINATE -- never the false REGRESSED that would have reached the chairman. Verified END-TO-END rather than by reading the diff: I imported the real exported builder and drove its output through a live INSERT against the engineer database inside an always-rolled-back transaction. INSERT_ACCEPTED=true (all BEFORE-INSERT triggers incl. trg_quick_fixes_validate_target_application passed), the row read back with the expected values, the belt auto-start predicate from belt-depth.cjs:227 matched it 0 times, the CAS predicate matched exactly once, and ROLLBACK left 0 rows -- zero durable production writes. Condition 2 (TS-6 zero-yield guard): ' + TEST_PATH + ':127-136 now imports the builder and asserts the real object, so the mutation that previously passed all 12 tests (dropping target_application, or status -> "open") now fails. MEASURED: target file ' + run.targetFilePassed + '/' + run.targetFileTests + ', fleet tier ' + run.passed + '/' + run.executed + ' passed, ' + run.failed + ' failed, ' + run.skipped + ' pre-existing skip, 213 files, success=' + run.success + ', counts read from the runner artifact whose sha256 is on this row. AC-1 still passes live (NOT_YET_APPLIED, real exit 0). ONE HIGH PROCESS WARNING, not a code defect: the working tree DIVERGES from the pushed commit by 39 uncommitted insertions -- a separate SECURITY (SEC-F2) delta adding realDeleteScratchQf error checking and cleanup-failure surfacing. HEAD == origin, but origin has 13 tests while the tree I measured has 14. Both blocking conditions are satisfied by the pushed commit alone, so this does not reopen them, but the SEC-F2 delta must be committed and pushed or it is lost on merge. Two LOW advisories: the SEC-F2 "if (result)" guard still swallows a cleanup failure on the throw path, and pick_reason is checked by key presence rather than value.',
  detailed_analysis: JSON.stringify({
    sd_key: SD_KEY,
    phase: 'EXEC-TO-PLAN',
    mode: 'post-implementation-reverification',
    measured: true,
    supersedes: PRIOR_ROW,
    head_commit: '932d3923fd4353ad48fd9b434a4b1401b5449a38',
    head_equals_origin: true,
    working_tree_diverges_from_head: true,
    uncommitted_delta: { files: 2, insertions: 39, deletions: 9, label: 'SEC-F2 security delta (evidence d0d0aaa7)', pushed: false },
    prior_blocking_conditions: {
      'condition_1_target_application_and_error_check': 'RESOLVED — verified by live rolled-back INSERT of the real exported builder output',
      'condition_2_ts6_asserts_real_payload': 'RESOLVED — test imports buildScratchQfInsertPayload and asserts the real object',
    },
    live_rolled_back_probe: {
      method: 'BEGIN; INSERT real buildScratchQfInsertPayload() output; verify; ROLLBACK',
      insert_accepted: true,
      stored_row: { status: 'in_progress', claiming_session_id: 'set', target_application: 'EHG_Engineer', pr_url: null, commit_sha: null },
      belt_auto_startable_matches: 0,
      cas_predicate_matches: 1,
      remaining_rows_after_rollback: 0,
      durable_writes: 0,
    },
    target_suite: { file: TEST_PATH, tests: run.targetFileTests, passed: run.targetFilePassed, failed: 0 },
    regression: { command: RUN_COMMAND, files: 213, executed: run.executed, passed: run.passed, failed: run.failed, skipped: run.skipped },
    live_ac1: { command: 'node ' + SCRIPT_PATH, exit_code: 0, output: 'NOT_YET_APPLIED ... Zero writes made.' },
    outstanding: [
      { severity: 'HIGH', type: 'process', item: 'Commit and push the uncommitted SEC-F2 delta before EXEC-TO-PLAN acceptance' },
      { severity: 'LOW', type: 'code', item: 'SEC-F2 "if (result)" guard swallows cleanup failure on the throw path' },
      { severity: 'LOW', type: 'code', item: 'pick_reason checked by key presence, not value' },
    ],
  }),
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: run.executed,
      passed: run.passed,
      failed: run.failed,
      skipped: run.skipped,
      artifactSha: sha,
      runner: 'vitest@4.1.4 --project unit --reporter=json',
      artifactPath: ARTIFACT_REL,
      source: 'fresh',
    }),
    run_command: RUN_COMMAND,
    post_implementation: true,
    reverification_of: PRIOR_ROW,
    evaluated_commit_sha: '932d3923fd4353ad48fd9b434a4b1401b5449a38',
    working_tree_dirty: true,
    phase: 'EXEC-TO-PLAN',
  },
  phase: 'EXEC-TO-PLAN',
};

const supabase = await getSupabaseClient();
const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });
const finalResults = applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('TESTING', SD_UUID, { name: 'QA Engineering Director' }, finalResults, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN', source: 'manual' });

console.log('ROW_ID=' + stored.id);
console.log('verdict=' + stored.verdict + ' confidence=' + stored.confidence);
console.log('phase=' + (stored.phase ?? stored.metadata?.phase));
console.log('measured=' + stored.metadata?.measured);
console.log('test_execution=' + JSON.stringify(stored.metadata?.test_execution));
console.log('supersedes=' + stored.metadata?.reverification_of);
