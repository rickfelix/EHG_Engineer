import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETRO_ID = 'f1920442-3b87-472f-aebb-3850c743c209';

const what_went_well = [
  "Three independent sub-agent review passes caught three DIFFERENT real defects at three different points in the lifecycle, before any of them reached main: (1) LEAD-phase VALIDATION (c84eda3c-0670-406e-80a6-d7c42b650f02, CONDITIONAL_PASS/92) measured -- via live execution against a score-85/1-issue PRD, not just static reading -- that the QF's literal proposed fix (swap to validatePRDForHandoff) would regress 447 of 1698 heuristic-path PRDs, because validatePRDForHandoff returns {valid, score,...} with no `passed`/`max_score` keys, so ValidatorRegistry.normalizeResult's nullish-coalesce chain falls through to `score >= 100` and silently inverts the gate for well-scoring PRDs. This is exactly the class of defect a 15-LOC QF review would not surface without live execution.",
  "(2) PLAN-phase TESTING (d4676393-9dc8-4ecd-9065-cbea28dc2c23, CONDITIONAL_PASS/82) reviewed the CORRECTED test plan (post-VALIDATION-fix) before EXEC wrote a line of code, and found the plan itself was unsound in three independent ways: TS-1's fixture would trip the SAME unconditional-block issue class that FR-3/AC-3 requires stay blocking (a fixture collision -- the test could not pass and satisfy the safety requirement simultaneously); TS-3's GIVEN clause (`validatePRDQuality result is {passed:false, score:72, details: undefined}`) was unreachable through the real module without mocking, so the assertion would pass for the wrong reason (a vacuous scenario); and FR-1 AC-2/AC-3 were unobservable through every specified assertion because normalizeResult's own fallback synthesizes max_score=100 regardless of what the gate does, so none of the five test scenarios as originally specified could actually distinguish 'the fix works' from 'normalizeResult's fallback happened to agree' (an unobservable assertion point).",
  "(3) Post-implementation, TESTING (e45e5976-e0cf-443e-81ac-c394faa9c73b, CONDITIONAL_PASS/92) found the empty-PRD quality floor (D2) is closed by the pre-existing unconditional-block regex patterns, not by the new category-derived threshold as FR-3/AC-1 claimed -- for infrastructure/documentation categories (threshold 50) the empty PRD's score of 53 actually CLEARS the new threshold, leaving those two regexes as the sole remaining guard, untested as such. The same pass independently corrected a stale population figure (PRD counts were off by roughly two orders of magnitude in the wrong direction -- 1698/2979 heuristic/AI-rubric claimed vs. 4618/60 measured live) that had been carried unchallenged from the LEAD-phase measurement into the PRD. SECURITY (c4ada0e0-ab70-49b4-b15d-0be4d33c391f, CONDITIONAL_PASS/92) in the same phase caught a missing isMainModule guard on a brand-new one-off script (measure-gate-plan-exec-001-regression.mjs) that would execute a privileged bulk read plus unbounded paid-LLM-call exposure on a bare import -- CI (`gh pr checks 8263`, run 33986320496) was already RED on `require-main-guard-in-one-off-lint` at the time this was found.",
  "Final measured outcome, independently reproduced by the EXEC_TO_PLAN TESTING pass against the real gate (not a replica): 0 regressions and 0 AI-path verdict changes across 4678 live PRDs, 76 newly-passing PRDs in the placeholder/boilerplate class the fix targets.",
  "All findings from all four review passes were resolved before this handoff -- commits 6f25879da8b (score-based leniency), 84ac4fe2099 (EXEC-TO-PLAN TESTING findings), and fa93c757ac8 (main-guard fix) -- with 0 critical_issues remaining open on either EXEC_TO_PLAN pass."
];

