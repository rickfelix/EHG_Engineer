#!/usr/bin/env node
/**
 * One-off: VALIDATION sub-agent independent verdict for
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001, PLAN_VERIFICATION phase.
 *
 * Commits under review: 313884be1aba9617e82e78ba08dd345e356b704b (implementation, 10 files,
 * +929/-14) and 7bf552b9fdcbad1488e1877f8fb571259bc6ffa8 (TESTING evidence script, no prod code).
 *
 * Independent of TESTING (e7445772 FAIL 90, 56dc6248 CONDITIONAL_PASS 88, testing-exec-to-plan
 * PASS 92) and REGRESSION (PASS 95). This review re-derived every FR/TR against the actual
 * shipped code rather than trusting prior sub-agent summaries, and traced ALL callers of
 * _advanceStage() (not just the 3 that pass a `result` context) to check FR-1's literal claim
 * that a chairman-adjudicated row is recorded on "every real _advanceStage() transition."
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'c0d3fcc7-dfd8-4c00-a9e9-1ec49fe48f7f';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';

const findings = [
  {
    id: 'FR-1-coverage-gap-two-preexisting-shortcuts-bypass-handleChairmanGate',
    severity: 'CRITICAL',
    summary: "The new recordGateAttempt() call inside _advanceStage() (stage-execution-worker.js:3277) is gated exclusively on `result?._chairmanGateSource === 'chairman_decision'`, and that field is written at exactly ONE site (:1432), inside the post-execution `_handleChairmanGate()` call block (:1400-1436). Direct reading of the surrounding loop found TWO separate, pre-existing 'chairman decision already approved -- skip re-processing, advance directly' shortcuts that call _advanceStage() WITHOUT ever invoking _handleChairmanGate() in that iteration, and therefore never set the tag: (a) the isPreExecGate 'approved decision + existing artifacts' branch (:1053-1196), which calls _advanceStage() at :1187 with `{ advancementType: 'pre_exec_skip' }` -- NO `result` key at all; (b) the SD-VW-FIX-WORKER-GATE-REENTRY-001 post-execution re-entry shortcut (:1227-1254), which independently re-queries chairman_decisions for status='approved' and calls _advanceStage() at :1245 with `{ result, advancementType: 're_entry' }`, where `result` is the fresh object from _executeWithRetry() (:1206) and has never had `_chairmanGateSource` set on it. Both shortcuts are scoped to `gov.isReview(currentStage) || gov.isBlocking(currentStage)` (:917, :1231) -- isBlocking is explicitly kill union promotion (stage-governance.js:105-106 comment) -- i.e. exactly the gate semantics this SD targets, not an unrelated code path. Both are real, load-bearing, pre-existing branches (each carries its own RCA/bugfix comment: QF-20260320-509 Bug 2, SD-VW-FIX-WORKER-GATE-REENTRY-001) documenting that 'chairman approved the decision between polls, worker re-enters' is a known, recurring, deliberately-handled production scenario -- not a hypothetical corner case. Net effect: any real chairman-adjudicated advance that reaches _advanceStage() via either of these two shortcuts (which appears to be the common case whenever the chairman approves asynchronously via the dashboard rather than while the worker happens to be synchronously blocked inside waitForDecision()) produces ZERO eva_stage_gate_attempts rows, post-fix, for the same underlying reason it produced zero pre-fix. FR-1's own title ('...on every real _advanceStage() transition') is not met by the shipped mechanism.",
  },
  {
    id: 'testing-exec-to-plan-finding-9-directly-contradicted-by-code',
    severity: 'HIGH',
    summary: "TESTING's EXEC-TO-PLAN evidence (testing-exec-to-plan-altifyai-instrumentation-001.mjs, PASS 92) finding 'pre-existing-adjacent-coverage-boundary-not-a-regression-out-of-scope' asserts that for BLOCKING/hard-gate stages, the pre-execution 'universalApproved' shortcut (:826-911) 'explicitly falls through to the isPreExecGate block and eventually still reaches _handleChairmanGate() at :1401 in the same iteration,' concluding the primary blocking-gate pathway is unaffected. Reading the isPreExecGate block in full (:915-1201) shows this is only true for the narrow sub-case at :1197-1200 where the stage has NO existing artifacts yet ('No artifacts yet -- fall through to execute processStage() normally'). The far more representative case -- decision already approved AND artifacts already exist (:1108-1196, the normal state for any kill/promotion gate that already ran its analysis before being gated) -- short-circuits at call site :1187 and never reaches _handleChairmanGate() at all. TESTING's PASS verdict rests in part on a claim that does not hold for the dominant sub-case.",
  },
  {
    id: 'FR-1-FR-2-literal-acceptance-criteria-not-behaviorally-demonstrated',
    severity: 'HIGH',
    summary: "FR-1's acceptance_criteria (PRD JSON, not just its description) literally require: 'After a fixture venture successfully advances one stage via _advanceStage(), exactly one new eva_stage_gate_attempts row exists... with resolved_outcome=\\'chairman_adjudicated\\' and passed=NULL' and 'a fixture where any chokepoint blocks the advance produces ZERO new attempt rows.' FR-2's acceptance_criteria require an N>=5 repeated-poll fixture producing zero rows, then one row on success. Read tests/unit/eva/advance-stage-chairman-attempt-recording.test.js in full: it is a pure `fs.readFileSync` + string-containment/index-position test suite over stage-execution-worker.js's source text. It never invokes _advanceStage(), never constructs a fixture venture, never mocks supabase.rpc, and never asserts an actual row count or call count against a real invocation. None of FR-1's or FR-2's literal acceptance criteria are behaviorally demonstrated by any test in the shipped suite -- only inferred via static source inspection. TESTING's own PLAN-TO-EXEC re-review (56dc6248) and FR-3's PRD description explicitly negotiated this downgrade ('_advanceStage() is too large/entangled... Do NOT attempt a full behavioral unit test'), but FR-1's and FR-2's own acceptance_criteria text was never edited to match -- the PRD as currently written contains criteria the shipped tests do not satisfy, even though the downgrade itself was reasonable and disclosed elsewhere in the same document.",
  },
  {
    id: 'FR-1a-second-acceptance-criterion-also-source-inspection-only',
    severity: 'MEDIUM',
    summary: "FR-1a's 2nd acceptance criterion ('FR-1's new recordGateAttempt() call fires ONLY when source===\\'chairman_decision\\' -- a fixture exercising the other 4 sources produces ZERO new eva_stage_gate_attempts rows') is likewise not behaviorally demonstrated. stage-execution-worker-chairman-gate-source.test.js is genuinely a real, well-constructed test of _handleChairmanGate() itself (constructs a real StageExecutionWorker, calls the real method, asserts exact toEqual shapes for all 5 branches) -- this part is solid. But it never exercises the downstream recordGateAttempt()-fires-or-not behavior; that remains covered only by the same static source-grep test as finding above.",
  },
  {
    id: 'commit-message-test-count-overstated',
    severity: 'LOW',
    summary: "Commit 313884be1ab claims '48 tests pass across 6 files.' Independently ran the 6 most-plausible files (2 new: advance-stage-chairman-attempt-recording.test.js [6], stage-execution-worker-chairman-gate-source.test.js [5]; 2 updated: stage-execution-worker-fixture-venture-gate.test.js [5], stage-execution-worker-high-consequence-mint.test.js [9]; 2 cited sibling-pattern files: artifact-persistence-service-gate-attempt.test.js [10], orchestrator-gate-result-persist.test.js [7]) = 42 tests, not 48. TESTING's own EXEC-TO-PLAN evidence independently flagged the same imprecision (finding 'minor-commit-message-test-count-imprecision', got 25-33 depending on file selection). I confirm the discrepancy from a third angle (42 across the most plausible 6-file set) -- documentation-only, not a functional defect.",
  },
  {
    id: 'TR-1-TR-3-TR-4-gateType-passed-null-confirmed-correct',
    severity: 'INFO',
    summary: "Independently confirmed via direct code read: gateType:'stage_gate' maps to 'exit' via recordGateAttempt()'s own GATE_TYPE_MAP (artifact-persistence-service.js:496); `passed` is correctly omitted and resolves to NULL via the finalize call's ternary (`resolvedOutcome === 'machine_pass' ? true : resolvedOutcome === 'machine_fail' ? false : null`), matching the CHECK constraint. TR-3 (stageNumber = FROM stage) confirmed against eva-orchestrator.js's existing call sites: `resolvedStage` (used identically at :930 and :1316) is defined as `stageId ?? ventureContext.current_lifecycle_stage ?? 1` with `nextStage = resolvedStage + 1` computed afterward -- i.e. resolvedStage IS the from-stage, matching the new call site's `stageNumber: fromStage`. TR-4's try/catch (non-fatal, logs via `this._logger.warn`, never re-throws) matches the pattern at the 4 existing call sites. FR-1a's 5-branch source tagging is correctly split (2 genuine chairman_decision branches, 3 automated-bypass branches) and both pre-existing toEqual-pinned tests (stage-execution-worker-high-consequence-mint.test.js:268, stage-execution-worker-fixture-venture-gate.test.js:98) were correctly updated in the same commit.",
  },
  {
    id: 'lead-descope-metadata-accurately-reflects-what-was-measured',
    severity: 'INFO',
    summary: "Queried strategic_directives_v2.metadata directly (not re-reading the PRD's own summary of it). metadata.plan_content's 'LEAD-PHASE VERIFICATION FINDING' section and metadata.mechanism_verifications (3 entries) accurately and consistently describe the original SD's FR-1 (launch_mode/launched_at reconciliation) as blocked on a structurally-unreachable Stage-24 go-live gate for AltifyAI specifically, and FR-2 (retroactive guardrail seeding via VENTURE-SCAFFOLD-CODE-001) as targeting a mechanism that performs zero DB writes -- both matching this PRD's executive_summary and risk[1] verbatim. No drift found between what was actually measured at LEAD and what the SD's durable metadata records.",
  },
  {
    id: 'no-undisclosed-scope-drift',
    severity: 'INFO',
    summary: "The only change outside the PRD's declared FR-1/FR-1a component list is the stale-PGRST202-comment correction in artifact-persistence-service.js (comment-only, function body byte-identical, confirmed via diff) -- explicitly pre-authorized by the PRD's own risk[2] entry ('EXEC should also correct or remove the stale comments while touching this code, as a small drive-by fix'). No other out-of-scope changes found in either commit.",
  },
];

const warnings = [
  "The FR-1/FR-2 coverage gap (finding #1) means this SD may not actually close the problem it exists to fix for AltifyAI's real future chairman approvals, to the extent those approvals route through either pre-existing 'already-approved, skip re-processing' shortcut rather than through _handleChairmanGate()'s own live-wait branches. This cannot be fully resolved by static analysis alone -- a post-deploy smoke test (this SD's own TS-4/smoke_test_steps) against a REAL AltifyAI kill/promotion approval is the only way to confirm which code path fires in practice, and should be watched closely rather than assumed closed.",
];

const recommendations = [
  "Thread the same decision-source signal through the two uninstrumented shortcuts identified in finding #1: at :1067 (isPreExecGate 'approved decision' branch) and :1242 (re-entry shortcut), both already positively confirm `status === 'approved'` on a non-advisory chairman_decisions row before calling _advanceStage() -- this is exactly FR-1a's own definition of a genuine chairman decision (case 4's semantics, re-derived independently rather than via _handleChairmanGate()). Set an equivalent tag (e.g. pass `chairmanGateSource: 'chairman_decision'` directly in the _advanceStage() context object at call sites :1187 and :1245, or synthesize a `result` object carrying `_chairmanGateSource` before those calls) so _advanceStage()'s existing, already-correct gate at :3277 also fires for these two paths.",
  "Correct FR-1's and FR-2's acceptance_criteria text in the PRD (not just FR-3's description) to reflect the source-inspection-only testing strategy that was actually negotiated and shipped, OR add the fixture-based behavioral test originally specified -- the current mismatch between literal acceptance criteria and actual test coverage should not persist silently.",
  "Re-verify TESTING's EXEC-TO-PLAN finding #9 ('pre-existing-adjacent-coverage-boundary...') given it rests on a claim (blocking stages 'eventually still reach _handleChairmanGate()') that does not hold for the dominant sub-case (artifacts already exist) -- this finding should be corrected or retracted, and its PASS verdict re-considered in light of finding #1 above.",
];

const summary = "VALIDATION review of SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 at PLAN_VERIFICATION, independent of TESTING (FAIL 90 -> CONDITIONAL_PASS 88 -> PASS 92) and REGRESSION (PASS 95). All FR-1a mechanics (5-branch source tagging, 2 toEqual test updates), TR-1/TR-3/TR-4 (gateType/passed-NULL/stageNumber/try-catch), and the LEAD-phase descope's reflection in SD metadata were independently re-derived from source and confirmed correct. However, tracing ALL 7 callers of _advanceStage() (not just the 3 that pass a `result` context, which prior sub-agents' analyses focused on) surfaced a real coverage gap: two pre-existing, load-bearing shortcuts (stage-execution-worker.js:1187 and :1245) advance a venture off a genuine, already-approved chairman_decisions row entirely without invoking _handleChairmanGate(), so the new source-gated recordGateAttempt() call never fires for either. Both shortcuts are scoped to exactly the kill/promotion/review gate semantics this SD targets and are the documented, deliberate handling for 'chairman approved between polls, worker re-enters' -- a real, recurring production pattern per their own RCA comments, not a hypothetical. This directly contradicts a specific claim in TESTING's EXEC-TO-PLAN PASS evidence, which is falsified by reading the isPreExecGate block's actual branching (its claim only holds for the 'no artifacts yet' sub-case, not the dominant 'artifacts already exist' case). Separately, FR-1's and FR-2's own literal acceptance_criteria describe fixture-based behavioral proof ('exactly one new row', 'zero rows across N polls') that no shipped test actually performs -- the only test touching _advanceStage() itself is pure source-string inspection, a downgrade negotiated in FR-3's description but never reflected back into FR-1/FR-2's acceptance_criteria text. Ran `npx vitest run tests/unit/eva/` independently: 569 files, 7401 passed, 34 skipped, 1 failed (path-integrity-flags-live-defaults.db.test.js, pre-existing, DB-tier-gated, unrelated to this SD). The 6 most-directly-implicated files total 42 passing tests, not the '48' the commit message claims.";

const justification = "Verdict is FAIL rather than CONDITIONAL_PASS because finding #1 is not a documentation nit or a narrow edge case -- it is a code-confirmed gap in the exact mechanism this SD exists to deliver, on the exact gate type (kill/promotion/review) this SD targets, via two pre-existing code paths whose own comments confirm they exist specifically to handle 'chairman approved between polls' as a real, recurring scenario. Both prior sub-agents (TESTING at EXEC-TO-PLAN, REGRESSION at PLAN_VERIFICATION) inventoried the 3 call sites that pass a `result` context and confirmed those 3 are correctly gated, but neither traced what happens at the 4 call sites that do NOT pass `result` (or, in TESTING's case, made an incorrect claim about one of them reaching _handleChairmanGate() when it demonstrably does not for the dominant sub-case). The literal-acceptance-criteria gap (finding #3) compounds this: no test in the shipped suite would have caught finding #1, because none of them exercise _advanceStage() end-to-end against a fixture -- they are all either isolated _handleChairmanGate() unit tests (real, correct, but scoped away from the gap) or static source-string inspection (which cannot see cross-call-site data-flow gaps by construction).";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'FAIL',
    confidence_score: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_VERIFICATION',
      commits_reviewed: ['313884be1aba9617e82e78ba08dd345e356b704b', '7bf552b9fdcbad1488e1877f8fb571259bc6ffa8'],
      prior_subagent_evidence_considered: [
        'TESTING e7445772 (FAIL 90, PLAN-TO-EXEC)',
        'TESTING 56dc6248 (CONDITIONAL_PASS 88, PLAN-TO-EXEC re-review)',
        'TESTING testing-exec-to-plan-altifyai-instrumentation-001 (PASS 92, EXEC-TO-PLAN)',
        'REGRESSION regression-plan-verification-altifyai-instrumentation-001 (PASS 95, PLAN_VERIFICATION)',
      ],
      advanceStage_call_sites_full_trace: {
        total: 7,
        instrumented_correctly: [1871, 1506],
        instrumented_but_unreachable_via_chairman_decision_in_practice: [1245],
        never_instrumented_no_result_context: [899, 1002, 1086, 1187],
        note: "1245 ('re_entry') and 1187 ('pre_exec_skip') both handle a genuine already-approved chairman_decisions row but neither sets/carries _chairmanGateSource='chairman_decision', so recordGateAttempt() never fires for either despite both representing real chairman-adjudicated advances.",
      },
      test_suite_results: {
        full_eva_directory: '569 files, 7401 passed, 34 skipped, 1 failed (pre-existing DB-tier-gated, unrelated)',
        six_most_implicated_files_total: 42,
        commit_message_claim: 48,
      },
      fr1_fr2_acceptance_criteria_vs_shipped_tests: 'literal criteria require fixture-based row-count/call-count proof against a real _advanceStage() invocation; shipped test (advance-stage-chairman-attempt-recording.test.js) is fs.readFileSync + string-containment only, never invokes the function',
    },
    phase: 'PLAN_VERIFICATION',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'VALIDATION' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION', source: 'manual' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
