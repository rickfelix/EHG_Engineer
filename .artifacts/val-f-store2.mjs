import dotenv from 'dotenv'; dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '6a9c6fe0-7a94-4437-b8bb-48f136e3b400';
const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F';
const SHA = '024e15076fa9556c7b7b1bce98a4d294f434e390';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  justification: "Re-verification of commit 024e1507 (supersedes my row 64ea554f against 8692c5c4). V-F1 is genuinely CLOSED: readBackClaimHistory performs a real independent SELECT and ACTIVATED now requires it to agree with stampClaim's in-memory return, with disagreement classified REGRESSED rather than silently accepted. All seven FR-1 acceptance criteria still hold, 16/16 tests pass, and the live run still prints NOT_YET_APPLIED at exit 0 with zero writes. One NEW defect the fix introduced: readBackClaimHistory collapses connect/query failure into the same `null` it returns for genuine non-persistence, so a transient DB blip during the read-back now classifies REGRESSED ('a real read-after-write defect') instead of INDETERMINATE -- directly contradicting FR-1's explicit requirement that connect_failed and unclassified errors must be INDETERMINATE 'so a flaky connection is never misreported as a code defect'. Conditioned rather than failed because every AC still passes and the remedy is ~4 lines, but this is more consequential than V-F1 was: V-F1 was an overclaiming docblock, V-F3 emits an actively WRONG chairman-facing verdict at the apply ceremony.",
  conditions: [
    "V-F3 (NEW, recommend fixing before LEAD-FINAL): readBackClaimHistory (script :94-111) has two bare `catch { return null }` blocks -- one for client construction (:98), one for the query (:106) -- and resolveActivationState (:180-183) maps any null to REGRESSED with detail 'a real read-after-write defect'. A connection blip or query error during read-back therefore reports a code defect that does not exist, at exactly the moment the chairman runs this post-apply. FR-1 requires the opposite: 'INDETERMINATE (the probe or the claim attempt fails with connect_failed or an unclassified error -- a transient/environmental condition, NOT evidence of a broken chain; exit 2, distinct from REGRESSED so a flaky connection is never misreported as a code defect)'. Fix: have readBackFn return a discriminated result (e.g. {found:false, reason:'connect_failed'|'query_failed'|'absent'}) and route the two error reasons to INDETERMINATE, mirroring what probeColumnPresent (:63-79) already does correctly in the same file.",
    "V-F2 (unchanged, merge-pending): agreed with the team lead that this is self-resolving on merge and not a defect to fix now -- with one caveat. It self-resolves only IF the branch actually merges. If the SD completes without the merge landing, -E's PRD activation_test_id points at a path that does not exist on main, which is strictly worse for a later reader than the NULL it replaced. Verify existsSync from the repo root post-merge rather than assuming it."
  ],
  critical_issues: [],
  warnings: [
    "V-F3 is the THIRD instance of the same failure class on this SD: TESTING evidence 65c242f0 found stampClaim collapsing mergeQfMetadataKeys's {merged, reason} discriminator (fixed with the wrapper); TESTING evidence a9bac2fa found an insert failure misclassified as REGRESSED (fixed by classifying it INDETERMINATE); now the read-back leg collapses connect/query failure into non-persistence. lib/fleet/qf-metadata-merge.mjs's own docblock (:8-12) names this anti-pattern explicitly: 'a blanket catch{return null} (the pattern this module deliberately avoids) makes a \"column not there yet\" indistinguishable from a real bug, which is unverifiable by construction'. Worth a line in the retrospective -- the discriminator-collapse pattern keeps reappearing at each new seam.",
    "Two tests now PIN the V-F3 conflation as intended behaviour: 'readBackClaimHistory returns ... null when the client cannot connect' asserts toBeNull() on an ECONNREFUSED factory, and the V-F1 test maps readBackFn -> null to REGRESSED. Both will need updating alongside the fix; neither currently distinguishes 'could not read' from 'read, found nothing'.",
    "Docblock nit (same overclaim class as V-F1, benign): readBackClaimHistory's docblock (:89) says it 'Returns the newest claim_history element (by claimed_at)', but the implementation returns history[history.length - 1] with no claimed_at comparison anywhere. Harmless in practice -- the merge appends via `|| $3::jsonb` so array order is chronological, and the scratch row has exactly one entry -- but the text claims a sort the code does not perform.",
    "The read-back does not assert the persisted entry's session_id matches the probe's sessionId; it only checks the entry has a pick_reason property. Sound for this probe (the scratch row is created fresh with no prior metadata, so exactly one entry can exist) but it would not detect reading someone else's entry on a pre-existing row. Noted, not a defect for this use.",
    "AC-3 and AC-7 assertion nits from my prior review (evidence 64ea554f) are unchanged and remain advisory only.",
    "TR-1 '.gitignore un-ignore negation' note from my prior review is unchanged."
  ],
  recommendations: [
    "Fix V-F3 before LEAD-FINAL rather than deferring it. It is ~4 lines plus two test updates, and it defeats the four-state design that is this SD's entire reason to exist -- shipping a verifier whose REGRESSED verdict can be caused by a network blip undermines the artefact the chairman is meant to trust.",
    "Mirror probeColumnPresent's existing shape ({present:false, indeterminate:true, error}) in readBackFn rather than inventing a new result vocabulary -- the discriminated-result pattern already exists in this same file and in mergeQfMetadataKeys's {merged, reason}.",
    "V-F2: proceed as the team lead proposed (self-resolving on merge), but re-check fs.existsSync from the repo root once the PR merges, since -E's activation_test_id now points at a file that only exists on this branch."
  ],
  detailed_analysis: {
    task: 'Re-verification of SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F at PLAN-TO-LEAD after the V-F1 fix. Supersedes evidence row 64ea554f (commit 8692c5c4).',
    evaluated_commit_sha: SHA,
    supersedes_row: '64ea554f-11ef-4517-a690-3a9fc8677d31 (commit 8692c5c475f)',
    worktree: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F',
    diff_reviewed: 'git diff 8692c5c475f 024e15076fa -- 2 files, +82/-5: scripts/verify-quick-fixes-metadata-activation.mjs (+51) and tests/unit/fleet/verify-quick-fixes-metadata-activation.test.js (+36). No other file touched; lib/fleet/claim-stamp.cjs and lib/fleet/qf-metadata-merge.mjs remain unchanged, so TR-1 still holds.',
    v_f1_closure_verification: {
      verdict: 'CLOSED -- verified, not accepted on the fixing agent word',
      read_back_is_real: "readBackClaimHistory (:94-111) calls dbClientFactory() to obtain its OWN client and issues a genuine fresh SELECT: \"SELECT metadata -> 'claim_history' AS claim_history FROM quick_fixes WHERE id = $1\". This is a real read of persisted state, independent of the in-memory object -- unlike the previous schema probe, which was SELECT ... LIMIT 0 and returned no rows by construction.",
      activated_now_requires_agreement: 'resolveActivationState :176-183: hasPickReason on the in-memory entry is now a REGRESSED short-circuit on its own (:172-175), and ACTIVATED additionally requires persistedHasPickReason from the independent read-back. A disagreement yields REGRESSED with detail naming it a read-after-write defect -- not silently accepted.',
      ordering_correct: 'The read-back executes inside the try block, before the finally that deletes the scratch row, so the row still exists when it is read. Verified by reading the control flow, not inferred.',
      text_now_matches_behaviour: "The docblock (:31-35) and the header design notes now state ACTIVATED requires BOTH the in-memory success AND an independent read-back. The ACTIVATED detail string was updated to 'written AND independently read back from quick_fixes.metadata'. The overclaim I flagged is gone.",
      regression_test_pins_it: "Test 'V-F1: REGRESSED (not ACTIVATED) when the in-memory entry claims success but an independent read-back finds nothing persisted' injects readBackFn -> null against a stampClaimFn that returns a fully-formed pick_reason-bearing entry, and asserts REGRESSED + /read-after-write/. This is the correct negative test -- it would fail if the read-back were removed."
    },
    v_f3_analysis: {
      severity: 'MEDIUM-HIGH (chairman-facing false defect report), live-path-only',
      code: 'readBackClaimHistory :96-100 catches client-construction failure with a bare `catch { return null }`; :105-107 catches query failure the same way. Both are indistinguishable at the call site from :104 (history absent or empty), which is the genuine non-persistence signal.',
      consequence: "At :180-183 any null becomes: REGRESSED, exit 1, 'merge reported success and returned a pick_reason-bearing entry, but an independent read-back of quick_fixes.metadata for <id> found no matching persisted entry -- a real read-after-write defect.' A dropped connection during the read-back thus tells the chairman to file a bug in the -E chain that does not exist.",
      contradicts: "FR-1 verbatim: 'INDETERMINATE (the probe or the claim attempt fails with connect_failed or an unclassified error -- a transient/environmental condition, NOT evidence of a broken chain; exit 2, distinct from REGRESSED so a flaky connection is never misreported as a code defect)'.",
      internal_inconsistency: 'probeColumnPresent, 30 lines above in the SAME file (:63-79), gets this right -- it returns {present:false, indeterminate:true, error} on connect failure and reserves the bare {present:false} for a real 42703. The new function does not follow its own sibling.',
      why_the_fix_is_cheap: 'readBackFn already flows through a single call site (:180). Returning a discriminated object and adding one INDETERMINATE branch alongside the existing ones (:187-190) is roughly four lines plus updating the two tests that currently pin the conflated behaviour.'
    },
    acceptance_criteria_recheck: {
      method: 'Re-checked all seven against 024e1507; the diff only touches the ACTIVATED classification path plus its tests.',
      ac1: "PASS -- ran the script live at 024e1507: 'NOT_YET_APPLIED: quick_fixes.metadata does not exist yet (chairman-gated migration unapplied). Zero writes made.', exit 0. Raw-pg query of quick_fixes WHERE id LIKE 'QF-VERIFYACT%' returned 0 rows, so the read-back addition introduced no new write and left no orphan.",
      ac2: 'PASS -- TS-2 (ACTIVATED) now additionally injects readBackFn and asserts /independently read back/; TS-3 (REGRESSED via cas_lost) unchanged. Both still DI-only.',
      ac3: 'PASS (assertion nit unchanged) -- the merge-side connect_failed branch still classifies INDETERMINATE correctly at :187-190. Note this is the branch AC-3 names; V-F3 concerns the NEW read-back leg, which AC-3 predates.',
      ac4: 'PASS -- buildScratchQfInsertPayload untouched by this commit.',
      ac5: 'PASS -- scratchIdFn untouched.',
      ac6: 'PASS -- try/finally structure untouched; the read-back sits inside the try, so cleanup still runs if it throws (it cannot, given the bare catches -- which is V-F3).',
      ac7: 'PASS (assertion nit unchanged) -- EXIT_CODES untouched; all four states still map 0/0/1/2.'
    },
    test_and_run_evidence: {
      unit: '16/16 passing in tests/unit/fleet/verify-quick-fixes-metadata-activation.test.js (vitest 4.1.4, 986ms) -- ran directly, not accepted on report. Up from 14/14 at 8692c5c4; the 2 new tests are the V-F1 negative case and readBackClaimHistory shape/connect-failure coverage.',
      live: 'NOT_YET_APPLIED, exit 0, zero writes -- ran directly.',
      orphans: '0 rows matching QF-VERIFYACT% in live quick_fixes after the run.',
      fleet_tier: "Did not re-run the team lead's 2641/2641 fleet-wide claim -- that is TESTING's evidence to produce, and re-running it is outside a fidelity review."
    },
    duplicate_check: 'Unchanged from evidence 64ea554f: no other script verifies the quick_fixes.metadata activation invariant; readBackClaimHistory and resolveActivationState are defined nowhere else in the repo.',
    not_rerun: 'Did not re-audit security, code quality, or test rigour -- TESTING (fae98c81) and SECURITY (e101d1c5) own those. V-F3 is reported as a PRD-fidelity finding (the code contradicts an explicit FR-1 clause), not as a code-quality opinion.',
    verdict_rationale: 'CONDITIONAL_PASS. The requested fix is real and well-made: the read-back is a genuine independent SELECT, ACTIVATED requires agreement, disagreement is surfaced as REGRESSED, the text now matches the behaviour, and a proper negative test pins it. Every AC still passes and nothing regressed in the live or unit evidence. Withheld from PASS solely because the fix reintroduces the discriminator-collapse pattern in its new error path, producing a REGRESSED verdict for a transient failure in direct contradiction of FR-1 -- narrow, unreachable until the migration lands, and cheap to close, but it degrades exactly the trustworthiness this tool exists to provide.'
  },
  metrics: {
    acceptance_criteria_verified: 7,
    acceptance_criteria_passed: 7,
    prior_conditions_closed: 1,
    new_defects_found: 1,
    duplicates_found: 0,
    unit_tests_passing: 16,
    live_runs_executed: 1
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
