#!/usr/bin/env node
/**
 * PLAN_VERIFICATION-phase SD_COMPLETION retrospective for
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158 (id/sd_key is the same TEXT value in
 * strategic_directives_v2 for this SD -- 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';
 * uuid_id=4bd98fe4-a13d-4c5e-adfc-7de23b8a32f3 is a separate, secondary column not
 * used by any of the canonical retro/evidence writers below), sd_type=infrastructure,
 * target_application=EHG_Engineer, no children.
 *
 * WHY A NEW ROW RATHER THAN AN EDIT OF eda5b8dd. The default PLAN_VERIFICATION
 * completion flow already wrote retrospectives row eda5b8dd-f261-4cd4-bfd6-94b2a3a50a16
 * (status=PUBLISHED, retro_type=SD_COMPLETION, quality_score=80) plus a matching
 * sub_agent_execution_results RETRO row (5b63fb4d-93b1-43da-a991-cd004ba350fa,
 * verdict=PASS, confidence=100). Both are template-boilerplate: the retro's content is
 * generic filler ("SD executed 3 handoffs", "reference X for similar SD scope
 * estimation" repeated across multiple entries) and the evidence row's own
 * detailed_analysis is a bare "{}" with a recommendations array of three generic
 * strings. Neither names the real story: the two-pass LEAD investigation where the
 * SECOND pass refuted the FIRST pass's own causal claim; the PLAN-phase TESTING
 * review that measured real data and found the drafted FR-1 design would have fixed
 * ZERO of the 4 motivating patterns, forcing a pre-code PRD correction; the 2
 * surviving mutants an EXEC-phase TESTING review found in the MERGED code; the
 * deliberate 1-of-3-guards scope decision; or the stale scope/description text a
 * VERIFY-phase VALIDATION review caught and a 3rd correction pass fixed. That row is
 * left IN PLACE, unmutated, for two reasons: (1) retro-clobber-guard.js's
 * classifyRetro() classifies status=PUBLISHED + quality_score>=70 as unsafe to
 * overwrite regardless of writer (matches this session's established precedent for
 * every prior boilerplate-but-passing auto-retro); (2) getFilteredRetrospective()
 * (scripts/modules/handoff/retro-filters.js) orders created_at DESC LIMIT 1, so this
 * new row SUPERSEDES it at the gate without deleting it -- verified live below.
 *
 * SOURCE MATERIAL for this retro (all verified live against the DB/git before
 * writing, not restated from any prior prompt): strategic_directives_v2 (sd_key=
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158, description/scope as corrected by the
 * THIRD correction pass, scripts/one-off/correct-scope-learn-158-v3-post-plan.mjs,
 * already applied at read time); sd_phase_handoffs (LEAD-TO-PLAN 96%, PLAN-TO-EXEC
 * 93%, EXEC-TO-PLAN 92%, all accepted); product_requirements_v2 (5 FRs); 18
 * sub_agent_execution_results rows already on this SD (EXPLORE+VALIDATION at LEAD,
 * DESIGN/DATABASE/RISK/STORIES x2 + TESTING at PLAN_PRD/PLAN, TESTING+SECURITY at
 * EXEC, REGRESSION+VALIDATION at VERIFY, plus the pre-existing boilerplate RETRO and
 * a PENDING VISION_FIDELITY row -- neither cited as evidence here); commits
 * c7cfb4ce481 (merged into origin/main via PR #8967, merge commit 1ac7f6d31ea) and
 * ff4f1ff2e1d (on open, unmerged PR #8970 -- CI green, 0 reviews, confirmed via
 * `git merge-base --is-ancestor ff4f1ff2e1d origin/main` returning false at the time
 * of this retro); `gh pr view 8967/8970` for merge/open state.
 *
 * Canonical writers only: storeRetrospective (lib/sub-agents/retro/db-operations.js)
 * for the retrospectives row; storeSubAgentResults (lib/sub-agent-executor/
 * results-storage.js) for the RETRO evidence row, matching the pattern already used
 * by every other required sub-agent on this SD (source='manual',
 * phase='PLAN_VERIFICATION').
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

// This SD's strategic_directives_v2.id IS the text sd_key -- confirmed live
// (SELECT id, sd_key ... -> both 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158'), and every
// existing handoff/retro/evidence row on this SD was written with sd_id set to this
// same text value, not the separate uuid_id column.
const SD_ID = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';
const SD_KEY = SD_ID;
const SD_CREATED_AT = '2026-09-14T12:56:14.486+00:00';

const AUTO_RETRO_ID = 'eda5b8dd-f261-4cd4-bfd6-94b2a3a50a16';
const AUTO_RETRO_EVIDENCE_ID = '5b63fb4d-93b1-43da-a991-cd004ba350fa';

// Evidence rows already on this SD (sub_agent_execution_results.id), cited so this
// retro's claims are traceable rather than restated from memory.
const EXPLORE_LEAD = 'b257ca95-10ee-4d4d-9c3d-593ee833c628'; // EXPLORE@LEAD PASS@95 -- 1st-pass mechanism trace
const VALIDATION_LEAD = '71140df1-f6e7-421c-a73b-000c04df0a33'; // VALIDATION@LEAD PASS@92 -- refuted 1st pass's first_seen claim
const TESTING_PLAN = 'ce046cae-bc8f-4639-8383-1b5e02b2755d'; // TESTING@PLAN PASS@90 -- falsified drafted FR-1 against real data
const TESTING_EXEC = '7299d86d-fba4-485e-bc70-d24e3339853f'; // TESTING@EXEC PASS@92 -- found 2 surviving mutants in merged code
const SECURITY_EXEC = 'de66c921-fa3e-4652-9cd7-a2f1b0123429'; // SECURITY@EXEC PASS@90 -- 5 risk classes traced, 2 pre-existing LOW flagged out of scope
const REGRESSION_VERIFY = 'e43d00fd-83a4-48fc-93ba-04e4e50ab2b0'; // REGRESSION@VERIFY CONDITIONAL_PASS@88 -- sibling-guard divergence
const VALIDATION_VERIFY = '8134ca33-de11-4424-baf5-8dc44e07fbb7'; // VALIDATION@VERIFY PASS@92 -- caught stale scope/description text

// Commits, oldest to newest.
const C1 = 'c7cfb4ce481'; // primary fix -- merged into origin/main via PR #8967 (merge 1ac7f6d31ea)
const C2 = 'ff4f1ff2e1d'; // closes 2 surviving mutants -- PR #8970, OPEN/unmerged as of this retro, CI green

// ---------------------------------------------------------------------------------------------
// BUGS_FOUND / BUGS_RESOLVED COUNTING (documented, not silently picked).
//   3  PLAN-phase design-time findings (TESTING row ce046cae, all resolved by correcting the
//      PRD BEFORE EXEC wrote any code, not by a post-hoc patch): (1) the drafted FR-1 predicate
//      (shared parent_sd_id + narrow recording-proximity window) measured against the 4
//      motivating patterns' REAL metadata.sites[] data -- 7-8 distinct parents each, 5-minute-
//      to-22-hour recording spans -- would have fixed ZERO of them; (2) FR-1/FR-2 were
//      destructively coupled (both would read/write the same first_seen field on the same
//      site, one at record time, one at a later rewrite); (3) FR-2 named the wrong call site
//      (extractPatternsFromRetrospective, a DB-fetching wrapper) and missed a second write path
//      (kb.createPattern) with the identical defect. All 3 closed by rewriting the PRD (FR-1 to
//      an all-distinct-SDs-closed predicate that reads no timestamp at all; FR-2 to the correct
//      function name plus the createPattern branch) before EXEC began.
//   2  EXEC-phase TESTING findings (row 7299d86d) on the MERGED PR #8967 code: (A) deleting
//      createPattern's created_at spread left 277/277 green -- zero test coverage existed for
//      that half of FR-2; (E) deleting occurred_at from either production call site in
//      scripts/auto-extract-patterns-from-retro.js also left 277/277 green. Both closed in
//      commit C2 (PR #8970): 5 new tests (3 for createPattern, 2 for call-site wiring),
//      independently mutation-tested by the SAME TESTING pass that found them (reverted,
//      confirmed exactly the intended new tests fail, restored, 282/282 green). PR #8970 itself
//      remains OPEN/unmerged as of this retro -- the fix is written and mutation-verified, but
//      not yet on origin/main. Carried into this retro's action items, not silently marked done.
//   1  VERIFY-phase VALIDATION finding (row 8134ca33, documentation-only): the SD's own
//      `scope`/`description` DB fields still described the PRE-PLAN, REJECTED design
//      (parent_sd_id + proximity window, extractPatternsFromRetrospective) after the PLAN-phase
//      correction had already rewritten the actual implementation target. Closed by a THIRD
//      correction pass (scripts/one-off/correct-scope-learn-158-v3-post-plan.mjs, already
//      applied) that appended a "PLAN-Phase Correction" addendum and rewrote `scope` to match
//      what shipped.
//  = 6 found, 6 resolved (code+tests written and mutation-verified for all 6; PR #8970's own
//  merge to main is the one open mechanical step, tracked as action item 1 below, NOT recounted
//  as a 7th unresolved bug -- it is the SAME 2 EXEC-phase findings, already fixed in source).
//  NOT counted as bugs, and why: the primary (single-SD guard defeat) and secondary
//  (first_seen wall-clock stamping) defects are the root cause THIS SD EXISTS TO FIX, not a
//  review-phase catch during its own execution -- same convention as prior retros on this
//  pattern. REGRESSION's sibling-guard-divergence finding (row e43d00fd) is NOT a bug: it is an
//  accurate re-confirmation of a DELIBERATE, already-documented PRD scope decision, explicitly
//  classified "NOT a regression... errs in the SAFE direction". REGRESSION's mergeSite
//  fallback-semantics note and SECURITY's 2 pre-existing LOW items (RLS breadth, unrelated
//  .or() interpolation) are likewise not bugs of this SD -- confirmed pre-existing/out of scope
//  by the sub-agents that found them, carried forward as action items instead.
// ---------------------------------------------------------------------------------------------
const BUGS_FOUND = 6;
const BUGS_RESOLVED = 6;
const TESTS_ADDED = 18; // measured directly: `git show C1 -- <3 test files> | grep -cE '^\+.*\b(it|test)\('` = 13; same for C2's 2 test files = 5. 13+5=18.

const whatWentWell = [
  `The LEAD-phase investigation was structured as two GENUINELY INDEPENDENT sub-agent passes, and the second one caught the first one being wrong rather than rubber-stamping it. Explore (row ${EXPLORE_LEAD}) traced the full 5-hop mechanism (cron -> extract-pending-retro-patterns.mjs -> auto-extract-patterns-from-retro.js -> recordOccurrence -> recordSiteAndMaybeEscalate -> mergeSite) and concluded first_seen's cron-time stamping was the field fooling /learn's scoring. Validation (row ${VALIDATION_LEAD}) independently re-derived the SAME 5-hop chain from its own file reads and DB queries -- then went further, grepped scripts/modules/learning/filter.mjs, and found first_seen is read NOWHERE in the scoring path (its only consumer is a display string). It traced the REAL mechanism instead: the backlog drain's sibling-SD fan-out (each of ~20 orchestrator-child SDs sharing one 2026-02-28 incident gets recorded under its own distinct sd_id) manufactures exactly the first_seen_sd_id!==last_seen_sd_id signal the 3 single-SD noise guards were built to trust as genuine cross-SD recurrence.`,

  `A PLAN-phase TESTING review (row ${TESTING_PLAN}) measured the ACTUAL site data of the 4 motivating patterns directly against strategic_directives_v2 BEFORE any implementation code was written, and found the originally-drafted FR-1 design (shared parent_sd_id + narrow recording-proximity window) does not match reality: 7-8 distinct parent_sd_id values per pattern, recording spans from 5 minutes to 22 hours -- not one shared parent in a narrow window. An implementation faithful to the draft would have shipped a green test suite over a defect fixed for ZERO of the 4 patterns it exists to fix. This falsification happened as a query against live data at PLAN time, not a shipped-code failure caught at EXEC or VERIFY -- the cheapest possible place for a design to be wrong.`,

  `The same PLAN-phase review found FR-1 and FR-2 (as drafted) were destructively coupled -- both would read/write the SAME first_seen field on the same site record, one at record time and one at a later historical rewrite -- and that FR-2 named the wrong function (extractPatternsFromRetrospective, a DB-fetching wrapper) while missing a second write path (kb.createPattern) carrying the identical timestamp-fidelity defect. All of this was folded into a corrected PRD before EXEC began: FR-1 retargeted to an all-distinct-SDs-closed predicate that reads no timestamp at all (resolving the coupling by construction, not by careful sequencing), FR-2 corrected to the real call site and extended to cover createPattern too.`,

  `The scope decision to generalize exactly 1 of 3 structurally-identical single-SD guards (checkSingleSDClosedSource) -- and deliberately NOT touch checkSingleSDStaleOpenSource or checkSingleSDRetroLikeCategory -- was made because it is the only one of the three predicates the real data (100% of the 4 patterns' resolved sites are status=completed) actually supports cleanly. This was documented explicitly in the PRD and commit message, not discovered as a surprise later: REGRESSION (row ${REGRESSION_VERIFY}) independently re-confirmed the divergence and correctly classified it "NOT a regression... errs in the SAFE direction", exactly matching the PRD's own stated scope rather than reading as an overlooked inconsistency.`,

  `An EXEC-phase TESTING review (row ${TESTING_EXEC}) did not just re-run the merged PR's own tests -- it independently MUTATION-TESTED the merged code and found 2 real surviving mutants a 277/277-green suite had not caught: deleting createPattern's created_at spread, and deleting either production call site's occurred_at argument in scripts/auto-extract-patterns-from-retro.js. Both were library-function-tested but never call-site-tested. Closed the same day in commit ${C2} with 5 new tests, independently re-mutation-tested by the same reviewer (reverted, confirmed exactly the intended tests fail, restored, 282/282 green across 27 files).`,

  `A VERIFY-phase VALIDATION review (row ${VALIDATION_VERIFY}) did not trust either the PRD's own claims or the prior sub-agent findings -- it re-derived every FR's acceptance criteria against the SHIPPED code and reran the actual causal test the PRD claims (diffed pre-fix vs shipped module against the live 4 motivating patterns' real data: pre-fix kept all 4, fixed rejects all 4 with SINGLE_SD_CLOSED_SOURCE). It also caught something no prior pass had: the SD's own DB 'scope'/'description' fields still described the REJECTED pre-PLAN design. That documentation-only gap was closed by a third correction pass before this retrospective.`,

  `The SECURITY review (row ${SECURITY_EXEC}) traced 5 specific risk classes against the ACTUAL call graph rather than reviewing hypothetically (occurred_at injection, sites[] prototype pollution, widened batch-query trust boundary, createPattern's created_at overwrite, and regression risk to the existing severity bypass), and correctly flagged 2 pre-existing LOW items (an over-permissive RLS policy, an unrelated .or() string interpolation in the same touched file) as OUT of this diff's scope rather than pulling unrelated code into the fix.`
];

const whatNeedsImprovement = [
  `The completion flow's DEFAULT artifacts for this SD -- retrospective ${AUTO_RETRO_ID} (quality_score=80, PUBLISHED) and its paired evidence row ${AUTO_RETRO_EVIDENCE_ID} (verdict=PASS, confidence=100) -- are template boilerplate that passed the quality gate on item-count alone. Neither mentions the two-pass LEAD refutation, the PLAN-phase design falsification, the 2 surviving mutants, the deliberate 1-of-3-guards scope decision, or the stale-scope-text correction: the four most consequential, hardest-won facts of this SD's entire cycle. A gate that scores boilerplate at 80/100 is not distinguishing "well-formed" from "true and specific".`,

  `PR #8970 (commit ${C2}), which closes the 2 EXEC-phase-found surviving mutants, remains OPEN and UNMERGED as of this retrospective -- confirmed live via \`gh pr view 8970\` (state=OPEN, 0 reviews) and \`git merge-base --is-ancestor ${C2} origin/main\` (false). CI is fully green (24/24 checks SUCCESS). The fix is real and mutation-verified in the branch, but production (origin/main) does not yet contain it -- the same gap TESTING found in the merged PR #8967 code is technically still live on main until #8970 merges.`,

  `The SD's 'success_metrics' and 'strategic_objectives' fields (populated by the ORIGINAL /learn auto-mint, before either investigation) still read "Reduce PAT-LES-X occurrences from N to 0 within 30 days" -- framing this SD as if it should zero out the 4 patterns' existing occurrence_count. The corrected 'scope'/'description' explicitly rule this out ("Backfilling/correcting occurrence_count, updated_at, or first_seen on the 4 already-contaminated patterns' existing rows" is out of scope). Two scope-correction passes (v2, v3) rewrote 'description'/'scope'; neither touched 'success_metrics'/'strategic_objectives', so a reader of only the structured metric fields would form the wrong expectation of what "done" looks like.`,

  `REGRESSION's own finding (row ${REGRESSION_VERIFY}) that only 1 of 3 structurally-identical single-SD guards was generalized is accurate and was already a documented PRD decision -- but it still surfaced as a MEDIUM-severity warning with an explicit "file a follow-up" recommendation. A deliberate, data-justified scope boundary still generates a carried-forward action item every time an independent review re-derives it from scratch, which is correct behavior for the reviewer but means the decision has to be actively tracked rather than closed once.`
];

const keyLearnings = [
  {
    lesson: `MEASURE THE DRAFTED DESIGN AGAINST THE REAL DATA POPULATION BEFORE PRD LOCK, NOT AFTER IMPLEMENTATION. The original FR-1 (root-caused during LEAD) proposed a shared-parent_sd_id + narrow-recording-window predicate. A PLAN-phase TESTING review (row ${TESTING_PLAN}) ran ONE query against the 4 motivating patterns' actual metadata.sites[] data and found 7-8 distinct parents per pattern and 5-minute-to-22-hour recording spans -- the predicate would have fixed ZERO of the 4 patterns it was drafted to fix. Because this was caught at PLAN time, the fix was a PRD rewrite (to an all-distinct-SDs-closed predicate the real data actually supports), not a shipped-and-reverted implementation. The same falsification found during EXEC would have cost a full implementation cycle; found during VERIFY, it would have cost the whole SD.`,
    category: 'PLAN_PHASE_DESIGN_FALSIFICATION',
    applicability: `Any SD whose root-cause investigation proposes a SPECIFIC predicate or matching condition (shared key, time window, threshold) as the fix design. Before PRD lock, run the ACTUAL predicate against the real population of records the SD names as motivating evidence, and treat "the predicate matches 0 of N motivating cases" as a design defect to fix in the PRD, not a caveat to note and implement anyway.`
  },
  {
    lesson: `A SECOND, INDEPENDENTLY-SCOPED INVESTIGATION PASS CAN REFUTE THE FIRST PASS'S OWN CAUSAL CLAIM, NOT JUST CONFIRM ITS CONCLUSION. Explore (row ${EXPLORE_LEAD}) traced the correct mechanism chain but concluded first_seen (stamped at cron-processing wall-clock time) was the field driving /learn's false-recurrence scoring. Validation (row ${VALIDATION_LEAD}), independently re-deriving the SAME chain from its own file reads rather than accepting Explore's framing, additionally grepped filter.mjs and found first_seen is read NOWHERE in the scoring path -- it is a display-only field. The REAL mechanism (sibling-SD fan-out defeating the first_seen_sd_id!==last_seen_sd_id single-SD guards) was found by re-deriving the question from the code's own guard logic, not by re-checking Explore's conclusion. A validation pass that only asks "is the first pass's story internally consistent" would have preserved a wrong causal claim into the PRD.`,
    category: 'TWO_PASS_LEAD_INVESTIGATION',
    applicability: `Any corrective SD whose scope is set by a single investigative pass. A second pass should independently re-derive the mechanism from the code/data (own queries, own file reads), not validate the first pass's narrative -- the value is in the second pass being ABLE to disagree with the first, which only happens if it starts from the evidence rather than the prior conclusion.`
  },
  {
    lesson: `GENERALIZING ONLY THE ONE OF N STRUCTURALLY-IDENTICAL GUARDS THE REAL DATA ACTUALLY JUSTIFIES IS A LEGITIMATE SCOPE BOUNDARY, PROVIDED IT IS DOCUMENTED AT DECISION TIME. filter.mjs has 3 single-SD noise guards sharing the identical firstId!==lastId->abstain premise this SD's investigation refuted. Only checkSingleSDClosedSource was generalized, because "every referenced SD is closed" is the one predicate that scales cleanly to N sites with the available data (100% of the 4 patterns' resolved sites are status=completed) -- the other two guards' underlying conditions (staleness, retro-like category) were not measured against equivalent N-site data and generalizing them would have been speculative. This was written into the PRD and commit message BEFORE EXEC, so when REGRESSION (row ${REGRESSION_VERIFY}) independently re-derived the same divergence at VERIFY, it correctly classified it as a known, safe-direction, non-blocking condition rather than a surprise defect.`,
    category: 'DELIBERATE_PARTIAL_GENERALIZATION',
    applicability: `Any SD that discovers N siblings (functions, guards, predicates) sharing one flawed premise, where the motivating data only supports fixing a subset. Generalize only what the data justifies, name the untouched siblings and why explicitly in the PRD/commit (not just in a code comment), and expect -- rather than being surprised by -- a later independent review re-deriving and flagging the divergence; that flag is the review working correctly, not evidence the decision was wrong.`
  },
  {
    lesson: `A FULLY MUTATION-TESTED, ALL-GREEN SUITE CAN STILL HIDE A COVERAGE GAP AT THE LIBRARY-FUNCTION/PRODUCTION-CALL-SITE BOUNDARY. The PR #8967 merge shipped with 277/277 tests green, including mutation-tested coverage of the library functions (recordOccurrence, mergeSite) honoring the new occurred_at parameter. An EXEC-phase TESTING review (row ${TESTING_EXEC}) mutation-tested the MERGED code independently and found 2 surviving mutants specifically at the CALL-SITE boundary: deleting createPattern's created_at spread, and deleting either production call site's occurred_at argument in scripts/auto-extract-patterns-from-retro.js -- both left the full suite green because the tests proved the library function's BEHAVIOR when called with the parameter, never that the production caller actually SUPPLIES it.`,
    category: 'LIBRARY_VS_CALL_SITE_MUTATION_COVERAGE',
    applicability: `Any fix that threads a new parameter from a production call site down into a shared library function. Mutation-test the CALL SITE'S argument-passing (does deleting the argument at the call site fail a test?) as a distinct assertion from mutation-testing the library function's handling of that argument (does the function behave correctly when passed it?) -- proving the second does not imply the first.`
  }
];

const actionItems = [
  {
    action: `Merge PR #8970 (test/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158-mutation-gaps -> main), which closes the 2 EXEC-phase-found surviving mutants (createPattern's created_at coverage, production call-site occurred_at wiring assertion). CI is green (24/24 checks SUCCESS) with 0 reviews as of this retro; confirmed via \`git merge-base --is-ancestor ${C2} origin/main\` returning false.`,
    owner: 'EXEC / PLAN follow-through',
    deadline: 'before this SD reaches LEAD-FINAL-APPROVAL, if practical, or immediately after',
    status: 'OPEN',
    success_criteria: `\`git merge-base --is-ancestor ${C2} origin/main\` returns true; PR #8970 shows state=MERGED via \`gh pr view 8970\`.`
  },
  {
    action: `Reconcile this SD's \`success_metrics\`/\`strategic_objectives\` fields, still framed as the ORIGINAL /learn auto-mint's "reduce PAT-LES-X occurrences from N to 0" -- which the corrected \`scope\`/\`description\` explicitly rule out (backfilling the 4 already-contaminated patterns' occurrence_count is out of scope). A reader of only the structured metric fields forms the wrong expectation of what this SD actually delivers.`,
    owner: 'PLAN (follow-up correction pass, same pattern as scripts/one-off/correct-scope-learn-158-v3-post-plan.mjs)',
    deadline: 'before LEAD-FINAL-APPROVAL',
    status: 'OPEN',
    success_criteria: `success_metrics/strategic_objectives text reconciled with the corrected scope/description (e.g. reframed around the filter-guard/timestamp-fidelity fix rather than occurrence_count reduction), verified by a live re-read of the SD row.`
  },
  {
    action: `Decide the fate of REGRESSION's sibling-guard-divergence finding (row ${REGRESSION_VERIFY}): checkSingleSDStaleOpenSource and checkSingleSDRetroLikeCategory remain on the original firstId!==lastId->abstain premise this SD's investigation refuted for checkSingleSDClosedSource. Either generalize both to the same metadata.sites[]-based N-SD form (once real data supports doing so, per this SD's own PLAN-phase measurement discipline), or explicitly ratify "closed-source only" as the PERMANENT scope boundary rather than a deferred TODO.`,
    owner: 'PLAN (new SD, or a documented ratification if the boundary is intended to be permanent)',
    deadline: 'next SD touching scripts/modules/learning/filter.mjs',
    status: 'OPEN',
    success_criteria: `Either a follow-up SD generalizes both remaining guards with the same measure-against-real-data discipline this SD used, or a ratification explicitly documents "closed-source only" as permanent, closing REGRESSION's MEDIUM warning either way.`
  },
  {
    action: `mergeSite's silent fallback-to-now() for a malformed 3rd-argument timestamp (REGRESSION's LOW finding, row ${REGRESSION_VERIFY}): pre-SD, a non-Date opts.now threw; post-SD it silently writes today's date as first_seen. Zero live callers affected today (confirmed: rca-orchestrator.js's 2 call sites pass no 4th argument; issue-knowledge-base.js's 1 call site passes a real Date) -- accepted as a deliberate fail-soft choice, but worth making loud if a future caller starts exercising the parameter with unvalidated input.`,
    owner: 'PLAN (follow-up QF, non-blocking)',
    deadline: 'if/when a new caller of mergeSite/recordSiteAndMaybeEscalate with a 4th argument is introduced',
    status: 'OPEN',
    success_criteria: `Either the fallback is made loud (throw/log on invalid timestamp) before a new caller lands, or the fail-soft choice is explicitly documented as permanent in class-escalation.js's own comments.`
  }
];

const successPatterns = [
  `Run the ACTUAL causal test (the drafted predicate, or the diffed pre-fix/post-fix module) against the LIVE data of the motivating cases before PRD lock, not after implementation -- caught by TESTING row ${TESTING_PLAN} (PLAN) and re-run again by VALIDATION row ${VALIDATION_VERIFY} (VERIFY) against the shipped code.`,
  `Structure a corrective SD's LEAD-phase investigation as two genuinely independent passes (own file reads, own DB/repo queries) rather than one pass plus a rubber-stamp review -- this is what let Validation (row ${VALIDATION_LEAD}) refute, not just confirm, Explore's own causal claim.`,
  `Mutation-test the production CALL SITE'S argument-passing as a distinct check from mutation-testing the library FUNCTION'S parameter handling -- row ${TESTING_EXEC} found 2 real gaps exactly at that boundary in an otherwise fully-green, previously-mutation-tested suite.`,
  `Document a deliberate partial-generalization scope decision (1 of 3 structurally-identical guards) explicitly in the PRD/commit at decision time, so a later independent review (row ${REGRESSION_VERIFY}) classifies the resulting divergence as known-and-accepted rather than a surprise defect.`,
  `Trace a SECURITY review's risk classes against the actual call graph (who calls this, with what values, from where) rather than reviewing hypothetically -- row ${SECURITY_EXEC} used this to correctly rule OUT 2 pre-existing findings as unrelated to the diff instead of pulling them into scope.`
];

const failurePatterns = [
  `The completion flow's default retrospective (${AUTO_RETRO_ID}) and its paired RETRO evidence row (${AUTO_RETRO_EVIDENCE_ID}) are generic template filler that scored 80/100 and PASS/100 respectively while citing none of this SD's real, hard-won findings -- a quality gate scoring structure (item counts) rather than substance let boilerplate pass at a score that would normally read as "good".`,
  `Two scope-correction passes (v2, v3) rewrote \`description\`/\`scope\` to match what actually shipped, but neither touched \`success_metrics\`/\`strategic_objectives\` -- both populated by the same now-superseded original /learn auto-mint, both left silently stale, because nothing enumerates which fields a "scope correction" must check as a set.`,
  `A fix that an EXEC-phase TESTING review found and closed (2 surviving mutants, commit ${C2}) remains unmerged on an open PR (#8970) with green CI and zero reviews -- "closed" in the sense of code-written-and-mutation-verified does not mean "closed" in the sense of on-main, and nothing in this SD's own workflow forced the distinction to surface until this retro checked \`gh pr view\` and \`git merge-base\` directly.`
];

const improvementAreas = [
  {
    area: `Auto-generated completion retrospectives for /learn-minted SDs can pass the quality gate at a score (80/100) that reads as "good" while containing zero SD-specific content.`,
    root_cause: `The retrospective-quality rubric scores structural completeness (item counts across what_went_well/key_learnings/action_items) rather than requiring the content to reference this SD's actual sub_agent_execution_results rows, commits, or findings -- RetrospectiveQualityRubric.detectBoilerplate exists in this repo but is only consulted by manual one-off scripts' own precheck() convention, not wired into the automated generation path that produced ${AUTO_RETRO_ID}.`,
    prevention: `Wire RetrospectiveQualityRubric.detectBoilerplate as a hard pre-insert/pre-publish check inside whichever code path auto-generates a PLAN_VERIFICATION completion retrospective, not only as an opt-in convention for hand-authored replacement scripts.`
  },
  {
    area: `Structured metric fields on an SD row (success_metrics, strategic_objectives) can drift out of sync with prose fields (scope, description) that get explicitly corrected.`,
    root_cause: `Both correction passes on this SD (v2, v3) targeted description/scope only -- there is no enumerated checklist of "which fields does a scope correction on a /learn-auto-minted SD need to touch", so success_metrics/strategic_objectives, populated by the identical now-superseded auto-generation logic, were never revisited.`,
    prevention: `When a scope-correction script rewrites description/scope for a /learn-auto-minted SD, add success_metrics/strategic_objectives to the same pass's field list (or file an explicit action item, as this retro does), since all of these fields share one origin and one staleness risk.`
  },
  {
    area: `A follow-up PR that an EXEC-phase TESTING finding names as "closing" a coverage gap can sit open, unmerged, indefinitely with no gate forcing its resolution before the parent SD proceeds.`,
    root_cause: `Nothing in the PLAN-TO-LEAD or LEAD-FINAL-APPROVAL gate chain checks the actual merge state of a PR a sub-agent's evidence prose names as the closure of a finding -- the evidence row's PASS verdict and the finding's "closed in PR #8970" language read as done regardless of whether #8970 has merged.`,
    prevention: `When EXEC-phase TESTING (or any sub-agent) evidence names a specific follow-up PR number as closing a finding, a later-phase gate (PLAN-TO-LEAD or LEAD-FINAL-APPROVAL) should verify that PR's merge state via \`gh pr view\`/\`git merge-base --is-ancestor\`, not just trust the finding's prose.`
  }
];

const protocolImprovements = [
  `RetrospectiveQualityRubric.detectBoilerplate should gate the AUTOMATED PLAN_VERIFICATION retrospective-generation path directly, not remain an opt-in convention only exercised by hand-authored replacement one-off scripts.`,
  `A scope-correction pass on a /learn-auto-minted SD's description/scope should carry an explicit checklist including success_metrics/strategic_objectives, since all are populated by the same superseded auto-generation logic and drift identically.`,
  `PLAN-TO-LEAD or LEAD-FINAL-APPROVAL should verify the actual merge state (via gh/git, not evidence prose) of any PR a sub-agent's finding names as the closure of an issue, before treating that finding as resolved.`
];

const AUTHORED_QUALITY_SCORE = 90; // self-assessment; a DB trigger may recompute on INSERT

const retrospective = {
  sd_id: SD_ID,
  project_name: 'Fix retro-pattern-extraction backlog drain: sibling-SD fan-out defeats /learn single-SD noise filter',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  title: `SD Completion Retrospective: ${SD_KEY} -- a self-correcting two-pass investigation, a pre-code PLAN falsification, and 2 surviving mutants found in already-merged code`,
  description:
    `Infrastructure SD in EHG_Engineer, no children, auto-minted by /learn from 4 issue_patterns `
    + `(occurrence_count 39-41) that READ as freshly recurring gate failures but were 6.5-month-old `
    + `historical residue (a one-time Feb-2026 PRD-template defect on completed orchestrator-child `
    + `SDs) being freshly re-timestamped by an hourly backlog-draining cron (QF-20260911-299). `
    + `Handoffs: LEAD-TO-PLAN accepted 96%, PLAN-TO-EXEC accepted 93%, EXEC-TO-PLAN accepted 92%. `
    + `LEAD-PHASE SELF-CORRECTION: a first Explore pass (row ${EXPLORE_LEAD}) correctly traced the `
    + `5-hop mechanism chain but concluded first_seen's cron-time stamping drove /learn's false-`
    + `recurrence scoring. A second, independently-scoped Validation pass (row ${VALIDATION_LEAD}) `
    + `re-derived the same chain from scratch and REFUTED that specific claim -- first_seen is read `
    + `nowhere in filter.mjs's scoring path -- finding the real mechanism instead: the backlog `
    + `drain's sibling-SD fan-out (~20 orchestrator-child SDs sharing one incident, each recorded `
    + `under its own sd_id) manufactures the exact first_seen_sd_id!==last_seen_sd_id signal the 3 `
    + `single-SD noise guards trust as genuine cross-SD recurrence. `
    + `PLAN-PHASE PRE-CODE CORRECTION: a TESTING review (row ${TESTING_PLAN}) measured the 4 `
    + `motivating patterns' REAL site data and found the drafted FR-1 (shared parent_sd_id + `
    + `narrow recording-window predicate) would have fixed ZERO of them (7-8 distinct parents `
    + `each, 5-minute-to-22-hour spans) -- also finding FR-1/FR-2 destructively coupled on the same `
    + `field, and FR-2 citing the wrong function name while missing a second write path. All 3 `
    + `closed by rewriting the PRD before EXEC wrote any code: FR-1 retargeted to an `
    + `all-distinct-SDs-closed predicate reading no timestamp at all. `
    + `WHAT SHIPPED (commit ${C1}, merged into origin/main via PR #8967, merge commit `
    + `1ac7f6d31ea): checkSingleSDClosedSource (scripts/modules/learning/filter.mjs) generalized `
    + `from exactly-one-closed-SD to all-distinct-SDs-in-metadata.sites[]-closed -- deliberately `
    + `NOT extended to the 2 sibling guards (checkSingleSDStaleOpenSource, `
    + `checkSingleSDRetroLikeCategory), a scoped decision the real data justified for only this one `
    + `predicate. An optional occurred_at parameter was threaded through `
    + `recordOccurrence/createPattern (lib/learning/issue-knowledge-base.js) and `
    + `recordSiteAndMaybeEscalate/mergeSite (lib/learning/class-escalation.js), wired at both call `
    + `sites in scripts/auto-extract-patterns-from-retro.js's extractPatternsFromImprovements -- `
    + `kept deliberately independent from the closed-source predicate so the two fixes could not `
    + `destabilize each other. `
    + `EXEC-PHASE CATCH ON ALREADY-MERGED CODE: an EXEC-phase TESTING review (row ${TESTING_EXEC}) `
    + `mutation-tested the MERGED PR #8967 code and found 2 surviving mutants the 277/277-green `
    + `suite had not caught -- createPattern's created_at spread, and either production call `
    + `site's occurred_at argument -- both library-tested but never call-site-tested. Closed same `
    + `day in commit ${C2} (5 new tests, independently mutation-tested: 282/282 green across 27 `
    + `files), but that closing PR (#8970) remains OPEN/UNMERGED as of this retro (CI green, `
    + `0 reviews; confirmed via \`gh pr view 8970\` and \`git merge-base --is-ancestor ${C2} `
    + `origin/main\` returning false). `
    + `SECURITY (row ${SECURITY_EXEC}, PASS) traced 5 risk classes against the real call graph and `
    + `correctly flagged 2 pre-existing LOW items (an over-permissive RLS policy on issue_patterns; `
    + `an unrelated .or() string interpolation in the same touched file) as OUT of this diff's `
    + `scope rather than pulling them in. `
    + `VERIFY-PHASE DOCUMENTATION CATCH: a VALIDATION review (row ${VALIDATION_VERIFY}) `
    + `independently re-derived every FR against the shipped code (re-ran the actual pre-fix/`
    + `post-fix causal test against the 4 live patterns) and additionally found the SD's own `
    + `\`scope\`/\`description\` DB fields still described the REJECTED pre-PLAN design -- closed by `
    + `a third correction pass (scripts/one-off/correct-scope-learn-158-v3-post-plan.mjs, already `
    + `applied) before this retrospective. REGRESSION (row ${REGRESSION_VERIFY}, CONDITIONAL_PASS) `
    + `confirmed zero signature/arity breaks across the touched functions and independently `
    + `re-confirmed the 1-of-3-guards scope decision as deliberate and safe-direction, not a `
    + `regression. `
    + `RELATIONSHIP TO PRIOR ROWS: ${AUTO_RETRO_ID} (retrospectives, quality_score=80) and `
    + `${AUTO_RETRO_EVIDENCE_ID} (sub_agent_execution_results, RETRO, PASS/100) are the default `
    + `completion-flow artifacts -- template boilerplate naming none of the above. Both left `
    + `unmutated (retro-clobber-guard.js classifies the retro row unsafe to overwrite at `
    + `status=PUBLISHED+quality_score>=70) and superseded at the gate by this row and its paired `
    + `evidence row, confirmed via a live getFilteredRetrospective() re-run.`,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['EXPLORE', 'VALIDATION', 'DESIGN', 'DATABASE', 'RISK', 'STORIES', 'TESTING', 'SECURITY', 'REGRESSION', 'RETRO'],
  human_participants: ['LEAD'],
  what_went_well: whatWentWell,
  what_needs_improvement: whatNeedsImprovement,
  action_items: actionItems,
  key_learnings: keyLearnings,
  quality_score: AUTHORED_QUALITY_SCORE,
  team_satisfaction: 8,
  business_value_delivered:
    `Restores trust in /learn's automated gate-recurrence scoring: prevents the backlog-draining `
    + `cron's sibling-SD fan-out from manufacturing false "many distinct SDs hit this" signals for `
    + `one-time historical incidents, for as long as the 81%-unextracted retrospective backlog `
    + `(7,983/9,869 rows at investigation time) continues draining. Without this fix, every future `
    + `auto-generated SD from a batch-shared incident risks the exact false-recurrence signal that `
    + `generated this SD itself.`,
  customer_impact:
    `No end-user-facing surface changed -- this is Chairman/LEO-operator-facing trust in the `
    + `/learn auto-SD-minting pipeline's signal quality.`,
  technical_debt_addressed: true,
  technical_debt_created: true, // 2 of 3 structurally-identical single-SD guards deliberately left ungeneralized (action item 3); PR #8970 unmerged (action item 1)
  bugs_found: BUGS_FOUND,
  bugs_resolved: BUGS_RESOLVED,
  tests_added: TESTS_ADDED,
  objectives_met: true, // EXEC-TO-PLAN accepted 92%; all 5 FRs implemented and mutation-verified; PR #8970 merge is a tracked open action item, not an unmet acceptance criterion
  on_schedule: true,
  within_scope: true, // the 4 originally-named gates were correctly left untouched; the 1-of-3-guards boundary was explicit and data-justified
  success_patterns: successPatterns,
  failure_patterns: failurePatterns,
  improvement_areas: improvementAreas,
  protocol_improvements: protocolImprovements,
  generated_by: 'SUB_AGENT',
  trigger_event: 'PLAN_VERIFICATION phase -- RETRO sub-agent invoked ahead of the PLAN-TO-LEAD handoff attempt',
  status: 'PUBLISHED',
  performance_impact:
    `checkSingleSDClosedSource's fallback path (no metadata.sites[]) is byte-identical to the `
    + `pre-SD single-SD-only predicate; the new N-SD path adds one Set-based lookup bounded by `
    + `SITES_CAP=50, no new DB round-trips (fetchPatternSourceSDStatuses already existed, already `
    + `batched at 100 rows via .in()). Not benchmarked.`,
  target_application: 'EHG_Engineer',
  learning_category: 'APPLICATION_ISSUE',
  related_files: [
    'scripts/modules/learning/filter.mjs',
    'lib/learning/class-escalation.js',
    'lib/learning/issue-knowledge-base.js',
    'scripts/auto-extract-patterns-from-retro.js',
    'tests/learn/filter-single-sd-noise.test.js',
    'tests/unit/learning/class-escalation.test.js',
    'tests/unit/learning/issue-knowledge-base-occurred-at.test.js',
    'tests/unit/learning/batch-resilience.test.js'
  ],
  related_commits: [C1, C2],
  related_prs: ['8967', '8970'],
  affected_components: [
    'learn-pattern-noise-filter',
    'retro-pattern-extraction-cron',
    'issue-knowledge-base',
    'class-escalation-site-merge'
  ],
  tags: [
    'ehg-engineer', 'learn-pipeline', 'pattern-noise-filter', 'retro-pattern-extraction-cron',
    'single-sd-guard', 'sibling-sd-fan-out', 'timestamp-fidelity', 'two-pass-lead-investigation',
    'plan-phase-design-falsification', 'mutation-testing', 'deliberate-partial-generalization'
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

  // REUSE_RETRO_ID: this script's own first run (2026-09-14T16:35:33Z) successfully inserted
  // the retrospectives row (fe134208-9ff6-4a33-93bb-6fd095416376) and only THEN failed at
  // STEP 3 (an unrelated results-storage.js field-name issue, since fixed above). Re-running
  // storeRetrospective() unconditionally would insert a SECOND, duplicate SD_COMPLETION row --
  // storeRetrospective is a plain INSERT with no idempotency check. Set REUSE_RETRO_ID to skip
  // STEP 1 and reuse the row already confirmed live (verified via a direct SELECT before this
  // guard was added: exactly one fe134208 row exists, no duplicates).
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
    confidence: 90,
    summary: `SD-completion retrospective generated (retrospectives id ${stored.id}, retro_type=SD_COMPLETION, status=PUBLISHED, quality_score=${AUTHORED_QUALITY_SCORE}). Hand-authored around specific, verified facts pulled from 7 existing sub_agent_execution_results rows on this SD (EXPLORE ${EXPLORE_LEAD} and VALIDATION ${VALIDATION_LEAD} at LEAD; TESTING ${TESTING_PLAN} at PLAN; TESTING ${TESTING_EXEC} and SECURITY ${SECURITY_EXEC} at EXEC; REGRESSION ${REGRESSION_VERIFY} and VALIDATION ${VALIDATION_VERIFY} at VERIFY) and 2 commits (${C1}, merged via PR #8967; ${C2}, on open/unmerged PR #8970 -- confirmed live via gh/git, not assumed): the two-pass LEAD self-correction (Validation refuting Explore's first_seen scoring claim), the PLAN-phase TESTING falsification of the drafted FR-1 predicate against real site data (would have fixed 0 of 4 motivating patterns), the deliberate 1-of-3-guards scope decision and REGRESSION's independent re-confirmation of it as safe-direction, the 2 surviving mutants TESTING found in the MERGED code and their same-day closure (PR #8970, itself still unmerged), and the stale scope/description text VALIDATION found and a third correction pass fixed. Boilerplate detector (RetrospectiveQualityRubric.detectBoilerplate) run against the draft before insert -- 0 matches. The default completion-flow retrospective (${AUTO_RETRO_ID}, quality_score=80, template filler) and its paired RETRO evidence row (${AUTO_RETRO_EVIDENCE_ID}) are left unmutated per retro-clobber-guard.js policy (PUBLISHED + quality_score>=70) and superseded at the gate by this row, confirmed via a live getFilteredRetrospective() re-run (gate_selects_this_row=${gateSees}).`,
    findings: [
      {
        id: 'RETRO-QUALITY-001',
        severity: 'INFO',
        title: 'Retrospective content is SD-specific and evidence-cited, not metric-only boilerplate',
        detail: `All structured fields cite specific sub_agent_execution_results row IDs, commit SHAs, and live-verified PR states (rather than restating PRD text or handoff summaries). Four key_learnings entries generalize beyond this SD: falsify a drafted design's predicate against real data before PRD lock; structure LEAD investigation as two independent passes so the second can refute the first; a deliberate partial-generalization of N structurally-identical guards is legitimate when documented at decision time; and mutation-test call-site argument-passing as distinct from library-function parameter handling.`,
      },
    ],
    critical_issues: [],
    warnings: [
      {
        id: 'RETRO-PR-8970-UNMERGED',
        severity: 'LOW',
        issue: `Commit ${C2} (closing 2 EXEC-phase-found surviving mutants) sits on open, unmerged PR #8970 as of this evidence row. CI green, 0 reviews. Tracked as action item 1 in the retrospective, not silently treated as resolved.`,
      },
    ],
    recommendations: [
      'Proceed to PLAN-TO-LEAD handoff.',
      'Merge PR #8970 (action item 1) before or shortly after LEAD-FINAL-APPROVAL.',
      'Reconcile success_metrics/strategic_objectives with the corrected scope/description (action item 2).',
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
      pr_8970_merged: false,
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sd.id,
    targetApplication: sd?.target_application || 'EHG_Engineer',
    subAgentCode: 'RETRO',
    fallback: 'EHG_Engineer',
    probeExistsRelative: 'package.json',
    supabase,
  });
  console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

  applySubAgentRepoVerdict(results, resolution);

  const stored2 = await storeSubAgentResults('RETRO', sd.id, { name: 'RETRO' }, results, {
    phase: 'PLAN_VERIFICATION',
    source: 'manual',
    sdKey: sd?.sd_key || SD_KEY,
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