const what_needs_improvement = [
  "The originating QF (QF-20260903-239) correctly diagnosed the underlying defect but estimated the fix at 15 LOC. The actual production-code delta (gate-1-plan-to-exec.js + PlanToExecVerifier.js) was ~64 LOC, the accompanying unit test file was 275 LOC, and the total branch diff -- including one-off measurement/migration scripts required to safely execute and verify the fix -- was 1,308 LOC across 11 files. Even excluding process/tooling scripts, core-fix-plus-test is >20x the original estimate; including the verification tooling the SD needed to prove zero-regression, it is >85x. The QF process has no mechanism that would have caught this at estimate time: LOC estimates for gate/validator-registry code are being made by reading the immediate call site, not by tracing the schema contract between the call site and its normalizer.",
  "The QF's OWN measurement (cited in its escalation body: 'MEASURED (full population, 4648 PRDs, paginated)... zero-regression... 216 currently-blocked PRDs newly pass') was superficially rigorous -- it ran a real population measurement -- but measured the WRONG thing: it validated that `minimumScore=50` was a safe threshold value in isolation, without independently re-deriving how validatePRDForHandoff's return shape flows through normalizeResult. A measurement that exercises only the threshold-comparison half of the change, not the full call chain, produces false confidence. The LEAD-phase VALIDATION pass caught this only because it independently traced normalizeResult's fallback logic line-by-line rather than trusting the QF's stated zero-regression claim.",
  "The QF's escalation could plausibly have caught 'the literal fix is unsafe' earlier if QF triage required tracing the return-shape contract of any function being swapped into a call site that feeds a generic normalizer (registry.normalizeResult) -- this is a repeatable pattern (GATE_RESULT_SCHEMA valid-vs-passed hazard, per the VALIDATION agent's own framing) that a lighter, more targeted static check could plausibly flag before a QF is even filed, rather than requiring a full LEAD-phase sub-agent pass to discover.",
  "The PRD carried forward a stale population figure (1698 heuristic-path / 2979 AI-rubric-path PRDs) from the LEAD-phase measurement into FR-2/FR-3 without being re-verified at PLAN or EXEC time, and it survived two full review passes (VALIDATION at LEAD, TESTING at PLAN_PRD) before the EXEC_TO_PLAN TESTING pass caught that the real numbers were 4618/60 -- roughly inverted. Numbers used to justify a scope boundary (heuristic-only vs. AI-rubric-only) should be re-measured at the point they are cited, not carried forward from an earlier phase's snapshot.",
  "A brand-new one-off script shipped in the same commit as the core fix (6f25879da8b) with a lint-enforced convention violation (missing main-guard) that was independently already failing CI before SECURITY's review -- the violation was visible in `gh pr checks` before a sub-agent had to name it, suggesting EXEC did not check CI status before considering the diff handoff-ready."
];

