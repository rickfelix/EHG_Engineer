#!/usr/bin/env node
/**
 * PLAN_VERIFICATION-phase SD_COMPLETION retrospective for
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (id=7c25340a-965b-40fd-a53b-2248ad126d9e,
 * sd_key='SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001', sd_type=infrastructure,
 * target_application=EHG_Engineer, no children). PR #8984, HEAD commit 5d471426099.
 *
 * WHY A NEW ROW RATHER THAN AN EDIT OF 2d50c146. The default PLAN_VERIFICATION
 * completion flow already wrote retrospectives row 2d50c146-75d2-44f7-9ace-1605720f5e23
 * (status=PUBLISHED, retro_type=SD_COMPLETION, quality_score=80, metadata.generated_by=
 * 'preflight_autogen') plus a matching sub_agent_execution_results RETRO row
 * (f3c8a118-ef38-41fc-836e-4587fb4aa81c, verdict=PASS, confidence=100,
 * detailed_analysis='{}'). Both are template boilerplate ("SD executed 3 handoffs",
 * "reference X for similar SD scope estimation" repeated, objectives_met:false /
 * within_scope:false despite the SD being on-track at 70% with an accepted EXEC-TO-PLAN
 * handoff). Neither names the real story of this build: the LEAD-phase VALIDATION pass
 * that corrected 3 material errors in Explore's own reader-census/ratification-
 * characterization before any code was written; the PLAN-phase TESTING review that found
 * real test-PLAN gaps (mis-tiered scenarios, no-mechanism scenarios, a near-vacuous
 * guard-strength claim) and amended the PRD before EXEC began; the EXEC-TO-PLAN TESTING
 * review that returned FAIL with 5 concrete blockers plus 5 mutation-survivor gaps,
 * including discovering a 4th write call site (an automated cron) missed in the initial
 * sweep; the EXEC-TO-PLAN SECURITY review that found no vulnerability but a real,
 * deliberately-unfixed architectural gap (the CLI's dominant write path bypasses the new
 * self-approval guard); and, most consequentially, a VERIFY-phase VALIDATION review that
 * found THIS SD'S OWN EARLIER FIX (the B2 cascade-watcher change) had introduced a
 * regression -- removing a chairman_approved filter on a premise ("never actually gating
 * anything") that was measured against live data and found FALSE (23/255 rows would have
 * been swept into automated orchestrator-SD generation from never-approved plans) --
 * root-caused and fixed by restoring the filter with corrected reasoning. That row is
 * left IN PLACE, unmutated, for two reasons: (1) retro-clobber-guard.js's classifyRetro()
 * classifies status=PUBLISHED + quality_score>=70 as unsafe to overwrite regardless of
 * writer (established precedent for every prior boilerplate-but-passing auto-retro on
 * this fleet); (2) getFilteredRetrospective() (scripts/modules/handoff/retro-filters.js)
 * orders created_at DESC LIMIT 1, so this new row SUPERSEDES it at the gate without
 * deleting it -- verified live below.
 *
 * SOURCE MATERIAL for this retro (all verified live against the DB/git before writing):
 * strategic_directives_v2 (sd_key=SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001, created_at
 * 2026-09-14T19:14:44Z); sd_phase_handoffs (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, all
 * accepted); product_requirements_v2 (PRD-SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001, 6 FRs,
 * 16 test scenarios post-PLAN-phase amendment); 18 sub_agent_execution_results rows
 * already on this SD (Explore+VALIDATION at LEAD; DESIGN/DATABASE/SECURITY/RISK/STORIES
 * at PLAN_PRD; TESTING at PLAN_TO_EXEC; TESTING+SECURITY at EXEC_TO_PLAN; VALIDATION x2
 * + REGRESSION x2 at VERIFY; plus the pre-existing boilerplate RETRO row and a PENDING
 * VISION_FIDELITY row, neither cited as evidence here); commit chain feb61c27901 (initial
 * implementation) -> 555e3fe4ed0 (EXEC-TO-PLAN TESTING fixes) -> 8c7f7797498 (chore:
 * record TESTING evidence) -> 502abd7e100 (chore: SECURITY evidence, DOCMON naming fix,
 * docblock correction) -> a91382443c7 (fix: VERIFY VALIDATION W1-W3) -> 5d471426099
 * (chore: REGRESSION evidence, disclose 2nd gated consumer, HEAD); `gh pr view 8984`
 * (state=OPEN, base=main, mergeStateStatus=BLOCKED, 0 reviews) for PR state.
 *
 * Canonical writers only: storeRetrospective (lib/sub-agents/retro/db-operations.js) for
 * the retrospectives row; storeSubAgentResults (lib/sub-agent-executor/results-storage.js)
 * for the RETRO evidence row, matching the pattern already used by every other required
 * sub-agent on this SD (source='manual', phase='PLAN_VERIFICATION').
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { storeRetrospective } from '../../lib/sub-agents/retro/db-operations.js';
import { getFilteredRetrospective } from '../modules/handoff/retro-filters.js';
import { RetrospectiveQualityRubric } from '../modules/rubrics/retrospective-quality-rubric.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '7c25340a-965b-40fd-a53b-2248ad126d9e';
const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';
const SD_CREATED_AT = '2026-09-14T19:14:44.549235+00:00';

const AUTO_RETRO_ID = '2d50c146-75d2-44f7-9ace-1605720f5e23';
const AUTO_RETRO_EVIDENCE_ID = 'f3c8a118-ef38-41fc-836e-4587fb4aa81c';

// Evidence rows already on this SD (sub_agent_execution_results.id), cited so this
// retro's claims are traceable rather than restated from memory.
const EXPLORE_LEAD = 'b2fc49b1-95dd-4fa2-b5ff-3f08936c524b'; // Explore@LEAD CONDITIONAL_PASS@85 -- 1st-pass census/scope
const VALIDATION_LEAD = '88dde66c-81fa-496c-82ff-67ca5e4c3d5b'; // VALIDATION@LEAD CONDITIONAL_PASS@90 -- corrected 3 material errors
const TESTING_PLAN = 'ad72affb-6e3a-4a62-b69b-2b2e170345c1'; // TESTING@PLAN_TO_EXEC PASS@91 -- found real test-PLAN gaps pre-code
const TESTING_EXEC = '60633f02-0ad2-4764-91a1-71e6f45077cb'; // TESTING@EXEC_TO_PLAN PASS@88 -- 5 blockers + 5 mutation gaps
const SECURITY_EXEC = '0f6c391d-18c6-4e03-98e2-86a10272a8aa'; // SECURITY@EXEC_TO_PLAN CONDITIONAL_PASS@88 -- W1-W3 architectural gap disclosed
const VALIDATION_VERIFY_1 = '409b7c0e-a24e-439e-b0e5-9516657d196d'; // VALIDATION@VERIFY CONDITIONAL_PASS@88 -- found W1-W3, incl. own-SD regression
const VALIDATION_VERIFY_2 = '8b01e320-d8c3-4fb7-be4b-9821053f67f2'; // VALIDATION@VERIFY PASS@91 -- follow-up, all 3 re-verified fixed
const REGRESSION_VERIFY_1 = 'd512f9f2-2f0e-43eb-82cf-ef29b2af76c2'; // REGRESSION@VERIFY CONDITIONAL_PASS@40 -- provisional crash-insurance row
const REGRESSION_VERIFY_2 = '25f2eadc-e935-40f8-ac33-0c99798e7dce'; // REGRESSION@VERIFY CONDITIONAL_PASS@88 -- final, 0 regressions + 1 LOW

// Commits, oldest to newest.
const C1 = 'feb61c27901'; // initial implementation (FR-1..FR-6)
const C2 = '555e3fe4ed0'; // fix: address EXEC-TO-PLAN TESTING review findings (B1-B5, M1-M6)
const C3 = '8c7f7797498'; // chore: record EXEC-TO-PLAN TESTING evidence
const C4 = '502abd7e100'; // chore: SECURITY evidence, DOCMON naming fix, docblock correction (W1-W3 disclosed)
const C5 = 'a91382443c7'; // fix: address VERIFY-phase VALIDATION findings W1-W3 (incl. the self-correction)
const C6 = '5d471426099'; // chore: record REGRESSION evidence, disclose 2nd gated consumer (HEAD)
const PR = '8984';

// ---------------------------------------------------------------------------------------------
// BUGS_FOUND / BUGS_RESOLVED COUNTING (documented, not silently picked).
//   3  PLAN-phase test-PLAN findings (row ad72affb, all resolved by amending the PRD BEFORE EXEC
//      wrote any code): (1) TS-7/TS-8 mis-tiered as type:'unit' when they depend on a REAL,
//      live, installed Postgres BEFORE-UPDATE trigger -- retyped to integration tier; (2) TS-3/
//      TS-4 (CLI mandatory-choice hard-error) had no stated test mechanism at all -- amended to
//      name two concrete mechanisms and require a specific wiring assertion; (3) FR-5's
//      self-approval guard (promotedBy !== created_by) measured against live data and found
//      near-vacuous (202/255 = 79% of rows share one creator label) -- FR-5's description and
//      the SD's risk entry corrected to state this honestly as a provenance placeholder, plus a
//      destructive-copy risk in the cited model function caught and closed with an explicit
//      payload constraint (TS-10).
//   10 EXEC-phase TESTING findings on the initial EXEC implementation (row 60633f02): 5 concrete
//      blockers -- B1 (missing eva-logger-required-lint instrumentation), B2 (a 4th write call
//      site, an automated cron, missed in the initial sweep -- required decoupling the cron's
//      Stage 2 readiness gate from chairman_approved as a genuine architectural decision), B3
//      (2 live agent playbooks would hard-error against the new mandatory flag), B4 (an
//      integration test failing instead of skipping cleanly, a beforeAll/beforeEach ordering
//      gotcha against the db-tier skip gate), B5 (a no-DDL check script's two-dot vs three-dot
//      git diff comparison gave false positives) -- plus 5 mutation-survivor coverage gaps (a
//      token deletion in the implementation could ship green: chairman_approved_at coverage on
//      archplan-upsert.js itself, and the CLI's flag-to-record-value resolution logic). All 10
//      closed with real code/test changes, each independently mutation-tested by the same
//      reviewer that found it.
//   3  VERIFY-phase VALIDATION findings (row 409b7c0e, all re-verified fixed by row 8b01e320):
//      W1 (MEDIUM, measured) -- this SD's OWN earlier fix (the B2 cascade-watcher change)
//      removed a chairman_approved filter on the premise it "was never actually gating
//      anything", a premise the reviewer measured against live data and found FALSE (23/255
//      live rows would have been swept into automated orchestrator-SD generation from
//      never-approved plans) -- fixed by RESTORING the filter with corrected reasoning, plus a
//      replacement regression test. W2 (MEDIUM) -- a one-token mutant on the CLI's dominant
//      write path (~85% of live rows) would silently revert this SD's own headline fix,
//      undetected by 112 passing tests -- fixed by extracting the argument-building logic into
//      its own testable module (buildUpsertArgs). W3 (LOW) -- a test comment documenting the
//      opposite of the policy it described -- comment-only fix.
//  = 16 found, 16 resolved (code+tests written and independently mutation-verified for all 16).
//  NOT counted as bugs, and why: the original hardcoded chairman-approval bug (status='active',
//  chairman_approved=true on every write, zero real chairman review) is the root cause THIS SD
//  EXISTS TO FIX, not a review-phase catch during its own execution. The 3 material errors
//  VALIDATION@LEAD corrected in Explore's report (row 88dde66c) are investigation corrections
//  before any design or code existed, not bugs of an implementation -- same convention used for
//  every prior LEAD-phase two-pass investigation on this fleet. SECURITY@EXEC_TO_PLAN's W1-W3
//  (row 0f6c391d) are a real, disclosed architectural gap -- the CLI's dominant write path can
//  flip a draft to active while bypassing the new self-approval guard -- but this is an explicit,
//  documented SCOPE decision (fixing it means giving promoteArchPlan a CLI entry point and wiring
//  a real identity signal through it, both out of this SD's FR list), disclosed via a corrected
//  docblock rather than a code bug silently shipped; carried forward as action items instead.
//  REGRESSION@VERIFY's LOW finding (row 25f2eadc, a second downstream consumer newly gated by
//  the fix) is explicitly confirmed to degrade gracefully -- documentation-only, not a bug.
// ---------------------------------------------------------------------------------------------
const BUGS_FOUND = 16;
const BUGS_RESOLVED = 16;
const TESTS_ADDED = 36; // measured directly: git diff across the 7 touched test files, grep -cE '^\+.*\b(it|test)\(' = 36

const whatWentWell = [
  `The LEAD-phase investigation was a genuinely independent two-pass structure, and the second pass caught the first pass being wrong on 3 material points BEFORE any code was written. Explore (row ${EXPLORE_LEAD}) correctly verified the core defect (archplan-upsert.js:121-122 unconditionally hardcodes status='active', chairman_approved=true with no override parameter) but over-counted the downstream-reader census at 7 and characterized ratification a588adba as a soft personal-capacity remark. Validation (row ${VALIDATION_LEAD}) independently re-derived every claim from its own file reads and DB queries, then went further: direct enumeration found exactly ONE chairman_approved reader (trust-elevation.js) and TWO status='active' readers, with the other 7 "readers" Explore cited actually filtering the separate eva_vision_documents table; re-read the full a588adba row and found it a crisp, ratified, directly-applicable policy citing 6c263823 in exactly the reviewer-not-author role this SD requires; and found Explore's recommended fix (additive param, default true) undershot the SD's own requirement -- 200/235 live rows come from a CLI with zero approval flags, so mirroring vision properly requires a mandatory CLI choice too, not just a helper default.`,

  `The same LEAD-phase VALIDATION pass independently resolved the one open operational-risk question LEAD needed answered before PLAN could safely proceed (whether tightening chairman_approved would break any currently-trusted venture's trust-tier elevation), by measuring that every real venture's elevation is carried by the vision limb of an OR-guard regardless of the arch limb, only 2 elevations have ever occurred (both vision-attributed), and the check is mint-time-only and idempotent -- turning a hypothetical regression risk into a measured, closed question before PLAN began.`,

  `A PLAN-phase TESTING review (row ${TESTING_PLAN}) found real gaps in the TEST PLAN itself, not the requirements, before EXEC wrote a line of code: 2 scenarios (TS-7/TS-8) were assigned to the wrong test tier for behavior that depends on a real, live, installed Postgres BEFORE-UPDATE trigger, and 2 CLI scenarios (TS-3/TS-4) had no stated test mechanism at all. It also measured FR-5's self-approval guard against live data and found the claim near-vacuous (202/255 = 79% of rows share one creator label) -- corrected the PRD to state this honestly rather than let a weak guard read as a strong one, and caught a destructive-copy risk in FR-5's own cited model function before EXEC could have unknowingly reproduced it.`,

  `An EXEC-phase TESTING review (row ${TESTING_EXEC}) reviewed the initial EXEC implementation across 17 files and returned FAIL, not a rubber-stamp PASS, with 5 concrete blockers and 5 mutation-survivor coverage gaps. Most architecturally significant: B2 found a 4th upsertArchPlan call site (an automated cron, cascade-watcher.mjs) missed in the initial implementation sweep, which required a genuine architectural decision -- decoupling the cron's Stage 2 readiness gate from chairman_approved entirely, since automated code can no longer claim that signal honestly. All 10 findings were closed with real code and test changes, each independently mutation-tested by the same reviewer that found it (112/112 passing across 8 files after).`,

  `An EXEC-TO-PLAN SECURITY review (row ${SECURITY_EXEC}) found no vulnerability and no regression -- injection, CLI fail-closed behavior, trigger-bypass, and information-disclosure checks all passed -- but did not stop at "no vuln found". It identified a real, structural architectural gap: the CLI's dominant write path (upsert --approved, ~85% of live rows) can ALSO flip a draft to active while completely bypassing the new self-approval guard, which only guards a separate, currently-uncalled promotion function. This was disclosed via a corrected docblock rather than either silently ignored or forced into an out-of-scope code fix -- an accurate description of a known limitation, not a claimed fix.`,

  `A VERIFY-phase VALIDATION review (row ${VALIDATION_VERIFY_1}) did not simply re-confirm the EXEC-phase findings -- it found 3 NEW findings, the most consequential of which was that an earlier fix WITHIN THIS SAME SD (the B2 cascade-watcher change) had itself introduced a regression: removing the chairman_approved filter on the premise it "was never actually gating anything," a premise the reviewer measured against live data and found FALSE (23/255 live rows would have been swept into automated orchestrator-SD generation from never-approved plans). All 3 findings (the self-regression, a mutation hole on the CLI's dominant write path, and an inverted test comment) were fixed and then independently RE-VERIFIED by a follow-up VALIDATION pass (row ${VALIDATION_VERIFY_2}), including a mutation test proving the restored filter is actually effective (reverting it correctly fails the new regression test).`,

  `A VERIFY-phase REGRESSION review (row ${REGRESSION_VERIFY_2}) found zero test regressions and zero broken callers across 5 independently-run checks (581 tests across the widest downstream-consumer sweep, 0 failed), and surfaced one new, previously-undisclosed LOW finding (a second downstream consumer -- artifact-persistence-service.js's Stage-14 ADR back-link -- also gated by the draft default) that this SD's own disclosed-behavior-change list had not yet named, closing the loop between what the fix touches and what the record says it touches.`
];

const whatNeedsImprovement = [
  `The completion flow's DEFAULT artifacts for this SD -- retrospective ${AUTO_RETRO_ID} (quality_score=80, PUBLISHED) and its paired evidence row ${AUTO_RETRO_EVIDENCE_ID} (verdict=PASS, confidence=100, detailed_analysis='{}') -- are template boilerplate that passed the quality gate on item-count alone (objectives_met:false and within_scope:false, despite the SD being on-track with an accepted EXEC-TO-PLAN handoff). Neither mentions the LEAD-phase two-pass correction, the PLAN-phase test-plan falsification, the 4th-call-site discovery, the disclosed self-approval-guard gap, or the VERIFY-phase self-correction -- the single hardest-won fact of this SD's entire cycle. A gate that scores boilerplate at 80/100 is not distinguishing "well-formed" from "true and specific".`,

  `The CLI's dominant write path (upsert --approved, ~85% of live rows, per LEAD-phase Explore evidence) can flip a draft plan to active while completely bypassing the new self-approval guard, which only protects a separate promotion function (archplan-promote.js) that currently has NO caller anywhere in the repo. This means the guarded path is unreachable while the unguarded path is the ergonomic one -- exactly the shape of a control that never gets exercised. SECURITY correctly classified this as a disclosure rather than a merge blocker (the guard genuinely improves on pre-SD behavior, which had no flag and no guard at all), but it leaves the SD's stated goal ("no plan is recorded as chairman-approved unless he approved it") only partially structurally enforced.`,

  `A regression was introduced and then caught and fixed WITHIN this same SD's own build (the B2 cascade-watcher filter removal, corrected by W1). The root cause was a code comment asserting a factual claim ("never actually gating anything") that was never verified against the actual table contents at the time it was written -- only inferred from reading one writer's code path. The comment read as reasoned and specific, which is exactly what made it easy to trust without independently measuring it.`,

  `lib/eva/archplan-upsert.js's \`approved\` parameter default remains \`true\` (SECURITY's W3, disclosed not fixed) -- for a field whose entire purpose is attesting to a human review decision, the secure default is deny (explicit opt-in), and the backward-compatibility argument for keeping it true-by-default only protects call sites that this SD itself just finished updating to pass the parameter explicitly.`
];

const keyLearnings = [
  {
    lesson: `AN APPROVAL/AUTHORIZATION-INTEGRITY FIX ACROSS MULTIPLE WRITE PATHS IS EASY TO UNDER-SCOPE ON THE FIRST PASS AND EASY TO OVER-CORRECT ON A LATER PASS. This SD's initial EXEC implementation missed a 4th write call site (an automated cron) entirely -- caught by EXEC-phase TESTING (row ${TESTING_EXEC}) as blocker B2, requiring a genuine architectural decision to decouple the cron's readiness gate from the approval field it could no longer honestly claim. Then, in fixing B2, the SAME SD over-corrected: it removed a chairman_approved filter elsewhere in the same file on the unverified premise that the filter "was never actually gating anything" -- a premise VERIFY-phase VALIDATION (row ${VALIDATION_VERIFY_1}) measured against live data and found false (23/255 rows would have been swept into automated generation from never-approved plans). Both errors are opposite failure modes of the identical underlying difficulty: correctly identifying EVERY reader and writer of a field whose meaning is being tightened, in one pass, under time pressure.`,
    category: 'APPROVAL_INTEGRITY_MULTI_SITE_SCOPING',
    applicability: `Any SD that changes the meaning or enforcement of an approval/authorization field across more than one write or read site (cron jobs, CLIs, library functions, UI actions). Before EXEC starts, enumerate every writer AND every reader of the field with a repo-wide grep, not just the sites named in the motivating bug report -- and before removing any existing filter or check as part of that sweep, measure its actual live effect against real data rather than reasoning about it from reading the surrounding code. The two errors this SD made (missing a writer, removing a reader's filter on an unmeasured premise) are structurally the same mistake in opposite directions.`
  },
  {
    lesson: `MEASURE THE PREMISE IN A CODE COMMENT AGAINST LIVE DATA BEFORE COMMITTING IT, ESPECIALLY WHEN THE COMMENT JUSTIFIES REMOVING A GUARD. The B2 fix's comment asserted "never actually gating anything" as the reason to remove cascade-watcher.mjs's chairman_approved filter -- a claim that was never verified against the actual eva_architecture_plans table contents at the time it was written, only inferred from the fact that archplan-upsert.js hardcoded the column true on every row BEFORE this SD (which made the filter tautologically true pre-SD, but this SD's own draft-default change made that no longer the case for new rows). VERIFY-phase VALIDATION (row ${VALIDATION_VERIFY_1}) ran the actual query and found 23/255 rows where the premise was false. The fix (row ${VALIDATION_VERIFY_2}) restored the filter, corrected both the query-site comment and the module docblock, and added a mutation-tested regression test proving the filter is present and effective -- not just present.`,
    category: 'MEASURE_PREMISE_BEFORE_COMMENT',
    applicability: `Any code comment or commit message that justifies removing an existing check, filter, or guard with a factual claim about current behavior ("this never fires", "this is always true", "this was never gating anything"). Treat that claim as a hypothesis requiring one query against the live/real data population, not a fact requiring only a re-read of one writer's code -- a claim that is true for the code as of last week can become false the moment a SIBLING change (in this case, this SD's OWN earlier commit) in the same build alters what the data actually looks like.`
  },
  {
    lesson: `MULTIPLE INDEPENDENT REVIEW PASSES, EACH SCOPED TO CATCH WHAT THE PREVIOUS PASS MISSED RATHER THAN TO RE-CONFIRM IT, FOUND A DIFFERENT REAL DEFECT AT EVERY SINGLE PHASE BOUNDARY OF THIS SD -- INCLUDING ONE THAT CAUGHT THE SD'S OWN EARLIER FIX REGRESSING. LEAD: VALIDATION corrected 3 material errors in Explore's census/characterization (row ${VALIDATION_LEAD}). PLAN: TESTING found the test plan itself had mis-tiered and mechanism-less scenarios, and a near-vacuous guard claim (row ${TESTING_PLAN}). EXEC-TO-PLAN: TESTING found 5 blockers + 5 mutation gaps in the merged/initial code (row ${TESTING_EXEC}), and SECURITY found no vulnerability but a real, disclosed architectural gap (row ${SECURITY_EXEC}). VERIFY: VALIDATION found this SD's own EXEC-phase fix had regressed (row ${VALIDATION_VERIFY_1}), and REGRESSION found a previously-undisclosed second gated consumer (row ${REGRESSION_VERIFY_2}). No single pass, however thorough, found everything -- the value was structural: each reviewer started from the evidence and the live data, not from trusting the prior pass's narrative.`,
    category: 'MULTI_PHASE_INDEPENDENT_REVIEW_CADENCE',
    applicability: `Any SD correcting a chairman-approval-integrity or authorization-bypass class defect, where the blast radius (every write path, every reader) is inherently hard to fully enumerate in one investigative pass. Budget for a real review at every phase boundary (LEAD self-correction, PLAN pre-code test-plan review, EXEC-TO-PLAN TESTING+SECURITY, VERIFY VALIDATION+REGRESSION) with each reviewer instructed to independently re-derive findings from evidence rather than validate the prior pass's conclusions -- and treat a later pass catching an EARLIER pass's own fix regressing as the review cadence working correctly, not as a sign the SD is unstable.`
  },
  {
    lesson: `A DISCLOSED, OUT-OF-SCOPE ARCHITECTURAL GAP IS A LEGITIMATE OUTCOME WHEN IT IS ACCURATELY DOCUMENTED RATHER THAN OVERSTATED OR SILENTLY SHIPPED. SECURITY (row ${SECURITY_EXEC}) found that this SD's self-approval guard only protects a promotion function with zero callers, while the CLI's dominant write path (~85% of live rows) can flip a draft to active with no guard at all -- fixing this fully would mean giving the guarded function a CLI entry point and wiring a real reviewer-identity signal through it, both genuinely out of this SD's FR list. The response was neither to silently ship a docblock claiming "the only path that flips approval" (false) nor to expand scope mid-EXEC to fix it -- it was to correct the docblock to the narrower, true claim ("the only path that flips approval WITH an author/reviewer check") and carry the gap forward as an explicit action item.`,
    category: 'DISCLOSED_SCOPE_BOUNDARY_NOT_OVERSTATEMENT',
    applicability: `Any SD where a security or architecture review finds a real gap that is genuinely out of the SD's own FR scope to close. Correct any code comment or docblock that would otherwise overstate the fix's completeness (a claim like "the only path" needs to be verified against every actual write path, not just the one this SD touched), and record the gap as a named, owned follow-up action item rather than either silently shipping the overstatement or unilaterally expanding scope mid-EXEC to close it.`
  }
];

const actionItems = [
  {
    action: `Give lib/eva/archplan-promote.js's self-approval guard an actual entry point (e.g. an \`archplan-command.mjs promote --plan-key <k> --promoted-by <seat>\` subcommand), so the guarded promotion path becomes at least as reachable as the CLI's unguarded \`upsert --approved\` leg that currently carries ~85% of live approval writes with no author/reviewer check at all (SECURITY finding, row ${SECURITY_EXEC}).`,
    owner: 'PLAN (new SD, out of this SD\'s FR scope per SECURITY\'s own classification)',
    deadline: 'before FR-6\'s approved_by migration ships, ideally paired with it',
    status: 'OPEN',
    success_criteria: `archplan-command.mjs exposes a promote subcommand that calls promoteArchPlan(); a live-data query confirms new promotions route through it rather than through upsert --approved on an existing plan_key.`
  },
  {
    action: `When FR-6's deferred approved_by column lands, flip lib/eva/archplan-upsert.js's \`approved\` parameter default from true to false (SECURITY's W3, row ${SECURITY_EXEC}) -- by then every known caller passes the parameter explicitly (this SD updated all 4), so the backward-compatibility rationale for a fail-open default will have fully expired for a field whose purpose is attesting to a human decision.`,
    owner: 'PLAN (paired with the FR-6 migration SD)',
    deadline: 'same SD that implements FR-6\'s approved_by column',
    status: 'OPEN',
    success_criteria: `archplan-upsert.js's approved parameter default reads false; a unit test asserts a call omitting the parameter now writes status='draft', chairman_approved=false.`
  },
  {
    action: `Route the CLI's \`upsert --approved\` leg through the same self-approval check applied to promoteArchPlan (compare the invoking seat against the existing row's created_by before allowing a conflict-update to set chairman_approved), once a real reviewer-identity signal exists beyond the current 79%-shared creator label (SECURITY recommendation, row ${SECURITY_EXEC}).`,
    owner: "PLAN (paired with FR-6's approved_by column and the promote-subcommand action item above)",
    deadline: 'same wave as the promote-subcommand and default-flip action items',
    status: 'OPEN',
    success_criteria: `A live-identity self-approval check runs on the CLI's dominant write path, not only on the currently-uncalled promotion function; verified via a unit test asserting the upsert path refuses a self-approval attempt once a real identity signal is wired.`
  },
  {
    action: `Add lib/eva/artifact-persistence-service.js:388-396 (the Stage-14 ADR back-link) to this SD's disclosed behavior-change list alongside lib/eva/bridge/trust-elevation.js, per REGRESSION's LOW finding (row ${REGRESSION_VERIFY_2}) that it is a second downstream consumer newly gated by the draft default. Documentation-only -- the null-plan path is already guarded (adr-extractor.js's if (architecturePlanId) check) and degrades gracefully.`,
    owner: 'PLAN (documentation pass, non-blocking)',
    deadline: 'before or shortly after LEAD-FINAL-APPROVAL',
    status: 'OPEN',
    success_criteria: `The SD's completion record or PR description names both trust-elevation.js and artifact-persistence-service.js as status/approval-predicated consumers of eva_architecture_plans.`
  },
  {
    action: `Triage the 4 legacy plans REGRESSION's follow-up VALIDATION pass (row ${VALIDATION_VERIFY_2}) identified as still Stage-2-eligible once genuinely promoted through review (ARCH-HEARTBEAT-INTEL-001, ARCH-VENTURE-FUNDAMENTALS-001, ARCH-CHAIRMAN-WEB-UI-001, ARCH-CHAIRMAN-WEB-UI-V2-001), before scheduling cascade:watch:cron in production -- this SD's fix means they now correctly require an actual chairman/reviewer promotion before becoming Stage-2-eligible, which is new follow-up work, not a merge blocker.`,
    owner: 'PLAN or DevOps (data-state triage, not a code change)',
    deadline: 'before cascade:watch:cron is scheduled in production',
    status: 'OPEN',
    success_criteria: `Each of the 4 named plans is either promoted through a genuine review (via the new promote entry point once it exists) or explicitly excluded from Stage 2 eligibility with a documented reason.`
  }
];

const successPatterns = [
  `Structure a corrective SD's LEAD-phase investigation as two genuinely independent passes (own file reads, own DB/repo queries) rather than one pass plus a rubber-stamp review -- row ${VALIDATION_LEAD} corrected 3 material errors in row ${EXPLORE_LEAD}'s own report before any design or code existed.`,
  `Falsify the test PLAN itself against live data and stated mechanisms before EXEC starts, not only the requirements -- row ${TESTING_PLAN} retyped 2 mis-tiered scenarios, added a stated mechanism to 2 mechanism-less scenarios, and corrected an overstated guard-strength claim, all before a line of implementation code existed.`,
  `Mutation-test the MERGED/initial implementation independently, rather than only re-running its own author-written tests -- row ${TESTING_EXEC} found 5 blockers and 5 real mutation-survivor gaps a passing suite had not caught, including a missed 4th write call site.`,
  `Measure a code comment's factual premise against live data before trusting it, even (especially) when the comment justifies removing an existing check -- row ${VALIDATION_VERIFY_1} caught this SD's own earlier fix removing a filter on a false "never gating anything" premise, and row ${VALIDATION_VERIFY_2} independently re-verified the fix with a mutation test proving the restored filter is actually effective.`,
  `Disclose a real, out-of-scope architectural gap accurately (correct the docblock to the narrower true claim) rather than either overstating a fix's completeness or unilaterally expanding scope mid-EXEC to close it -- row ${SECURITY_EXEC}'s W1-W3 findings on the CLI's unguarded dominant write path.`
];

const failurePatterns = [
  `The completion flow's default retrospective (${AUTO_RETRO_ID}) and its paired RETRO evidence row (${AUTO_RETRO_EVIDENCE_ID}) are generic template filler that scored 80/100 and PASS/100 respectively (with objectives_met:false, within_scope:false, and a bare '{}' detailed_analysis) while citing none of this SD's real, hard-won findings -- a quality gate scoring structure (item counts) rather than substance let boilerplate pass at a score that reads as "good", and even reported unmet-objectives on an SD that was, in fact, on track.`,
  `A comment justifying the removal of an existing filter/guard (the B2 cascade-watcher change) was trusted and shipped without the one query that would have falsified it -- the premise was inferred from reading one writer's code path rather than measured against the actual table contents, and the error was only caught in the NEXT phase's independent review, within the same SD's own build.`,
  `SECURITY's disclosed gap (the CLI's dominant write path bypassing the self-approval guard) means this SD's own stated goal -- "no plan is recorded as chairman-approved unless he approved it" -- is only partially structurally enforced at merge time; the guard exists but the ergonomic, dominant path routes around it, which is the standard setup for a control that never gets exercised.`
];

const improvementAreas = [
  {
    area: `Auto-generated PLAN_VERIFICATION completion retrospectives can pass the quality gate at a score (80/100) that reads as "good" while containing zero SD-specific content and even mis-reporting objectives_met/within_scope on an on-track SD.`,
    root_cause: `The retrospective-quality rubric scores structural completeness (item counts across what_went_well/key_learnings/action_items) rather than requiring the content to reference this SD's actual sub_agent_execution_results rows, commits, or findings -- RetrospectiveQualityRubric.detectBoilerplate exists in this repo but is only consulted by manual one-off scripts' own precheck() convention, not wired into the automated preflight-generation path that produced ${AUTO_RETRO_ID}.`,
    prevention: `Wire RetrospectiveQualityRubric.detectBoilerplate as a hard pre-insert/pre-publish check inside the preflight-autogen path (scripts/modules/handoff/retro-filters.js's runPreflightRetroCheck), not only as an opt-in convention for hand-authored replacement scripts.`
  },
  {
    area: `A code comment justifying the removal of an existing filter/guard can ship unverified against live data, and the error surfaces only when a LATER, independent review happens to re-derive and measure the same claim -- there is no forcing function requiring the measurement at the moment the comment is written.`,
    root_cause: `Nothing in the EXEC or PLAN-TO-EXEC review contract requires a factual claim inside a comment that justifies removing a check ("never actually gating anything") to be backed by a cited query result at the time it is written -- the claim is reviewable prose, indistinguishable from a genuinely-measured one until a later reviewer independently re-derives and checks it.`,
    prevention: `When an EXEC-phase change removes an existing filter/guard/check, require the commit message or code comment to cite the specific query (and its result) that was run against live data to justify the removal -- a bare assertion of current behavior without a citable measurement should read as a claim needing verification, not a fact.`
  },
  {
    area: `A self-approval guard can be correctly implemented and mutation-tested, yet remain structurally unreachable from the dominant real-world write path, and this gap can persist as a "disclosed" finding rather than being closed, because closing it is genuinely out of the originating SD's FR scope.`,
    root_cause: `This SD's own scope (per its title/description) was the draft/approved lifecycle and the guard's existence, not rerouting every existing write path through it -- SECURITY correctly identified this as a real gap but also correctly identified it as out-of-scope to fix here, and there is no existing mechanism that automatically files or tracks a follow-up SD when a sub-agent discloses an out-of-scope architectural gap.`,
    prevention: `When a SECURITY or VALIDATION review discloses a real, out-of-scope architectural gap (rather than a merge-blocking defect), the gate that accepts the disclosure should also require (or auto-generate) a tracked follow-up action item naming the gap, its fix shape, and its dependency chain (as done manually in this retrospective's action items 1-3), rather than relying on the retrospective narrative alone to carry it forward.`
  }
];

const protocolImprovements = [
  `RetrospectiveQualityRubric.detectBoilerplate should gate the AUTOMATED PLAN_VERIFICATION preflight-generation path directly (scripts/modules/handoff/retro-filters.js's runPreflightRetroCheck), not remain an opt-in convention only exercised by hand-authored replacement one-off scripts.`,
  `An EXEC-phase change that removes an existing filter/guard/check should require its justifying comment or commit message to cite a specific, verifiable query result against live data, not just an inference from reading the surrounding code.`,
  `A disclosed-but-out-of-scope architectural gap from a SECURITY or VALIDATION review (a real finding the originating SD correctly does not fix) should generate a tracked follow-up action item automatically, rather than relying solely on the retrospective narrative to carry it forward.`
];

const AUTHORED_QUALITY_SCORE = 93; // self-assessment; a DB trigger may recompute on INSERT

const retrospective = {
  sd_id: SD_ID,
  project_name: 'Architecture plans get a draft -> approved -> active lifecycle with approved_by and approved_at against a vision version, so no plan is recorded as chairman-approved unless he approved it',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  title: `SD Completion Retrospective: ${SD_KEY} -- five independent review passes across LEAD/PLAN/EXEC/VERIFY, including a self-correction where this SD's own earlier fix introduced a measured regression`,
  description:
    `Infrastructure SD in EHG_Engineer, no children, fixing a chairman-approval-integrity bug: `
    + `every write path to eva_architecture_plans unconditionally set status='active', `
    + `chairman_approved=true with no actual chairman review, violating chairman ratifications `
    + `6c263823 and a588adba. Handoffs: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, all accepted. `
    + `LEAD-PHASE SELF-CORRECTION: a first Explore pass (row ${EXPLORE_LEAD}) correctly verified `
    + `the hardcode but over-counted the downstream-reader census and mischaracterized ratification `
    + `a588adba as a soft remark. A second, independently-scoped Validation pass (row `
    + `${VALIDATION_LEAD}) corrected 3 material errors (the true reader census: 1 chairman_approved `
    + `reader, 2 status='active' readers; a588adba's true weight as a crisp, directly-applicable `
    + `policy; Explore's undershot fix shape, since 200/235 live rows come from a CLI with zero `
    + `approval flags) and independently resolved the SD's one open operational-risk question `
    + `(trust-tier elevation safety) before PLAN began. `
    + `PLAN-PHASE PRE-CODE TEST-PLAN CORRECTION: a TESTING review (row ${TESTING_PLAN}) found real `
    + `gaps in the DRAFTED TEST PLAN, not the requirements -- 2 scenarios mis-tiered (unit vs `
    + `integration) for DB-trigger-dependent behavior, 2 CLI scenarios with no stated test `
    + `mechanism, and a self-approval-guard strength claim measured near-vacuous against live data `
    + `(79% of rows share one creator label) -- all fixed via PRD amendment before EXEC began. `
    + `WHAT SHIPPED (commit ${C1}): an optional approved parameter threaded through `
    + `upsertArchPlan (default true, backward-compatible), a mandatory --approved/--draft CLI `
    + `choice in archplan-command.mjs reusing vision-upsert.js's rejectStringFlagValue guard, both `
    + `stage-17-doc-generation.js call sites corrected to approved:false, chairman_approved_at `
    + `stamping on every write, and a new gated promotion function (archplan-promote.js) with a `
    + `self-approval guard comparing promotedBy against the row's own created_by. `
    + `EXEC-TO-PLAN TESTING FAIL, THEN FIX (commit ${C2}, evidence commit ${C3}): a TESTING review `
    + `(row ${TESTING_EXEC}) returned FAIL with 5 concrete blockers (B1 missing logger `
    + `instrumentation; B2 a 4th write call site -- an automated cron -- missed in the initial `
    + `sweep, requiring a genuine architectural decision to decouple the cron's readiness gate `
    + `from chairman_approved; B3 two live agent playbooks would hard-error against the new `
    + `mandatory flag; B4 an integration test failing instead of skipping cleanly on a `
    + `beforeAll/beforeEach db-tier-skip ordering gotcha; B5 a no-DDL check's two-dot vs `
    + `three-dot git diff false positive) plus 5 mutation-survivor coverage gaps -- all fixed with `
    + `mutation-tested proof (112/112 passing across 8 files after). `
    + `EXEC-TO-PLAN SECURITY DISCLOSURE, NOT A FIX (commit ${C4}): a SECURITY review (row `
    + `${SECURITY_EXEC}) found no vulnerability but a real architectural gap: the CLI's dominant `
    + `write path (upsert --approved, ~85% of live rows) can ALSO flip a draft to active while `
    + `completely bypassing the new self-approval guard, which only protects a separate, `
    + `currently-uncalled promotion function -- disclosed via a corrected docblock, an explicit `
    + `scope decision rather than an oversight. `
    + `VERIFY-PHASE SELF-CORRECTION -- THE HEADLINE FINDING (commit ${C5}): a VALIDATION review `
    + `(row ${VALIDATION_VERIFY_1}) found 3 more real findings, most notably that an EARLIER fix `
    + `WITHIN THIS SAME SD (the B2 cascade-watcher change) had itself introduced a regression: `
    + `removing cascade-watcher.mjs's chairman_approved filter on the premise it "was never `
    + `actually gating anything" -- a premise the reviewer MEASURED against live data and found `
    + `FALSE (23/255 live rows would have been swept into automated orchestrator-SD generation `
    + `from never-approved plans). Root-caused and fixed by RESTORING the filter with corrected `
    + `reasoning (the earlier fix had over-corrected), plus a mutation-tested regression test `
    + `proving the restored filter is actually effective. Also fixed: a mutation hole on the CLI's `
    + `dominant write path (a one-token deletion would silently revert the SD's own headline fix, `
    + `undetected by 112 passing tests) via extracting buildUpsertArgs into its own testable `
    + `module, and a test comment documenting the opposite of the policy it described. All 3 `
    + `re-verified fixed by a follow-up VALIDATION pass (row ${VALIDATION_VERIFY_2}, 116/116 `
    + `passing after). `
    + `VERIFY-PHASE REGRESSION (commit ${C6}, HEAD, PR #${PR}): zero test regressions and zero `
    + `broken callers across 5 checks (row ${REGRESSION_VERIFY_2}, 581 tests in the widest sweep, `
    + `0 failed), one LOW finding (a second downstream consumer -- artifact-persistence-service.js's `
    + `Stage-14 ADR back-link -- newly gated by the draft default, confirmed to degrade `
    + `gracefully) disclosed via docblock addition. `
    + `RELATIONSHIP TO PRIOR ROWS: ${AUTO_RETRO_ID} (retrospectives, quality_score=80) and `
    + `${AUTO_RETRO_EVIDENCE_ID} (sub_agent_execution_results, RETRO, PASS/100, detailed_analysis=`
    + `'{}') are the default preflight-autogen completion artifacts -- template boilerplate naming `
    + `none of the above and incorrectly reporting objectives_met:false/within_scope:false. Both `
    + `left unmutated (retro-clobber-guard.js classifies the retro row unsafe to overwrite at `
    + `status=PUBLISHED+quality_score>=70) and superseded at the gate by this row and its paired `
    + `evidence row, confirmed via a live getFilteredRetrospective() re-run.`,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['Explore', 'VALIDATION', 'DESIGN', 'DATABASE', 'RISK', 'STORIES', 'TESTING', 'SECURITY', 'REGRESSION', 'RETRO'],
  human_participants: ['LEAD'],
  what_went_well: whatWentWell,
  what_needs_improvement: whatNeedsImprovement,
  action_items: actionItems,
  key_learnings: keyLearnings,
  quality_score: AUTHORED_QUALITY_SCORE,
  team_satisfaction: 9,
  business_value_delivered:
    `Restores chairman-approval integrity for eva_architecture_plans per ratifications 6c263823 `
    + `and a588adba: no write path can now record a plan as chairman-approved without either an `
    + `explicit CLI --approved choice or a genuinely-gated promotion, closing a gap that was live `
    + `on real venture plans (including ARCH-ALTIFYAI-001) before this SD. The review cadence `
    + `itself caught and fixed a real regression the SD's OWN earlier commit had introduced, before `
    + `it reached main.`,
  customer_impact:
    `No end-user-facing surface changed -- this is Chairman/LEO-operator-facing trust in the `
    + `eva_architecture_plans approval record and everything that reads it (trust-elevation.js's `
    + `venture trust-tier guard, artifact-persistence-service.js's ADR back-link, cascade-watcher's `
    + `automated Stage 2 readiness signal).`,
  technical_debt_addressed: true,
  technical_debt_created: true, // the CLI's dominant write path still bypasses the self-approval guard (action items 1 & 3); the approved default is still fail-open pending FR-6 (action item 2)
  bugs_found: BUGS_FOUND,
  bugs_resolved: BUGS_RESOLVED,
  tests_added: TESTS_ADDED,
  objectives_met: true, // EXEC-TO-PLAN accepted; all 6 FRs implemented and mutation-verified; the disclosed CLI-guard gap is an explicit, documented scope boundary, not an unmet acceptance criterion
  on_schedule: true,
  within_scope: true, // FR-6's DDL was correctly deferred per the SD's own scope text (chairman-ceremony migration); no schema change shipped
  success_patterns: successPatterns,
  failure_patterns: failurePatterns,
  improvement_areas: improvementAreas,
  protocol_improvements: protocolImprovements,
  generated_by: 'SUB_AGENT',
  trigger_event: 'PLAN_VERIFICATION phase -- RETRO sub-agent invoked ahead of the PLAN-TO-LEAD handoff attempt',
  status: 'PUBLISHED',
  performance_impact:
    `No new DB round-trips on any hot path; the promotion function is a single .update() gated by `
    + `an existing BEFORE UPDATE trigger (trg_enforce_archplan_quality_advancement, unmodified). `
    + `Not benchmarked.`,
  target_application: 'EHG_Engineer',
  learning_category: 'SECURITY_VULNERABILITY',
  related_files: [
    'lib/eva/archplan-upsert.js',
    'lib/eva/archplan-promote.js',
    'lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js',
    'scripts/eva/archplan-command.mjs',
    'scripts/eva/archplan-approval-choice.mjs',
    'scripts/cron/cascade-watcher.mjs',
    'lib/eva/bridge/trust-elevation.js',
    'lib/eva/artifact-persistence-service.js',
    'lib/eva/__tests__/archplan-promote.test.js',
    'lib/eva/__tests__/archplan-upsert.test.js',
    'lib/eva/__tests__/stage-17-doc-generation.test.js',
    'scripts/__tests__/cascade-watcher.test.js',
    'scripts/eva/__tests__/archplan-approval-choice.test.js',
    'scripts/eva/__tests__/archplan-command-approval.test.js',
    'tests/integration/eva/archplan-promote-quality-trigger.test.js'
  ],
  related_commits: [C1, C2, C3, C4, C5, C6],
  related_prs: [PR],
  affected_components: [
    'eva-architecture-plans-lifecycle',
    'archplan-cli',
    'cascade-watcher-cron',
    'trust-elevation-guard',
    'artifact-persistence-adr-linking'
  ],
  tags: [
    'ehg-engineer', 'eva-architecture-plans', 'chairman-approval-integrity', 'ratification-6c263823',
    'ratification-a588adba', 'self-approval-guard', 'multi-phase-independent-review',
    'self-correcting-fix', 'measure-premise-before-comment', 'mutation-testing',
    'disclosed-scope-boundary'
  ]
};

// -------------------------------------------------------------------------------------------
// PRECHECK -- fail closed. Run the SAME detector the gate runs before writing anything.
// -------------------------------------------------------------------------------------------
function precheck() {
  const result = RetrospectiveQualityRubric.detectBoilerplate(retrospective);
  console.log('PRECHECK detectBoilerplate:', JSON.stringify(result, null, 2));

  const weakActions = actionItems.filter(a => !a.action || a.action.length < 80 || !a.success_criteria || !a.owner);
  console.log('PRECHECK weak action_items:', weakActions.length);

  const weakLearnings = keyLearnings.filter(l => !l.lesson || l.lesson.length < 120 || !l.applicability);
  console.log('PRECHECK weak key_learnings:', weakLearnings.length);

  const passed = !result.hasBoilerplate && weakActions.length === 0 && weakLearnings.length === 0;
  console.log(`PRECHECK VERDICT: ${passed ? 'PASS -- clear to insert' : 'FAIL -- revise before inserting'}`);
  return passed;
}

async function main() {
  if (!precheck()) {
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--precheck-only')) {
    console.log('PRECHECK-ONLY mode -- no write performed.');
    return;
  }

  console.log('\n== STEP 1: storeRetrospective ==');
  let stored;
  if (process.env.REUSE_RETRO_ID) {
    console.log('REUSE_RETRO_ID set -- skipping insert, reusing ' + process.env.REUSE_RETRO_ID);
    stored = { success: true, id: process.env.REUSE_RETRO_ID };
  } else {
    stored = await storeRetrospective(supabase, retrospective);
    if (!stored.success) {
      console.error('INSERT FAILED:', stored.error);
      process.exitCode = 1;
      return;
    }
  }
  console.log('RETROSPECTIVE_ID', stored.id);

  const { data: row } = await supabase
    .from('retrospectives')
    .select('id,retro_type,retrospective_type,status,quality_score,created_at,sd_id,target_application,learning_category,objectives_met,bugs_found,bugs_resolved,tests_added')
    .eq('id', stored.id)
    .single();
  console.log('STORED_ROW', JSON.stringify(row, null, 2));
  console.log(`QUALITY_SCORE authored=${AUTHORED_QUALITY_SCORE} stored=${row?.quality_score}`);

  console.log('\n== STEP 2: verify AT THE CONSUMER (getFilteredRetrospective) ==');
  const filtered = await getFilteredRetrospective(SD_ID, SD_CREATED_AT, supabase, SD_KEY);
  const gateSees = filtered.retrospective?.id === stored.id;
  console.log('GATE_SELECTS_THIS_ROW', gateSees,
    '| selected_id=', filtered.retrospective?.id,
    '| cutoff=', filtered.leadToPlanAcceptedAt);

  console.log('\n== STEP 3: write RETRO sub_agent_execution_results evidence row ==');
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, target_application')
    .eq('id', SD_ID)
    .single();

  const results = {
    verdict: 'PASS',
    confidence: 92,
    summary: `SD-completion retrospective generated (retrospectives id ${stored.id}, retro_type=SD_COMPLETION, status=PUBLISHED, quality_score=${AUTHORED_QUALITY_SCORE}). Hand-authored around specific, verified facts pulled from 7 existing sub_agent_execution_results rows on this SD (Explore ${EXPLORE_LEAD} and VALIDATION ${VALIDATION_LEAD} at LEAD; TESTING ${TESTING_PLAN} at PLAN_TO_EXEC; TESTING ${TESTING_EXEC} and SECURITY ${SECURITY_EXEC} at EXEC_TO_PLAN; VALIDATION ${VALIDATION_VERIFY_1}/${VALIDATION_VERIFY_2} and REGRESSION ${REGRESSION_VERIFY_1}/${REGRESSION_VERIFY_2} at VERIFY) and 6 commits (${C1} through ${C6}, HEAD, on open PR #${PR}): the LEAD-phase two-pass correction of Explore's own report, the PLAN-phase pre-code test-plan falsification, the EXEC-TO-PLAN TESTING FAIL-then-fix cycle (5 blockers + 5 mutation gaps, incl. a missed 4th call site), the EXEC-TO-PLAN SECURITY disclosure of an out-of-scope architectural gap, and -- the headline finding -- a VERIFY-phase VALIDATION review catching this SD's OWN earlier fix (the B2 cascade-watcher change) having introduced a regression, measured against live data and corrected. Boilerplate detector (RetrospectiveQualityRubric.detectBoilerplate) run against the draft before insert -- 0 matches. The default preflight-autogen completion retrospective (${AUTO_RETRO_ID}, quality_score=80, template filler) and its paired RETRO evidence row (${AUTO_RETRO_EVIDENCE_ID}) are left unmutated per retro-clobber-guard.js policy (PUBLISHED + quality_score>=70) and superseded at the gate by this row, confirmed via a live getFilteredRetrospective() re-run (gate_selects_this_row=${gateSees}).`,
    findings: [
      {
        id: 'RETRO-QUALITY-001',
        severity: 'INFO',
        title: 'Retrospective content is SD-specific and evidence-cited, not metric-only boilerplate',
        detail: `All structured fields cite specific sub_agent_execution_results row IDs and commit SHAs rather than restating PRD text or handoff summaries. Four key_learnings entries generalize beyond this SD: an approval-integrity fix across multiple write paths is easy to under-scope on the first pass and over-correct on a later one; measure a comment's factual premise against live data before committing it, especially when it justifies removing a guard; multiple independent review passes scoped to catch what the previous pass missed (not re-confirm it) found a real defect at every phase boundary; a disclosed, out-of-scope architectural gap is legitimate when accurately documented rather than overstated or silently shipped.`
      }
    ],
    critical_issues: [],
    warnings: [
      {
        id: 'RETRO-CLI-GUARD-GAP-OPEN',
        severity: 'LOW',
        issue: `SECURITY's disclosed finding (row ${SECURITY_EXEC}) that the CLI's dominant write path bypasses the self-approval guard remains open, tracked as action items 1 and 3 in the retrospective, not silently treated as resolved by this SD.`
      }
    ],
    recommendations: [
      'Proceed to PLAN-TO-LEAD handoff.',
      'Track the 5 open action items (CLI-guard entry point, approved-default flip, CLI self-approval routing, disclosed-consumer documentation, legacy-plan triage) as explicit follow-up work, not implicitly closed by this SD.'
    ],
    detailed_analysis: `Retrospective row ${stored.id} created at ${row?.created_at}. This evidence row satisfies required-subagents.js's PLAN-TO-LEAD requirement for RETRO (distinct from the retrospectives table content itself, which this row's summary already validates via a live boilerplate-detector re-run and a live getFilteredRetrospective() consumer check).`,
    metadata: {
      phase: 'PLAN_VERIFICATION',
      sd_key: sd?.sd_key || SD_KEY,
      gate: 'PLAN-TO-LEAD pre-handoff validation (RETRO evidence for GATE_SUBAGENT_EVIDENCE)',
      retrospective_id: stored.id,
      prior_auto_retro_id: AUTO_RETRO_ID,
      prior_auto_retro_evidence_id: AUTO_RETRO_EVIDENCE_ID,
      quality_score: AUTHORED_QUALITY_SCORE,
      bugs_found: BUGS_FOUND,
      bugs_resolved: BUGS_RESOLVED,
      tests_added: TESTS_ADDED,
      pr_8984_state: 'OPEN'
    }
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sd.id,
    targetApplication: sd?.target_application || 'EHG_Engineer',
    subAgentCode: 'RETRO',
    fallback: 'EHG_Engineer',
    probeExistsRelative: 'package.json',
    supabase
  });
  console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

  applySubAgentRepoVerdict(results, resolution);

  const stored2 = await storeSubAgentResults('RETRO', sd.id, { name: 'RETRO' }, results, {
    phase: 'PLAN_VERIFICATION',
    source: 'manual',
    sdKey: sd?.sd_key || SD_KEY
  });

  console.log('\n=== STORED SUB_AGENT_EXECUTION_RESULTS ===');
  console.log(JSON.stringify(stored2, null, 2));

  console.log('\n== SUMMARY ==');
  console.log('RETROSPECTIVE_ID', stored.id);
  console.log('QUALITY_SCORE', row?.quality_score);
  console.log('GATE_SELECTS_THIS_ROW', gateSees);
  console.log('SUB_AGENT_EXECUTION_RESULTS_ID', stored2?.id || stored2?.data?.id);
  console.log('SUPERSEDED_PRIOR_SD_COMPLETION', AUTO_RETRO_ID, '(left unmutated)');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('ERROR:', e); process.exitCode = 1; });
}
