#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 — TESTING RE-VERIFICATION at EXEC phase (EXEC-TO-PLAN gate).
 *
 * Follow-up to the CONDITIONAL_PASS evidence row (b9408054-add2-431b-b959-5a9d278ecb3e), whose
 * SOLE reason for CONDITIONAL_PASS instead of PASS was TEST-EXEC-1 (MEDIUM, FR-3 null-route
 * collision in computeFlowCoverage). Commit d1c91d8b7d6 closes that gap. This script is an
 * INDEPENDENT re-verification of the fix (not a rubber stamp of the author's own summary):
 * read both branches of the fix, ran the real runner (JSON reporter, hashed artifact), ran an
 * independent mutation test (reverted the fix, confirmed the exact predicted test fails, restored,
 * confirmed source byte-identical and 41/41 green again), and re-assessed the overall verdict.
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FIX-STAGE-JOURNEY-001';
const ARTIFACT = '.artifacts/sjtest-repass-results.json';
const SRC = 'lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js';
const PRIOR_EVIDENCE_ROW = 'b9408054-add2-431b-b959-5a9d278ecb3e';
const FIX_COMMIT = 'd1c91d8b7d6fe37f08a16c1bd37c0c35d63a5b74';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const artifactBuf = fs.readFileSync(ARTIFACT);
  const artifactSha = crypto.createHash('sha256').update(artifactBuf).digest('hex');
  const report = JSON.parse(artifactBuf.toString());
  const srcSha = crypto.createHash('sha256').update(fs.readFileSync(SRC)).digest('hex');

  const results = {
    verdict: 'PASS',
    confidence: 94,
    phase: 'EXEC',
    execution_time_ms: 0,
    summary:
      `RE-VERIFICATION of commit ${FIX_COMMIT}, which closes TEST-EXEC-1 (MEDIUM) from the prior CONDITIONAL_PASS evidence row (${PRIOR_EVIDENCE_ROW}). ` +
      "That row's own verdict text stated the CONDITIONAL_PASS was 'solely on gap (1)' -- TEST-EXEC-1 -- so a verified fix of that gap, with no new gap introduced, resolves to PASS by the prior review's own stated criterion. " +
      "READ BOTH BRANCHES OF THE FIX in full: (a) the flow-side branch in computeFlowCoverage now checks `resolveScreenRoute(screen, iaPages) === null` immediately after the existing screen-not-found check, pushes a FLOW_STEP_UNRESOLVED finding, and `continue`s -- excluding the step from resolvableRoutes exactly as a not-found screen already was; (b) the journey side (concatenatedRoutes) now applies `.filter((route) => route !== null)` before the subsequence comparison. Both branches are necessary and both are exercised: (a) alone would still let concatenatedRoutes carry nulls that could collide with a DIFFERENT flow's genuinely-null resolvableRoutes entry from a different bug shape; (b) alone would still let the flow side's own two nulls collide with each other. Together, no null value ever reaches isOrderedSubsequence from either side, so `null === null` can no longer produce a match -- the exact defect measured in TEST-EXEC-1. " +
      "NEW REGRESSION TEST READ AND CONFIRMED NON-VACUOUS: reconstructs the exact measured shape from TEST-EXEC-1's evidence (two screens with no matching IA page, journey order Alpha-then-Beta via story order, flow demands the reverse Beta-then-Alpha) and asserts UNCOVERED with both flow steps individually raising FLOW_STEP_UNRESOLVED. " +
      "INDEPENDENTLY MUTATION-TESTED (not trusting the author's self-report): reverted ONLY the source file to its pre-fix (parent, 90703e3e614) state via `git checkout <parent> -- <file>` while leaving the new test committed, ran the real runner -- exactly 1 of 41 tests failed, and it was the new regression test, failing with `AssertionError: expected [] to include 'Reversed Null-Route Flow'` (i.e. pre-fix code reports the reversed-order flow as COVERED, reproducing TEST-EXEC-1's exact measured false positive). Restored the fix via `git checkout ${FIX_COMMIT} -- <file>`; `git status --porcelain` on both the source and test file was empty (byte-identical restore) and the suite returned to 41/41. " +
      `RAN THE REAL RUNNER (vitest run --project unit, JSON reporter, artifact hashed below): the target file is 41/41 (40 prior + 1 new), and the 5-file scoped regression sweep the author claimed (stage-15-user-journey, eva/stage-templates/stage-15, lifecycle-sd-bridge/orchestrator-journey-steps, eva/stage-templates/analysis-steps/stage-15-coverage-disposition-reader, eva/stage-15-canonical-artifacts) is 80/80, 0 failed -- confirms the author's claimed 80/80 sweep, though note the author's own prose gave those 4 filenames without their actual subdirectory prefixes (eva/, eva/stage-templates/, lifecycle-sd-bridge/); a minor documentation-precision gap, not a test-execution gap, since this session located and ran the real files by content search. ` +
      "CHECKED FOR A NEW GAP INTRODUCED BY THE FIX (task requirement 4): on a venture where an IA page never happens to match a screen name (the measured 14/14 null-route case on live AltifyAI data cited in TEST-EXEC-1's own evidence), resolvableRoutes will be empty for every flow whose steps are all such screens, so `covered` is forced false by the `resolvableRoutes.length > 0` guard regardless of whether the flow's real screen order was actually correct. This is a real behavior change on that data shape -- pre-fix, an all-null flow with the CORRECT order also happened to read COVERED (coincidentally correct, for the wrong reason); post-fix it reads UNCOVERED (conservatively wrong, for a documented reason). This is the intended and correct tradeoff, not a new defect: it trades a SILENT, unbounded false-positive (the exact TEST-EXEC-1 defect) for an explicit, evidenced false-negative -- every excluded step still raises its own FLOW_STEP_UNRESOLVED finding, so the reader always sees why coverage could not be verified, rather than a bare unexplained miss. It is also not a new code pattern: it is the SAME treatment the file already gave to a step whose screen does not exist at all (pre-dating this fix, and validated by the existing (f) DISCRIMINATOR test, which confirms the exclusion-then-continue pattern does not itself break coverage when the REMAINING resolvable steps are in correct order). The underlying reason routes are null in the first place (IA-page/screen name misalignment) is FR-2 / route-resolution-quality territory, out of scope for this FR-3 fix and already known before this change. Recommend logging as a routine follow-up observation, not a blocker: once screen/IA name alignment improves, flows_covered will start reflecting real signal instead of being structurally near-zero on null-route-heavy ventures. " +
      "MIXED-CASE COVERAGE NOTE (minor, non-blocking): the fixture exercising 'unresolvable step present but resolvable steps still form a correct ordered subsequence -> COVERED' (existing test (f)) only exercises the no-screen-match sub-case of exclusion, not the screen-exists-but-route-null sub-case, for a flow that also has real non-null resolvable steps in correct order. The code treats both sub-cases identically (same push-finding-and-continue branch feeding the same resolvableRoutes/concatenatedRoutes arrays), so this is a code-path symmetry argument rather than direct test evidence for that exact combination; a future test adding a null-route screen alongside resolved-route screens in a COVERED flow would close this without any code change expected. Not blocking PASS. " +
      "PRIOR NON-BLOCKING FINDINGS (TEST-EXEC-2/3/4) CARRIED FORWARD, UNCHANGED, STILL NON-BLOCKING: TEST-EXEC-2 (LOW, no FLOW_PERSONA_UNMATCHED finding type) is unaddressed by this commit -- still an open follow-up recommendation, not required for this SD. TEST-EXEC-3 (LOW, FR-1 content-address collision) remains accepted-as-designed per the source's own documented tradeoff. TEST-EXEC-4 (LOW, db-tier regression leg skipped) is environmental and unaffected by this commit; not re-run here since it produces zero signal either way. " +
      "VERDICT PASS: the sole documented reason for the prior CONDITIONAL_PASS is independently confirmed fixed, root-caused (not worked around), regression-tested, non-vacuously covered, and introduces no new blocking gap -- only a documented, evidenced, conservative behavior change on already-known problematic data (null routes), which is the correct direction for an honest gauge.",
    findings: {
      critical: [],
      high: [],
      medium: [],
      low: [
        {
          id: 'TEST-EXEC-2',
          area: 'FR-3 / findings taxonomy',
          issue: "Carried forward, unchanged, from the prior evidence row. A user_flow whose persona matches no generated journey still emits plain FLOW_COVERAGE_MISSING, indistinguishable from a genuine ordering/coverage gap.",
          status: 'not_addressed_by_this_commit',
          recommendation: "Unchanged: add a FLOW_PERSONA_UNMATCHED finding type. Still a non-blocking follow-up, not required for this SD.",
          blocking: false,
        },
        {
          id: 'TEST-EXEC-3',
          area: 'FR-1 / computeStoryRef',
          issue: "Carried forward, unchanged. Two distinct stories with identical {as_a,i_want_to,so_that} collapse to the same sty- pointer.",
          status: 'accepted_as_designed',
          recommendation: "No action -- explicitly documented tradeoff in the source's own FR-1 comment.",
          blocking: false,
        },
        {
          id: 'TEST-EXEC-4',
          area: 'regression sweep coverage',
          issue: "Carried forward, unchanged. tests/integration/stage-15-stitch-handoff.test.js is a db-project suite skipped at runtime by the db-tier guard in this environment; not re-run in this re-verification since it produces zero signal either way.",
          status: 'environmental_unaffected_by_this_commit',
          recommendation: "Environmental, not an SD defect. Do not read as regression evidence in this environment.",
          blocking: false,
        },
        {
          id: 'TEST-EXEC-5',
          area: 'FR-3 / computeFlowCoverage residual behavior (new observation, not a defect)',
          issue: "On a venture where every reached screen's route resolves to null (IA-page/screen name misalignment -- the measured 14/14 case on live AltifyAI data), the fix now forces every such flow's coverage to UNCOVERED via the `resolvableRoutes.length > 0` guard, even when the flow's real screen visit order was actually correct. This is the correct, intended, documented tradeoff (a bounded, evidenced false-negative replacing an unbounded, silent false-positive) and reuses the file's pre-existing exclusion pattern for no-screen-match steps -- not a new class of gap. Recorded so it is not re-discovered as a surprise, and so flows_covered near-zero on a null-route-heavy venture is read as expected, not as a new bug.",
          status: 'observed_intended_tradeoff',
          recommendation: "No action for this SD. Once FR-2/route-resolution quality improves screen/IA-page name alignment on real ventures, flows_covered will start reflecting real signal. Out of scope here.",
          blocking: false,
        },
      ],
    },
    recommendations: [
      { action: 'TEST-EXEC-1 (MEDIUM, prior blocker for a bare PASS) is CLOSED by commit ' + FIX_COMMIT + ' -- independently re-verified, no further action.', priority: 'info', blocking: false },
      { action: 'Follow-up QF/backlog item (unchanged from prior row): add a FLOW_PERSONA_UNMATCHED finding type (TEST-EXEC-2).', priority: 'low', blocking: false },
      { action: 'Do not count tests/integration/stage-15-stitch-handoff.test.js as regression evidence in this environment (TEST-EXEC-4) -- db-tier guarded, 11/11 skipped.', priority: 'low', blocking: false },
    ],
    metadata: {
      independent_verification: true,
      measured: true,
      supersedes_evidence_row: PRIOR_EVIDENCE_ROW,
      reverification_of_finding: 'TEST-EXEC-1',
      test_execution: buildTestExecution({
        executed: report.numTotalTests,
        passed: report.numPassedTests,
        failed: report.numFailedTests,
        skipped: report.numPendingTests || 0,
        artifactSha,
        artifactPath: ARTIFACT,
        runner: 'vitest run --project unit --reporter=json',
        source: 'runner',
      }),
      target_file_suite: { file: 'tests/unit/stage-15-user-journey.test.js', total: 41, passed: 41, failed: 0, prior: 40, added_by_fix_commit: 1 },
      scoped_regression_sweep: {
        files: [
          'tests/unit/stage-15-user-journey.test.js',
          'tests/unit/eva/stage-templates/stage-15.test.js',
          'tests/unit/lifecycle-sd-bridge/orchestrator-journey-steps.test.js',
          'tests/unit/eva/stage-templates/analysis-steps/stage-15-coverage-disposition-reader.test.js',
          'tests/unit/eva/stage-15-canonical-artifacts.test.js',
        ],
        test_files_passed: 5, tests_passed: 80, tests_failed: 0,
      },
      independent_mutation_testing: {
        performed_by: 'testing-agent (this re-verification, not the fix author)',
        method: "git checkout <pre-fix parent commit> -- <source file only> (test file left at its post-fix committed state), ran real runner, then git checkout <fix commit> -- <source file> to restore",
        source_sha256_after_restore: srcSha,
        source_restored_byte_identical: true,
        git_status_clean_after_restore: true,
        result: {
          tests_run: 41,
          tests_failed: 1,
          failed_test: "a flow whose real order is the REVERSE of the journey is UNCOVERED even when every visited screen has an unresolved (null) route (regression: null must not satisfy null via route-string equality -- EXEC review finding, live data measures 14/14 null routes)",
          failure_message: "AssertionError: expected [] to include 'Reversed Null-Route Flow'",
          matches_predicted_mechanism: true,
        },
      },
      new_gap_check: {
        performed: true,
        finding: 'TEST-EXEC-5 (informational, non-blocking) -- see findings.low',
      },
      verified_commit: FIX_COMMIT,
      verified_commit_parent: '90703e3e6149bc2657b29d812fa4cfe7642202b0',
      source_sha256: srcSha,
      branch: 'feat/SD-LEO-INFRA-FIX-STAGE-JOURNEY-001',
      pr: 8989,
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: SRC,
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'QA Engineering Director' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
  console.log('STORED:', JSON.stringify({
    id: stored?.id, verdict: stored?.verdict, phase: stored?.phase,
    repo_path: stored?.metadata?.repo_path, repo_resolved: stored?.metadata?.repo_resolved,
    executed_from_cwd: stored?.metadata?.executed_from_cwd,
    test_execution: stored?.metadata?.test_execution,
  }, null, 1));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
