import dotenv from 'dotenv'; dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '6a9c6fe0-7a94-4437-b8bb-48f136e3b400';
const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F';
const SHA = '8692c5c475f374131fd5044a144d248c30d3ea8e';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  justification: 'All seven FR-1 acceptance criteria (AC-1..AC-7) are independently satisfied, FR-2 is confirmed set by direct DB query, FR-3 is present, and no duplicate implementation exists. One PRD-to-implementation fidelity gap: FR-1 description and the script header both promise the ACTIVATED verdict is "read back and verified", but no read-back SELECT exists -- ACTIVATED rests on UPDATE rowCount plus a property of a locally-constructed object. No AC requires read-back, so this conditions rather than fails the verdict. SUPERSEDES row 64ea554f-11ef-4517-a690-3a9fc8677d31 (identical findings; that row was written from the MAIN repo root so the writer stamped metadata.evaluated_commit_sha = main HEAD b8af5a05 rather than the branch commit 8692c5c4 actually evaluated -- this row is written from the SD worktree so the stamp is correct).',
  conditions: [
    "V-F1: Either add a read-back SELECT of quick_fixes.metadata->'claim_history' for the scratch id before returning ACTIVATED, or amend FR-1 description + the script header runbook text (lines 13-14) to drop the 'reads back' claim. The header is chairman-facing at the apply ceremony, so the wording must match what the code does.",
    "V-F2 (merge-pending, not a defect): TS-4 requires fs.existsSync('scripts/verify-quick-fixes-metadata-activation.mjs') from repo root to be true. It is FALSE on main today -- the file exists only in the SD worktree; branch feat/SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F is unmerged with no open PR. FR-2's own AC (activation_test_id equals the exact path) IS satisfied; the existsSync half completes on merge."
  ],
  critical_issues: [],
  warnings: [
    "V-F1 (see conditions): resolveActivationState classifies ACTIVATED from (a) capturedResult.merged, which mergeQfMetadataKeys derives from result.rowCount !== 0 on its UPDATE (lib/fleet/qf-metadata-merge.mjs:59-62, no SELECT), and (b) Object.hasOwnProperty(entry, 'pick_reason') on the in-memory object stampClaim just built -- claim-stamp.cjs:134 sets entry.pick_reason unconditionally BEFORE the merge, so that check is near-tautological. The only SELECT in the script is the schema probe 'SELECT metadata FROM quick_fixes LIMIT 0' (LIMIT 0 returns no rows). rowCount=1 does prove the column exists and the CAS predicate matched a row, which is real evidence -- but a BEFORE-UPDATE trigger or jsonb shape error that stripped claim_history would still print ACTIVATED.",
    "AC-3 nit: the code emits the required 'environmental/transient, not a code defect' text (script :146), but the connect_failed test asserts it only negatively (expect(result.detail).not.toMatch(/real defect/), test :108). The insert-failure INDETERMINATE branch does assert positively (:148). A positive assertion on the connect_failed branch would match AC-3's 'explicitly distinguishes' wording more tightly.",
    "AC-7 nit: tests assert result.exitCode === EXIT_CODES.X rather than the literals 0/0/1/2. If EXIT_CODES were edited to wrong values every test would still pass. The code defines them correctly today; only the assertion is indirect.",
    "TR-1 says 'adds exactly one new file'. The branch also adds 3 lines to .gitignore (an un-ignore negation for scripts/verify-quick-fixes-metadata-activation.mjs, required because scripts/verify-* is ignored). Necessary plumbing, not scope creep -- noted for completeness."
  ],
  recommendations: [
    'Ship. The one substantive finding (V-F1) is a wording-vs-behaviour mismatch on a path that cannot execute until the chairman-gated migration lands, and the cheaper of the two fixes is a header/PRD text edit.',
    'If the read-back is added instead: ~6 lines inside the column-present branch, reusing the raw pg client from dbClientFactory, asserting the last claim_history entry carries pick_reason. That would make ACTIVATED mean what both the FR and the header already say it means.',
    'Create the PR before LEAD-FINAL so V-F2 (fs.existsSync on main) closes; GATE_ACTIVATION_INVARIANT file-exists precondition for -E only becomes true after merge.'
  ],
  detailed_analysis: {
    task: 'PLAN-TO-LEAD (VERIFY) PRD-to-implementation fidelity check for SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F. Scope: does the code do what the PRD says. Explicitly NOT a re-run of TESTING (evidence fae98c81) or SECURITY (evidence e101d1c5).',
    evaluated_commit_sha: SHA,
    worktree: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F',
    files_read: [
      'scripts/verify-quick-fixes-metadata-activation.mjs (217 lines, full)',
      'tests/unit/fleet/verify-quick-fixes-metadata-activation.test.js (178 lines, full)',
      'lib/fleet/claim-stamp.cjs:90-170 (stampClaim signature + QF branch)',
      'lib/fleet/qf-metadata-merge.mjs (71 lines, full)',
      'lib/fleet/belt-depth.cjs:210-230 (fetchAutoStartCandidateRows)'
    ],
    acceptance_criteria_verification: [
      { ac: 'AC-1', verdict: 'PASS', measured: "Ran the script live against production from the worktree: printed 'NOT_YET_APPLIED: quick_fixes.metadata does not exist yet (chairman-gated migration unapplied). Zero writes made.', exit code 0. Zero writes confirmed two ways: resolveActivationState returns at :104-106 BEFORE insertScratchQfFn is ever reached, and a direct raw-pg query of quick_fixes WHERE id LIKE 'QF-VERIFYACT%' returned 0 rows (no orphans from this or any prior run)." },
      { ac: 'AC-2', verdict: 'PASS', measured: "Tests :57-68 inject mergeQfMetadataFn -> {merged:true} => ACTIVATED; :70-82 inject {merged:false, reason:'cas_lost'} => REGRESSED with detail matching /cas_lost/. Both go through resolveActivationState's DI seam with fakePresentDb; no real connection, no schema mutation. 14/14 tests pass (vitest 4.1.4, 429ms)." },
      { ac: 'AC-3', verdict: 'PASS (weak assertion)', measured: "Test :97-109 injects {merged:false, reason:'connect_failed'}, asserts state INDETERMINATE and exitCode 2. Code :146 emits '-- environmental/transient, not a code defect.' vs REGRESSED's :151 '-- a real defect in the chain.' The distinguishing text exists in the code; the test asserts it only via not.toMatch(/real defect/). See warnings." },
      { ac: 'AC-4', verdict: 'PASS', measured: "buildScratchQfInsertPayload (:179-190) sets status:'in_progress' and claiming_session_id at insert time. Verified the belt predicate is quoted ACCURATELY: lib/fleet/belt-depth.cjs:227 is .eq(status,open).is(pr_url,null).is(commit_sha,null).is(claiming_session_id,null) -- the payload fails it on TWO independent legs. Also verified the payload is genuinely insertable (not dead-by-construction): against the live engineer DB, type=bug passes quick_fixes_type_check, severity=low passes quick_fixes_severity_check, status=in_progress passes quick_fixes_status_check, the only other NOT NULL columns (factory_lane, force_completed) both default to false, and I ran the target_application trigger's OWN EXISTS predicate for 'EHG_Engineer' -> true (active row in public.applications)." },
      { ac: 'AC-5', verdict: 'PASS', measured: 'QF_ID_RE at lib/fleet/claim-stamp.cjs:96 is literally /^QF-/, tested at :126 to route to the QF branch. Default scratchIdFn (:96) yields QF-VERIFYACT-<pid>-<base36>.toUpperCase(), which matches. Test :117-125 asserts the id the stampClaimFn actually RECEIVES matches /^QF-/, so the generator and the routing regex are checked against the same value.' },
      { ac: 'AC-6', verdict: 'PASS', measured: 'The whole probe body is try{...}finally{...} (:120-167); deleteScratchQfFn runs in the finally. Test :169-177 proves cleanup runs when stampClaimFn throws (deleted===true while the call rejects). Test :138-152 proves it also runs when the INSERT itself failed (harmless no-op delete).' },
      { ac: 'AC-7', verdict: 'PASS (indirect assertion)', measured: 'EXIT_CODES (:51) = {NOT_YET_APPLIED:0, ACTIVATED:0, REGRESSED:1, INDETERMINATE:2} -- exactly as AC-7 specifies. All four branches assert exitCode via the classify function return value (:52,:67,:80,:94,:107,:114,:147). Tests compare to the EXIT_CODES constants rather than literals; see warnings.' }
    ],
    fr2_verification: {
      method: 'Direct supabase query of product_requirements_v2 where directive_id=SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E -- not trusting any prior claim.',
      row: 'PRD-SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (sd_id dfdad20c-bf37-47ef-8588-0ebd82cfb874)',
      activation_test_id: 'scripts/verify-quick-fixes-metadata-activation.mjs',
      exact_path_match: true,
      e_sd_status: 'completed (so GATE_ACTIVATION_INVARIANT does not re-evaluate -- the documentary-repair framing is accurate)',
      fs_exists_from_repo_root: false,
      fs_exists_in_worktree: true,
      note: 'FR-2 AC satisfied. TS-4 additionally requires existsSync from repo root; false until the branch merges (see condition V-F2).'
    },
    fr2_language_audit: {
      method: 'Grepped the full PRD row (all fields) plus all three commit messages for the forbidden terms re-gated / re-gate / bypass closure / closed / re-verified / "reads or consumes".',
      finding: "No violation. Every hit is either the AC text quoting the forbidden words, or SECURITY findings being described as 'SEC-F1 CLOSED / SEC-F2 CLOSED / re-verified' -- which refer to the security findings, NOT to the ACTIV-CHAIN-DEFERRED bypass. The PRD states affirmatively: 'This is a DOCUMENTARY REPAIR of -E record, not a re-gate'.",
      fr2_ac3: 'No text claims any downstream code reads quick_fixes.metadata today.'
    },
    fr3_verification: {
      verdict: 'PASS',
      measured: "Script header :11-17 is a RUNBOOK block naming the exact command 'node scripts/verify-quick-fixes-metadata-activation.mjs' and giving plain-language meanings for all four states: ACTIVATED = migration + chain genuinely live; REGRESSED = column exists but chain broken, a real defect, file it; INDETERMINATE = connection/environmental, retry, not a code defect; NOT_YET_APPLIED = migration has not landed. Exceeds the AC (which asked only for ACTIVATED vs REGRESSED).",
      caveat: "The ACTIVATED sentence says 'writes and reads back' -- see V-F1."
    },
    signature_fidelity: {
      why: 'The unit tests inject a FAKE stampClaimFn, so a real-signature mismatch would be invisible to them and would only surface post-migration in front of the chairman. Checked directly.',
      real_signature: 'stampClaim(supabase, sdRef, sessionId, identitySource, mergeMetadataKeysFn = null, opts = {}) at lib/fleet/claim-stamp.cjs:124',
      script_call: "stampClaimFn({}, qfId, sessionId, 'verify-activation-probe', null, { mergeQfMetadataFn: wrappedMergeFn }) at script :134",
      verdict: 'MATCHES exactly. supabase={} is truthy so it clears the !supabase guard, and the QF branch never dereferences it. opts.mergeQfMetadataFn IS the real injection seam (resolveQfMergeFn, claim-stamp.cjs:101-105/:135). mergeQfMetadataKeys(qfId, sessionId, entry) -> {merged, reason} matches the wrapper 3-arg delegation and the reason vocabulary (column_absent|cas_lost|connect_failed|error) the script branches on.'
    },
    duplicate_check: {
      verdict: 'NO DUPLICATE',
      method: 'grep -rl for quick_fixes.metadata|mergeQfMetadataKeys across scripts/, lib/, tests/; ls of scripts/verify-*activation* and scripts/one-off/*activation*; grep for resolveActivationState repo-wide.',
      touching_the_column: ['lib/fleet/claim-stamp.cjs (the -E writer under test)', 'lib/fleet/qf-metadata-merge.mjs (the -E merge under test)', 'tests/unit/fleet/qf-metadata-merge.test.js (-E unit coverage)', 'scripts/qf-start.js', 'two one-off feedback-table scripts (unrelated)'],
      other_activation_verifiers: 'scripts/one-off/verify-sourcing-activation-reconciler-live.mjs is the named PRECEDENT and verifies a different subject (sourcing reconciler). No script verifies the quick_fixes.metadata activation invariant. resolveActivationState is defined nowhere else.'
    },
    scope_creep_check: 'Diff vs main is exactly 3 files / +398 lines: the script (217), its test (178), and a 3-line .gitignore un-ignore negation. No production code and no migration touched, matching TR-1. lib/fleet/claim-stamp.cjs and lib/fleet/qf-metadata-merge.mjs are UNCHANGED on this branch.',
    not_rerun: 'Deliberately did not re-audit code quality, injection surface, RLS, or test rigour -- those are TESTING (fae98c81, PASS 90) and SECURITY (e101d1c5) verdicts. Where I touched their findings it was only to confirm the FIX matches the PRD text that now describes it (target_application present in the exported builder; cleanup error surfaced in result.detail).',
    verdict_rationale: 'CONDITIONAL_PASS, not PASS: every enumerated AC holds under independent measurement, but FR-1 description and the chairman-facing runbook header both assert a read-back that the implementation does not perform. For a tool whose only product is a trustworthy verdict, an ACTIVATED that has not actually read the persisted row is an overclaim -- the same class of gap FR-2 AC-3 was written to prevent. Not a FAIL because no acceptance criterion requires read-back, the path is unreachable until the gated migration lands, and the remedy can be a text edit.'
  },
  metrics: {
    acceptance_criteria_verified: 7,
    acceptance_criteria_passed: 7,
    functional_requirements_verified: 3,
    fidelity_gaps_found: 1,
    duplicates_found: 0,
    unit_tests_passing: 14,
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

results.metadata = { ...(results.metadata || {}), evaluated_commit_sha: SHA };

const stored = await storeSubAgentResults('VALIDATION', SD_UUID, null, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
console.log('STORED_ID=', stored.id, '| verdict=', results.verdict);
