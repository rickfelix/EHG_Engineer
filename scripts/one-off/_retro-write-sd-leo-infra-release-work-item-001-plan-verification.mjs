#!/usr/bin/env node
/**
 * One-off: RETRO (Continuous Improvement Coach) for
 * SD-LEO-INFRA-RELEASE-WORK-ITEM-001 — "release-work-item SD branch never
 * reverts status and writes current_phase unguarded".
 *
 * Two writes, in order:
 *   1. retrospectives row (retro_type=SD_COMPLETION, status=PUBLISHED)
 *   2. sub_agent_execution_results evidence row for sub_agent_code='RETRO'
 *      via the CANONICAL writers (lib/sub-agents/resolve-repo.js
 *      applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js
 *      storeSubAgentResults) per CLAUDE.md prologue rule 11 — metadata.repo_path
 *      + metadata.executed_from_cwd, NO top-level repo_path/local_path columns.
 *
 * sd_id is resolved via .eq('sd_key', SD_KEY) per task instruction — an
 * .eq('id', SD_KEY) lookup on a sd_key-formatted string silently returns null.
 *
 * PHASE STRING: 'PLAN_VERIFICATION' — matches the SD's current_phase and the
 * REGRESSION/VALIDATION rows already written for this phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-RELEASE-WORK-ITEM-001';
const PHASE = 'PLAN_VERIFICATION';
const HEAD = 'c004456ee5307e1aaf859f02c97c6dd11cd9302b';
const QUALITY_SCORE = 78;

// ---------------------------------------------------------------------------
// THE CENTRAL PATTERN
// ---------------------------------------------------------------------------
const PATTERN = 'A SAFETY CHECK BUILT ON A PROXY FOR THE RISK, NOT THE RISK ITSELF';
const PATTERN_TEST =
  'Name what the check actually reads (a git range, a caller\'s stated gating, a NOT-NULL filter, a constant exported by the module under test) and ask: does that reading move in lockstep ' +
  'with the real hazard (lost work, a live process, a reachable population), or can the two diverge? Six instances on this one SD answer "it can diverge" — a pushed-but-unmerged branch vs. an ' +
  'upstream ref; commits-ahead vs. loss risk; commits-ahead vs. working-tree dirtiness; an inherited gating premise vs. the actual call graph; a NOT-NULL filter vs. a column the studied event itself nulls; ' +
  'and a step-order constant vs. the module whose order it is meant to police.';

const what_went_well = [
  {
    achievement: 'A FAILING FIXTURE AGAINST A REAL WORKTREE CAUGHT THE RANGE BUG THAT REASONING AND REVIEW HAD ALREADY PASSED OVER.',
    detail:
      'Commit e122acc3544: the first cut of the FR-6 pre-flight used \'@{u}..HEAD\', the literal reading of "unpushed work". SD-6 pointed it at THIS SD\'s own worktree rather than a stub, and it returned 0 ' +
      'against a branch that had just been pushed — reading a branch carrying real commits as empty. The commit message names the mechanism exactly: "a stubbed count would have returned whatever I told it to and confirmed my mistake back to me with full green."',
    consequence:
      '\'origin/main..HEAD\' replaced it (verified live: this worktree reports the correct non-zero count), and the range bug never reached EXEC-TO-PLAN review, let alone merge.',
    is_boilerplate: false
  },
  {
    achievement: 'EXEC ACTUALLY TRIED TO WIRE THE ADVISORY LAYER BEFORE DECLARING FR-6 DONE, AND THE ATTEMPT IS WHAT SURFACED THE DESIGN DEFECT.',
    detail:
      'Commit d7f6baf1c5a: rather than leaving probeAhead() unwired with passing unit tests as sufficient evidence, EXEC tried to connect it to its two real candidate callers and found it strands rows at BOTH, ' +
      'for opposite reasons (stale-session-sweep\'s worktree is routinely archived -> indeterminate -> skip; graceful-kill\'s prepark-wip commits+pushes BEFORE the reset -> count guaranteed non-zero -> skip every time). Documented in place, in the code comment, rather than shipped silently.',
    consequence:
      'FR-6 ships honestly labeled as an inert-but-tested primitive with a named reason, not as a working protection nobody re-checked. VALIDATION (row 6f405baa) later extended the same finding to a third case (working-tree dirtiness) using the documentation as its starting point.',
    is_boilerplate: false
  },
  {
    achievement: 'A DIFFERENTLY-MANDATED SUB-AGENT RE-DERIVED A FACT FROM THE CALL GRAPH INSTEAD OF INHERITING IT, AND CAUGHT A WRONG PREMISE TWO OTHER REVIEWS HAD BOTH ABSORBED.',
    detail:
      'SECURITY (row 5597bc51, SEC-2) and TESTING (row f6ec7c01, five_call_site_analysis) each independently characterized graceful-kill.mjs\'s reset call as gated/non-default-live. REGRESSION (row 53ee3edd), ' +
      'whose actual job was coverage/call-graph analysis rather than accepting a brief\'s stated premise, found lib/fleet/graceful-kill.mjs:177 carries ZERO LEO_RELEASE_WORKITEM_RESET references and is wired into production via scripts/fleet-kill.mjs and lib/fleet/console-reaper.mjs.',
    consequence:
      'The exposure that wrong premise was hiding (a claimable, re-enterable SD-scoped worktree before a kill is confirmed) was fixed same-session in commit c004456ee53, reordering RESET to run after kill+verify — not deferred to a follow-up SD.',
    is_boilerplate: false
  },
  {
    achievement: 'EXEC RESPONDED TO NON-BLOCKING FINDINGS IMMEDIATELY, SAME SESSION, RATHER THAN LOGGING THEM AS FOLLOW-UPS.',
    detail:
      'SEC-2 (reorder RESET after KILL, priority high but blocking:false), REGRESSION\'s graceful-kill live-integration coverage gap, and REGRESSION\'s SD-2/SD-5 toHaveLength(1) parity finding (priority low) were ALL addressed in the single commit c004456ee53, ' +
      'landed after REGRESSION\'s (08:29:37Z) and VALIDATION\'s (08:42:25Z) reviews, both of which evaluated the pre-fix commit d7f6baf1c5a.',
    consequence:
      'Independently re-run for this retrospective at HEAD c004456ee53: 42/42 across the two directly-modified test files, 60/60 across five structurally-close files, 219/219 across a wider ten-file adjacent sweep — all green, confirming the fix did not regress anything REGRESSION or VALIDATION had checked at the earlier commit.',
    is_boilerplate: false
  },
  {
    achievement: 'THE TEST-DOUBLE RESHAPE CONFIRMED A PLAN-PHASE PREDICTION EMPIRICALLY RATHER THAN JUST ASSERTING IT.',
    detail:
      'TESTING\'s PLAN_PRD adversarial review (row 447d173b) predicted that extending the existing read-then-write-shaped sdClient() test double, rather than reshaping it, would "silently validate a non-atomic implementation." ' +
      'Commit b505187b303 (the first EXEC attempt) reproduced exactly that: 5 SD tests failed with action:\'error\' the moment the atomic guard landed, because the unreshaped double could not express a .filter().is() chain at all. Commit c6baf7d2841 reshaped it to mirror qfClient()\'s QF-2 pattern.',
    consequence:
      'The five failing tests were the confirmation, not a regression — the commit message states this plainly ("THE 5 FAILING SD TESTS ARE NOT A REGRESSION — they are the predicted consequence, and the WAY they fail is the confirmation"), and the fix that followed pins atomicity the same way QF-2 does.',
    is_boilerplate: false
  },
  {
    achievement: 'TWO SD-MANDATED DELIVERABLES WERE REPORTED AS UNMET RATHER THAN ROUNDED UP OR SILENTLY ABSORBED.',
    detail:
      'TESTING (row f6ec7c01, still_missing) and VALIDATION (row 6f405baa, fr4_falsifiability_ruling + backfill_leg) both independently confirmed FR-4 (population re-measure) is unfalsifiable as specified and the backfill leg does not exist anywhere in the repo — ' +
      'matching the SD\'s own pre-EXEC narrative, which had already named and forbidden the naive "the criticals became claimable" framing before EXEC began.',
    consequence:
      'Neither gap is scored MET in this retrospective or in the PRD-level reviews. LEAD retains an explicit, evidenced decision to make rather than inheriting an implicit pass.',
    is_boilerplate: false
  }
];

const what_needs_improvement = [
  {
    item: 'THE RANGE BUG: \'@{u}..HEAD\' FAILED OPEN IN EXACTLY THE CASE THAT MOTIVATED THE WHOLE SD, AND FAILED CLOSED IN THE CASE THAT DID NOT NEED IT.',
    detail:
      'A pushed-but-unmerged branch reports 0 commits ahead of upstream while carrying real work — the SD\'s own justifying example is 5 commits WITH an open PR, precisely this shape. A never-pushed branch has no upstream ref at all, so \'@{u}\' fails ' +
      'to resolve and the probe goes indeterminate, which happens to be safe. The dangerous case (pushed, unmerged) failed OPEN; the harmless case (never pushed) failed CLOSED — so a casual test of "does this detect unpushed work" would pass while the load-bearing case sat behind it undetected.',
    root_cause: 'A literal reading of the requirement phrase ("unpushed work") was substituted for the actual safety question ("would work be lost"). The two readings agree in the easy case and diverge in exactly the case that matters.',
    severity: 'HIGH'
  },
  {
    item: 'FR-6\'S PREMISE IS WRONG, NOT MERELY UNWIRED — AND THE SAME WRONG QUESTION RECURS TWO ALTITUDES ABOVE THE RANGE BUG.',
    detail:
      'probeAhead asks "does the branch carry commits ahead of main" when the actual question is "would work be LOST". Those diverge exactly when a branch is pushed: pushed commits are not lost when a row becomes claimable again (that is how sd-start resume works), so a genuinely safe branch reads as "carrying work" and a genuinely unsafe one (real, never-committed WIP) reads as "nothing ahead" — under EITHER range choice, in both the pre-fix and the fixed code, because probeAhead calls only `git rev-list --count`, never `git status`. ' +
      'Wiring it at either concrete candidate strands rows: stale-session-sweep\'s worktree is routinely archived (indeterminate -> skip), and graceful-kill\'s prepark-wip step commits and pushes the WIP BEFORE the reset step runs, so the count is guaranteed non-zero there and it would skip every time.',
    root_cause: 'The range-bug fix (commit e122acc3544) corrected a PARAMETER of the same wrong question; it did not surface that the ENTIRE mechanism was built on that question. A recurring error shape is not exhausted by fixing one instance of it.',
    severity: 'HIGH'
  },
  {
    item: 'I SUPPLIED A WRONG FACT, AND IT CAME BACK WEARING THE AUTHORITY OF TWO INDEPENDENT SUB-AGENT VERDICTS.',
    detail:
      'I told TESTING and SECURITY that stale-session-sweep.cjs was the only call site that runs the reset unconditionally. TESTING\'s five_call_site_analysis (row f6ec7c01) concluded "only stale-session-sweep.cjs executes this code path live"; SECURITY\'s SEC-2 (row 5597bc51) rated its own finding MEDIUM, ' +
      'explicitly bounded by "gated behind FLEET_GRACEFUL_KILL_ENABLED (default off)". Both are wrong about the same call: lib/fleet/graceful-kill.mjs:177 carries zero LEO_RELEASE_WORKITEM_RESET references and is wired into production via scripts/fleet-kill.mjs and lib/fleet/console-reaper.mjs — just as unconditionally live as stale-session-sweep.cjs. REGRESSION (row 53ee3edd) caught it.',
    root_cause:
      'A brief\'s factual premises get absorbed into the verdict that follows from them, so a wrong premise returns dressed as an independent check — and it returned TWICE, because both sub-agents were handed the same wrong fact rather than re-deriving it. ' +
      'The countermeasure that worked was structural, not attitudinal: REGRESSION\'s actual mandate (coverage/call-graph analysis) forced it to re-derive the gating fact from source as a side effect of doing its own job, rather than trusting the brief.',
    severity: 'HIGH'
  },
  {
    item: 'A VOID MEASUREMENT: THE POPULATION I QUERIED WAS STRUCTURALLY GUARANTEED TO RETURN CLEAN, INDEPENDENT OF THE TRUE RATE.',
    detail:
      'To estimate how often a released session\'s worktree survives release (relevant to whether a worktree-based signal would ever have anything to read), I queried claude_sessions filtered on worktree_path NOT NULL. release_sd (database/migrations/20260727_release_sd_qf_reopen.sql:93) unconditionally sets worktree_path = NULL as part of releasing a session — ' +
      'confirmed directly in the migration SQL and referenced in-code at release-work-item.mjs\'s own FR-6 comment block ("release_sd NULLs worktree_path (migration 20260727, line 93)"). Every row that would ever match my filter had already had the matching column erased by the exact event whose aftermath I was trying to characterize.',
    root_cause: 'The query was never used to make a decision (caught before use), but the near-miss is real: a population filter was trusted without first checking whether the row-lifecycle event under study is also a WRITER of the column the filter depends on.',
    severity: 'MEDIUM'
  },
  {
    item: 'A SELF-CONSISTENCY TRAP IN graceful-kill.test.js: THE STEP-ORDER ASSERTION COULD ONLY EVER PROVE AGREEMENT, NEVER SAFETY.',
    detail:
      '`expect(r.steps).toEqual(KILL_STEPS)` looks like an order-safety check. KILL_STEPS is exported BY THE SAME MODULE UNDER TEST (graceful-kill.mjs:53), so when the reorder fix moved \'reset\' after \'kill\' in the implementation AND in the exported constant in the same commit, ' +
      'the assertion stayed green throughout — it had been passing under the UNSAFE pre-fix order the entire time, and it would pass under any order, as long as both sides move together. The commit\'s own in-code comment names this precisely: "a self-consistency check that passes whenever both sides move together. It caught the reorder only because I changed one side."',
    root_cause: 'An order/shape/contract assertion sourced FROM the module under test cannot fail independently of that module changing, so it cannot detect that the module changed to something UNSAFE — only that it changed.',
    severity: 'MEDIUM'
  },
  {
    item: 'REGRESSION FOUND TWO SIBLING TESTS HAD SILENTLY DROPPED AN ASSERTION THEIR NEIGHBORS KEPT, DURING A MECHANICAL TEST-DOUBLE RESHAPE.',
    detail:
      'SD-2 and SD-5 in release-work-item.test.js (from the c6baf7d2841 reshape) dropped the exact `expect(sb.updates).toHaveLength(1)` assertion that sibling tests SD-0/SD-4 kept for the analogous scenario — not exploitable today, since the source issues exactly one UPDATE on every path, ' +
      'but a silent parity gap across a set of tests meant to cover the same property. Restored in commit c004456ee53.',
    root_cause: 'A test-suite-wide mechanical edit (reshaping a shared test double) changed individual assertions inconsistently across sibling tests, with no parity check across the set before the edit was considered done.',
    severity: 'LOW'
  },
  {
    item: 'HONEST GAP: FR-4 (RE-MEASURE THE STRANDED POPULATION) IS UNFALSIFIABLE AS SPECIFIED, NOT MERELY UNIMPLEMENTED.',
    detail:
      'FR-4/AC-6/TS-5 ask for a before/after count of status=in_progress AND claiming_session_id IS NULL as proof the fix worked. adoptOrphanInProgress (scripts/worker-checkin.cjs:1228, pre-existing, untouched by this diff) continuously drains that IDENTICAL population on every fleet check-in, regardless of this SD\'s fix — ' +
      'confirmed live by both TESTING (row f6ec7c01: population dropped from the baseline 10/5 to 2/1 BEFORE this branch merged) and VALIDATION (row 6f405baa: "a post-fix drop is equally consistent with \'this SD worked\' and \'adoption self-healed it regardless\' — the two hypotheses are not separable by this measurement"). ' +
      'The SD\'s own pre-EXEC narrative (coordinator + Solomon) had already named and forbidden the naive version of this exact trap before EXEC began.',
    root_cause: 'An acceptance criterion asked the SAME measurement to serve as proof for two different, live hypotheses (this fix vs. an unrelated self-heal mechanism) that it cannot distinguish, however carefully it is executed.',
    severity: 'CRITICAL — scope gap, not a code defect'
  },
  {
    item: 'HONEST GAP: THE BACKFILL LEG DOES NOT EXIST, AND THE SD\'S OWN TEXT CALLS IT LOAD-BEARING.',
    detail:
      'The SD description states plainly: without a backfill leg, "this SD... REMEDIATES ZERO ROWS" against the originally-cited stranded population (the two chairman-owned criticals that forced this SD to exist). No backfill script exists anywhere in the repo — confirmed by independent repo-wide searches from both TESTING and VALIDATION. ' +
      'The exclusion criteria the SD spent three narrative revisions deriving (skip sd_type=orchestrator; skip rows adoptOrphanInProgress can already reach) were never formalized into an FR/AC/TS, so even a future session building the backfill is not handed the hard-won exclusions.',
    root_cause: 'A deliverable the SD\'s own creation narrative treats as essential to its stated purpose was descoped from the PRD\'s formal requirements without a corresponding formal decision to descope it.',
    severity: 'CRITICAL — scope gap, not a code defect'
  }
];

const key_learnings = [
  {
    category: 'TESTING_STRATEGY',
    learning:
      'A LITERAL READING OF A REQUIREMENT PHRASE CAN BE THE BUG. \'@{u}..HEAD\' is the literal reading of "unpushed work", and it is wrong for the actual safety question ("would work be lost"). The two readings diverge in exactly the case that matters ' +
      '(a pushed-but-unmerged branch) and agree in the case that does not (a never-pushed branch, which fails closed either way) — so a test that only checks "does this detect unpushed work" passes cleanly while the load-bearing case sits behind it, undetected. ' +
      'THE GENERALIZABLE TEST: point the check at a REAL instance of the system under test at least once before trusting a range/query/filter choice — a stub returns whatever you told it to and confirms your own mistake back to you with full green.',
    evidence: 'Commit e122acc3544 (SD-6/7/8); TESTING row f6ec7c01 range_choice_challenge; VALIDATION row 6f405baa fr6_premise_ruling (live control on this SD\'s own branch: origin/main..HEAD=4, @{u}..HEAD=0, fully pushed).'
  },
  {
    category: 'ARCHITECTURE',
    learning:
      'THE SAME WRONG QUESTION CAN BE ASKED AT TWO ALTITUDES IN ONE CHANGE, AND FIXING IT ONCE DOES NOT FIX IT AGAIN. The range bug (a parameter choice) and FR-6\'s premise (the entire mechanism\'s design) are the identical error — "does the branch carry commits" substituted for "would work be lost" — ' +
      'at two different scopes. Fixing the parameter did not surface the mechanism-level version; it took an actual wiring attempt, not a design review, to find that. Even then, a THIRD instance went unfound until an adversarial sub-agent (VALIDATION) noted the mechanism measures only commits via git rev-list, never working-tree dirtiness via git status, ' +
      'so real uncommitted WIP — the single highest-loss case — reads as "nothing to lose" under every range choice tried, in both the buggy and the fixed version. A recurring error shape is not exhausted by one fix; ask whether the SAME wrong question is being asked somewhere else in the same change before declaring the class closed.',
    evidence: 'Commit d7f6baf1c5a; release-work-item.mjs:236-253 in-code comment; lib/fleet/branch-ahead.cjs probeAhead (git rev-list only, no git status); VALIDATION row 6f405baa fr6_premise_ruling.'
  },
  {
    category: 'PROCESS_IMPROVEMENT',
    learning:
      'A SUB-AGENT\'S VERDICT IS ONLY AS INDEPENDENT AS THE FACTS IT WAS HANDED. A wrong premise I supplied (stale-session-sweep.cjs is the only unconditionally-live caller) returned in TWO differently-named sub-agent verdicts (TESTING\'s five_call_site_analysis, SECURITY\'s SEC-2 severity bound), ' +
      'each wearing the authority of a separate specialist review, because both built on the same inherited fact rather than re-deriving it from source. REGRESSION caught it not because its reasoning was sharper, but because its MANDATE (coverage analysis via the call graph and test-file cross-reference) forced an independent re-derivation of exactly that fact as a side effect of doing its actual job. ' +
      'THE GENERALIZABLE COUNTERMEASURE IS STRUCTURAL, NOT ATTITUDINAL: route a load-bearing factual claim through at least one check whose primary mandate requires re-deriving it from source — two differently-named sub-agents fed the same premise agree with each other, not with reality.',
    evidence: 'SECURITY row 5597bc51 (SEC-2: "gated behind FLEET_GRACEFUL_KILL_ENABLED (default off)"); TESTING row f6ec7c01 (five_call_site_analysis: "only stale-session-sweep.cjs executes this code path live"); REGRESSION row 53ee3edd (graceful-kill.mjs:177 "completely UNGATED... wired into production via scripts/fleet-kill.mjs and lib/fleet/console-reaper.mjs"); fix in commit c004456ee53.'
  },
  {
    category: 'DATABASE_SCHEMA',
    learning:
      'A POPULATION QUERY CAN BE STRUCTURALLY GUARANTEED TO RETURN A CLEAN RESULT, INDEPENDENT OF THE TRUE RATE. Filtering claude_sessions on worktree_path NOT NULL to estimate how often a released session\'s worktree survives release looks like a direct measurement of exactly that question. It cannot be one, ' +
      'because release_sd — the function that PERFORMS a release — unconditionally NULLs worktree_path as part of releasing. Every row that would ever match the filter has already had the matching column erased by the event whose aftermath the query claims to characterize. ' +
      'THE GENERALIZABLE CHECK: before trusting a population count, ask whether the row-lifecycle event you are studying is also a WRITER of the column your filter depends on — if it is, the filter cannot see the population, and a clean/empty result is evidence of nothing, not evidence of a low rate.',
    evidence: 'database/migrations/20260727_release_sd_qf_reopen.sql:85-95 (release_sd sets worktree_path = NULL unconditionally); release-work-item.mjs in-code comment citing the same migration and line.'
  },
  {
    category: 'TESTING_STRATEGY',
    learning:
      'A TEST THAT COMPARES THE SYSTEM UNDER TEST AGAINST A CONSTANT THE SAME SYSTEM EXPORTS CAN ONLY PROVE AGREEMENT, NEVER CORRECTNESS. `expect(r.steps).toEqual(KILL_STEPS)` looks like an order-safety assertion; KILL_STEPS is exported by graceful-kill.mjs itself, so reordering the implementation AND the constant in the same commit ' +
      '(exactly what the RESET-after-KILL safety fix required) leaves the assertion passing throughout — including through the entire pre-fix window when the order was genuinely unsafe. It is a self-consistency check, not a correctness check, and it only ever caught THIS particular reorder because one side was edited before the other. ' +
      'THE GENERALIZABLE PATTERN: an order/shape/contract assertion sourced FROM the module under test cannot fail independently of that module changing — pin the safety PROPERTY against externally observed behavior (here: hand-back withheld until verifyGone confirms death) in addition to, never instead of, the sequence constant.',
    evidence: 'lib/fleet/graceful-kill.test.js:78-82 in-code comment; commit c004456ee53 (adds GK-RESET-AFTER-KILL tests pinning the behavioral property directly).'
  },
  {
    category: 'PROCESS_IMPROVEMENT',
    learning:
      'AN ACCEPTANCE CRITERION CAN BE UNFALSIFIABLE BY CONSTRUCTION, AND THAT IS A DIFFERENT PROBLEM FROM "NOT YET MEASURED". FR-4 asks for a before/after count of the same population that a pre-existing, unrelated mechanism (adoptOrphanInProgress) continuously drains regardless of this SD\'s fix. A post-fix drop is consistent with both ' +
      '"the fix worked" and "self-heal did it anyway" — no re-run of the SAME measurement can separate the two hypotheses, however carefully it is executed. The SD\'s own narrative had already named and forbidden the naive version of this trap before EXEC began, and the PRD\'s worded AC still let the confound back in through a side door. ' +
      'THE GENERALIZABLE CHECK: before accepting a re-measurement as proof, name the OTHER mechanism that could produce the same after-state, and ask whether your measurement can tell the two apart — if it cannot, no amount of careful execution fixes the design of the test.',
    evidence: 'PRD.metadata.testing_corrections; TESTING row f6ec7c01 (still_missing.fr4_repopulation_remeasure); VALIDATION row 6f405baa (fr4_falsifiability_ruling).'
  }
];

const action_items = [
  {
    text: 'Formally resolve FR-4/AC-6 in the PRD before LEAD-FINAL-APPROVAL: either reword as an operational-health observation (not a pass/fail gate) or explicitly mark unfalsifiable-as-specified and accept without it. Do not leave it open as a checkable AC nobody can close.',
    owner: 'PLAN',
    action: 'Reword or explicitly waive FR-4/AC-6 in the PRD.',
    category: 'PROCESS_IMPROVEMENT',
    priority: 'HIGH',
    verification: 'PRD FR-4/AC-6 text no longer reads as a checkable pass/fail item without a named resolution.'
  },
  {
    text: 'File a follow-on SD/QF for the backfill leg, carrying the exact exclusion criteria the SD\'s own narrative derived across three revisions (skip sd_type=orchestrator; skip rows adoptOrphanInProgress can already reach; log every skipped row by key and reason, never silently) — or explicitly decide not to pursue it and record why, given the two originating criticals already self-heal.',
    owner: 'LEAD',
    action: 'File or explicitly decline a follow-on backfill SD.',
    category: 'PROCESS_IMPROVEMENT',
    priority: 'HIGH',
    verification: 'Either a follow-on SD exists carrying the named exclusions, or the PRD/SD records an explicit decision not to backfill with its rationale.'
  },
  {
    text: 'Do not wire probeAhead\'s worktreePath into any real caller as currently specified — wiring it today reproduces the exact stranding bug this SD fixes, at either concrete candidate. Re-specify the mechanism first: it must answer "would work be lost" (uncommitted OR unpushed), not "is the branch ahead of main".',
    owner: 'PLAN',
    action: 'Re-specify FR-6 before any future wiring attempt; block wiring on the re-spec.',
    category: 'ARCHITECTURE',
    priority: 'MEDIUM',
    verification: 'A follow-on SD/PRD states the re-specified signal explicitly before any release-work-item.mjs call site gains a worktreePath argument.'
  },
  {
    text: 'Add a working-tree-dirtiness signal (e.g. git status --porcelain) alongside probeAhead\'s commit-count check — uncommitted WIP is the highest-loss case and currently reads as 0 under every range choice, in both the buggy and fixed code.',
    owner: 'EXEC',
    action: 'Add a dirtiness check to the branch-ahead pre-flight primitive.',
    category: 'TESTING_STRATEGY',
    priority: 'MEDIUM',
    verification: 'A test proves an uncommitted-but-unstaged change in the probed worktree is detected as loss risk, not read as 0.'
  },
  {
    text: 'Add SD-side matched:false / live-claimant test coverage (parity with the QF branch\'s QF-3/QF-4) — flagged by VALIDATION as untested at the mock level despite being RISK-1\'s stated mitigation ("the obvious fix is strictly worse than the bug").',
    owner: 'EXEC',
    action: 'Add a release-work-item.test.js case exercising sdClient({matched:false}).',
    category: 'TESTING_STRATEGY',
    priority: 'LOW',
    verification: 'A new SD-branch test asserts a live-claimant row is left untouched, mirroring QF-3/QF-4.'
  },
  {
    text: 'Promote "re-derive a sub-agent brief\'s load-bearing factual premises from source rather than inheriting them" as explicit guidance for sub-agent prompts generally. TESTING and SECURITY both independently absorbed the same EXEC-supplied premise about caller gating; only REGRESSION (a differently-mandated check) re-derived it and caught the error.',
    owner: 'PLAN',
    action: 'Add premise-re-derivation guidance to the sub-agent prompt template.',
    category: 'PROCESS_IMPROVEMENT',
    priority: 'HIGH',
    verification: 'The sub-agent prompt template instructs re-deriving any load-bearing factual claim in a brief from source before it feeds a verdict; a future SD shows this happening for at least one claim.'
  },
  {
    text: 'Before trusting a live-population DB query as evidence, check whether the row-lifecycle event under study is also a WRITER of the column the query filters on (per the claude_sessions.worktree_path / release_sd example). Add this to the DB-measurement checklist.',
    owner: 'PLAN',
    action: 'Add the writer-vs-filter-column check to the DB-measurement discipline checklist.',
    category: 'DATABASE_SCHEMA',
    priority: 'MEDIUM',
    verification: 'A documented checklist item exists; a future population-count claim references having checked it.'
  },
  {
    text: 'Execute the worker-checkin.cjs and claim-validity-gate.js dedicated test suites (reviewed by source-read only by both TESTING and REGRESSION) before enabling LEO_RELEASE_WORKITEM_RESET=on fleet-wide.',
    owner: 'EXEC',
    action: 'Run the worker-checkin.cjs and claim-validity-gate.js dedicated suites and record the result.',
    category: 'TESTING_STRATEGY',
    priority: 'MEDIUM',
    verification: 'A sub-agent or session evidence row shows these two suites executed (not source-read) against HEAD.'
  }
];

const success_patterns = [
  'TESTED AGAINST A REAL WORKTREE, NOT A STUB, AT LEAST ONCE: SD-6 pointed the range-bug pre-flight test at this SD\'s own branch and caught a defect a stub would have confirmed back as correct.',
  'EXEC ACTUALLY TRIED TO WIRE THE ADVISORY LAYER BEFORE DECLARING IT DONE: a real integration attempt (not just passing unit tests) surfaced that FR-6\'s premise was wrong at both real candidate call sites, for opposite reasons, and documented it in place.',
  'A DIFFERENTLY-MANDATED SUB-AGENT RE-DERIVED A FACT INSTEAD OF INHERITING IT: REGRESSION\'s call-graph-and-test-coverage mandate forced it to re-check which caller sites are actually gated, catching a wrong premise two other sub-agents had both absorbed from the same brief.',
  'NON-BLOCKING FINDINGS WERE ADDRESSED SAME SESSION, NOT DEFERRED: SEC-2 (reorder RESET after KILL) and REGRESSION\'s coverage/parity gaps (SD-2/SD-5 toHaveLength, graceful-kill live-path test coverage) were all fixed in one commit before the next handoff.',
  'A PLAN-PHASE PREDICTION ABOUT A TEST DOUBLE WAS EMPIRICALLY CONFIRMED, NOT JUST ASSERTED: extending the unreshaped sdClient() double failed exactly as TESTING predicted, and the reshape that followed mirrors the QF branch\'s own proven pattern.',
  'UNMET ACCEPTANCE CRITERIA WERE REPORTED AS UNMET, NOT ROUNDED UP: FR-4 and the backfill leg are both explicitly scored NOT MET, matching two independent sub-agent conclusions, rather than absorbed into a passing summary.'
];

const failure_patterns = [
  'THE SAME WRONG QUESTION ("does the branch carry commits" instead of "would work be lost") WAS ASKED TWICE AT TWO ALTITUDES: once as a range-parameter bug (@{u}..HEAD), once as the entire FR-6 mechanism\'s design premise — fixing the first did not surface the second.',
  'A THIRD INSTANCE OF THE SAME QUESTION WENT UNFOUND UNTIL AN ADVERSARIAL REVIEW NAMED IT: probeAhead measures commits only via git rev-list, never working-tree dirtiness via git status, so real uncommitted WIP — the highest-loss case — reads as "nothing to lose" under every range choice tried, in both the buggy and the fixed version.',
  'A WRONG FACTUAL PREMISE, SUPPLIED IN A SUB-AGENT BRIEF, RETURNED AS TWO INDEPENDENT-LOOKING VERDICTS: SECURITY and TESTING both characterized graceful-kill.mjs\'s reset call as gated/non-default-live; it is unconditionally live via two production entry points, caught only by REGRESSION re-deriving the call graph.',
  'A POPULATION QUERY WAS STRUCTURALLY GUARANTEED TO RETURN A CLEAN RESULT: querying claude_sessions on worktree_path NOT NULL to gauge post-release worktree survival, when release_sd unconditionally nulls that exact column as part of releasing.',
  'A STEP-ORDER TEST COMPARED THE SYSTEM UNDER TEST AGAINST A CONSTANT THE SAME SYSTEM EXPORTS: it could only ever detect that the two sides disagree, never that the agreed order was safe, and it passed throughout the entire pre-fix, unsafe ordering.',
  'TWO SIBLING TESTS SILENTLY DROPPED AN ASSERTION THEIR NEIGHBORS KEPT DURING A MECHANICAL TEST-DOUBLE RESHAPE, CAUGHT ONLY BY REGRESSION\'S EXPLICIT TEST-BY-TEST DIFF.',
  'TWO PRD-LEVEL DELIVERABLES THE SD\'S OWN TEXT CALLS MANDATORY REMAIN UNBUILT AT THIS HANDOFF: the population re-measure (FR-4, unfalsifiable as worded) and the backfill leg, without which the SD\'s own words say it "remediates ZERO ROWS" against the originally-cited stranded population.'
];

const improvement_areas = [
  'FR-4 (population re-measure) is unfalsifiable as specified due to an unrelated self-heal confound (adoptOrphanInProgress) and remains open in the PRD as a checkable AC.',
  'The backfill leg is entirely unbuilt; its exclusion criteria (skip orchestrators, skip self-heal-reachable rows) were derived across three SD narrative revisions but never formalized into an FR/AC/TS.',
  'FR-6\'s advisory pre-flight is a tested, correct primitive wired to zero of six real call sites, and cannot be wired at either of the two concrete candidates without re-specifying what "loss risk" means (uncommitted-or-unpushed, not ahead-of-main) and adding a working-tree-dirtiness signal it currently lacks.',
  'SD-side matched:false / live-claimant test coverage (parity with the QF branch\'s QF-3/QF-4) remains absent at the mock level, per VALIDATION.',
  'scripts/worker-checkin.cjs and lib/claim-validity-gate.js call sites have been reviewed by source-read only; their dedicated test suites were not executed by either TESTING or REGRESSION.'
];

const retro = {
  title:
    'SD-LEO-INFRA-RELEASE-WORK-ITEM-001 — released SDs become claimable again, atomically and mutation-tested; the safety net meant to protect them asked "does the branch carry commits" when the question was "would work be lost," at two altitudes, and a wrong premise I supplied came back as two sub-agent verdicts',
  retro_type: 'SD_COMPLETION',
  retrospective_type: 'SD_COMPLETION',
  conducted_date: new Date().toISOString(),
  period_start: '2026-08-01T07:29:18.000Z',
  period_end: '2026-08-01T08:54:09.000Z',
  project_name: 'EHG_Engineer',
  target_application: 'EHG_Engineer',
  learning_category: 'TESTING_STRATEGY',
  applies_to_all_apps: true,
  generated_by: 'SUB_AGENT',
  status: 'PUBLISHED',
  trigger_event: 'PLAN-TO-LEAD handoff (RETRO Continuous Improvement Coach, PLAN_VERIFICATION phase, post REGRESSION CONDITIONAL_PASS 75 + VALIDATION CONDITIONAL_PASS 80)',
  auto_generated: false,
  description:
    'WHAT SHIPPED: lib/fleet/release-work-item.mjs\'s SD branch used to write ONLY current_phase on release, never status, so a released SD kept status=\'in_progress\' forever — permanently invisible to the claim path\'s positive allowlist ' +
    '.in(\'status\',[\'draft\',\'active\']) at four sites in scripts/worker-checkin.cjs. A second, independent defect left that same phase write completely unguarded (.eq(\'sd_key\') alone), able to rewind current_phase on a row with a live claimant or real work. ' +
    'FR-1/FR-2/FR-3 fix both in one guarded UPDATE: status now reverts unconditionally to \'active\' (a live, already-admitted value, not gated on rewindPhase), atomic in the WHERE clause on the only two columns that exist for this purpose ' +
    '(status=in_progress AND claiming_session_id IS NULL — the QF branch\'s four-column guard does not port, because pr_url/commit_sha/branch_name are all absent from strategic_directives_v2). FR-6 adds probeAhead() in lib/fleet/branch-ahead.cjs, a non-atomic pre-flight using git rev-list ' +
    'to see work an atomic column-guard cannot. graceful-kill.mjs\'s RESET step was reordered to run after kill+verify rather than before (commit c004456ee53), because this SD\'s status write made the pre-fix ordering hand a claimable, re-enterable SD-scoped worktree to a second session before the ' +
    'first process was confirmed dead. 5 commits, 5 files (release-work-item.mjs, branch-ahead.cjs, release-work-item.test.js, graceful-kill.mjs, graceful-kill.test.js), 356 insertions / 49 deletions. 42/42 target-suite tests, 60/60 across the five structurally-closest files, 219/219 across a ten-file ' +
    'adjacent sweep — all re-run live at HEAD c004456ee53 for this retrospective, not carried forward from an earlier commit. No PR opened yet; SD is at PLAN_VERIFICATION, pre PLAN-TO-LEAD.\n\n' +
    'BUT THE RETROSPECTIVE VALUE IS THE PROCESS FAILURES, NOT THE FEATURE SUMMARY. Four are documented in the commits and the sub-agent evidence; two more sit beside them. ' +
    '(1) THE RANGE BUG: the pre-flight first used \'@{u}..HEAD\', the literal reading of "unpushed work". A pushed-but-unmerged branch reports 0 while carrying the SD\'s own justifying case (5 commits, an open PR); a never-pushed branch fails to resolve and goes indeterminate. ' +
    'The dangerous case failed OPEN, the harmless one failed CLOSED, so a casual test of "unpushed work" would have passed over the gap — caught only because SD-6 pointed at this SD\'s own real worktree rather than a stub (commit e122acc3544). ' +
    '(2) FR-6\'S PREMISE IS WRONG, not merely unwired: TESTING and SECURITY both independently found probeAhead wired to zero of six callers; trying to wire it (commit d7f6baf1c5a) showed it strands rows at BOTH concrete candidates for opposite reasons — stale-session-sweep\'s worktree is routinely ' +
    'archived (indeterminate, skip) and graceful-kill\'s prepark-wip commits-and-pushes before the reset (count guaranteed non-zero, skip every time). VALIDATION then found a third instance nobody had named: probeAhead measures only commits via git rev-list, never working-tree dirtiness via git status, ' +
    'so real uncommitted WIP — the highest-loss case — reads 0 under every range choice tried, in both the buggy and the fixed version. (3) A WRONG FACT I SUPPLIED CAME BACK AS TWO SUB-AGENT VERDICTS: I told TESTING and SECURITY that stale-session-sweep.cjs was the only unconditionally-live caller. ' +
    'TESTING\'s five_call_site_analysis concluded "only stale-session-sweep.cjs executes this code path live"; SECURITY\'s SEC-2 rated its own finding MEDIUM, bounded by "gated behind FLEET_GRACEFUL_KILL_ENABLED (default off)". Both are wrong about the same call: REGRESSION, whose mandate forced it to ' +
    're-derive the call graph rather than accept the premise, found lib/fleet/graceful-kill.mjs:177 carries zero LEO_RELEASE_WORKITEM_RESET references and is wired into production via scripts/fleet-kill.mjs and lib/fleet/console-reaper.mjs — just as unconditionally live as stale-session-sweep.cjs. ' +
    'The exposure that premise was hiding (a claimable, re-enterable worktree before a kill is confirmed) is what commit c004456ee53 closed. (4) A VOID MEASUREMENT I DID NOT COUNT: to estimate how often a released session\'s worktree survives, I queried claude_sessions filtered on worktree_path NOT NULL — ' +
    'but release_sd (database/migrations/20260727_release_sd_qf_reopen.sql:93) unconditionally NULLs worktree_path as part of releasing, so the population I meant to characterize is erased by the very event I was studying; a clean result was structurally guaranteed regardless of the true rate. ' +
    '(5) A SELF-CONSISTENCY TRAP in graceful-kill.test.js: the pre-existing step-order assertion compares r.steps to KILL_STEPS, a constant the SAME module exports — reordering the implementation and the constant together (exactly what the RESET-after-KILL fix required) left the assertion green throughout, ' +
    'regardless of whether the new order was safe; two new tests (GK-RESET-AFTER-KILL) now pin the actual property against observed behavior instead. (6) REGRESSION found SD-2 and SD-5 in release-work-item.test.js had silently dropped the exact toHaveLength(1) assertion their siblings SD-0/SD-4 kept for the ' +
    'analogous scenario, during the test-double reshape — not exploitable today, but a silent parity gap; restored in c004456ee53.\n\n' +
    'WHAT IS HONESTLY UNMET: FR-4 (re-measure the stranded population) is unimplemented and unfalsifiable as specified — adoptOrphanInProgress (scripts/worker-checkin.cjs:1228, pre-existing, untouched by this diff) continuously drains the identical population this SD\'s fix affects, so no post-fix count ' +
    'can be attributed to this SD specifically, a confound both TESTING and VALIDATION independently confirmed live and the SD\'s own pre-EXEC narrative (coordinator + Solomon) had already named and forbidden. The backfill leg does not exist anywhere in the repo, though the SD\'s own description states ' +
    'plainly that without it "this SD... remediates ZERO ROWS" against the originally-cited stranded population (the two chairman-owned criticals that forced this SD to exist) — only future releases benefit from the merged code. Neither is scored as met here.',
  what_went_well,
  what_needs_improvement,
  key_learnings,
  action_items,
  success_patterns,
  failure_patterns,
  improvement_areas,
  quality_score: QUALITY_SCORE,
  team_satisfaction: 8,
  objectives_met: false,
  on_schedule: true,
  within_scope: true,
  business_value_delivered:
    'Released SDs (and QFs, unchanged) become reachable again through the normal claim path — the class that stranded a chairman-owned security item for hours, twice, is fixed for the two production call sites that matter most today: stale-session-sweep.cjs (always live, now strictly safer than before this SD, ' +
    'since the pre-fix phase write there had NO guard at all) and graceful-kill.mjs (always live via fleet-kill/console-reaper, now correctly sequenced so a kill is confirmed before the row is handed back). The fix is atomic (mutation-verified: removing the claiming_session_id guard line fails 2/22 tests), and a guarded ' +
    'no-op is correctly distinguished from an error in the return value. Three of five remaining call sites stay inert behind LEO_RELEASE_WORKITEM_RESET (default off) until a separate decision enables them.',
  customer_impact:
    'None directly user-visible. Operationally: the two chairman-owned critical SDs that originally forced this class to be reported are NOT retroactively fixed by this merge — they either already self-healed via adoptOrphanInProgress or remain stranded pending the (currently unbuilt) backfill leg. ' +
    'Only SDs released AFTER this code merges benefit from the fix.',
  technical_debt_addressed: true,
  technical_debt_created: true,
  bugs_found: 8,
  bugs_resolved: 5,
  tests_added: 5,
  performance_impact: 'Negligible. The guarded UPDATE gains two additional WHERE predicates over the pre-fix unguarded write. probeAhead is an inert, unwired primitive today — not on any hot path — but its documented cost if ever wired is a synchronous execSync git subprocess with up to a 15s timeout per call.',
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['Explore', 'VALIDATION', 'DESIGN', 'DATABASE', 'SECURITY', 'RISK', 'STORIES', 'TESTING', 'REGRESSION'],
  human_participants: ['Rick Felix (Chairman)'],
  related_prs: [],
  related_commits: [
    'b505187b303 wip: status revert + two-layer guard — 5 SD tests fail BECAUSE the test double is the shape TESTING warned about',
    'c6baf7d2841 test: reshape the SD double and correct 5 tests that ENCODED the defect',
    'e122acc3544 fix: pre-flight tests, and a range bug they caught immediately',
    'd7f6baf1c5a docs: FR-6\'s advisory is inert AND its premise is wrong',
    'c004456ee53 fix: reset must follow the kill, not precede it'
  ],
  related_files: [
    'lib/fleet/release-work-item.mjs',
    'lib/fleet/branch-ahead.cjs',
    'lib/fleet/release-work-item.test.js',
    'lib/fleet/graceful-kill.mjs',
    'lib/fleet/graceful-kill.test.js'
  ],
  affected_components: [
    'release-work-item claim-reachability guard (SD branch)',
    'branch-ahead.cjs pre-flight primitive (countAhead / probeAhead)',
    'graceful-kill.mjs step ordering (RESET vs KILL)',
    'worker-checkin.cjs claim-path allowlist (consumer, unchanged)'
  ],
  tags: [
    'proxy-for-the-risk-not-the-risk-itself',
    'range-bug',
    'commits-ahead-vs-loss-risk',
    'working-tree-dirtiness-blind-spot',
    'wrong-premise-inherited-by-sub-agents',
    'independent-re-derivation-vs-inheritance',
    'void-measurement-population-erased-by-studied-event',
    'self-consistency-test-trap',
    'exported-constant-compared-against-itself',
    'sibling-test-assertion-parity-gap',
    'unfalsifiable-acceptance-criterion',
    'self-heal-confound',
    'backfill-leg-descoped-without-decision',
    'atomic-guard-mutation-verified',
    'claim-reachability'
  ],
  unnecessary_work_identified: [
    'Two EXEC attempts on the SD-side guard chain: b505187b303 shipped a status-revert-plus-guard against the ORIGINAL, read-then-write-shaped sdClient() test double (5 tests failed by design, per TESTING\'s own PLAN_PRD prediction); c6baf7d2841 then reshaped the double. ' +
      'Neither attempt was wasted — the first was the falsification the second one\'s design rests on — but a test double reshaped up front (informed directly by TESTING\'s row 447d173b, already on file before EXEC began) would have avoided the intermediate red state.'
  ],
  protocol_improvements: [
    'Sub-agent briefs that state a factual premise about caller gating, liveness, or reachability should be flagged for independent re-derivation by at least one reviewing sub-agent whose primary mandate requires reading the call graph directly (as REGRESSION\'s coverage mandate did here), rather than accepted at face value by every reviewer.',
    'A DB-measurement checklist item: before trusting a population count derived from a column filter, confirm the row-lifecycle event under study does not also WRITE (especially NULL) that same column — the claude_sessions.worktree_path / release_sd case is a concrete, reusable example.',
    'A test-authoring note for order/sequence assertions: an assertion comparing observed behavior to a constant exported by the SAME module under test should be paired with (never substituted by) an assertion of the actual safety property against externally observed behavior.'
  ],
  future_enhancements: [
    'Re-specify FR-6\'s advisory pre-flight to answer "would work be lost" (uncommitted OR unpushed) rather than "is the branch ahead of main", and add a working-tree-dirtiness check (git status) before any real call site is wired to it.',
    'Formalize and ship the backfill leg with its derived exclusion criteria (skip sd_type=orchestrator; skip rows adoptOrphanInProgress can already reach; log every skip by key and reason).',
    'Add SD-side matched:false / live-claimant test coverage for parity with the QF branch\'s QF-3/QF-4.',
    'Execute (not just source-read) the worker-checkin.cjs and claim-validity-gate.js dedicated test suites before LEO_RELEASE_WORKITEM_RESET is ever flipped on fleet-wide.'
  ],
  metadata: {
    sd_key: SD_KEY,
    prd_id: 'PRD-SD-LEO-INFRA-RELEASE-WORK-ITEM-001',
    branch: 'feat/SD-LEO-INFRA-RELEASE-WORK-ITEM-001',
    head_commit: HEAD,
    phase_at_generation: PHASE,
    pattern_named: PATTERN,
    pattern_test: PATTERN_TEST,
    pr: null,
    merge_state: 'not on origin/main; no PR open (gh pr list --head feat/SD-LEO-INFRA-RELEASE-WORK-ITEM-001 --state all returned empty)',
    quality_score_reasoning:
      'Scored 78, materially below a fully-merged, single-open-gap precedent (90) for three reasons that are all real and none of which is a code-correctness defect in the shipped mechanism itself: ' +
      '(1) TWO SD-mandated deliverables (FR-4 re-measure, the backfill leg) are entirely unbuilt at this handoff, and the SD\'s own words treat the backfill as load-bearing ("remediates ZERO ROWS" without it) against the exact rows that forced the SD to exist; ' +
      '(2) the wrong-premise-to-verdict failure (point 3) is a genuine, repeatable process risk surfaced WITHIN this SD\'s own review, not a one-off; ' +
      '(3) the SD has not been merged, has no PR, and has not been re-reviewed by TESTING/SECURITY/REGRESSION against the final commit (c004456ee53) — this retrospective is the first independent check of the final state, via a live test re-run (42/60/219 green). ' +
      'Scored above the 70 minimum by a wide margin because the core mechanism is correct and mutation-verified, six distinct process defects were root-caused with mechanism-level explanations rather than surface fixes, four of the six were fixed same-session, and the two unmet deliverables are honestly reported rather than absorbed.',
    own_verification: {
      method: 'Independently re-ran the target and structurally-adjacent test suites against HEAD c004456ee53 (npx vitest run), which postdates both REGRESSION (08:29:37Z) and VALIDATION (08:42:25Z), each of which evaluated the prior commit d7f6baf1c5a.',
      result: '42/42 across release-work-item.test.js + graceful-kill.test.js; 60/60 adding spawn-control-stop-workitem.test.js + claim-command-workitem-handback.test.js + stale-session-sweep-workitem-handback.test.js; 219/219 across a ten-file wider adjacent sweep (claim-guard, worker-checkin, claim-validity-gate*, worker-checkin-*, stale-session-sweep-*). Zero failures.',
      scope_caveat: 'Did not reproduce TESTING\'s full 41-file / 489-test EXEC-phase sweep exactly (glob patterns differ); did not independently re-run the worker-checkin.cjs or claim-validity-gate.js dedicated suites, matching the same gap REGRESSION and TESTING both flagged as source-read-only.'
    },
    round_verdicts: [
      'Explore 2026-07-31T22:32:46Z PASS 92 (LEAD) — row 8d131278, confirmed leg1/leg2 and the 4-site positive allowlist',
      'VALIDATION 2026-07-31T22:32:47Z PASS 90 (LEAD) — row 1c17d117',
      'DESIGN 2026-08-01T01:06:45Z CONDITIONAL_PASS 60 (PLAN_PRD) — row 44da3527, infrastructure SD, non-UI skip',
      'DATABASE 2026-08-01T01:06:49Z PASS 100 (PLAN_PRD) — row a35a50e0',
      'SECURITY 2026-08-01T01:06:54Z PASS 100 (PLAN_PRD, prospective pre-EXEC) — row 7e05d3f3',
      'RISK 2026-08-01T01:06:58Z PASS 85 (PLAN_PRD) — row 7c953b26',
      'STORIES 2026-08-01T01:07:10Z PASS 95 (orchestrated) — row 671fc3fb',
      'TESTING 2026-08-01T07:18:18Z CONDITIONAL_PASS 70 (PLAN_PRD, PLAN-TO-EXEC adversarial review) — row 447d173b, predicted the read-then-write test-double trap',
      'SECURITY 2026-08-01T08:16:08Z CONDITIONAL_PASS 80 (EXEC, EXEC-TO-PLAN) — row 5597bc51, SEC-1 (probeAhead unwired) + SEC-2 (graceful-kill ordering, later fixed)',
      'TESTING 2026-08-01T08:16:26Z CONDITIONAL_PASS 78 (EXEC, EXEC-TO-PLAN, mutation testing) — row f6ec7c01, 5/5 mutations killed as predicted',
      'REGRESSION 2026-08-01T08:29:37Z CONDITIONAL_PASS 75 (PLAN_VERIFICATION) — row 53ee3edd, caught graceful-kill ungated-and-untested + SD-2/SD-5 assertion gap',
      'VALIDATION 2026-08-01T08:42:25Z CONDITIONAL_PASS 80 (PLAN_VERIFICATION) — row 6f405baa, fr4_falsifiability_ruling + fr6_premise_ruling'
    ],
    handoff_history: 'REGRESSION and VALIDATION both reviewed as of commit d7f6baf1c5a. Commit c004456ee53 (RESET-after-KILL reorder, SD-2/SD-5 parity restore, GK-RESET-AFTER-KILL tests) landed AFTER both reviews, addressing their non-blocking findings same-session; neither has re-reviewed the final commit. This retrospective is the first check against HEAD.',
    fr_disposition: {
      'FR-1/FR-2/FR-3': 'MET — atomic guard, active status, unconditional status write independent of rewindPhase; mutation-verified.',
      'FR-4': 'NOT MET — unfalsifiable as specified (adoptOrphanInProgress self-heal confound).',
      'FR-5': 'MET — no dispatch_rank written; verified via toEqual exact-match assertions and grep.',
      'FR-6': 'PARTIAL — primitive built and mutation-tested, but its premise (commits-ahead as a loss-risk proxy) is documented-wrong, unwired at 0/6 call sites, and blind to working-tree dirtiness.',
      backfill_leg: 'NOT MET — does not exist; SD text calls it load-bearing.'
    },
    baseline_population: '10 in_progress / 5 unclaimed (50%) / 2 critical, measured 2026-07-29T16:59Z by the coordinator.',
    live_population_at_review: '2 in_progress / 1 unclaimed, measured live pre-merge by VALIDATION 2026-08-01T08:42Z — NOT attributable to this SD\'s unmerged fix; included only to demonstrate the FR-4 confound.'
  }
};

async function main() {
  const supabase = await getSupabaseClient();

  // ---- 0. Resolve sd_id via sd_key (per task instruction: an id= lookup on a
  //         sd_key-formatted string silently returns null) --------------------
  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, current_phase')
    .eq('sd_key', SD_KEY)
    .single();

  if (sdErr || !sdRow) {
    console.error('SD LOOKUP FAILED:', sdErr?.message || 'no row');
    process.exit(1);
  }

  const SD_ID = sdRow.id;
  console.log('SD RESOLVED:', SD_KEY, '->', SD_ID, '| current_phase:', sdRow.current_phase);

  // ---- 1. Persist the retrospective -------------------------------------
  const payload = { ...retro, sd_id: SD_ID };

  const { data: retroRow, error: retroErr } = await supabase
    .from('retrospectives')
    .insert(payload)
    .select('id, title, quality_score, status, retro_type')
    .single();

  if (retroErr) {
    console.error('RETROSPECTIVE INSERT FAILED:', retroErr.message, retroErr.details || '');
    process.exit(1);
  }

  console.log('\nRETROSPECTIVE WRITTEN:');
  console.log('  id:', retroRow.id);
  console.log('  quality_score:', retroRow.quality_score, '| status:', retroRow.status, '| retro_type:', retroRow.retro_type);

  // ---- 2. Persist the sub-agent evidence row ----------------------------
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    warnings: [
      {
        issue: 'FR-4 and the backfill leg remain unmet at this handoff; the SD\'s own text treats the backfill as load-bearing against the originally-cited stranded population.',
        severity: 'HIGH',
        recommendation: 'LEAD to explicitly rule on FR-4/AC-6 and the backfill leg disposition before LEAD-FINAL-APPROVAL, per VALIDATION row 6f405baa\'s own condition.'
      },
      {
        issue: 'Commit c004456ee53 (the RESET-after-KILL reorder) landed after both REGRESSION and VALIDATION reviewed the SD; neither has re-reviewed the final commit.',
        severity: 'MEDIUM',
        recommendation: 'Independently re-ran the test suite at HEAD for this retrospective (42/60/219 green); a full sub-agent re-review against c004456ee53 is still recommended before merge.'
      }
    ],
    recommendations: [
      'Proceed with PLAN-TO-LEAD. Retrospective PUBLISHED at quality_score ' + QUALITY_SCORE + ' (target >= 70).',
      'LEAD must explicitly rule on FR-4/AC-6 (unfalsifiable as worded) and the backfill leg (SD text: "remediates ZERO ROWS" without it) — do not let either close silently.',
      'Do not wire probeAhead\'s worktreePath into any real caller as currently specified; it strands rows at both concrete candidates. Re-specify the loss-risk question first.',
      'File the follow-on for a working-tree-dirtiness check (git status) alongside probeAhead\'s commit-count check — the highest-loss case currently reads as 0 under every range choice.'
    ],
    summary:
      'RETRO CONDITIONAL_PASS for ' + SD_KEY + ' (' + PHASE + '). Retrospective ' + retroRow.id + ' PUBLISHED, retro_type=SD_COMPLETION, quality_score=' + QUALITY_SCORE + '. ' +
      'THE TRANSFERABLE FINDING IS A DEFECT CLASS: "' + PATTERN + '". Six instances on this one SD: a git range (@{u}..HEAD) that failed open in exactly the case that mattered and closed in the case that did not (caught by a real-worktree test, not a stub); ' +
      'the entire FR-6 advisory mechanism asking "commits ahead" instead of "would work be lost", one altitude above the range bug and unfixed by fixing the range bug; a third instance (working-tree dirtiness never checked) found only by an adversarial review; ' +
      'a wrong caller-gating premise I supplied that TESTING and SECURITY both independently absorbed into their verdicts, caught only by REGRESSION re-deriving the call graph from its own coverage mandate; a population query (claude_sessions.worktree_path NOT NULL) structurally guaranteed clean because ' +
      'release_sd nulls that exact column on release; and a step-order test that compared the module under test to a constant the SAME module exports, so it could only prove the two sides moved together, never that the order was safe. ' +
      'The core mechanism itself is correct and mutation-verified: the atomic guard (status=in_progress AND claiming_session_id IS NULL) is genuinely in the WHERE clause (removing the predicate fails 2/22 tests), 5/5 EXEC-phase mutations killed exactly as predicted, and re-run live at HEAD c004456ee53 for this retrospective: 42/42, 60/60, and 219/219 across increasingly wide test sweeps, zero failures. ' +
      'HELD TO CONDITIONAL, NOT PASS: FR-4 (population re-measure) is unfalsifiable as specified due to a pre-existing self-heal confound, and the backfill leg the SD\'s own text calls load-bearing ("remediates ZERO ROWS" without it) does not exist — both independently confirmed by TESTING and VALIDATION, neither manufactured or rounded up here.',
    detailed_analysis: {
      sd_key: SD_KEY,
      branch: 'feat/SD-LEO-INFRA-RELEASE-WORK-ITEM-001',
      head_commit: HEAD,
      pr: null,
      retrospective_id: retroRow.id,
      retrospective_quality_score: QUALITY_SCORE,
      retrospective_status: 'PUBLISHED',
      pattern_named: PATTERN,
      counts: {
        what_went_well: what_went_well.length,
        what_needs_improvement: what_needs_improvement.length,
        key_learnings: key_learnings.length,
        action_items: action_items.length,
        success_patterns: success_patterns.length,
        failure_patterns: failure_patterns.length,
        improvement_areas: improvement_areas.length
      },
      own_test_reverification: retro.metadata.own_verification,
      fr_disposition: retro.metadata.fr_disposition,
      honest_assessment:
        'Quality scored ' + QUALITY_SCORE + ', not higher: two SD-mandated deliverables (FR-4, backfill leg) are unmet, the wrong-premise-to-verdict failure is a repeatable process risk surfaced within this SD\'s own review chain, and the SD is unmerged with no PR, ' +
        'so the final commit has not yet been independently re-reviewed by a sub-agent (only by this retrospective\'s own live test re-run). Not lower, because the core mechanism is correct, mutation-verified, and six distinct process defects were root-caused to a mechanism-level explanation rather than a surface description, four of six fixed same-session.'
    },
    retro_contribution: {
      retrospective_id: retroRow.id,
      quality_score: QUALITY_SCORE,
      pattern: PATTERN,
      action_items_count: action_items.length,
      key_learnings_count: key_learnings.length
    },
    phase: PHASE,
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_ID,
    { name: 'Continuous Improvement Coach (RETRO)' },
    results,
    { sdKey: SD_KEY, phase: PHASE }
  );

  console.log('\nEVIDENCE ROW WRITTEN:');
  console.log('  id:', stored.id);
  console.log('  sub_agent_code:', stored.sub_agent_code, '| verdict:', stored.verdict, '| confidence:', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  metadata.repo_path:', stored.metadata?.repo_path);
  console.log('  metadata.repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  metadata.executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
