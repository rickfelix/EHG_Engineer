#!/usr/bin/env node
/**
 * POST-IMPLEMENTATION TESTING evidence for SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F, EXEC-TO-PLAN.
 * Counts are read programmatically from a vitest --reporter=json artifact whose sha256 is on the row.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F';
const SD_UUID = '6a9c6fe0-7a94-4437-b8bb-48f136e3b400';
const ARTIFACT_REL = '.artifacts/testing-SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F-exec.json';
const RUN_COMMAND = 'npx vitest run tests/unit/fleet/ --project unit --reporter=json';
const SCRIPT_PATH = 'scripts/verify-quick-fixes-metadata-activation.mjs';
const TEST_PATH = 'tests/unit/fleet/verify-quick-fixes-metadata-activation.test.js';

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
    id: 'measured-target-suite',
    severity: 'INFO',
    summary: 'MEASURED RUN, independently re-executed rather than trusting the implementing session claim: "npx vitest run ' + TEST_PATH + ' --project unit" -> 12 tests executed, 12 passed, 0 failed. Confirmed a second time inside the fleet-tier sweep that backs this row: the ' + TEST_PATH + ' entry in ' + ARTIFACT_REL + ' (sha256 ' + sha + ') shows ' + run.targetFilePassed + '/' + run.targetFileTests + ' passing.',
  },
  {
    id: 'measured-regression-fleet-tier',
    severity: 'INFO',
    summary: 'REGRESSION SWEEP: "' + RUN_COMMAND + '" -> ' + run.executed + ' tests executed, ' + run.passed + ' passed, ' + run.failed + ' FAILED, ' + run.skipped + ' skipped across 213 test files; success=' + run.success + '. Zero collateral failures. Counts read programmatically from the runner artifact, not restated by hand.',
  },
  {
    id: 'ac1-live-not-yet-applied-VERIFIED',
    severity: 'INFO',
    summary: 'AC-1 VERIFIED LIVE against the real production database: "node ' + SCRIPT_PATH + '" from the SD worktree printed "NOT_YET_APPLIED: quick_fixes.metadata does not exist yet (chairman-gated migration unapplied). Zero writes made." and exited 0. The exit code was measured WITHOUT a pipe (a piped "echo $?" would have read tail status, not node status). Reproduced twice, with and without an explicit dotenv preload. The NOT_YET_APPLIED path provably makes zero writes: resolveActivationState() returns at ' + SCRIPT_PATH + ':105 BEFORE insertScratchQfFn is reached at :120, and the unit test at ' + TEST_PATH + ':43-55 asserts neither the insert nor the delete hook fires on this branch.',
  },
  {
    id: 'raw-pg-probe-VERIFIED',
    severity: 'INFO',
    summary: 'REQUESTED CHECK (a) PASSES: the schema-presence probe uses a raw pg client, never supabase-js/PostgREST. ' + SCRIPT_PATH + ':45 imports createDatabaseClient from ./lib/supabase-connection.js; :54-56 calls createDatabaseClient("engineer", { verify: false }); :71 issues "SELECT metadata FROM quick_fixes LIMIT 0" via client.query(). Traced into scripts/lib/supabase-connection.js:226-264 and confirmed it returns new Client({connectionString, ssl}) from node-postgres and awaits client.connect() -- a genuine raw pg client. The 42703 discrimination at :74 keys on err.code, which only a pg driver surfaces. No @supabase/supabase-js import exists anywhere in the probe path; the sole supabase-js use is a dynamic import at :162 inside run(), for the scratch-row lifecycle only.',
  },
  {
    id: 'try-finally-cleanup-VERIFIED',
    severity: 'INFO',
    summary: 'REQUESTED CHECK (b) PASSES: cleanup is a genuine try/finally, not sequential/inline steps. ' + SCRIPT_PATH + ':119 opens try, :138 finally, :139-141 invokes deleteScratchQfFn inside its own inner try/catch so a failing cleanup cannot mask the real result. The insert at :120 sits INSIDE the guarded try, so even an insert-time throw still reaches cleanup. Behaviourally pinned, not merely structural: ' + TEST_PATH + ':144-152 injects a stampClaimFn that throws and asserts deleteScratchQfFn still ran AND the error still propagates.',
  },
  {
    id: 'scratch-id-regex-VERIFIED',
    severity: 'INFO',
    summary: 'REQUESTED CHECK (c) PASSES: the default scratch id generator at ' + SCRIPT_PATH + ':96 produces QF-VERIFYACT-<pid>-<base36 ts> uppercased, matching /^QF-/. Verified against the ACTUAL regex stampClaim dispatches on -- lib/fleet/claim-stamp.cjs:96 declares QF_ID_RE = /^QF-/ and uses it at :126 -- so the probe routes to the QF branch instead of silently falling through to readSd()/strategic_directives_v2. Pinned by ' + TEST_PATH + ':117-125.',
  },
  {
    id: 'belt-auto-start-unsatisfiable-VERIFIED',
    severity: 'INFO',
    summary: 'REQUESTED CHECK (d) PASSES AT SOURCE LEVEL: realInsertScratchQf at ' + SCRIPT_PATH + ':146-156 sets status:"in_progress" (:153) and claiming_session_id:sessionId (:154) in the SAME insert object, so the row is born claimed and non-open, never open+unclaimed even transiently. Cross-checked against the REAL predicate rather than the PRD paraphrase: lib/fleet/belt-depth.cjs:227 applies .eq("status","open").is("pr_url",null).is("commit_sha",null).is("claiming_session_id",null). The scratch row fails that predicate on TWO independent clauses. See the TS-6 finding below for the coverage caveat: the source is correct, but nothing guards it.',
  },
  {
    id: 'merge-discriminator-wrapper-VERIFIED',
    severity: 'INFO',
    summary: 'REQUESTED CHECK (e) PASSES: the wrapper at ' + SCRIPT_PATH + ':114-117 assigns capturedResult = await mergeQfMetadataFn(id, sess, entry) into a closure variable AND returns it unchanged, so the {merged, reason} discriminator survives. This genuinely closes the collapse it targets: lib/fleet/claim-stamp.cjs:139 does "return result && result.merged ? entry : null", discarding reason. The injection seam was confirmed real rather than assumed -- claim-stamp.cjs:121 declares stampClaim(supabase, sdRef, sessionId, identitySource, mergeMetadataKeysFn = null, opts = {}) and :134 resolves opts.mergeQfMetadataFn via resolveQfMergeFn(); the 6-argument call at ' + SCRIPT_PATH + ':121 matches that arity and slot exactly. Also confirmed that passing {} as the supabase argument is safe: the guard at claim-stamp.cjs:123 is truthiness-only and the QF branch never dereferences it.',
  },
  {
    id: 'BLOCKING-live-probe-insert-missing-target-application',
    severity: 'CRITICAL',
    summary: 'BLOCKING DEFECT at ' + SCRIPT_PATH + ':147-155 (realInsertScratchQf). The scratch-row insert omits target_application, but quick_fixes carries a BEFORE-INSERT trigger trg_quick_fixes_validate_target_application -> fn_quick_fixes_validate_target_application whose first statement is: IF NEW.target_application IS NULL THEN RAISE EXCEPTION "quick_fixes.target_application is required". Measured directly against the live engineer database via pg_get_functiondef. Every other column is fine: all five NOT-NULL-without-default columns (id/title/type/severity/description) are supplied, and type="bug", severity="low", status="in_progress" each satisfy their CHECK constraints. The trigger is the sole failure. CONSEQUENCE, and this is why it blocks rather than being cosmetic: :147 calls "await supabase.from(\'quick_fixes\').insert({...})" WITHOUT destructuring or checking error, and supabase-js RESOLVES with {data:null,error} instead of throwing. The insert therefore fails SILENTLY; execution continues to :121; the real mergeQfMetadataKeys runs "UPDATE quick_fixes ... WHERE id=$1 AND claiming_session_id=$2" against a row that was never created; rowCount===0 (lib/fleet/qf-metadata-merge.mjs:59-60) yields {merged:false, reason:"cas_lost"}; and ' + SCRIPT_PATH + ':137 classifies that as REGRESSED, exit 1, "a real defect in the chain". The runbook would tell the chairman or coordinator that sibling -E shipped a BROKEN chain, immediately after the gated apply ceremony, when in fact only this probe own insert is malformed. That is exactly the misclassification the four-state design exists to prevent, aimed at the highest-stakes reader. FIX: add target_application: "EHG_Engineer" (verified active in public.applications, and the value used by 2006 existing quick_fixes rows) to the insert at :147-155, AND destructure { error } from both the insert and the delete so a failed scratch write surfaces as INDETERMINATE instead of laundering into a false REGRESSED.',
  },
  {
    id: 'ts6-does-not-assert-the-real-payload',
    severity: 'HIGH',
    summary: 'TEST-COVERAGE DEFECT that directly HID the blocking finding above. PRD TS-6 states: "The exact insert payload the live ACTIVATED probe would write is asserted to have status != \'open\' AND a non-null claiming_session_id at creation." The test claiming to do this (' + TEST_PATH + ':127-142) does NOT read the payload at all -- it INJECTS insertScratchQfFn, replacing realInsertScratchQf entirely, then asserts only that the injected hook received a truthy sessionId and a /^QF-/ id. realInsertScratchQf is module-private (' + SCRIPT_PATH + ':146, not exported), so no test can reach it. Demonstrable consequence: flip :153 from status:"in_progress" to status:"open", or delete claiming_session_id at :154, or omit any required column, and all 12 tests still pass. TS-6 is a guard that cannot fail on the regression it names. The entire live path (' + SCRIPT_PATH + ':145-170: realInsertScratchQf, realDeleteScratchQf, run) has zero test coverage; that is defensible for the parts needing a live post-migration DB, but the insert PAYLOAD SHAPE is statically assertable and TS-6 promised to assert it. FIX: export the payload builder (e.g. buildScratchQfPayload(qfId, sessionId)) and have TS-6 assert the literal object -- which would have caught the missing target_application.',
  },
  {
    id: 'pick-reason-presence-not-value',
    severity: 'LOW',
    summary: 'ADVISORY at ' + SCRIPT_PATH + ':124. ACTIVATED is decided by Object.prototype.hasOwnProperty.call(entry, "pick_reason") -- key PRESENCE, not value. Against the real chain, lib/fleet/claim-stamp.cjs:136 assigns entry.pick_reason = buildPickReason(...) UNCONDITIONALLY, so the key is always present and the "merged but no pick_reason" REGRESSED sub-branch at :128 is dead by construction on the real path; it can only fire under an injected fake stampClaimFn, which is exactly how ' + TEST_PATH + ':84-95 exercises it. If buildPickReason ever regressed to return undefined or null, the script would still report ACTIVATED. A truthiness or shape check would close it. Not blocking.',
  },
  {
    id: 'activated-does-not-read-back',
    severity: 'LOW',
    summary: 'ADVISORY on PRD wording versus implementation. FR-1 describes ACTIVATED as an entry "read back and verified"; the script performs NO independent read-back SELECT. It infers success from mergeQfMetadataKeys returning {merged:true}, which itself derives from result.rowCount>0 on a server-side atomic jsonb_set/|| UPDATE (lib/fleet/qf-metadata-merge.mjs:49-62), plus the in-memory entry object. That is arguably STRONGER than a client-side read-then-check because it has no TOCTOU window, and the script own output string at :126 is honest ("written and returned"). So this is PRD-prose overstatement rather than a code defect. Flagged so a future reader does not assume metadata->\'claim_history\' was re-selected and inspected.',
  },
  {
    id: 'fr2-documentary-repair-VERIFIED',
    severity: 'INFO',
    summary: 'FR-2 VERIFIED against the live database: product_requirements_v2 row PRD-SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (sd_id dfdad20c-bf37-47ef-8588-0ebd82cfb874) has activation_test_id = "scripts/verify-quick-fixes-metadata-activation.mjs" exactly, updated 2026-09-06T18:32:43Z. -E is status=completed / current_phase=COMPLETED, consistent with the documentary-repair framing. CAVEAT for TS-4: the gate fs.existsSync precondition holds only inside this SD worktree today -- "git cat-file -e origin/main:scripts/verify-quick-fixes-metadata-activation.mjs" fails and the file is absent from the main checkout, so activation_test_id currently points at a path that does not exist on main. Expected pre-merge and resolves on merge; recorded so it is not later misread as a broken pointer.',
  },
  {
    id: 'fr3-runbook-header-VERIFIED',
    severity: 'INFO',
    summary: 'FR-3 VERIFIED: the header comment at ' + SCRIPT_PATH + ':11-17 names the exact post-apply command ("node scripts/verify-quick-fixes-metadata-activation.mjs") and states in plain language what each of the four states means, explicitly separating REGRESSED ("a real defect, file it") from INDETERMINATE ("retry, do not treat as a code defect"). Note that the BLOCKING finding above undermines this FR in practice rather than in form: the header text is correct, but the script would currently emit the REGRESSED wording for a non-defect.',
  },
  {
    id: 'git-tracking-VERIFIED',
    severity: 'INFO',
    summary: 'REQUESTED CHECK 5 PASSES: "git ls-files" returns both ' + SCRIPT_PATH + ' and ' + TEST_PATH + ' from the worktree. "git check-ignore -v" reports the script is NOT ignored despite the broad scripts/verify-* block in .gitignore, because commit a38978d4d03 adds an explicit negation "!scripts/verify-quick-fixes-metadata-activation.mjs" at .gitignore:224 with a comment naming this SD. The commit contains exactly 3 files (+333 lines) and no stray artifacts.',
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 72,
  findings,
  warnings: [
    {
      severity: 'CRITICAL',
      issue: SCRIPT_PATH + ':147-155 omits target_application, which a BEFORE-INSERT trigger on quick_fixes requires; combined with an unchecked supabase-js insert error at :147, the live runbook would silently fail to create its scratch row and then misreport the chain as REGRESSED (exit 1) to the chairman immediately after the gated migration is applied.',
      recommendation: 'Add target_application: "EHG_Engineer" to the insert, and destructure { error } from both realInsertScratchQf and realDeleteScratchQf so a failed scratch write classifies as INDETERMINATE, never REGRESSED.',
    },
    {
      severity: 'HIGH',
      issue: 'PRD TS-6 is not satisfied: ' + TEST_PATH + ':127-142 injects insertScratchQfFn and never asserts the real payload, so AC-4 (status != "open" plus non-null claiming_session_id at creation) has no regression guard, and the target_application omission went undetected.',
      recommendation: 'Export a buildScratchQfPayload(qfId, sessionId) from the script and have TS-6 assert the literal object, including every column the quick_fixes triggers and NOT NULL constraints require.',
    },
    {
      severity: 'LOW',
      issue: 'ACTIVATED is gated on hasOwnProperty(entry, "pick_reason") rather than the value, so the :128 REGRESSED sub-branch is unreachable on the real chain because claim-stamp.cjs always assigns the key.',
      recommendation: 'Check the value, not just key presence, if that branch is meant to carry real diagnostic power.',
    },
  ],
  recommendations: [
    'DO NOT accept EXEC-TO-PLAN until the two blocking conditions land: (1) target_application on the scratch insert plus error checking, (2) TS-6 asserting the real payload. Both are small (~6 lines total) and the second is what would have caught the first.',
    'Re-run this TESTING validation after the fix; the unit tier is already green so the delta should be confined to the new payload assertion.',
    'Treat the LOW advisories (pick_reason presence-vs-value, ACTIVATED not literally reading back) as optional polish or follow-ups, not handoff blockers.',
    'Reviewer note: everything the team lead asked to be verified (raw pg probe, try/finally, /^QF-/ id, born-claimed non-open row, {merged,reason} wrapper) PASSES at source level, AC-1 passes live, and the fleet tier is 2636/2636 green. The blocking defect sits in the one area none of those five checks covered: whether the untested live insert would actually be accepted by the schema.',
  ],
  summary: 'POST-IMPLEMENTATION TESTING for ' + SD_KEY + ' at EXEC-TO-PLAN: CONDITIONAL_PASS (72). MEASURED, not prospective. Independently re-ran the target suite (12/12 pass) and the whole fleet unit tier (' + run.passed + '/' + run.executed + ' pass, ' + run.failed + ' failed, ' + run.skipped + ' skipped, 213 files); counts read from the vitest JSON artifact whose sha256 is on this row. AC-1 verified LIVE: node ' + SCRIPT_PATH + ' prints NOT_YET_APPLIED and exits 0 (exit code measured without a pipe), making zero writes. All five requested source-level checks pass: raw pg schema probe via createDatabaseClient (traced to new Client() in node-postgres, no PostgREST anywhere in the probe path); genuine try/finally cleanup with a behavioural test that throws mid-probe; scratch id matching the real QF_ID_RE at claim-stamp.cjs:96; scratch row born status="in_progress" with claiming_session_id set, failing belt-depth.cjs:227 auto-start predicate on two clauses; and the mergeQfMetadataFn wrapper genuinely capturing {merged,reason} through a seam confirmed to exist at claim-stamp.cjs:121/134. FR-2 and FR-3 verified. The file is git-tracked via an explicit .gitignore negation. ONE BLOCKING DEFECT was found in the one place those checks did not reach -- whether the untested live insert is schema-legal. It is not: ' + SCRIPT_PATH + ':147-155 omits target_application, which the quick_fixes BEFORE-INSERT trigger fn_quick_fixes_validate_target_application requires (RAISE EXCEPTION on NULL, read live from pg_get_functiondef), and the insert never checks the error supabase-js returns. The scratch row would never be created, the CAS UPDATE would match zero rows, and the script would report REGRESSED "a real defect in the chain" (exit 1) to the chairman right after the gated apply -- the exact misclassification the four-state design exists to prevent. A second HIGH defect explains why it was missed: PRD TS-6 promises to assert the real insert payload, but ' + TEST_PATH + ':127-142 injects the hook instead, so realInsertScratchQf (module-private, unexported) is unreachable by any test and all 12 still pass if status is flipped to "open" or a required column dropped. Two LOW advisories recorded: pick_reason checked by key presence not value, and ACTIVATED does not literally read back.',
  detailed_analysis: JSON.stringify({
    sd_key: SD_KEY,
    phase: 'EXEC-TO-PLAN',
    mode: 'post-implementation',
    measured: true,
    commit_reviewed: 'a38978d4d03',
    branch: 'feat/' + SD_KEY,
    target_suite: { command: 'npx vitest run ' + TEST_PATH + ' --project unit', tests: run.targetFileTests, passed: run.targetFilePassed, failed: 0 },
    regression: { command: RUN_COMMAND, files: 213, executed: run.executed, passed: run.passed, failed: run.failed, skipped: run.skipped },
    live_ac1: { command: 'node ' + SCRIPT_PATH, stdout: 'NOT_YET_APPLIED: quick_fixes.metadata does not exist yet (chairman-gated migration unapplied). Zero writes made.', exit_code: 0, reproduced: 2 },
    requested_checks: {
      a_raw_pg_probe: 'PASS',
      b_try_finally_cleanup: 'PASS',
      c_scratch_id_QF_prefix: 'PASS',
      d_never_belt_auto_startable: 'PASS at source; NOT guarded by any test (see TS-6 defect)',
      e_merge_reason_wrapper: 'PASS',
      git_tracked: 'PASS',
    },
    blocking_defects: [
      { file: SCRIPT_PATH, lines: '147-155', issue: 'insert omits target_application (BEFORE-INSERT trigger raises); supabase-js error never checked, so the failure launders into a false REGRESSED exit 1' },
      { file: TEST_PATH, lines: '127-142', issue: 'TS-6 injects insertScratchQfFn instead of asserting the real payload; realInsertScratchQf is unexported and untestable' },
    ],
    fr_verification: {
      'FR-1': 'PARTIAL -- AC-1/AC-2/AC-3/AC-5/AC-6/AC-7 verified; AC-4 correct in source but unguarded, and the live path carries the blocking insert defect',
      'FR-2': 'VERIFIED (documentary repair; path absent from main until merge)',
      'FR-3': 'VERIFIED',
    },
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
    evaluated_commit_sha: 'a38978d4d03',
    phase: 'EXEC-TO-PLAN',
  },
  phase: 'EXEC-TO-PLAN',
  conditions: [
    { action: 'Add target_application: "EHG_Engineer" to the scratch insert at ' + SCRIPT_PATH + ':147-155 and check the { error } returned by supabase-js on both insert and delete, so a failed scratch write classifies as INDETERMINATE rather than a false REGRESSED.', priority: 'critical', blocking: true },
    { action: 'Satisfy PRD TS-6 for real: export the scratch payload builder from ' + SCRIPT_PATH + ' and assert the literal insert object in ' + TEST_PATH + ', so AC-4 (status != "open", non-null claiming_session_id) and the required-column set are actually guarded.', priority: 'high', blocking: true },
  ],
  justification: 'CONDITIONAL_PASS rather than PASS: every requested source-level check passes, AC-1 is verified live (NOT_YET_APPLIED, exit 0, zero writes), the target suite is 12/12 and the fleet unit tier is ' + run.passed + '/' + run.executed + ' with zero failures. But the live ACTIVATED probe is unrunnable as written -- the scratch insert omits target_application, which a BEFORE-INSERT trigger on quick_fixes requires, and the unchecked supabase-js error would launder that into a false REGRESSED verdict delivered to the chairman right after the gated migration apply. PRD TS-6 was supposed to assert that exact payload and instead injects past it, which is why the defect survived. Both fixes are small; neither is optional before EXEC-TO-PLAN.',
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
console.log('repo_path=' + stored.metadata?.repo_path);
console.log('sd_id=' + stored.sd_id);