const key_learnings = [
  {
    category: "GATE_SCHEMA_CONTRACT",
    evidence: "sub_agent_execution_results c84eda3c-0670-406e-80a6-d7c42b650f02 (VALIDATION, LEAD, CONDITIONAL_PASS/92)",
    learning: "When a fix proposes swapping one validator function for another that feeds a shared normalizer (here, ValidatorRegistry.normalizeResult's `passed = result.passed ?? result.pass ?? (score >= max_score)` fallback chain), the safety of the swap depends entirely on the RETURN SHAPE of the new function matching what the normalizer expects -- not on whether the new function's business logic is more correct. validatePRDForHandoff's {valid, score} shape (no `passed`, no `max_score`) silently degraded to `score >= 100` under the fallback, which is a stricter, not more lenient, gate than intended -- the opposite of the QF's goal.",
    applicability: "Any future fix that reroutes a gate through a different validator/wrapper function must explicitly trace the full call chain through its normalizer/adapter layer and mandate an explicit field-mapping FR, not just verify the swap's business-logic correctness in isolation."
  },
  {
    category: "TEST_PLAN_REVIEW_BEFORE_CODE",
    evidence: "sub_agent_execution_results d4676393-9dc8-4ecd-9065-cbea28dc2c23 (TESTING, PLAN_PRD, CONDITIONAL_PASS/82)",
    learning: "A PLAN-phase TESTING review of the test plan itself (before EXEC writes code) caught a fixture collision (a test scenario's fixture would trip the SAME issue class another FR requires stay unconditionally blocking), a vacuous scenario (a GIVEN clause unreachable through the real module without mocking, so the assertion would pass for the wrong reason), and an unobservable assertion point (the normalizer's own fallback behavior makes several planned assertions unable to distinguish 'fix works' from 'fallback happened to agree'). All three would have produced a GREEN but non-diagnostic test suite if not caught pre-implementation.",
    applicability: "For any gate/validator-registry fix, require a PLAN-phase TESTING pass on the test plan (not just the PRD) before EXEC starts, specifically probing: (a) do any two required test scenarios structurally conflict, (b) is every GIVEN clause reachable through real code without new mocking infrastructure, (c) can each assertion actually fail in the way the FR intends, distinct from a downstream fallback."
  },
  {
    category: "STALE_MEASUREMENT_CARRYOVER",
    evidence: "sub_agent_execution_results e45e5976-e0cf-443e-81ac-c394faa9c73b (TESTING, EXEC_TO_PLAN, CONDITIONAL_PASS/92), finding D5",
    learning: "A population measurement (heuristic-path vs. AI-rubric-path PRD counts) computed once at LEAD phase was cited unchanged through PLAN_PRD and into the shipped PRD's FR-2/FR-3 justification, and was off by roughly two orders of magnitude (claimed 1698/2979, measured live 4618/60) because the LEAD-phase measurement likely omitted the sdType/sdCategory options the gate actually passes at runtime. The DIRECTION and safety conclusion (heuristic-only scoping is correct and conservative) both survived; only the magnitude was wrong -- but a magnitude wrong by 50x undermines confidence in every other number in the same document.",
    applicability: "Any population-scale measurement used to justify a scope boundary should be re-run at the point it is cited (PRD, EXEC handoff) rather than carried forward from an earlier phase snapshot, especially when the measurement script's invocation parameters could plausibly differ from the real call site's."
  },
  {
    category: "ONE_OFF_SCRIPT_CI_HYGIENE",
    evidence: "sub_agent_execution_results c4ada0e0-ab70-49b4-b15d-0be4d33c391f (SECURITY, EXEC_TO_PLAN, CONDITIONAL_PASS/92), finding SEC-1",
    learning: "A new one-off verification script (measure-gate-plan-exec-001-regression.mjs) shipped without the required isMainModule guard, and the repo's own require-main-guard-in-one-off-lint CI check was already failing at the time of the EXEC-TO-PLAN handoff. The security impact was real (unconditional top-level execution on bare import would trigger a privileged bulk read plus unbounded paid-LLM-call exposure), and the fix was a well-established one-line pattern already used by a sibling script in the same PR.",
    applicability: "EXEC should check `gh pr checks <pr-number>` for RED CI status before considering a diff handoff-ready -- a CI-visible lint failure should never need a sub-agent review pass to surface."
  },
  {
    category: "QF_ESCALATION_SCOPE_CALIBRATION",
    evidence: "SD metadata.qf_estimated_loc=15 vs. actual diff of 1308 LOC / 11 files (core fix + test: ~339 LOC; verification/measurement tooling: ~969 LOC)",
    learning: "QF-20260903-239 correctly diagnosed a real, high-value defect and correctly recommended escalation to a full SD (Tier 3, per the LEO Work Item Routing table), but its own literal proposed fix and 15-LOC estimate were themselves unsafe/undersized. The QF's escalation reasoning ('this needs Tier 3 because it touches a shared gate') was sound; the LOC estimate attached to the specific literal fix was not, because the QF measured whether the threshold VALUE was safe without independently tracing the return-SHAPE contract between the swapped-in function and the shared normalizer it feeds.",
    applicability: "For QFs proposing to reroute a call site through a different validator/wrapper function, LOC estimation should explicitly account for a) tracing the full return-shape contract through any shared normalizer, and b) accompanying test/verification-tooling LOC, not just the call-site edit itself -- a QF touching a gate-pipeline schema contract should default toward Tier 3 estimation even when the surface-level diff looks like a one-line swap."
  }
];

