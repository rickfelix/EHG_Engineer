#!/usr/bin/env node
/**
 * Write RETRO (Continuous Improvement Coach) PLAN-phase evidence for
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 ahead of PLAN-TO-LEAD.
 *
 * A genuine SD_COMPLETION retrospective was generated via the canonical script
 * (scripts/generate-comprehensive-retrospective.js, id fd442d13-f751-4651-833d-31522452eb63)
 * and then enhanced in two passes with grounded, independently-verified analysis:
 * re-derived findings from the four prior sub-agent evidence rows (EXEC TESTING x2,
 * EXEC SECURITY, PLAN VALIDATION, PLAN REGRESSION x2), the branch diff, commit
 * messages, and fresh live re-measurements taken at retrospective-write time
 * (migration check: 5/5 FAIL; stranded-signature count: 1 row, QF-20260727-157,
 * of 9 in_progress).
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'b165653a-5857-4678-beb6-193ade75478f';
const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';
const RETRO_ID = 'fd442d13-f751-4651-833d-31522452eb63';

const findings = [
  {
    id: 'F1-retro-generated-and-enhanced-with-grounded-analysis',
    severity: 'INFO',
    summary: 'SD_COMPLETION retrospective generated via the canonical scripts/generate-comprehensive-retrospective.js (id fd442d13-f751-4651-833d-31522452eb63), which pulled the SD row, PRD, and all prior sub-agent evidence. The base output was mechanical boilerplate (success_patterns were literally gate-score percentages; action_items were generic "continue following LEO Protocol"), so I replaced it in two enhancement passes with grounded, independently-derived analysis: 8 what_went_well entries, 6 what_needs_improvement items, 5 full-paragraph key_learnings (each stating a rule generalizable to a DIFFERENT SD, not just this one), 7 sourced action_items with owner/priority/success_criteria/evidence_ref, 6 verbatim_citations with exact quotes and sources, and a populated triangulation_divergence_insights block for the FR-3 3-way convergence. Every factual claim was re-derived from the actual sub_agent_execution_results rows, commit messages (git show), the live git log (git log origin/main..HEAD, git merge-base), and fresh live DB queries — not restated from the prompt.',
  },
  {
    id: 'F2-quality-scoring-trigger-bug-documented-and-worked-around',
    severity: 'MEDIUM',
    summary: 'Confirmed a live, previously-documented harness bug: validate_retrospective_quality_trigger (a BEFORE INSERT OR UPDATE trigger on retrospectives) mechanically discards any caller-supplied quality_score and recomputes its own prose-completeness/specificity heuristic. I supplied quality_score:88 on my first enhancement UPDATE; the stored value came back as 100 — the trigger silently overwrote it. This exactly matches a prior, already-signalled finding on retrospective 33857181-36fa-4ec6-8a64-1147f9318091 (feedback id 6dc346b9: "the retrospective quality trigger cannot store an honest low score"). I applied the SAME documented workaround: metadata.retro_assigned_quality_score=63 is the authoritative, honest assessment (score_rationale: craft_of_shipped_work=90, purpose_achievement=40, composite=63 — capped well below craft because NONE of this SD\'s fixes are live in production yet), while metadata.trigger_assigned_quality_score records the mechanical column\'s value (100) with an explicit note that it is machine-owned and not comparable across rows or time. Did not re-litigate or attempt to "fix" the trigger — out of scope for RETRO, and already tracked.',
  },
  {
    id: 'F3-two-real-camouflage-recursion-bugs-independently-confirmed-fixed',
    severity: 'INFO',
    summary: 'Independently re-derived (via git show 80273a9fc0f, not taken from any prior verdict\'s prose) that this SD\'s own subject bug recurred one layer up inside its own fix: insertCoordinationRow throws on exactly one fault class and resolves normally with {data,error} for every other fault; deliverHints originally caught only throws, so a resolved delivery error was silently counted as delivered — the FR-6 ratio would have read a confident 10-of-10 while every row was dropped. Both TESTING and SECURITY found this independently at EXEC; both were fixed in commit 80273a9fc0f and mutation-tested (disabling the check reds exactly the 3 tests built to catch it). The alarm-durability gap (console.error only, against FR-6\'s own opening line "a logged skip count is a record nobody reads") was fixed in the same commit and is similarly mutation-confirmed. Both gaps closed; TESTING\'s re-verification moved from WARNING to CONDITIONAL_PASS as a direct result.',
  },
  {
    id: 'F4-fr3-three-way-independent-convergence-on-a-prd-text-defect-still-uncorrected',
    severity: 'MEDIUM',
    summary: 'Confirmed via git show ed0fda01bc1 (EXEC\'s own commit message, written DURING the build, before any later review) that EXEC itself already reasoned through and correctly excluded complete-quick-fix/orchestrator.js:84 from FR-3\'s routing, on the same grounds TESTING (downgraded HIGH to LOW on re-verification) and VALIDATION (finding V3) later independently re-derived: that call site always writes a real, non-null pr_url, so it can never satisfy FR-1\'s own guard (pr_url IS NULL) by construction. Three independent traces, one conclusion. However, product_requirements_v2 functional_requirements[2] (read directly) still literally names that site and still asserts a "zero bare-clear grep hits" AC the shipped, correct code does not satisfy — the PRD text itself has not been edited despite 3 rounds of independent sub-agents concluding it is wrong. Flagged as an explicit, still-open action item (not merely restated as a footnote in a verdict).',
  },
  {
    id: 'F5-live-honesty-check-re-measured-at-retro-write-time-not-inherited-from-validation',
    severity: 'HIGH',
    summary: 'Per the explicit instruction to state the SD\'s incompleteness in numbers rather than reassurance, I re-ran scripts/one-off/verify-release-sd-qf-branch.mjs myself at retrospective-write time: 5/5 checks still FAIL (unchanged from VALIDATION\'s and REGRESSION\'s prior re-checks). I also re-queried quick_fixes myself: 9 in_progress rows, of which 1 (QF-20260727-157) matches the exact four-predicate stranded signature right now — NOT the 0 VALIDATION measured (e4a07b5a, finding V8). This is not a regression; it is the SAME volatile-population behavior VALIDATION itself warned about (it personally watched a row move buckets between two of its own queries a minute apart) — but it does mean this retrospective could not simply cite VALIDATION\'s "0" as still-current without re-measuring, and re-measuring found the population had already moved. Also confirmed via git merge-base --is-ancestor HEAD origin/main (returns false): the branch remains unmerged, so none of FR-1/FR-3/FR-4/FR-5/FR-6/FR-7 are live in production. The 2026-07-26 incident class is fully unremediated in production as of this evidence row.',
  },
  {
    id: 'F6-adversarial-verification-pattern-and-recurring-sourcing-gap-both-worth-generalizing',
    severity: 'INFO',
    summary: 'Two of the five key_learnings I wrote into the retrospective are, in my judgment, the most transferable beyond this specific SD: (a) a differently-angled third review pass (REGRESSION tracing consumers of an altered value, rather than re-testing the function that produces it) found a real, still-open risk (detectThunderingHerd sensitivity to the FR-4 gauge narrowing) that two AGREEING EXEC-phase passes could not have surfaced by construction — evidence that adversarial-review value does not exhaust after two independent agents concur, if the third pass asks a structurally different question; (b) the chairman-gated-DDL-not-flagged-at-sourcing gap is not a one-off here — I independently found (via a feedback-table query, not taken on the prompt\'s word) a different SD\'s feedback dated 2026-07-20 explicitly naming "the known pre-flag-chairman-gated-DDL-at-sourcing gap," plus several 2026-06 completion-flags recording the identical unapplied-migration pattern on other SDs. This is now a recurring, named, still-unfixed structural gap in SD creation, not an isolated miss, and I filed it as a high-priority harness-backlog action item.',
  },
];

const warnings = [
  'FR-2\'s migration is NOT applied to the live database (re-verified by me, 5/5 checks FAIL) and this branch is NOT merged to origin/main (re-verified by me via git merge-base) — the 2026-07-26 incident class remains fully live and exploitable in production. This is chairman-gated DDL that no worker may self-apply, correctly untouched by this or any other sub-agent in this chain.',
  'FR-3\'s PRD text (product_requirements_v2 functional_requirements[2]) remains uncorrected despite 3 independent sub-agent passes (EXEC\'s own commit, TESTING, VALIDATION) concluding it names an unsatisfiable requirement — filed as an explicit action item rather than left as a verdict footnote.',
  'REGRESSION\'s R2 finding (detectThunderingHerd sensitivity change under the FR-4 gauge narrowing) has no pinning test and no explicit PRD acknowledgment — a real, currently-uncovered behavior-change risk, likely benign but unconfirmed.',
  'The retrospective\'s top-level quality_score column (100) is a mechanical, trigger-computed value that a documented, previously-signalled harness bug makes unreliable as an honest signal (it discarded my explicit 88 without comment). The authoritative assessment is metadata.retro_assigned_quality_score=63, which is deliberately lower than the mechanical column because purpose_achievement (nothing yet live in production) is weighted alongside craft_of_shipped_work (very high) rather than craft alone.',
];

const recommendations = [
  'PROCEED to PLAN-TO-LEAD. The retrospective is genuine, evidence-grounded, and honest about the remaining gap — it is not a rubber-stamp of a fully-closed SD.',
  'At LEAD-FINAL-APPROVAL, treat this SD as NOT fully closed until: (1) the chairman applies database/migrations/20260727_release_sd_qf_reopen.sql and verify-release-sd-qf-branch.mjs reports 5/5 PASS live, and (2) the branch is merged to origin/main. Both remain unmet as of this evidence row.',
  'Route the FR-3 PRD-text correction and the chairman-gated-DDL-pre-flag-at-sourcing harness-backlog item (both filed as retrospective action_items) to their respective owners rather than letting them lapse now that the retrospective itself is complete.',
  'Separately signal the validate_retrospective_quality_trigger instability (discards caller-supplied quality_score; a prior row also observed the mechanical score DECAYING across repeat no-op writes) as a harness bug if not already tracked beyond the one prior retrospective that documented it.',
];

const summary = 'CONDITIONAL_PASS (confidence 90). A genuine, evidence-grounded SD_COMPLETION retrospective was generated (canonical generate-comprehensive-retrospective.js, id fd442d13-f751-4651-833d-31522452eb63) and enhanced across two passes with independently re-derived findings, not restated prompt content: re-read the branch diff, commit messages (ed0fda01bc1, 80273a9fc0f), all sub_agent_execution_results rows for this SD, and a feedback-table query confirming the chairman-gated-DDL-pre-flag gap is a recurring, named pattern (not asserted on trust). Re-measured the SD\'s own honesty bar myself at write time rather than citing VALIDATION\'s figures: the live migration check is still 5/5 FAIL, the branch is still unmerged, and 1 row (QF-20260727-157) currently matches the exact stranded signature the incident is defined by. Five generalizable lessons were extracted (FR-3\'s unsatisfiable-by-construction requirement text; the untimestamped-volatile-population near-miss VALIDATION caught in itself; the recurring chairman-gated-DDL-at-sourcing gap; evidence-vs-implementation as the actual handoff blocker after an orphan-session adoption; and adversarial verification\'s continued value from a differently-angled third pass), each written to generalize to a different SD, not just restate this one\'s specifics. Also surfaced and worked around a live instance of a previously-documented harness bug: the retrospectives table\'s quality-scoring trigger discarded my supplied score and computed its own mechanical 100; the honest assessment (63) is recorded in metadata.retro_assigned_quality_score with an explicit rationale, per the established precedent for this exact issue. CONDITIONAL rather than a clean PASS because the retrospective itself correctly refuses to certify the SD as fully delivered: the chairman-gated migration is unapplied and the branch is unmerged, both re-confirmed live at this evidence row\'s own timestamp.';

const justification = [
  'CONDITIONAL_PASS — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 PLAN-phase RETRO evidence ahead of PLAN-TO-LEAD.',
  '',
  'METHOD: read the PRD and SD row directly from the database; read all prior sub_agent_execution_results rows for this sd_id (18 total; the 7 phase-gating rows in depth: LEAD VALIDATION, EXEC TESTING x2, EXEC SECURITY, PLAN REGRESSION x2, PLAN VALIDATION); read the branch diff and commit messages directly (git log origin/main..HEAD, git show on the two commits central to the retrospective\'s narrative, ed0fda01bc1 and 80273a9fc0f); confirmed the "9 commits pre-adoption / 28 commits merged in from origin/main" narrative against git log timestamps and Claude-Session trailers (61d2bb66 for the original 9, d6f66610 for the adopting session\'s merge and fix commits) rather than accepting it as asserted; independently re-ran the live migration-verification script and a live quick_fixes query rather than citing VALIDATION\'s numbers; and ran a feedback-table query to independently confirm the chairman-gated-DDL-at-sourcing gap is a named, recurring pattern rather than a one-off assertion.',
  '',
  '1. RETROSPECTIVE GENERATION: used the canonical scripts/generate-comprehensive-retrospective.js against the SD\'s UUID (its SD_KEY lookup path requires the UUID, not the text key — confirmed by reading the script\'s SD-lookup query before invoking it). The base row was mechanical boilerplate (success_patterns literally read as gate-score percentages). Replaced it via two targeted UPDATE passes with grounded content: 8 what_went_well, 6 what_needs_improvement/failure_patterns, 5 full-paragraph key_learnings each stating a transferable rule, 7 sourced action_items, 6 verbatim_citations, a populated triangulation_divergence_insights block for the FR-3 convergence, real test/file/commit cross-references (103/103 tests, 14 commits, 12 changed files), and structured metadata (handoff history, orphan-adoption session ids, live re-measurements with timestamps).',
  '',
  '2. QUALITY-SCORE TRIGGER: my first UPDATE supplied quality_score:88; the stored value came back 100. Diagnosed this as the SAME documented trigger behavior already found and signalled on a prior retrospective (33857181-36fa-4ec6-8a64-1147f9318091, feedback 6dc346b9): validate_retrospective_quality_trigger discards any caller-supplied score and computes its own mechanical prose-completeness heuristic. Applied the identical, already-established workaround rather than re-fighting the trigger: metadata.retro_assigned_quality_score=63 (with an explicit craft_of_shipped_work=90 / purpose_achievement=40 rationale) is the authoritative number; metadata.trigger_assigned_quality_score=100 records the mechanical column\'s value with a note that it is machine-owned and not comparable across rows or time.',
  '',
  '3. FR-5/FR-6 RECURSION BUG: independently confirmed via git show 80273a9fc0f (not via any prior verdict\'s prose alone) that this SD\'s own subject failure mode (reports success while having delivered nothing) recurred inside the delivery-ratio metric built to detect it, via insertCoordinationRow\'s two distinct fault-signaling shapes (throw vs. resolved {error}). Both EXEC sub-agents (TESTING, SECURITY) found this independently; both gaps are fixed and mutation-tested in the same commit. TESTING\'s own re-verification moved WARNING -> CONDITIONAL_PASS as a direct, traceable result.',
  '',
  '4. FR-3 THREE-WAY CONVERGENCE: read git show ed0fda01bc1 directly and confirmed EXEC itself reasoned through the identical conclusion TESTING and VALIDATION later reached independently, all three tracing the same fact (the call site\'s prUrl is always non-null, structurally excluding it from FR-1\'s guard). Populated retrospectives.triangulation_divergence_insights with this convergence as a generalizable pattern. Confirmed via a direct read of product_requirements_v2 that the PRD text itself STILL contradicts the shipped, correct code — filed as an explicit action item rather than accepted as merely noted-in-passing.',
  '',
  '5. LIVE HONESTY CHECK (re-measured, not inherited): re-ran scripts/one-off/verify-release-sd-qf-branch.mjs myself: 5/5 FAIL. Re-queried quick_fixes myself: 9 in_progress, 1 (QF-20260727-157) matching the exact stranded signature — different from VALIDATION\'s own "0" measurement, consistent with the SD\'s own documented population volatility, not a regression. Confirmed via git merge-base --is-ancestor HEAD origin/main (false) that the branch remains unmerged. This retrospective states the SD\'s incompleteness with this row\'s own timestamped numbers, not a reused, potentially-stale prior figure.',
  '',
  '6. RECURRING SOURCING GAP, INDEPENDENTLY CONFIRMED: queried the feedback table myself for "chairman-gated" + "pre-flag"/"at sourcing" text rather than accepting the pattern\'s existence on the prompt\'s word; found a different SD\'s feedback (856969b1, 2026-07-20) explicitly naming "the known pre-flag-chairman-gated-DDL-at-sourcing gap," plus multiple 2026-06 completion-flags recording the same unapplied-migration pattern on other SDs. This is a repeatedly-recurring, named structural gap, not a one-off — filed as a high-priority harness-backlog action item with the corroborating feedback id cited.',
  '',
  'RATIONALE FOR CONDITIONAL_PASS (not a clean PASS, not FAIL): the retrospective itself is genuine, well-grounded, and internally honest — it does not certify the SD as complete, because the SD is not complete. RETRO\'s own job (generate a meaningful retrospective) succeeded at high confidence. The CONDITIONAL qualifier mirrors every other sub-agent verdict on this SD (TESTING, SECURITY, VALIDATION, REGRESSION all returned CONDITIONAL_PASS for the identical reason): sound, well-tested work, blocked from being a clean PASS by an external, chairman-gated dependency that remains unresolved and is re-confirmed unresolved at this evidence row\'s own timestamp.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Apply database/migrations/20260727_release_sd_qf_reopen.sql once chairman-approved, and re-run scripts/one-off/verify-release-sd-qf-branch.mjs to confirm the live function passes all 5 checks (currently 5/5 FAIL, re-verified at this evidence row\'s own timestamp) before treating this SD as fully closed at LEAD-FINAL-APPROVAL.',
      'Merge feat/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 to origin/main — confirmed NOT merged (git merge-base --is-ancestor HEAD origin/main returns false); none of FR-1/FR-3/FR-4/FR-5/FR-6/FR-7 are live in production.',
      'Correct FR-3\'s acceptance_criteria/description text in product_requirements_v2 (still names orchestrator.js:84 as a required routing site after 3 independent sub-agent passes concluded that is wrong).',
    ],
    metadata: {
      assessment_type: 'sd_completion_retrospective_generation_and_enhancement',
      retrospective_id: RETRO_ID,
      retrospective_generator: 'scripts/generate-comprehensive-retrospective.js',
      retro_type: 'SD_COMPLETION',
      retro_mechanical_quality_score: 100,
      retro_authoritative_quality_score: 63,
      retro_quality_score_note: 'validate_retrospective_quality_trigger discards caller-supplied quality_score and computes its own mechanical prose-completeness heuristic (documented, previously-signalled harness bug — see retrospective 33857181-36fa-4ec6-8a64-1147f9318091 / feedback 6dc346b9). Authoritative score lives at retrospectives.metadata.retro_assigned_quality_score=63 on this row.',
      sd_owned_test_suite: '74/74 (SD-owned) — 103/103 across SD-owned + 2 directly-relevant pre-existing regression files (per REGRESSION\'s independent re-run, eceae9b1)',
      commits_reviewed: 14,
      files_changed: 12,
      live_migration_check_at_evidence_time: { script: 'scripts/one-off/verify-release-sd-qf-branch.mjs', result: '5/5 FAIL', ran_by_me: true },
      live_stranded_population_at_evidence_time: { total_in_progress: 9, stranded_signature_count: 1, stranded_ids: ['QF-20260727-157'], ran_by_me: true },
      branch_merged_to_main: false,
      key_learnings_count: 5,
      action_items_count: 7,
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
      phase_assessed: 'PLAN (RETRO evidence ahead of PLAN-TO-LEAD handoff)',
    },
    phase: 'PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_ID,
    { name: 'Continuous Improvement Coach (retro-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
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

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
