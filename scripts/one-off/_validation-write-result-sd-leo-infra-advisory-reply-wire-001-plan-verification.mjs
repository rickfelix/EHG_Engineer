#!/usr/bin/env node
/**
 * Write VALIDATION (Principal Systems Analyst) PLAN_VERIFICATION verdict for
 * SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001 (PR #7536, head 0a7bf86ea20).
 *
 * Question answered: does the SHIPPED implementation actually satisfy the PRD
 * (PRD-SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001 FR-1..FR-5, TR-1..TR-3, TS-1..TS-8,
 * AC-1..AC-3) — and does it actually fix the real-world bug?
 *
 * Method: EXECUTION + live-data measurement, not reading. Three instruments:
 *  (1) OLD-vs-NEW differential — origin/main's solomon-advisory.cjs was extracted to a
 *      sibling path (so relative requires resolve), both modules loaded in one process, and
 *      resolveConsultOriginator run against a REAL service-role Supabase client over every
 *      live answered correlation, through all three doors (by correlation, by reply-row id,
 *      by ask-row id).
 *  (2) Mutation testing, uniqueness-asserted — 13 mutations of the shipped behaviours,
 *      each anchor asserted to match exactly ONE site before applying (see finding V3).
 *  (3) End-to-end execution of the shipped ensureOriginatorCc against live specimens with
 *      insertRow stubbed to a capture array (zero rows written) and a unique replyTo so the
 *      dedup branch cannot pre-empt the resolve+target decision under measurement.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'b0d54b9f-8848-4cab-a7d8-fba9ad3e31fb';
const SD_KEY = 'SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001';

const findings = [
  {
    id: 'V-FR1-widened-kind-gate-VERIFIED',
    requirement: 'FR-1',
    severity: 'INFO',
    status: 'PASS',
    description:
      "IMPLEMENTED AS SPECIFIED, and named once as the PRD required. REPLY_ELIGIBLE_KINDS = Object.freeze([SOLOMON_CONSULT_KIND, PAYLOAD_KINDS.ADAM_ADVISORY]) at solomon-advisory.cjs:571 is the single source for BOTH gates the PRD named: the by-id branch guard (:635 `if (!REPLY_ELIGIBLE_KINDS.includes(p.kind)) return null;`, replacing the old `p.kind !== SOLOMON_CONSULT_KIND`) and the correlation-fallback query filter (:591 `.in('payload->>kind', REPLY_ELIGIBLE_KINDS)`, replacing the old `.eq('payload->>kind', SOLOMON_CONSULT_KIND)`). No second hard-coded literal exists. VERIFIED BY EXECUTION, not by reading: three independent mutations all KILLED — M1 (narrow the frozen set back to consult-only) fails 10 tests, M6 (neuter the by-id allowlist) fails 1, M7 (delete the fallback .in()) fails 1. So both halves are load-bearing AND test-pinned; neither can be regressed with a green suite. FR-1 acceptance criterion 1 (by-id resolves a real originator for kind=adam_advisory) and criterion 2 (fallback WHERE matches kind IN (solomon_consult, adam_advisory)) are both satisfied.",
  },
  {
    id: 'V-FR2-by-id-reply-fallthrough-VERIFIED',
    requirement: 'FR-2',
    severity: 'INFO',
    status: 'PASS',
    description:
      "IMPLEMENTED AS THE CONTROL-FLOW CHANGE THE PRD DEMANDED, not as a mere added filter. FR-2 was explicit that an isReplyRow() hit in the by-id branch must NOT early-return but fall through via that row's own payload.correlation_id. Shipped code at :639-641 does exactly that: `if (isReplyRow(byId)) { return p.correlation_id ? resolveOriginatorFromCorrelation(supabase, p.correlation_id) : null; }`, placed AFTER the :635 kind allowlist so a non-eligible kind can never reach the fall-through door. MEASURED LIVE, and the door is real: across all 47 live answered correlations, resolving by the REPLY row's id returned OLD=null / NEW=<true originator> in 47/47 cases. Under OLD the by-id-on-a-reply-row path was inert only because reply rows are stamped kind=adam_advisory and OLD admitted solomon_consult only — i.e. FR-1's widening is precisely what ARMS this hazard, confirming FR-2 is load-bearing rather than defensive. Mutation M2 (delete the fall-through) is KILLED (1 test). FR-2 acceptance criteria 1 and 3 satisfied; criterion 2 (the named live specimen) verified separately — see V-LIVE-SPECIMEN.",
  },
  {
    id: 'V-FR3-regression-coverage-VERIFIED',
    requirement: 'FR-3',
    severity: 'INFO',
    status: 'PASS',
    description:
      "SATISFIED, including the two named side-conditions. tests/unit/solomon-consult-originator-cc.test.js carries 36 it() blocks (the SD's 42-test claim over-counts this file; the accurate figures are 36 in-file and 72 across the three PRD-named files). Coverage confirmed present for each FR-3 acceptance sub-clause: (a) by-id kind=adam_advisory -> 'FR-1: resolves by row id for an adam_advisory-kind (non-reply) row'; (b) ask+reply fallback -> 'FR-4: correlation fallback on an answered correlation resolves the ask, not the newest (reply) row'; (c) second reply on an already-answered solomon_consult -> 'TS-3: a SECOND reply on an already-answered solomon_consult correlation still CCs the original asker'; (d) the pre-existing negative-scoping guard is UPDATED-NOT-DELETED and still asserts null ('a NON-eligible-kind row resolved by id yields null — CC stays scoped, not a blanket bypass (review I4)'). FR-3 acceptance criterion 2 verified by execution: the two named collateral suites (tests/unit/coordinator/correction-delivery-path.test.js, tests/unit/coordinator/disposition-lock.test.js) pass with zero regressions — 72/72 green across the three files.",
  },
  {
    id: 'V-FR4-cap-then-filter-ascending-VERIFIED',
    requirement: 'FR-4',
    severity: 'INFO',
    status: 'PASS',
    description:
      "ALL THREE ACCEPTANCE CRITERIA IMPLEMENTED AND INDEPENDENTLY MUTATION-PROVED. resolveOriginatorFromCorrelation (:588-611) fetches `.order('created_at', {ascending:true}).limit(20)`, then filters in JS via `rows.find((r) => !isReplyRow(r))` — cap-then-filter in the correct order, never `.limit(1)` before exclusion, ascending, first-non-reply-wins. FOUR mutations of this one function were run and ALL KILLED: M3 ascending true->false (1 failed), M4 .limit(20)->.limit(1) (2 failed), M4b .limit(20)->.limit(2) (1 failed), M10 rows.find(!isReplyRow)->rows[0] (3 failed). M4b is the notable one — even a window NARROWING that still exceeds live data volume is caught, so the bound is pinned by intent and not merely by accident of fixture size. Criterion 3 (idempotency across repeated replies) is pinned by 'TS-8: dedup stability — resolving via the correlation fallback is identical whether 1 or 3 replies exist'. Live headroom confirms the .limit(20) cap is not currently load-bearing in the truncating direction: measured rows-per-correlation distribution over 377 live correlations is {1:330, 2:30, 3:17}, max 3, zero correlations above 20.",
  },
  {
    id: 'V-FR5-solomon-remap-implemented-but-live-inert',
    requirement: 'FR-5',
    severity: 'INFO',
    status: 'PASS_WITH_OBSERVATION',
    description:
      "IMPLEMENTED FAITHFULLY AND TEST-PINNED; live efficacy is currently nil, for a reason INHERITED from the Adam-side logic FR-5 was told to mirror. The code (:676-678) adds `else if (sess.metadata.role === 'solomon') originator = (await getLiveSolomonId(...).catch(()=>null)) || originator;` as an exact structural mirror of the pre-existing role==='adam' W3 branch, reusing lib/coordinator/solomon-identity.cjs getActiveSolomonId as FR-5 specified, and failing open to the raw originator. Mutation M5 (delete the branch) is KILLED (3 tests), and TS-7 is covered by 'FR-5: re-resolves a dead SOLOMON originator session to the LIVE solomon session'. So FR-5 acceptance criterion 1 (behavioural) is met. HONEST MEASUREMENT ON CRITERION 2: it cannot currently be exercised in production. metadata.role is effectively a SINGLETON tag — targeted counts give role='solomon': 1 (d8f99dba, status=active, and it IS the live seat), role='adam': 1 (50192c2e, active, IS the live seat), role='solomon_retired': 0, role='adam_retired': 21. Because the only session matching each branch already IS the live seat, getActiveSolomonId/getActiveAdamId return the same value and the remap is a no-op. Confirmed end-to-end over all 377 live correlations: the resolved originator's role distribution is {adam:46, solomon:8, adam_retired:303, (no role):6}, and the count of correlations whose resolved originator is a STALE role-tagged seat — i.e. where either remap would fire AND change the value — is 0 for solomon and 0 for adam. A rotated seat either gets re-tagged '<role>_retired' or loses metadata.role entirely (probed c84a1b4a: role undefined, status=released), and NEITHER shape matches the `role === 'solomon'` predicate. NOT A DEFECT OF THIS SD: FR-5's own text required mirroring the Adam W3 logic exactly, and the Adam branch has the identical measured-zero reachability — this is a pre-existing property of the role-tag convention faithfully inherited, not something the change introduced, and the failure mode is fail-open to the raw id. Recorded so a future reader does not infer live protection that the tagging convention does not currently deliver.",
  },
  {
    id: 'V-LIVE-SPECIMEN-bug-actually-fixed',
    requirement: 'TS-5 / AC-1 / real-world defect',
    severity: 'INFO',
    status: 'PASS',
    description:
      "THE SD FIXES A REAL, MEASURED, LIVE DEFECT — not a hypothetical one. An OLD-vs-NEW differential was run in a single process against a real service-role client over every live answered correlation. ADVISORY LANE (adam_advisory-only correlations, n=9): OLD resolves null on 9/9 (i.e. no CC — exactly the reported symptom), NEW resolves the true asker on 9/9. FIXED 9, REGRESSED 0. The PRD's named specimen reproduces exactly as TS-5 predicted: correlation a25bbb03-9d25-4e87-85f9-5254baa03a18 (ask d1a5a2aa 2026-08-25T00:46:29Z sender_type=adam sender 50192c2e, reply 4dbf183c 00:50:28Z sender=solomon d8f99dba) gives OLD=null, NEW=50192c2e — the Adam originator, NOT d8f99dba the replier — through all three doors (by correlation, by reply id, by ask id). Eight further independent live advisory specimens fix identically, including cross-seat shapes (333e83ca / 55c9a78a / 56f40c10 / 5c4528b0 / 716d0967: ask adam 0549d739, reply solomon c84a1b4a -> NEW resolves 0549d739). The PRD's own scope note that the second LEAD-named candidate (reply 18700836 / correlation 9d15ee25) is NOT a specimen of this bug is confirmed: it has no non-reply ask row on its correlation, so it correctly resolves null under both builds.",
  },
  {
    id: 'V-NO-REGRESSION-consult-path',
    requirement: 'AC-2 / FR-3',
    severity: 'INFO',
    status: 'PASS',
    description:
      "NO REGRESSION TO THE PREVIOUSLY-WORKING solomon_consult CC PATH — measured, not assumed. In the same OLD-vs-NEW live differential, the consult lane (n=38 correlations carrying a solomon_consult ask) shows byCorrelation OLD == NEW == the true originator in 38/38, and byAskId OLD == NEW == truth in 38/38. REGRESSED count is 0 across BOTH lanes (0 of 47 correlations total). The consult lane additionally IMPROVES on the by-reply-id door (OLD=null -> NEW=correct in 38/38), which is FR-2 working on the consult kind as well. Broader blast-radius check: every test file in the repo that references solomon-advisory or guard-wiring-registry was run — 38 files, 475/475 tests passing, zero failures.",
  },
  {
    id: 'V-AC-END-TO-END-EXECUTED',
    requirement: 'AC-1, AC-2, AC-3',
    severity: 'INFO',
    status: 'PASS',
    description:
      "ALL THREE PRD ACCEPTANCE CRITERIA PROVEN END-TO-END BY EXECUTING THE SHIPPED ensureOriginatorCc (not just the resolver) against LIVE rows, with insertRow stubbed to a capture array so zero rows were written, and a unique synthetic replyTo so the idempotence branch could not pre-empt the decision under measurement. 5/5 cases PASS on all of {returned originator, rows written, actual target_session on the captured row}: (AC-1) advisory a25bbb03 -> inserted:true, target_session=50192c2e, via='cc_originator'; (AC-1) advisory ee1f101f -> 50192c2e; (AC-1) advisory 333e83ca cross-seat -> 0549d739; (AC-2) a SECOND reply on already-answered consult correlation e3000455 -> inserted:true targeting the ORIGINAL asker 50192c2e, i.e. the multi-reply consult case explicitly named in AC-2 still works; (AC-3) a live coordinator_reply row hit by id -> inserted:false, originator:null, ZERO rows captured, i.e. the negative-scoping guard for non-reply-worthy kinds holds against real data. This closes the gap between 'the resolver returns the right id' and 'the CC row is actually addressed to the right session', which is what the acceptance criteria are written in terms of.",
  },
  {
    id: 'V-TR-technical-requirements-VERIFIED',
    requirement: 'TR-1, TR-2, TR-3',
    severity: 'INFO',
    status: 'PASS',
    description:
      "ALL THREE HOLD. TR-1 (single-file production change, no schema/migration): confirmed by diff — production changes are scripts/solomon-advisory.cjs (+107/-41) plus a 1-line pointer correction in lib/governance/guard-wiring-registry.js; the only other diffed paths are the test file and three scripts/one-off evidence scripts. No migration, no new table. The registry edit was independently RE-DERIVED rather than trusted: definedAt was updated 291 -> 292, and `function enforceSweepBudget(` is in fact at line 292 of the shipped file (the drift is the honest consequence of this SD's own single-line import addition at :53), and tests/unit/governance/guard-wiring.test.js passes. TR-2 (do not widen beyond the two named kinds): the set is frozen at exactly {solomon_consult, adam_advisory}, pinned by a dedicated test ('REPLY_ELIGIBLE_KINDS is exactly {solomon_consult, adam_advisory} — no silent widening beyond the two named kinds') AND by mutations M6/M7 both being killed; the live AC-3 probe confirms an arbitrary kind still resolves null. TR-3 (origin_session has no producer; sender_session is the sole real-world signal): INDEPENDENTLY RE-MEASURED rather than accepted from the PRD — a repo-wide grep across lib/ and scripts/ finds zero write sites (the only non-test hits are prose inside this SD's own one-off evidence scripts), and a live query returns 0 rows carrying payload.origin_session. TR-3's derived instruction is also honoured: the by-id path has BOTH an origin_session fixture and a sender_session-only fixture, so the tests do not depend on origin_session being populated.",
  },
  {
    id: 'V1-origin_session-fallback-preference-unpinned',
    requirement: 'FR-1 / TR-3 (test adequacy)',
    severity: 'LOW',
    status: 'NON_BLOCKING_RESIDUAL',
    description:
      "ONE OF 13 MUTATIONS SURVIVED, and it is the expected one. M11 — dropping the origin_session preference inside resolveOriginatorFromCorrelation (:604, `(origin.payload && origin.payload.origin_session) || origin.sender_session` -> `origin.sender_session`) — leaves the suite 72/72 green. The SYMMETRIC preference on the by-id path IS pinned (M12 killed, 1 failed), so this is an asymmetry, not a blanket gap. WHY IT IS NOT BLOCKING, and why adding a test would arguably be worse: TR-3 states — and this pass independently re-measured — that payload.origin_session has zero writers repo-wide and zero live rows, so this branch is unreachable in production. TR-3 explicitly warns that a fixture setting origin_session 'tests the fixture shape, not the live system'. Pinning it would therefore pin dead-by-construction behaviour. This is the same surface the EXEC-TO-PLAN SECURITY pass recorded as S5 (LOW, 'unverified prose with no writer') and carried forward as an accepted residual; PLAN_VERIFICATION concurs with that disposition and adds nothing new. The standing recommendation remains SECURITY's: either wire a producer or narrow the :607-608 doc comment, which currently describes the field as 'set by relay paths' when no such path exists.",
  },
  {
    id: 'V3-mutation-harness-false-survivor-self-corrected',
    requirement: 'method integrity',
    severity: 'INFO',
    status: 'SELF_CORRECTED',
    description:
      "RECORDED BECAUSE IT NEARLY PRODUCED A FALSE FINDING AGAINST THIS SD. The first mutation run reported M3 (FR-4's ascending ordering) as SURVIVED, which would have been reported as a genuine FR-4 coverage gap. It was a harness artifact: the anchor string `.order('created_at', { ascending: true })` was written WITHOUT its leading indentation, and String.replace substitutes only the FIRST occurrence — which is solomon-advisory.cjs:408 inside drainInbox, not :592 inside resolveOriginatorFromCorrelation. The mutation had been silently applied to an unrelated function. Caught by a follow-up probe whose ASC and DESC builds returned identical results on a fixture designed to force divergence, then confirmed by diffing the mutant against the source (single hunk at 408). The entire run was redone with every anchor asserted to match EXACTLY ONE site (count===1, else HARNESS-ERROR), after which M3 at the correct site is KILLED. Final tally: 13 mutations, 12 killed, 1 survivor (V1). Two lessons worth carrying: (a) a mutation harness must verify WHERE it mutated, not merely THAT the pattern matched — 'applied' and 'applied at the intended site' are different claims; (b) incidentally and out of scope for this SD, mutating drainInbox's ordering at :408 survived all 38 dependent test files, which is a separate coverage observation about drainInbox, not about this change. Source was confirmed byte-identical to HEAD after every run (git diff --stat empty).",
  },
  {
    id: 'V4-scratch-artifact-contaminated-a-repo-scanning-test',
    requirement: 'method integrity',
    severity: 'INFO',
    status: 'SELF_CORRECTED',
    description:
      "Also recorded for method honesty. The OLD-vs-NEW differential required origin/main's module to resolve its relative requires, so it was extracted to scripts/zz-val-old-solomon-advisory.cjs. That untracked sibling caused 2 genuine-looking failures in tests/unit/governance/guard-wiring.test.js, which scans scripts/ for wired call sites and correctly reported that enforceSweepBudget 'now HAS a wired caller'. The failure was MINE, not the SD's: after deleting the scratch copy the same 38 files pass 475/475. Worth noting as a live demonstration that repo-scanning guards are sensitive to untracked scratch files in scanned directories — an evaluator who did not recognise their own artifact could have mis-attributed this to the change under review. Tracked directories (scripts/, lib/, tests/) were confirmed clean afterwards via git status --porcelain.",
  },
];

const warnings = [
  "FR-5's Solomon live-remap is correct, test-pinned, and fail-open, but has measured-zero effect on live data today (0 of 377 correlations resolve to a stale role-tagged seat; role='solomon' is a singleton tag held by the live seat, and rotated seats are re-tagged '<role>_retired' or lose the role, matching neither branch). The pre-existing Adam W3 branch has the identical property, so this is inherited rather than introduced — but the role-tag convention, not the remap, is what currently determines whether a rotated-seat CC dead-letters.",
  "The origin_session preference on the correlation-fallback path is not test-pinned (mutation M11 survives). Deliberately not raised as a condition: the field has zero writers repo-wide and zero live rows, so a pinning test would encode dead-by-construction behaviour, which TR-3 explicitly warns against. The doc comment at solomon-advisory.cjs:607-608 still describes origin_session as 'set by relay paths that preserve the true originator' — prose that no code backs.",
  "The .limit(20) candidate window is comfortably above live volume (max 3 rows per correlation, 0 correlations above 20), so the cap is not currently exercised in the truncating direction. It is nonetheless mutation-pinned in both directions (limit->1 and limit->2 both killed), so a future volume increase would not silently degrade unnoticed.",
];

const recommendations = [
  'No blocking action. PLAN_VERIFICATION passes; the SD is ready for the PLAN->LEAD handoff on the merits of the implementation.',
  "Optional follow-up (NOT a condition of this SD, and NOT harness work to be opened during a product session): the metadata.role tagging convention means neither the pre-existing Adam W3 remap nor the new FR-5 Solomon remap can fire on a rotated seat, because retirement re-tags to '<role>_retired' or clears the role. If the dead-seat CC redirect is meant to be a live protection rather than a narrow-window guard, the predicate should match the retired forms too — but that is a change to inherited W3 behaviour affecting both roles, so it belongs in its own SD rather than being smuggled into this one.",
  "Optional follow-up, inherited from SECURITY S5 and re-confirmed here: either wire a producer for payload.origin_session or narrow the doc comment at solomon-advisory.cjs:607-608, so the highest-precedence input to CC-target resolution is not described as wired when it has no writer.",
];

const summary =
  'PASS. The shipped implementation satisfies FR-1..FR-5, TR-1..TR-3, TS-1..TS-8 and AC-1..AC-3, and — the question that actually matters — it demonstrably fixes a real, live, currently-broken path rather than merely adding related-looking code. Verified by execution and live measurement on three independent instruments. (1) OLD-vs-NEW DIFFERENTIAL: origin/main and HEAD builds of solomon-advisory.cjs loaded in one process and run against a real service-role client over every live answered correlation, through all three entry doors. Advisory lane: OLD resolves null (no CC — the reported symptom) on 9/9, NEW resolves the true asker on 9/9. Consult lane (the previously-working control): OLD == NEW == truth on 38/38 by correlation and by ask id. FIXED 47, REGRESSED 0 of 47. The PRD-named specimen a25bbb03 reproduces exactly as TS-5 predicted (OLD null -> NEW 50192c2e, the Adam asker, not d8f99dba the replier). (2) MUTATION TESTING, uniqueness-asserted: 13 mutations of the shipped behaviours, 12 KILLED — including all four FR-4 mutants (ASC->DESC, limit 20->1, limit 20->2, reply-filter removal), both halves of the TR-2 kind allowlist, the FR-2 fall-through, the FR-5 remap, the R3 error-signalling branch and the EXEC-SEC-S4 CC-target guard. The single survivor is the origin_session preference on the fallback path, which TR-3 independently establishes is dead-by-construction (zero writers repo-wide, zero live rows, both re-measured here). (3) END-TO-END: the shipped ensureOriginatorCc — not just the resolver — driven against live rows with insertRow stubbed and dedup neutralised, proving all three acceptance criteria at the level they are written (the actual target_session on the actual captured row): 5/5 PASS, including AC-2 multi-reply consult and AC-3 negative scoping with zero rows written. Blast radius: all 38 test files referencing the changed modules pass 475/475. TR-1 confirmed single-file with no migration, and the guard-wiring registry line pointer was re-derived rather than trusted (enforceSweepBudget is genuinely at :292).';

const justification =
  "PASS rather than CONDITIONAL_PASS because every PRD requirement was confirmed by an executed probe against live data or by a killed mutant, and the only residual (V1) is a test-adequacy asymmetry on a branch the PRD itself (TR-3) documents as unreachable — pinning it would encode dead-by-construction behaviour, so attaching it as a condition would be process theatre rather than risk reduction. It is recorded as a LOW residual and inherits SECURITY's existing S5 disposition rather than reopening it. The FR-5 observation is deliberately NOT a condition either: FR-5's own acceptance text asked for an exact mirror of the Adam W3 remap, the code delivers exactly that, and the measured-zero live reachability is a property of the metadata.role tagging convention shared identically by the Adam branch — i.e. inherited, not introduced, and fail-open. Holding this SD for it would penalise the change for faithfully doing what it was told. PASS rather than an unqualified rubber-stamp because this pass did not rely on the prior EXEC-TO-PLAN rounds' conclusions: the PRD's own factual claims were re-measured first-hand (TR-3's zero-writer claim, the a25bbb03 specimen shape, the registry line number, the 42-test count — which is in fact 36 in-file), and the OLD build was executed side-by-side with the NEW rather than reasoning about what the old code would have done. Confidence 94: the residual uncertainty is not about whether the fix works — that is settled by 47/47 differential and 5/5 end-to-end on live rows — but about longer-horizon behaviour the current data volume cannot exercise (correlations above the 20-row cap, and rotated-seat remap under a tagging convention that does not presently produce the matching shape). One methodological caveat is disclosed in finding V3: the first mutation run produced a FALSE survivor because an under-specified anchor mutated the wrong function, and the verdict rests on the corrected, uniqueness-asserted re-run, not the first pass.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 94,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      review_type: 'PLAN_VERIFICATION_VALIDATION_REVIEW',
      pr: 7536,
      branch: 'feat/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
      head_commit: '0a7bf86ea20',
      prd_reviewed: 'PRD-SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
      requirement_verdicts: {
        'FR-1 widened kind gate (REPLY_ELIGIBLE_KINDS, both branches)': 'PASS — mutation-pinned x3 (M1/M6/M7 killed)',
        'FR-2 reply-row exclusion in BOTH branches (control-flow fall-through)': 'PASS — M2 killed; 47/47 live by-reply-id door OLD null -> NEW correct',
        'FR-3 regression coverage without regressing consult path': 'PASS — 36 it() in file, 72/72 across the 3 PRD-named files, negative-scoping test preserved',
        'FR-4 cap-then-filter, ascending, stable/idempotent': 'PASS — all 4 mutants killed (ASC->DESC, limit 20->1, limit 20->2, filter removal)',
        'FR-5 Solomon role-based live remap': 'PASS (behaviour) with live-reachability observation — M5 killed; 0/377 live correlations exercise it, identically to the inherited Adam branch',
        'TR-1 single-file, no schema/migration': 'PASS — solomon-advisory.cjs + 1-line registry pointer; registry line 292 re-derived correct',
        'TR-2 no widening beyond the two named kinds': 'PASS — frozen set, dedicated test, M6/M7 killed, live coordinator_reply probe returns null',
        'TR-3 origin_session has no producer': 'PASS — re-measured independently: 0 writers repo-wide, 0 live rows',
        'TS-1..TS-8': 'ALL COVERED — TS-1/2/3/4/6/7/8 by named unit tests; TS-5 (live specimen) verified by live execution in this pass',
        'AC-1 advisory reply CCs the originating Adam session': 'PASS — proven end-to-end on 3 live specimens, target_session captured',
        'AC-2 no regression to solomon_consult incl. multi-reply': 'PASS — 38/38 live differential unchanged; multi-reply case proven end-to-end',
        'AC-3 no regression to negative-scoping guard': 'PASS — live coordinator_reply row -> inserted:false, 0 rows written',
      },
      evidence: {
        method: 'execution + live measurement on three independent instruments; no verdict rests on reading alone',
        live_differential:
          'origin/main vs HEAD builds loaded in ONE process, run against a real service-role client over every live answered correlation, through 3 doors (by correlation / by reply-row id / by ask-row id). ADVISORY lane n=9: OLD null 9/9, NEW correct 9/9. CONSULT lane n=38: byCorr and byAskId OLD==NEW==truth 38/38, byReplyId OLD null -> NEW correct 38/38. FIXED 47, REGRESSED 0.',
        named_specimen_ts5:
          'correlation a25bbb03-9d25-4e87-85f9-5254baa03a18 (ask d1a5a2aa 2026-08-25T00:46:29Z sender_type=adam sender 50192c2e; reply 4dbf183c 00:50:28Z sender solomon d8f99dba): OLD=null, NEW=50192c2e through all three doors. Second LEAD-named candidate 9d15ee25 confirmed NOT a specimen (no non-reply ask row) — matches the PRD scope note.',
        mutation_results:
          '13 mutations, uniqueness-asserted (anchor must match exactly 1 site or the run reports HARNESS-ERROR). KILLED (12): M1 kind-set->consult-only (10 failed), M2 by-id fall-through deleted (1), M3 ASC->DESC at the CORRECT site :592 (1), M4 limit(20)->limit(1) (2), M4b limit(20)->limit(2) (1), M5 solomon remap deleted (3), M6 by-id allowlist neutered (1), M7 fallback .in() deleted (1), M8 error-signalling branch neutered (1), M9 isUsableSessionId/broadcast guard neutered (4), M10 reply-filter removed (3), M12 by-id origin_session preference dropped (1). SURVIVED (1): M11 fallback origin_session preference dropped (72/72 green) — dead-by-construction per TR-3. Source restored byte-identical after every run (git diff --stat empty).',
        mutation_harness_caveat:
          'FIRST run reported M3 as SURVIVED; this was a FALSE survivor caused by an unindented anchor matching solomon-advisory.cjs:408 (drainInbox) instead of :592 (the resolver). Detected by an ASC-vs-DESC divergence probe returning identical results, confirmed by diffing the mutant. Verdict rests on the corrected uniqueness-asserted re-run. See finding V3.',
        end_to_end_executed:
          'shipped ensureOriginatorCc driven against live rows with insertRow stubbed to a capture array (0 rows written) and a unique synthetic replyTo so dedup could not pre-empt. 5/5 PASS on {returned originator, rows written, captured target_session}: a25bbb03 -> target 50192c2e via cc_originator; ee1f101f -> 50192c2e; 333e83ca -> 0549d739; consult e3000455 SECOND reply -> 50192c2e (AC-2); live coordinator_reply row -> inserted:false, originator:null, 0 rows (AC-3).',
        live_data_shape:
          '525 eligible-kind rows / 377 distinct correlations; rows-per-correlation {1:330, 2:30, 3:17}, max 3 vs the 20-row cap; 0 correlations with multiple non-reply asks; 61 answered correlations, and the newest row is a reply in 61/61 — the exact shape that made the pre-fix DESC .limit(1) query resolve the replier.',
        fr5_reachability_measured:
          "metadata.role targeted counts: solomon=1 (d8f99dba, active, IS live), adam=1 (50192c2e, active, IS live), solomon_retired=0, adam_retired=21. Resolved-originator role distribution over 377 live correlations: {adam:46, solomon:8, adam_retired:303, (no role):6}. Correlations where a remap would fire AND change the value: solomon 0, adam 0. Rotated seat c84a1b4a probed: metadata.role undefined, status=released — matches neither branch.",
        tr3_reverified:
          'payload.origin_session write sites in lib/ + scripts/ (excluding tests and this SD\'s own one-off evidence prose): 0. Live rows carrying payload.origin_session: 0. Independently re-measured, not taken from the PRD.',
        test_counts:
          '36 it() in tests/unit/solomon-consult-originator-cc.test.js (the SD\'s "42 tests" claim over-counts this file); 72/72 across the 3 PRD-named files; 475/475 across all 38 repo test files referencing solomon-advisory or guard-wiring-registry.',
        registry_pointer_rederived:
          "lib/governance/guard-wiring-registry.js definedAt 291 -> 292 verified correct: `function enforceSweepBudget(` is at solomon-advisory.cjs:292; tests/unit/governance/guard-wiring.test.js green.",
        probes_persisted: [
          '.artifacts-val-get-prd.mjs',
          '.artifacts-val-live-survey.mjs',
          '.artifacts-val-differential.cjs',
          '.artifacts-val-mutate.cjs',
          '.artifacts-val-mutate2.cjs',
          '.artifacts-val-desc-probe.cjs',
          '.artifacts-val-e2e.cjs',
          '.artifacts-val-fr5.cjs',
          '.artifacts-val-fr5b.cjs',
          '.artifacts-val-roles2.cjs',
          '.artifacts-val-origin-live.mjs',
        ],
      },
      prior_reviews_cross_checked: {
        'SECURITY EXEC-TO-PLAN S5 (origin_session unverified prose, no writer)':
          'CONCURRED and independently re-measured (0 writers, 0 live rows). Same surface as this pass\'s sole surviving mutant V1; disposition unchanged (LOW residual, not a condition).',
        'SECURITY EXEC-TO-PLAN S4 (CC target written unvalidated)':
          'CONFIRMED CLOSED by mutation — neutering the isUsableSessionId/broadcast guard kills 4 tests, so the fix is test-pinned and not merely present.',
        'TESTING EXEC-TO-PLAN TST-C1/C2 (cap, sort direction, reply-exclusion unpinned)':
          'CONFIRMED CLOSED — all four FR-4 mutants now killed, including the limit(20)->limit(2) narrowing that a fixture-sized bound alone would not catch.',
        'VALIDATION LEAD-phase (naive kind-widening would resolve the replier)':
          'CONFIRMED ADDRESSED — measured live: the by-reply-id door returns the true originator on 47/47 correlations, and deleting the FR-2 fall-through kills a test.',
      },
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree:
        'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
    },
    phase: 'PLAN_VERIFICATION',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
