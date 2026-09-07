import dotenv from 'dotenv'; dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '6a9c6fe0-7a94-4437-b8bb-48f136e3b400';
const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F';
const SHA = '2efd61989db2ab01a027e7d9953832cdeaa4a739';

const results = {
  verdict: 'PASS',
  confidence: 93,
  justification: "Final re-verification of commit 2efd6198 (supersedes rows 64ea554f @ 8692c5c4 and 5c499972 @ 024e1507). Both conditions I raised are now genuinely closed and independently verified, not accepted on the fixing agent's word. V-F1: ACTIVATED requires a real independent SELECT of quick_fixes.metadata to agree with stampClaim's in-memory return. V-F3: readBackClaimHistory now returns {entry, indeterminate?, error?} mirroring probeColumnPresent's existing shape, the call site checks indeterminate BEFORE treating a missing entry as a defect, and genuine non-persistence ({entry:null} with no indeterminate flag) still correctly classifies REGRESSED -- so the fix closed the conflation without collapsing the real-defect signal in the other direction. All seven FR-1 acceptance criteria hold, FR-2 and FR-3 hold, no duplicate implementation exists, scope is unchanged from TR-1, and I re-ran the evidence myself: 17/17 unit tests, live run NOT_YET_APPLIED at exit 0, zero orphan scratch rows in production quick_fixes.",
  conditions: [],
  critical_issues: [],
  warnings: [
    "Advisory only, no behavioural impact: the DI seam's @param JSDoc at scripts/verify-quick-fixes-metadata-activation.mjs:126 still documents the OLD return shape -- `@param {(dbClientFactory, qfId) => Promise<object|null>} [deps.readBackFn]`. readBackClaimHistory now always returns an object ({entry, indeterminate?, error?}) and never null. The function's own docblock (:85-95) carries the correct @returns, so the authoritative documentation is right; only the seam's param annotation is stale. Worth a one-line touch-up if the branch is amended for another reason, but not worth a commit on its own. Flagged for completeness because a future implementer writing a fake from that @param could return a bare null, which would throw at `readBack.indeterminate` (:184) -- a loud failure that the run() catch converts to exit 2, so even that mis-use fails safe.",
    "Unchanged advisory nits from evidence 64ea554f, all cosmetic: AC-3's connect_failed test asserts the distinguishing output text negatively (not.toMatch(/real defect/)) rather than positively; AC-7's tests compare result.exitCode to the EXIT_CODES constants rather than the literals 0/0/1/2, so a wrong constant would not be caught. Neither affects correctness of the shipped code.",
    "Unchanged scope note: the branch adds 3 lines to .gitignore (an un-ignore negation, required because scripts/verify-* is ignored) on top of TR-1's 'exactly one new file'. Necessary plumbing, not scope creep."
  ],
  recommendations: [
    "Proceed to the PLAN-TO-LEAD handoff. No blocking or conditional findings remain from VALIDATION.",
    "V-F2 remains the one open item and is correctly deferred: -E's PRD activation_test_id points at a path that exists only on this branch, so re-check fs.existsSync from the repo root once the PR merges rather than assuming. If the SD were ever to complete unmerged, that field would point at a non-existent file, which is strictly worse for a later reader than the NULL it replaced.",
    "The retrospective /signal the team lead already sent is the right home for the 3x discriminator-collapse pattern (evidence 65c242f0 stampClaim's {merged,reason}; a9bac2fa the insert failure; 5c499972 the read-back). The recurring shape is: each new seam added to this chain initially swallowed its own error into the same sentinel it used for a real negative result. probeColumnPresent got it right first and became the template the other two were eventually corrected toward -- that template is the reusable lesson."
  ],
  detailed_analysis: {
    task: 'Final PRD-to-implementation fidelity re-verification of SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F at PLAN-TO-LEAD, after fixes for VALIDATION findings V-F1 and V-F3.',
    evaluated_commit_sha: SHA,
    supersedes_rows: [
      '64ea554f-11ef-4517-a690-3a9fc8677d31 (commit 8692c5c475f, CONDITIONAL_PASS, raised V-F1 + V-F2)',
      '5c499972-cd47-440c-9a30-7be35331955f (commit 024e15076fa, CONDITIONAL_PASS, confirmed V-F1 closed, raised V-F3)'
    ],
    worktree: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F',
    diff_reviewed: 'git diff 024e15076fa 2efd61989db -- 2 files, script +21/-13 and test +36/-10. Full branch vs main remains 3 files / +512: .gitignore (3), the script (271), the test (238). No production code and no migration touched; lib/fleet/claim-stamp.cjs and lib/fleet/qf-metadata-merge.mjs are still unmodified, so TR-1 holds.',
    v_f3_closure_verification: {
      verdict: 'CLOSED -- verified by reading the code and the call site, then re-running the suite',
      shape_now_discriminated: "readBackClaimHistory (:94-116) returns {entry: history[last]} on success, {entry: null} for a genuine empty/absent claim_history, and {entry: null, indeterminate: true, error: err.message} from BOTH failure paths -- client construction (:99-101) and the query itself (:110-112). This mirrors probeColumnPresent's {present:false, indeterminate:true, error} exactly, which is what I recommended rather than a new vocabulary.",
      call_site_order_correct: 'resolveActivationState :184-190 checks readBack.indeterminate FIRST and returns INDETERMINATE (exit 2) with detail "the independent read-back could not reach a definite answer (<error>) -- environmental/transient, not a code defect." Only after that gate does it evaluate readBack.entry for the pick_reason property.',
      real_defect_signal_preserved: 'Critically, the fix did NOT over-correct: {entry: null} WITHOUT the indeterminate flag still falls through to REGRESSED with the read-after-write detail (:191-193). A genuine "the write did not land" is still a defect. I checked this specifically because the cheap way to close V-F3 would have been to make every missing entry INDETERMINATE, which would have destroyed the signal the read-back exists to provide.',
      no_residual_swallowing: "grep for 'return null' across the script now returns ZERO matches. The only two bare catch blocks remaining (:81, :113) are `try { await client.end(); } catch { /* best-effort close */ }` -- a failed connection close is genuinely nothing and correctly ignored.",
      docblock_nit_also_fixed: "The inaccurate 'Returns the newest claim_history element (by claimed_at)' line I flagged (the function sorts nothing; it takes the last array element) was removed and replaced with a correct @returns annotation.",
      regression_tests_updated_not_just_added: "All four readBackFn injection sites in the test file were migrated to the new shape (:65, :83, :103, :222) -- the two that previously PINNED the conflated behaviour are now correct rather than left passing on a stale contract. The readBackClaimHistory shape test now covers all three outcomes: found ({entry:{...}}), empty ({entry:null}), unreachable (entry null + indeterminate true + error matching /ECONNREFUSED/). New test 'V-F3: an INDETERMINATE (not REGRESSED) read-back connection failure never gets conflated with a real read-after-write defect' asserts state, exit code 2, and .not.toMatch(/real read-after-write defect/)."
    },
    v_f1_still_closed: "Re-confirmed at this commit: readBackClaimHistory issues a genuine fresh SELECT metadata -> 'claim_history' ... WHERE id = $1 using its own client from dbClientFactory, and ACTIVATED at :191-193 requires that persisted entry to carry pick_reason. The in-memory entry from stampClaim is now only a short-circuit for the no-pick_reason REGRESSED case (:176-179). The read-back still executes inside the try block, before the finally that deletes the scratch row, so the row exists when read.",
    acceptance_criteria_final: {
      method: 'All seven re-checked against 2efd6198. This commit touches only the ACTIVATED classification path and its tests, so AC-4/AC-5/AC-6/AC-7 are structurally unaffected; re-verified anyway.',
      ac1: "PASS -- ran the script live: 'NOT_YET_APPLIED: quick_fixes.metadata does not exist yet (chairman-gated migration unapplied). Zero writes made.', exit 0. Raw-pg query of quick_fixes WHERE id LIKE 'QF-VERIFYACT%' returned 0 rows.",
      ac2: 'PASS -- TS-2 (ACTIVATED, now with the {entry} read-back shape and asserting /independently read back/) and TS-3 (REGRESSED via cas_lost) both DI-only, no live DB.',
      ac3: 'PASS -- the merge-side connect_failed branch (:194-197) still classifies INDETERMINATE; the read-back leg now does too, which strengthens AC-3 beyond its literal wording rather than weakening it.',
      ac4: 'PASS -- buildScratchQfInsertPayload untouched since 8692c5c4, where I verified it insertable against the live schema (type/severity/status CHECKs, factory_lane and force_completed defaults, target_application trigger EXISTS predicate true for EHG_Engineer) and non-belt-auto-startable on two independent legs.',
      ac5: 'PASS -- scratchIdFn untouched; QF_ID_RE at lib/fleet/claim-stamp.cjs:96 is literally /^QF-/.',
      ac6: 'PASS -- try/finally intact; the read-back is inside the try, so cleanup runs even if it throws.',
      ac7: 'PASS -- EXIT_CODES untouched: 0 NOT_YET_APPLIED, 0 ACTIVATED, 1 REGRESSED, 2 INDETERMINATE.'
    },
    fr2_recheck: {
      activation_test_id: 'scripts/verify-quick-fixes-metadata-activation.mjs',
      method: 'Re-queried product_requirements_v2 directly at this commit to confirm no other agent clobbered the field between reviews.',
      still_exact_match: true,
      fs_exists_from_repo_root: false,
      note: "Unchanged: FR-2's own AC is satisfied; TS-4's existsSync-from-repo-root half completes on merge (V-F2, correctly deferred by the team lead)."
    },
    fr3_recheck: 'PASS -- the header RUNBOOK block still names the exact command `node scripts/verify-quick-fixes-metadata-activation.mjs` and gives plain-language meanings for all four states. The ACTIVATED sentence now accurately describes the read-back the code actually performs.',
    test_and_run_evidence: {
      unit: '17/17 passing (vitest 4.1.4, 253ms) -- ran directly. Progression across the three reviews: 14 at 8692c5c4, 16 at 024e1507, 17 at 2efd6198, with each increment being a regression test pinning a VALIDATION finding rather than coverage padding.',
      live: 'NOT_YET_APPLIED, exit 0, zero writes -- ran directly.',
      orphans: '0 rows matching QF-VERIFYACT% in live quick_fixes.',
      fleet_tier: "Did not re-run the team lead's 2642/2642 fleet-wide claim -- that is TESTING's evidence to produce."
    },
    duplicate_check: 'Unchanged: no other script verifies the quick_fixes.metadata activation invariant; resolveActivationState and readBackClaimHistory are defined nowhere else in the repo. scripts/one-off/verify-sourcing-activation-reconciler-live.mjs is the named precedent for a different subject.',
    not_rerun: 'Did not re-audit security, code quality, or test rigour -- TESTING (fae98c81) and SECURITY (e101d1c5) own those verdicts. All three of my findings across these reviews were reported as PRD-fidelity gaps (code contradicting an explicit FR clause or a docblock claiming behaviour the code lacked), not code-quality opinions.',
    verdict_rationale: "PASS. Every acceptance criterion in FR-1 and the ACs of FR-2 and FR-3 are satisfied under independent measurement; both VALIDATION conditions are closed by real code changes with regression tests that would fail if the fixes were reverted; the second fix closed the conflation without sacrificing the real-defect signal, which was the specific risk in over-correcting it; and scope, duplicate, and orphan checks are all clean. The one remaining warning is a stale @param type annotation with no behavioural consequence and a correct authoritative docblock beside it -- not grounds to withhold PASS a third time. V-F2 (existsSync post-merge) is an open verification step, not a defect, and is correctly deferred."
  },
  metrics: {
    acceptance_criteria_verified: 7,
    acceptance_criteria_passed: 7,
    functional_requirements_verified: 3,
    prior_conditions_closed: 2,
    open_conditions: 0,
    new_defects_found: 0,
    duplicates_found: 0,
    unit_tests_passing: 17,
    live_runs_executed: 1,
    review_rounds: 3
  }
};

try {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    fallback: 'EHG_Engineer',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);
} catch (e) {
  console.warn('repo stamp failed:', e.message);
}

const stored = await storeSubAgentResults('VALIDATION', SD_UUID, null, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
console.log('STORED_ID=', stored.id, '| verdict=', results.verdict);