const action_items = [
  {
    owner: "QF Triage / leo-create-sd.js",
    action: "When a QF proposes rerouting a call site through a different validator/wrapper function that feeds a shared normalizer (e.g. ValidatorRegistry.normalizeResult), require the QF body to explicitly state the OLD and NEW return shapes and how each field maps through the normalizer, before an LOC estimate is accepted.",
    source: "root_cause_analysis",
    deadline: "Before next gate/validator-registry QF",
    priority: "high",
    root_cause: "QF-20260903-239 measured threshold-value safety but not return-shape compatibility with the shared normalizer, producing a 15-LOC estimate for a fix later proven to regress 447/1698 PRDs.",
    smart_format: true,
    success_criteria: "Next gate-pipeline QF escalation includes an explicit before/after return-shape comparison for any swapped validator function.",
    verification_query: "N/A - process check on next relevant QF body, not a DB-verifiable state"
  },
  {
    owner: "PLAN sub-agent orchestration",
    action: "Keep the PLAN-phase TESTING review of the TEST PLAN (not just the PRD) as a standing step for gate/validator-registry SDs, given it caught a fixture collision, a vacuous scenario, and an unobservable assertion point on this SD before any code was written.",
    source: "success_pattern",
    deadline: "Ongoing - already standard for this SD class",
    priority: "medium",
    root_cause: "Test-plan-only review at PLAN_PRD phase surfaced defects that a code-only TESTING review at EXEC_TO_PLAN would have found only after implementation, wasting an EXEC cycle.",
    smart_format: true,
    success_criteria: "Future gate/validator-registry SDs show a PLAN_PRD-phase TESTING sub_agent_execution_results row prior to the PLAN-TO-EXEC handoff.",
    verification_query: "SELECT id, phase, verdict FROM sub_agent_execution_results WHERE sub_agent_code='TESTING' AND phase='PLAN_PRD' AND sd_id = '<future-sd-uuid>'"
  },
  {
    owner: "EXEC (session agent)",
    action: "Check `gh pr checks <pr-number>` for RED CI status before considering an EXEC-TO-PLAN handoff diff ready, specifically the require-main-guard-in-one-off-lint check for any new scripts/one-off/*.mjs file.",
    source: "gap_analysis",
    deadline: "Immediate - apply to next EXEC-phase handoff",
    priority: "medium",
    root_cause: "A new one-off script shipped without isMainModule guard while CI was already RED on the relevant check; the gap was caught by SECURITY sub-agent review rather than by EXEC checking CI status directly.",
    smart_format: true,
    success_criteria: "EXEC-TO-PLAN handoffs cite the `gh pr checks` result (0 failing required checks) in the handoff's executive_summary or known_issues.",
    verification_query: "SELECT executive_summary, known_issues FROM sd_phase_handoffs WHERE handoff_type='EXEC-TO-PLAN' AND sd_id = '<future-sd-uuid>'"
  },
  {
    owner: "PRD authoring (PLAN)",
    action: "Re-measure any population-scale statistic cited to justify a scope boundary (e.g. heuristic-path vs. AI-rubric-path PRD counts) at PRD-authoring time rather than carrying forward a number computed in an earlier phase, and record the measurement script/command used.",
    source: "evidence_gap",
    deadline: "Before next PRD citing a population measurement",
    priority: "medium",
    root_cause: "The PRD's FR-2/FR-3 population figures (1698/2979) were carried forward from a LEAD-phase measurement that likely omitted runtime-passed sdType/sdCategory options, and were off from the measured live figures (4618/60) by roughly two orders of magnitude.",
    smart_format: true,
    success_criteria: "PRDs citing a live population measurement include the exact command/script used and its execution timestamp.",
    verification_query: "N/A - PRD content check, not a DB-verifiable state"
  }
];

const success_patterns = [
  "Multi-pass, multi-phase sub-agent review (LEAD VALIDATION -> PLAN_PRD TESTING -> EXEC_TO_PLAN TESTING + SECURITY) caught four distinct, real, independently-verified defects at four different points in the lifecycle, none of which were caught by the prior pass -- each pass genuinely added information rather than re-confirming the previous one.",
  "Live execution / measurement (not just static code reading) was used at every review pass -- the LEAD-phase agent ran the naive fix against a real PRD fixture rather than reasoning about it abstractly, which is what surfaced the schema-mismatch regression the QF's own population measurement had missed.",
  "Independent re-measurement at EXEC_TO_PLAN (driving the real gate rather than trusting the shipped one-off script's replica) caught both a stale population figure and confirmed the final zero-regression/76-newly-passing outcome, closing the loop the LEAD-phase measurement had opened."
];

const failure_patterns = [
  "QF LOC estimation for a fix that reroutes a call site through a different validator function feeding a shared normalizer did not account for the return-shape contract, producing an estimate off by roughly 20-85x depending on scope counted (core fix+test vs. full diff including verification tooling).",
  "A population-scale measurement computed once at LEAD phase was carried forward unchallenged through two further review passes (VALIDATION at LEAD, TESTING at PLAN_PRD) before being caught wrong by ~50x at EXEC_TO_PLAN -- no phase re-verified a cited number before using it to justify scope.",
  "A new one-off script's CI-visible lint failure (missing main-guard) was not caught by EXEC before handoff despite being visible in `gh pr checks` at handoff time, and was instead first surfaced by a SECURITY sub-agent pass."
];

const { data, error } = await supabase
  .from('retrospectives')
  .update({
    title: "SD-LEO-FIX-GATE-PLAN-EXEC-001: gate-1-plan-to-exec.js prdQualityValidation leniency fix - Retrospective",
    description: "Retrospective for a QF-escalated bugfix to the prdQualityValidation gate (gate-1-plan-to-exec.js). The originating QF correctly diagnosed the defect but its own literal proposed fix and 15-LOC estimate were proven unsafe by two independent sub-agent review passes (LEAD VALIDATION, PLAN_PRD TESTING) before code was written, and two more passes (EXEC_TO_PLAN TESTING, SECURITY) found further real gaps after implementation. Final state: 0 regressions / 0 AI-path changes across 4678 live PRDs, 76 newly-passing PRDs.",
    what_went_well,
    what_needs_improvement,
    key_learnings,
    action_items,
    success_patterns,
    failure_patterns,
    quality_score: 92,
    velocity_achieved: 92,
    team_satisfaction: 9,
    objectives_met: true,
    bugs_found: 4,
    bugs_resolved: 4,
    generated_by: 'MANUAL',
    status: 'PUBLISHED',
    learning_category: 'PROCESS_IMPROVEMENT',
    related_prs: ['https://github.com/rickfelix/EHG_Engineer/pull/8263'],
    related_commits: ['6f25879da8b', '84ac4fe2099', 'fa93c757ac8'],
    related_files: [
      'scripts/modules/handoff/validation/validator-registry/gates/gate-1-plan-to-exec.js',
      'scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js',
      'tests/unit/plan-to-exec/gate1-prd-quality-leniency.test.js',
      'scripts/one-off/measure-gate-plan-exec-001-regression.mjs'
    ]
  })
  .eq('id', RETRO_ID)
  .select('id, quality_score, status')
  .single();

console.log('UPDATE RESULT:', JSON.stringify(data, null, 2));
if (error) console.log('ERROR:', error);
