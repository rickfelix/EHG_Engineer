/**
 * Quick-Fix Completion Orchestrator
 * Part of quick-fix modularization
 *
 * Main orchestration logic for completing quick-fixes.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
// Reuse the SAME redaction the coordination channel already applies, rather than rolling a second
// set of patterns that would drift from it (lib/shared/body-cap.cjs is CJS, hence createRequire).
const { redact, capBodySafe, BODY_HARD_CAP } = createRequire(import.meta.url)('../../../lib/shared/body-cap.cjs');
import { restartLeoStack } from '../../../lib/server-manager.js';
import { runSelfVerification } from '../../../lib/quickfix-self-verifier.js';
import {
  captureConsoleErrorsAfterFix,
  generateEvidenceSummary
} from '../../../lib/utils/quickfix-evidence-capture.js';
import fs from 'fs';
import os from 'os';

import { REPO_PATHS, EHG_ROOT } from './constants.js';
import { runTests, runTypeScriptCheck, displayTestResults } from './test-runner.js';
import { autoDetectGitInfo, analyzeGitDiff, commitAndPushChanges, mergeToMain, resolveQFWorktreeFromCwd, isDocsOnlyDiff, canSkipTestGate, reconcileDeclaredTypeVsFiles, touchesFrontend, getScopedUnitTestFiles, isEmptyDiff, buildRateLimitHint } from './git-operations.js';
// SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001: merge-verification witness so a
// quick_fixes row cannot reach status=completed while its change is absent from origin/main.
import { verifyQFMergeWitness } from './merge-witness.js';
import {
  validateLOC,
  validateTests,
  validateTypeScript,
  validateUAT,
  validatePR,
  verifyTestCoverage,
  validateSelfVerification,
  validateCompliance
} from './verification.js';
import { runComplianceWithRefinement } from './compliance-loop.js';
import { prompt, displayCompletionSummary } from './cli.js';
import { resolveFeedback, parseAndExpandFeedbackFooters } from '../../../lib/governance/resolve-feedback.js';
import { recordSdCompleted, recordQfCompleted } from '../../../lib/learning/outcome-tracker.js';
import { checkResolverFreshness, logResolverFreshnessBanner } from '../../../lib/governance/check-resolver-freshness.js';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * SD-REFILL-00QQ60BN: build the quick_fixes UPDATE payload for the already-MERGED reconcile path.
 * The completed_requires_verification CHECK requires (tests_passing AND uat_verified) OR
 * force_completed for status='completed'. A QF whose verification columns were never stamped
 * pre-merge would otherwise fail this update forever ("Could not reconcile QF record (non-fatal)"
 * on every re-run; QF stuck in_progress with a merged PR). A merged PR is the CI witness, so
 * tests_passing=true is justified; UAT does not run in this reconcile path, so the CHECK is
 * satisfied via force_completed=true + an appended audit note rather than fabricating uat_verified.
 * Pure: no DB/clock access — the caller passes nowIso.
 * @param {{ qf?:object, prUrl:string, mergeSha?:string|null, nowIso:string }} args
 * @returns {object} the UPDATE payload
 */
/**
 * SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-2 — pull the WITNESS NAME out of a
 * --scope-accepted value so verified_by holds an identity rather than a paragraph.
 *
 * verified_by is TEXT and every existing writer puts a short identity in it ('EXEC',
 * 'ORPHAN_REAPER', 'FORCE_COMPLETE'). --scope-accepted is written as "<who> — <why>", where the
 * why can run to hundreds of words. Storing the whole attestation would make the column unreadable
 * at a glance, which defeats the point: FR-2 exists so a thin stamp's witness is VISIBLE in the
 * row, not so the row carries more prose. The full attestation still lands in verification_notes.
 *
 * Falls back to the trimmed whole string when there is no separator, and caps length so a caller
 * who ignores the convention still yields something readable rather than a wall of text.
 * @param {string|null} scopeAcceptedBy
 * @returns {string|null}
 */
export function witnessNameFrom(scopeAcceptedBy) {
  if (!scopeAcceptedBy || typeof scopeAcceptedBy !== 'string') return null;
  const trimmed = scopeAcceptedBy.trim();
  if (!trimmed) return null;
  // em-dash is the documented convention; hyphen-with-spaces accepted so a caller who cannot type
  // an em-dash is not silently degraded to storing the entire attestation.
  const head = trimmed.split(/\s+(?:—|--|-)\s+/)[0].trim();
  const name = head || trimmed;
  return name.length > 120 ? `${name.slice(0, 117)}...` : name;
}

/**
 * SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-2, second writer — build the verified_by stamp
 * for the direct completion path.
 *
 * EXTRACTED FROM AN INLINE IIFE SO IT CAN BE ASSERTED, and that is the whole point of this change:
 * the behaviour was already shipped but UNPINNED, and unpinned in the specific way that hides a
 * regression. The only test naming FORCE_COMPLETE asserts FORCE_COMPLETE_NO_REASON — a different
 * thing — so nothing covered this value. Worse, the fallback makes the gap invisible: under test
 * CLAUDE_SESSION_ID is unset and no --scope-accepted is passed, so `who` is null and the function
 * returns the bare mode label. A test written against the live behaviour would therefore have
 * observed EXACTLY the pre-FR-2 output and passed, certifying the old behaviour while the
 * improvement went unexercised. Reverting the identity logic entirely would not have failed a
 * single test.
 *
 * Pure by construction — sessionId is a PARAMETER, not a process.env read — because a function that
 * reaches for ambient state can only be tested by mutating the environment, and the branch that
 * matters here is precisely the one ambient state suppresses.
 *
 * BEHAVIOUR IS UNCHANGED, deliberately: same precedence (explicit scope-accepter, then the operator
 * session, then neither), same `<who> (<MODE>)` shape, same bare-mode fallback. The mode is kept as
 * a suffix so anything classifying rows on these literals keeps the distinction it relied on.
 *
 * @param {{forceComplete?: boolean, scopeAcceptedBy?: string|null, sessionId?: string|null}} args
 * @returns {string} never null — a close is always attributable to at least its mode
 */
export function completionModeStamp({ forceComplete = false, scopeAcceptedBy = null, sessionId = null } = {}) {
  const mode = forceComplete ? 'FORCE_COMPLETE' : 'UAT_AGENT';
  const who = witnessNameFrom(scopeAcceptedBy) || sessionId || null;
  return who ? `${who} (${mode})` : mode;
}

/**
 * Bridge the CLI options object to completionModeStamp, and pin the property NAME.
 *
 * THIS EXISTS BECAUSE THE NAME WAS WRONG IN SHIPPED CODE. FR-2 read `options.scopeAcceptedBy`
 * while cli.js has always produced `options.scopeAccepted`, so the value was permanently
 * `undefined` and the documented precedence — prefer the scope-accepter over the operator session
 * — COULD NEVER FIRE. It degraded silently to the session id, which looks like a working stamp.
 *
 * The FR-2 pins did not catch it because they call completionModeStamp DIRECTLY with explicit
 * arguments: the function was correct, the CALL SITE handed it the wrong key. Unit verified,
 * consumer not. Routing both call sites through one exported bridge makes the option name an
 * executable contract that a test can drive with a REAL parsed-argv options object, instead of a
 * spelling that has to be re-checked by eye at every call site.
 *
 * @param {object} options - the options object built by cli.js
 * @param {string|null} sessionId
 * @returns {string}
 */
export function completionStampFromOptions(options = {}, sessionId = null) {
  return completionModeStamp({
    forceComplete: options.forceComplete,
    scopeAcceptedBy: options.scopeAccepted,
    sessionId
  });
}

/**
 * SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-1 — build the runtime_observation value.
 *
 * WHAT THIS IS FOR. commit_sha and pr_url already witness that CODE LANDED. This SD exists because
 * landing is not running, so FR-1 wants one observation of the RUNNING system at close time. The
 * shape is fixed by precedent, not invented here: Adam recorded the first real observation on
 * QF-20260725-096 using {observed_at, method, observation, declared_by}, so this conforms to what
 * is already in the column rather than introducing a second dialect one table over — which is the
 * exact collision that ruled out compliance_details as a home in the first place.
 *
 * ABSENCE IS RECORDED, NOT LEFT BLANK. When nothing is declared, this returns an explicit
 * `declared: false` record instead of null. That is the FR-1 acceptance criterion verbatim: the
 * absence must be explicit "so silence is distinguishable from not applicable". A null column
 * cannot carry that distinction — it reads identically whether nobody looked, nobody thought to
 * look, or looking was genuinely irrelevant.
 *
 * THE HONEST LIMITATION, kept next to the code rather than in a doc nobody opens: the FR-1 trigger
 * is worker-DECLARED, not detected. Nothing on quick_fixes can decide "this row's acceptance
 * depends on runtime behaviour" — the LEAD survey looked and found no mechanical discriminator. So
 * `declared: false` means NOBODY DECLARED ONE. It is not evidence that none was needed, and must
 * never be read as an all-clear.
 *
 * NEVER CLOBBERS. An existing observation is returned untouched. Re-running a completion must not
 * overwrite a probe someone actually performed with a fresh "nobody declared one" — that would
 * destroy real evidence to record its absence, which is worse than either outcome alone.
 *
 * Pure: the caller passes nowIso and the identity. No clock, no env, no DB.
 *
 * @param {{existing?: object|null, observation?: string|null, method?: string|null,
 *          declaredBy?: string|null, nowIso: string}} args
 * @returns {object} always an object — the column is never left silently empty by this path
 */
export function buildRuntimeObservation({ existing = null, observation = null, method = null, declaredBy = null, nowIso }) {
  // Real evidence already on the row wins over anything this close would write.
  if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) return existing;

  // SECURITY S3 — REDACT AND CAP. This field is the WORSE one to leave raw, not the safer one: its
  // own column comment and method vocabulary (http_probe, log_grep) actively invite pasting request
  // /response and log text, which is exactly where bearer tokens and signed URLs live. The one real
  // observation in the column is literal HTTP probe output. worker-signal.cjs already routes its
  // bodies through the same helper; leaving this path raw was an ASYMMETRY, not a considered choice.
  // capBody() redacts internally and THROWS over the cap; capBodySafe() adapts that to a
  // {value, error} tuple. Neither TRUNCATES — and dropping an over-long observation would leave
  // this function recording declared:false, manufacturing the exact false absence FR-1 exists to
  // stop. So an over-cap observation is truncated and SAID SO in the stored text, rather than
  // silently becoming an absence.
  const raw = typeof observation === 'string' ? observation.trim() : '';
  const capped = raw ? capBodySafe(raw) : { value: '', error: null };
  const text = capped.error
    ? `${redact(raw).slice(0, BODY_HARD_CAP - 60)} … [TRUNCATED at ${BODY_HARD_CAP} chars]`
    : (capped.value || '');
  if (!text) {
    return {
      declared: false,
      observed_at: nowIso,
      declared_by: declaredBy || null,
      note: 'No runtime observation declared at close. The FR-1 trigger is worker-DECLARED, not detected — nothing on quick_fixes can decide whether acceptance depends on runtime behaviour. So this records that NOBODY DECLARED ONE; it is not evidence that none was applicable.'
    };
  }
  return {
    observed_at: nowIso,
    method: (typeof method === 'string' && method.trim()) || 'declared',
    observation: text,
    declared_by: declaredBy || null
  };
}

/**
 * QF-20260727-731 — the merged-reconcile path SILENTLY DROPPED --uat-verified and --actual-loc.
 *
 * The payload carried neither key, so both values vanished while the CLI exited success: the row
 * read uat_verified=false, actual_loc=null, and that is INDISTINGUISHABLE from never having passed
 * them. Reported independently from two separate closures (QF-20260726-575, QF-20260726-222), which
 * is what makes it a pattern rather than an anecdote.
 *
 * THE TWO FLAGS GET DIFFERENT TREATMENT, deliberately, because they are different KINDS of thing.
 *
 * --actual-loc is HONOURED. It is a measurement carrying no truth claim about verification, so
 * dropping it only lost data. Same for its source/test siblings.
 *
 * --uat-verified is REFUSED LOUDLY. UAT provably does not run on this path — that is the whole
 * reason force_completed carries the completed_requires_verification CHECK here rather than
 * fabricating uat_verified (see the rationale below). Honouring a BARE BOOLEAN would write an
 * anonymous truth claim that UAT ran, on a path where it did not, with nobody named. --scope-accepted
 * is the attestation mechanism on this path precisely because it names a witness; --uat-verified
 * cannot, so it is rejected with a message that says where to go instead.
 *
 * Refusing is not a workaround for the drop: silence was the defect. A caller now learns
 * immediately, instead of reading the row later and finding their input gone.
 *
 * @throws {Error} UAT_VERIFIED_UNSUPPORTED_ON_RECONCILE when --uat-verified is passed here
 */
export function assertReconcileFlagsSupported(options = {}) {
  if (options.uatVerified === undefined) return;
  const err = new Error(
    '[UAT_VERIFIED_UNSUPPORTED_ON_RECONCILE] --uat-verified is not honoured on the already-MERGED ' +
    'reconcile path: UAT does not re-run here, so the flag would assert that it did. This path sets ' +
    'force_completed=true instead, which satisfies the completed_requires_verification CHECK without ' +
    'claiming a UAT that never ran. To attest on this path use --scope-accepted "<who> — <why>", ' +
    'which records a NAMED witness. Re-run without --uat-verified.'
  );
  err.code = 'UAT_VERIFIED_UNSUPPORTED_ON_RECONCILE';
  throw err;
}

export function buildMergedReconcileUpdate({ qf = {}, prUrl, mergeSha = null, nowIso, scopeAcceptedBy = null, runtimeObservation = null, observationMethod = null, options = {} }) {
  // Accept the CLI options object as a FALLBACK source for the FR-1 fields, not only explicit
  // args. Two named params were declared here and the sole production call site passed NEITHER, so
  // the feature was dead on this path while the unit tests passed — they supplied the args by hand,
  // reproducing in the test the exact plumbing production omitted. Reading from `options` means the
  // only way to break it again is to drop `options` entirely, which also breaks scopeAcceptedBy and
  // fails loudly instead of silently recording a false absence.
  const declaredObservation = runtimeObservation ?? options.runtimeObservation ?? null;
  const declaredMethod = observationMethod ?? options.observationMethod ?? null;
  // QF-20260725-691: a merged PR witnesses that CODE LANDED. Terminal `completed` asserts that
  // the QF's SCOPE WAS SATISFIED. Those are different propositions and this path used to
  // substitute one for the other silently — invisible precisely because the merge really did
  // happen. Demonstrated by QF-20260725-638: it named two surfaces, one shipped, it reached
  // completed anyway, and the remainder had to be re-filed as QF-20260725-639.
  //
  // So the merge witness alone now lands NON-TERMINAL: it records the true fact (this PR merged)
  // without asserting the false one. Terminal `completed` requires an explicit scope attestation
  // (--scope-accepted). No status-CHECK widening: 'in_progress' is already in the enum
  // ('open','in_progress','completed','escalated'), so this needs no migration.
  const merged = `PR ${prUrl} MERGED and reachable from origin/main${mergeSha ? ` (${mergeSha})` : ''}`;
  if (!scopeAcceptedBy) {
    const witnessNote = `${merged} — merge witnessed, SCOPE ACCEPTANCE OUTSTANDING (QF-20260725-691: a merged PR proves code landed, not that this QF's scope is satisfied; UAT not re-run in the reconcile path). Attest with: node scripts/complete-quick-fix.js ${qf.id || '<QF>'} --pr-url ${prUrl} --scope-accepted "<who/why>".`;
    return {
      status: 'in_progress',
      pr_url: prUrl,
      commit_sha: mergeSha,
      // The merge IS a genuine CI witness — that part was never the lie.
      tests_passing: true,
      verification_notes: [qf.verification_notes, witnessNote].filter(Boolean).join(' | '),
      // QF-20260711-176 preserved: an unheld QF must not pin worktree reaping. The row is left
      // discoverable rather than closed, which is the point — it is NOT finished.
      claiming_session_id: null
    };
  }
  const reconcileNote = `${merged}; SCOPE ACCEPTED by ${scopeAcceptedBy} (QF-20260725-691 attestation; UAT not re-run in reconcile path).`;
  const verification_notes = [qf.verification_notes, reconcileNote].filter(Boolean).join(' | ');
  return {
    status: 'completed',
    pr_url: prUrl,
    commit_sha: mergeSha,
    tests_passing: true,
    // The completed_requires_verification CHECK wants (tests_passing AND uat_verified) OR
    // force_completed. UAT genuinely did not re-run here, so force_completed carries it rather
    // than fabricating uat_verified — unchanged from SD-REFILL-00QQ60BN.
    force_completed: true,
    // SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-2. This path wrote force_completed=true with
    // uat_verified left false and verified_by OMITTED ENTIRELY, so the row asserted a close with
    // nobody attached to it. Measured across the table: 392 of 629 force-completed rows carry
    // uat_verified=false AND verified_by=null — 62 percent, the majority pattern, not an exception.
    //
    // The fix is nearly free because the witness was ALREADY IN SCOPE: --scope-accepted is mandatory
    // to reach this terminal branch at all, so a name exists at the moment the row is written and was
    // simply not carried across. Defaulting to already-captured data instead of adding a prompt is
    // deliberate — a field nobody has to fill is a field that stays accurate.
    //
    // The point is VISIBILITY, not blocking. FR-2 does not stop a thin close; it stops a thin close
    // being ANONYMOUS. "accepted on merge evidence alone" is a legitimate value here; nothing at all
    // is not, because an empty witness is indistinguishable from a close nobody thought about.
    verified_by: witnessNameFrom(scopeAcceptedBy),
    // SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-1. Written on EVERY terminal close, including
    // when nothing was declared — an explicit `declared: false` record, never a silent null, so a
    // later reader can tell "nobody declared one" from "not applicable". Existing evidence wins.
    runtime_observation: buildRuntimeObservation({
      existing: qf.runtime_observation,
      observation: declaredObservation,
      method: declaredMethod,
      declaredBy: witnessNameFrom(scopeAcceptedBy),
      nowIso
    }),
    // QF-20260727-731: honour the LOC measurements. They carry no truth claim about
    // verification, so dropping them only lost data. Omitted keys are left absent rather than
    // written as null, so a re-run without the flag cannot ERASE a value recorded earlier.
    ...(options.actualLoc       !== undefined ? { actual_loc: options.actualLoc } : {}),
    ...(options.actualSourceLoc !== undefined ? { actual_source_loc: options.actualSourceLoc } : {}),
    ...(options.actualTestLoc   !== undefined ? { actual_test_loc: options.actualTestLoc } : {}),
    verification_notes,
    completed_at: qf.completed_at || nowIso,
    // QF-20260711-176: a completed QF has no holder. Leaving claiming_session_id set made the
    // live-claim-guard permanently block worktree reaping (claimed_claimant_not_verifiably_alive)
    // until the pool drained to WORKTREE_CREATE_FAILED (coordinator evidence 5655cb68).
    claiming_session_id: null
  };
}

/**
 * Main orchestration function for completing quick-fixes
 * @param {string} qfId - Quick-fix ID
 * @param {object} options - Completion options
 * @returns {Promise<object>} Completed quick-fix record
 */
export async function completeQuickFix(qfId, options = {}) {
  console.log(`\n✅ Completing Quick-Fix: ${qfId}\n`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  // Service-role required: resolveLinkedFeedbackRows performs cross-row SELECT/UPDATE
  // on feedback rows whose table policy blocks anon-tier access. Empirically validated
  // in PR #3697 — anon-tier client returns zero matches for rows service-role sees.
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    console.log('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // QF-20260529-852 (RCA c6a002d5): disable the auth background-refresh setInterval and
  // session persistence on this short-lived service-role CLI client. Service-role keys do
  // not expire, so there is nothing to refresh — and the default auto-refresh timer is the
  // handle that kept the event loop alive after the completion write, hanging the process
  // to the external ~2-min timeout. With it off, the loop drains naturally for a clean exit.
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // QF-20260511-258: Stale-branch guard for the post-merge feedback auto-resolver.
  // If origin/main has commits touching resolver paths that the worker's HEAD
  // doesn't yet have, refuse to proceed unless --allow-stale-branch is set.
  // Closes the QF-205 recurrence class (worker forked before resolver fixes merged).
  const freshness = checkResolverFreshness(process.cwd());
  if (freshness.stale) {
    const bypass = { allowed: !!options.allowStaleBranch, reason: options.allowStaleBranchReason };
    logResolverFreshnessBanner(freshness, bypass);
    if (!bypass.allowed) {
      process.exit(1);
    }
  }

  // Fetch quick-fix record
  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .single();

  if (error || !qf) {
    console.log(`❌ Quick-fix not found: ${qfId}`);
    process.exit(1);
  }

  // Determine test directory from target_application
  const targetApplication = qf.target_application || 'EHG';
  let testDir = REPO_PATHS[targetApplication] || EHG_ROOT;

  const cwdWorktree = resolveQFWorktreeFromCwd(qfId);
  if (cwdWorktree && cwdWorktree !== testDir) {
    console.log(`📂 Auto-detected QF worktree CWD; overriding Test Dir from ${testDir} → ${cwdWorktree}`);
    testDir = cwdWorktree;
  }

  console.log(`📋 Quick-Fix: ${qf.title}`);
  console.log(`   Type: ${qf.type}`);
  console.log(`   Target App: ${targetApplication}`);
  console.log(`   Test Dir: ${testDir}`);
  console.log(`   Status: ${qf.status}\n`);

  // Already completed?
  if (qf.status === 'completed') {
    console.log(`✅ Already completed at ${new Date(qf.completed_at).toLocaleString()}`);
    return qf;
  }

  // Escalated?
  if (qf.status === 'escalated') {
    console.log('⚠️  This issue was escalated to a full SD');
    console.log(`   Reason: ${qf.escalation_reason}`);
    return qf;
  }

  // SD-FDBK-INFRA-RCA-FIRST-HARD-001 (FR-4) + SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001 (FR-3):
  // early already-MERGED reconcile probe, now GATED by the merge-verification witness. A /checkin
  // re-run on a QF whose OWN qf/<QF-ID> branch is merged + on origin/main short-circuits to a fast
  // idempotent completion. Crucially the witness self-derives the PR from the QF's own branch and
  // requires headRefName === qf/<QF-ID> — so an arbitrary / most-recent / FOREIGN merged pr_url
  // (the QF-20260701-989 / #5290 mis-attribution) no longer reconciles the QF to completed. Bounded
  // (fetchPRMetadata / gh via EXTERNAL_STEP_TIMEOUT_MS) and fail-closed: any failure or an
  // unverified witness falls through to the normal pipeline and never false-completes.
  try {
    const probeWitness = verifyQFMergeWitness({ qfId, prUrl: options.prUrl || qf.pr_url, testDir });
    if (probeWitness.verified) {
      const mergeSha = probeWitness.mergeSha || qf.commit_sha || null;
      // QF-20260725-691: the witness proves the PR merged, not that scope was satisfied. Without
      // an explicit --scope-accepted attestation this records the merge and leaves the QF OPEN.
      const scopeAcceptedBy = options.scopeAccepted || null;
      if (scopeAcceptedBy) {
        console.log(`\n✅ QF own PR ${probeWitness.prUrl} (head ${probeWitness.headBranch}) is MERGED + reachable from origin/main, and SCOPE ACCEPTED by ${scopeAcceptedBy} — completing ${qfId}.\n`);
      } else {
        console.log(`\n📌 QF own PR ${probeWitness.prUrl} (head ${probeWitness.headBranch}) is MERGED + reachable from origin/main.`);
        console.log(`   Recording the merge and leaving ${qfId} IN_PROGRESS — a merged PR proves the code landed, NOT that this QF's scope is satisfied (QF-20260725-691).`);
        console.log('   Re-read the QF\'s stated scope. If every named surface is genuinely done, attest it:');
        console.log(`     node scripts/complete-quick-fix.js ${qfId} --pr-url ${probeWitness.prUrl} --scope-accepted "<who/why>"`);
        console.log('   If only part shipped, file the remainder rather than closing this row.\n');
      }
      // SD-REFILL-00QQ60BN: preserve the verification-column stamping the
      // completed_requires_verification CHECK demands, now with the SELF-DERIVED pr_url.
      // QF-20260727-731: refuse BEFORE building, so the caller never gets a success exit with
      // their input discarded. Silence was the defect; a loud failure is the fix.
      assertReconcileFlagsSupported(options);
      const reconcileUpdate = buildMergedReconcileUpdate({
        qf, prUrl: probeWitness.prUrl, mergeSha, nowIso: new Date().toISOString(), scopeAcceptedBy,
        // THIS LINE WAS MISSING AND IT MATTERED. Without it a real --runtime-observation was
        // dropped here and the row recorded declared:false — a MANUFACTURED FALSE ABSENCE over an
        // operator's actual declaration, which the never-clobber guard then made permanent. Worse
        // than a null: FR-1 exists so absence is honest, and this asserted absence that was false.
        options
      });
      const { error: reconcileErr } = await supabase
        .from('quick_fixes')
        .update(reconcileUpdate)
        .eq('id', qfId)
        .neq('status', 'completed');
      if (reconcileErr) {
        console.log(`   ⚠️  Could not reconcile QF record (non-fatal): ${reconcileErr.message}`);
      }
      return { ...qf, ...reconcileUpdate };
    }
  } catch (e) {
    console.log(`   ℹ️  Already-merged witness probe skipped (will run normal pipeline): ${e.message}`);
  }

  // Auto-detect git info. autoDetectGitInfo NOW throws on PR-metadata failure
  // and on refuse-to-auto-detect-outside-QF-worktree (SD-LEO-FIX-COMPLETE-QUICK-FIX-001).
  // Surface the operator-readable message without the Node stack trace.
  let gitInfo;
  try {
    gitInfo = autoDetectGitInfo(testDir, options);
  } catch (e) {
    console.error(`\n❌ ${e.message}\n`);
    // QF-20260706-282: on a gh GraphQL rate-limit failure, print the exact manual-completion
    // invocation pre-filled with locally-derivable values, instead of every worker re-deriving
    // --commit-sha/--branch-name from first principles.
    const hint = buildRateLimitHint(e.message, qfId, testDir);
    if (hint) console.error(`💡 gh rate-limited. Manual completion:\n   ${hint}\n`);
    process.exit(1);
  }
  let { commitSha, branchName, actualLoc, actualSourceLoc, actualTestLoc, sourceDeletionLoc } = gitInfo;

  // SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001:
  //   - Operator can override source/test split via --actual-source-loc / --actual-test-loc
  //   - Backward-compat: --actual-loc still accepted (treated as source; test=0)
  if (options.actualSourceLoc !== undefined) actualSourceLoc = options.actualSourceLoc;
  if (options.actualTestLoc !== undefined) actualTestLoc = options.actualTestLoc;
  if (actualSourceLoc === undefined && actualTestLoc === undefined && actualLoc !== undefined) {
    actualSourceLoc = actualLoc;
    actualTestLoc = 0;
  }

  // Manual input if not provided
  if (actualLoc === undefined && actualSourceLoc === undefined) {
    const locStr = await prompt('Actual lines of code changed: ');
    actualLoc = parseInt(locStr);
    actualSourceLoc = actualLoc;
    actualTestLoc = 0;
  }

  // Compute totals for legacy single-column write + cap policy
  if (actualSourceLoc === undefined) actualSourceLoc = 0;
  if (actualTestLoc === undefined) actualTestLoc = 0;
  if (actualLoc === undefined) actualLoc = actualSourceLoc + actualTestLoc;

  // LOC validation — source-only cap; --force-complete bypasses
  const locValid = await validateLOC(actualSourceLoc, actualTestLoc, qfId, supabase, prompt, {
    forceComplete: options.forceComplete,
    reason: options.reason,
    overCapReason: options.overCapReason,
    // SD-FDBK-ENH-COMPLETE-QUICK-FIX-002: thread pure-deletion LOC so the cap is net-aware
    sourceDeletionLoc,
    // SD-FDBK-FIX-COMPLETE-QUICK-FIX-001: thread non-interactive so the escalate prompt fails-fast
    nonInteractive: options.nonInteractive
  });
  if (!locValid) {
    process.exit(1);
  }

  // QF-20260511-365 / feedback 869f7cf3: hoist analyzeGitDiff above the test-run
  // block so docs-only QFs can skip the unit+e2e suite (otherwise the gate
  // re-surfaces pre-existing baseline failures unrelated to the QF on every ship,
  // burning a bypass-quota slot per ship). Original hoist site (closer to
  // createAutoPR) is preserved as a no-op reference; filesChanged/diffAnalysis
  // are now computed once here and reused later in the PR-acquisition block.
  const { filesChanged, diffAnalysis } = analyzeGitDiff(testDir, qf.description);
  const docsOnlyDiff = isDocsOnlyDiff(filesChanged);
  const skipTestGate = canSkipTestGate({ qfType: qf.type, docsOnlyDiff });

  // QF-20260604-479 (PAT-QF-EMPTY-DIFF-FALSE-COMPLETION-001): terminal empty-diff guard.
  // A committed branch diff vs origin/main of 0 files / 0 LOC means the implementation never
  // landed (never committed, or lost to a parallel-session working-tree clobber — CLAUDE.md #8).
  // Every compliance criterion is vacuously satisfied by "no change" (error_resolved passes on an
  // EMPTY console-error list; loc/scope/targeted all pass at 0), so the QF would false-complete at
  // score 100 and merge an EMPTY PR (witnessed: QF-20260604-749 / PR #4238). Refuse unless
  // --allow-empty-diff is explicit; NOT bypassable by --force-complete / --non-interactive / --auto-pr.
  if (isEmptyDiff(filesChanged, actualLoc)) {
    if (options.allowEmptyDiff) {
      console.log(`\n⚠️  --allow-empty-diff: proceeding on EMPTY branch diff (reason="${options.allowEmptyDiffReason || 'n/a'}")\n`);
    } else {
      console.error(`\n❌ EMPTY DIFF — refusing to complete ${qfId}: branch diff vs origin/main is 0 files / 0 LOC.`);
      console.error('   Commit your fix to the branch (the diff is computed from committed changes vs');
      console.error('   origin/main), or pass --allow-empty-diff --reason "<why>" for a genuine revert/no-op.');
      console.error('   NOT bypassable by --force-complete / --non-interactive / --auto-pr.\n');
      process.exit(1);
    }
  }

  // SD-FDBK-ENH-CREATE-QUICK-FIX-001 (FR-3): reconcile the declared type against the REAL diff.
  // The work-item-router documentation Tier-2 floor relaxes risk-keyword escalation at routing
  // time by trusting type==='documentation' (no diff exists yet). Here the diff DOES exist, so a
  // documentation-typed QF that touches non-docs source files is a mislabel — surface it
  // NON-SILENTLY and feed it to the self-verifier so the code change cannot silently complete as
  // "documentation" and bypass the LEAD + SECURITY/GITHUB review the floor skipped.
  const typeFileMismatch = reconcileDeclaredTypeVsFiles({ qfType: qf.type, filesChanged });
  if (typeFileMismatch.mismatch) {
    console.log('\n🚨 TYPE/FILE MISMATCH — documentation QF touches non-docs source files');
    console.log('   Declared type: documentation, but the diff includes source file(s):');
    typeFileMismatch.nonDocsFiles.forEach(f => console.log(`      - ${f}`));
    console.log('   A documentation QF that changes code can bypass LEAD + SECURITY/GITHUB review');
    console.log('   (it was routed under the documentation Tier-2 floor). Self-verifier confidence');
    console.log('   will be reduced — re-classify the QF type or split out the code change.\n');
  }

  // Test verification - PROGRAMMATIC (not self-reported)
  console.log('\n🧪 PROGRAMMATIC TEST VERIFICATION\n');

  let unitTestResult = null;
  let e2eTestResult = null;
  let testsPass;

  // --skip-tests alone means "trust CI / cached results". Default testsPass=true unless
  // the caller explicitly says otherwise via --tests-pass no. This matches the sibling
  // pattern at test-runner.js:108-113 (--skip-typecheck works standalone).
  if (options.skipTestRun) {
    testsPass = options.testsPass !== undefined ? options.testsPass : true;
    console.log(`   ⚠️  Skipping test run (--skip-tests); testsPass=${testsPass}\n`);
  } else if (skipTestGate) {
    // QF-20260511-365 / feedback 869f7cf3: docs-only diff bypasses the test-run
    // gate. The diff contains zero source files (docs/, *.md, *.rst, README/
    // LICENSE/CHANGELOG, etc.), so the unit+e2e suite would only re-validate
    // unrelated pre-existing baseline failures. testsPass=true is sound here
    // because there is no source to validate; docmon + bypass-guard still run.
    testsPass = true;
    const skipReason = docsOnlyDiff
      ? `Docs-only diff detected (${filesChanged.length} file(s))`
      : 'type=documentation QF (no executable source to validate)';
    console.log(`   📚 ${skipReason}; skipping unit+e2e tests.\n`);
  } else {
    console.log('   Running tests to verify fix quality (not self-reported)...\n');

    // SD-FDBK-INFRA-CHANGE-SCOPE-COMPLETE-001: change-scope the gate to THIS QF's
    // diff instead of the whole suite. The whole `npm run test:unit` run exceeds
    // TEST_TIMEOUT_UNIT (and re-surfaces unrelated baseline failures), and the
    // Playwright e2e smoke run can't execute headless — both forced a per-ship
    // bypass even for a verified Tier-1 QF whose own tests are green.
    //   • Unit: run only tests RELATED to the QF's changed source files (FR-1);
    //     empty source set → buildUnitTestCommand falls back to the whole suite.
    //   • E2E: run the Playwright smoke suite only when the diff touches the
    //     frontend/browser surface (FR-2); a backend-only diff skips it.
    const scopedTestFiles = getScopedUnitTestFiles(filesChanged, testDir);
    const runE2E = touchesFrontend(filesChanged);

    console.log('━━━ Unit Tests ━━━\n');
    if (scopedTestFiles.length > 0) {
      // Targeted run of exactly the QF's unit-test files — clean/fast and free of
      // the baseline-graph poisoning that breaks `vitest related`/`--changed`.
      console.log(`   🎯 Change-scoped to ${scopedTestFiles.length} unit-test file(s): ${scopedTestFiles.join(', ')}\n`);
      unitTestResult = runTests('unit', { testDir, testFiles: scopedTestFiles });
    } else if (Array.isArray(filesChanged) && filesChanged.length > 0) {
      // Diff is known but no unit-test file maps to it (coverage gap, not a gate
      // failure). The whole suite would only re-surface unrelated baseline
      // failures, so skip the unit run and let UAT + compliance + self-verifier
      // gate. verifyTestCoverage (below) surfaces the gap explicitly.
      unitTestResult = {
        passed: true,
        exitCode: 0,
        skippedNoScoped: true,
        output: 'No unit-test file maps to the changed files; scoped unit run skipped (coverage gap, not a failure).'
      };
      console.log('   ⏭️  No unit-test file maps to the changed files; skipping scoped unit run (coverage gap, not a failure). UAT + compliance still gate.\n');
    } else {
      // Diff not resolvable (e.g. offline / detached) — fall back to the whole
      // suite as a last resort (backward compatible).
      console.log('   ℹ️  Diff not resolvable; running whole unit suite (fallback).\n');
      unitTestResult = runTests('unit', { testDir });
    }

    if (runE2E) {
      console.log('\n━━━ E2E Smoke Tests ━━━\n');
      e2eTestResult = runTests('e2e', { testDir });
    } else {
      console.log('\n━━━ E2E Smoke Tests ━━━\n');
      console.log('   ⏭️  Diff does not touch the frontend/browser surface; skipping e2e smoke (backend-only QF).\n');
    }

    displayTestResults(unitTestResult, e2eTestResult);

    // Overall pass/fail. E2E only gates when it actually ran (FR-2); a skipped
    // e2e (backend-only diff) does not pull testsPass down.
    testsPass = unitTestResult.passed && (e2eTestResult ? e2eTestResult.passed : true);
    console.log();
  }

  // Validate tests (QF-20260509-552: forward {forceComplete,reason} flags)
  if (!validateTests(unitTestResult, e2eTestResult, testsPass, { forceComplete: options.forceComplete, reason: options.reason })) {
    process.exit(1);
  }

  // TypeScript verification - PROGRAMMATIC
  const tscResult = runTypeScriptCheck(testDir, options.skipTypeCheck || qf.type === 'documentation');
  if (!validateTypeScript(tscResult)) {
    process.exit(1);
  }

  // UAT verification
  let uatVerified;
  if (options.uatVerified === undefined) {
    const uatInput = await prompt('UAT verified (manually tested fix works)? (yes/no): ');
    uatVerified = uatInput.toLowerCase().startsWith('y');
  } else {
    uatVerified = options.uatVerified;
  }

  if (!validateUAT(uatVerified)) {
    process.exit(1);
  }

  // QF-20260509-779 / QF-20260511-365: analyzeGitDiff was hoisted above the
  // test-run block so docs-only QFs can short-circuit the test gate. filesChanged
  // and diffAnalysis are reused here. (Original hoist motivation: ensure
  // createAutoPR has filesChanged available and the autoPr branch fires BEFORE
  // the PR-URL prompt. 13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.)

  // Test Coverage Verification (uses filesChanged from above).
  // SD-FDBK-INFRA-RCA-FIRST-HARD-001 (FR-3): gate the advisory per-file probe loop so a
  // ballooned filesChanged (stale origin/main after a worktree removal) can't ride the
  // unbounded spawn loop to EXIT 124. Skip when the operator opted out, when the test gate
  // itself was skipped (docs-only / --skip-tests), or under --force-complete. Coverage is
  // console-only and never gates, so skipping changes no verdict. (verifyTestCoverage also
  // self-skips on an empty filesChanged and bounds each spawn via EXTERNAL_STEP_TIMEOUT_MS.)
  const skipCoverage = Boolean(
    options.skipCoverage || options.skipTestRun || options.forceComplete || skipTestGate
  );
  const testCoverage = verifyTestCoverage(filesChanged, { skip: skipCoverage });

  // PR verification
  let prUrl = options.prUrl;

  // QF-20260603-778: --auto-pr defers PR creation until AFTER commit+push below.
  // createAutoPR runs `gh pr create`, which requires the branch to already have
  // pushed commits; firing it here (before commitAndPushChanges) opened the PR
  // against an unpushed/commit-less branch and then wedged on the PR-URL prompt
  // under --non-interactive. Only the PR-creation side effect moves — the commit
  // still happens after verification (this is NOT the commit-before-verify reorder).
  // QF-20260727-714: --no-code-deliverable suppresses auto-PR entirely. A zero-code QF has an
  // empty branch, so a deferred `gh pr create` would correctly refuse ("No commits between main
  // and main") — and suppressing it here also keeps the SECOND validatePR (in the deferAutoPr
  // block further down) unreachable on this path, rather than patching two gates that must stay
  // in agreement.
  const deferAutoPr = !prUrl && options.autoPr && !options.noCodeDeliverable;

  if (!prUrl && !options.autoPr && !options.noCodeDeliverable) {
    const prInput = await prompt('\nGitHub PR URL (required): ');
    prUrl = prInput.trim();
  }

  // When the PR will be auto-created post-push, there is no URL to validate yet.
  //
  // QF-20260727-714: --no-code-deliverable also skips it, because the deliverable is a DB write,
  // a refutation, or a decision — there is nothing to commit and a PR URL could only be
  // fabricated. THE NORMAL PATH IS UNCHANGED: without this flag a PR is still mandatory, and
  // validatePR itself is untouched, so this is a scoped exemption rather than a weakened guard.
  // The flag cannot be passed without --deliverable-evidence (enforced in cli.js).
  if (!deferAutoPr && !options.noCodeDeliverable && !validatePR(prUrl, qfId, qf.title)) {
    process.exit(1);
  }

  // Optional: Verification notes (after PR so autoPr-created PR body uses
  // options.verificationNotes if provided; the prompt below only runs without
  // --non-interactive when no notes were supplied).
  let verificationNotes = options.verificationNotes;
  // QF-20260529-888: actually honor the guard the comment above describes — under
  // --non-interactive (or --force-complete) this optional prompt must NOT fire, else
  // prompt() rejects and fails the whole completion. Absent notes default to null below.
  if (!verificationNotes && !options.nonInteractive && !options.forceComplete) {
    verificationNotes = await prompt('\nVerification notes (optional): ');
  }

  // LEO Stack Restart
  console.log('🔄 LEO Stack Restart\n');
  // SD-FDBK-ENH-COMPLETE-QUICK-FIX-001 (Part B): inside a QF worktree, `leo-stack.sh restart`
  // always fails (the stack runs from the main repo, not the worktree) and is irrelevant to
  // completing the QF. The old red "restart failed" warning was routinely mistaken for a
  // verification problem and nudged operators toward the over-broad --force-complete. In a
  // worktree, skip the attempt and emit a calm informational note instead. (This warning never
  // fed self-verification confidence — that comes from the self-verifier's own checks.)
  const inWorktree = typeof testDir === 'string' && /[\\/]\.worktrees[\\/]/.test(testDir);
  if (inWorktree) {
    console.log('   ℹ️  LEO stack restart skipped in worktree (expected; the stack runs from the main repo). Does not affect verification.\n');
  } else {
    const restartResult = await restartLeoStack({ verbose: true });
    if (!restartResult.success) {
      console.log(`   ⚠️  LEO stack restart failed: ${restartResult.message}`);
      console.log('   You may need to restart manually: bash scripts/leo-stack.sh restart\n');
    }
  }

  // QF-20260509-779: --auto-pr is now handled in the PR-acquisition block above.
  // The prior duplicate block here would have been unreachable post-hoist.
  let finalPrUrl = prUrl;

  // Self-Verification (Combat Overconfidence)
  // QF-20260511-056: forward source/test split so verifyLOCConstraint can apply
  // the cap to source-only LOC (matches compliance-rubric context below).
  const verificationContext = {
    actualLoc,
    actualSourceLoc,
    actualTestLoc,
    filesChanged,
    testsPass,
    uatVerified,
    testsVerifiedRecently: true,
    diffAnalysis,
    testCoverage,
    // SD-FDBK-ENH-SOURCE-LOC-CAP-001: thread the LOC-only bypass to verifyLOCConstraint
    // (Check 1) so a single --over-cap-reason clears BOTH enforcement points together.
    overCapReason: options.overCapReason,
    // SD-FDBK-ENH-COMPLETE-QUICK-FIX-002: thread pure-deletion LOC so verifyLOCConstraint
    // caps on net source LOC, matching validateLOC (avoids the dual-hard-gate half-fix).
    sourceDeletionLoc,
    // SD-FDBK-ENH-CREATE-QUICK-FIX-001 (FR-3): documentation type-vs-filepath mismatch signal
    // so the self-verifier penalizes confidence + records a blocker for a mislabeled doc QF.
    typeFileMismatch
  };

  // QF-20260524-309 (a38f6b06): prefer the testDir (QF worktree) copy of the self-verifier
  // over this orchestrator's bundled import, so running the main repo's complete-quick-fix.js
  // from a worktree cannot run a stale verifier when the main tree predates a merged fix.
  let runSV = runSelfVerification;
  try {
    const localVerifier = path.join(testDir, 'lib', 'quickfix-self-verifier.js');
    if (testDir && fs.existsSync(localVerifier)) {
      const mod = await import(pathToFileURL(localVerifier).href);
      if (typeof mod.runSelfVerification === 'function') runSV = mod.runSelfVerification;
    }
  } catch { /* fall back to the bundled verifier */ }
  const verificationResults = await runSV(qfId, verificationContext);
  // SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-2: --force-complete bypasses self-verification prompts
  const selfVerificationValid = await validateSelfVerification(verificationResults, prompt, {
    forceComplete: options.forceComplete,
    // SD-FDBK-ENH-COMPLETE-QUICK-FIX-001: granular bypass for the low-confidence proceed-anyway
    // prompt only (mirrors how validateCompliance receives acceptComplianceWarn).
    acceptLowConfidence: options.acceptLowConfidence,
    reason: options.reason
  });
  if (!selfVerificationValid) {
    process.exit(1);
  }

  // Evidence Capture - Console Errors After Fix
  const evidenceData = await captureEvidenceData(qfId, qf);

  // Compliance Rubric with Auto-Refinement
  // QF-20260509-070: include source/test split so rubric uses source-only LOC.
  // QF-20260509-407: forward sourceDeletionLoc so the rubric can subtract pure
  // dead-code deletion from tier classification (loc_constraint + proper_classification).
  const complianceContext = {
    errorsBeforeFix: evidenceData.errorsBeforeFix,
    errorsAfterFix: evidenceData.errorsAfterFix,
    actualLoc,
    actualSourceLoc,
    actualTestLoc,
    sourceDeletionLoc,
    filesChanged,
    testsPass
  };

  // QF-20260509-COMPLIANCE-LOOP (closes 0974d18b): forward {forceComplete,reason}
  // so the refinement-prompt at compliance-loop.js:77 auto-skips under
  // --force-complete instead of wedging on stdin (9th-witness writer/consumer
  // asymmetry; sibling miss in QF-20260509-552).
  const { complianceResults } = await runComplianceWithRefinement(qfId, qf, complianceContext, prompt, {
    forceComplete: options.forceComplete,
    reason: options.reason,
    // SD-FDBK-FIX-COMPLETE-QUICK-FIX-001: thread non-interactive so the refinement prompt auto-skips
    nonInteractive: options.nonInteractive
  });
  // QF-20260508-407: forward {forceComplete, reason} so validateCompliance can
  // short-circuit the WARN-verdict prompt under --non-interactive (sibling parity
  // with validateLOC and validateSelfVerification).
  const complianceValid = await validateCompliance(complianceResults, prompt, {
    forceComplete: options.forceComplete,
    acceptComplianceWarn: options.acceptComplianceWarn,
    reason: options.reason
  });
  if (!complianceValid) {
    process.exit(1);
  }

  // Commit & Push (QF-20260509-552: forward {forceComplete,reason} flags)
  // QF-20260529-168: thread nonInteractive so git-operations' commit/push guards (QF-888) fire.
  commitSha = await commitAndPushChanges(testDir, qf, { commitSha, branchName }, actualLoc, filesChanged, finalPrUrl, testsPass, prompt, { forceComplete: options.forceComplete, reason: options.reason, nonInteractive: options.nonInteractive });

  // QF-20260603-778: with the branch now committed+pushed, create the deferred
  // --auto-pr PR (gh pr create requires the pushed branch). finalPrUrl flows into
  // the record update, completion summary, and merge below. If creation fails,
  // exit loudly rather than recording an empty pr_url.
  if (deferAutoPr && !prUrl) {
    console.log('🤖 --auto-pr: creating PR via gh (post-push)');
    const created = await createAutoPR(qfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes);
    if (created) {
      prUrl = created;
      finalPrUrl = created;
    }
    if (!validatePR(prUrl, qfId, qf.title)) {
      process.exit(1);
    }
  }

  // SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001 (FR-2): merge THEN verify, BEFORE writing
  // status=completed. Previously the completed write happened first and mergeToMain ran AFTER —
  // so under --non-interactive (mergeToMain deliberately skips the direct merge, deferring to
  // `gh pr merge --auto`/CI) a QF was written completed with its change still OFF origin/main
  // (the QF-20260701-989 false-completion class). Merge here so the witness can confirm the QF's
  // OWN qf/<QF-ID> branch actually landed before we mark it done.
  await mergeToMain(testDir, qf, finalPrUrl, prompt, { forceComplete: options.forceComplete, skipCiWait: options.skipCiWait, reason: options.reason, nonInteractive: options.nonInteractive });

  // Merge-verification WITNESS: a quick_fixes row may only reach status=completed when its own
  // qf/<QF-ID> branch has a MERGED PR reachable from origin/main. Self-derives pr_url from the
  // QF's own branch (never a foreign/most-recent merged PR — closes the #5290 mis-attribution).
  // Fail-closed. --force-complete stays the audited escape hatch (records the unverified witness).
  const mergeWitness = verifyQFMergeWitness({ qfId, prUrl: finalPrUrl, testDir });
  if (!mergeWitness.verified) {
    if (!options.forceComplete) {
      console.error(`\n❌ [QF_MERGE_UNVERIFIED] Refusing to mark ${qfId} completed: ${mergeWitness.reason}`);
      console.error('   A QF completes only after its own qf/<QF-ID> branch PR is MERGED and on origin/main.');
      console.error('   This is a DEFERRAL, not a failure: merge the PR (gh pr merge --merge / /ship, or let');
      console.error('   `gh pr merge --auto` + CI land it), then re-run complete-quick-fix to reconcile.');
      console.error('   Override (audited): --force-complete --reason "<why>".\n');
      process.exit(1);
    }
    console.log(`\n⚠️  [QF_MERGE_UNVERIFIED] ${mergeWitness.reason} — completing anyway under --force-complete (recorded in verification_notes).`);
  } else {
    // Self-derive the correct pr_url from the QF's OWN merged PR — never the passed-in foreign one.
    finalPrUrl = mergeWitness.prUrl;
    console.log(`   ✅ Merge witness verified: ${mergeWitness.prUrl} (head ${mergeWitness.headBranch}) MERGED + reachable from origin/main.`);
  }

  // Update record
  console.log('🔄 Updating quick-fix record...\n');

  // SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001:
  //   - Write actual_source_loc + actual_test_loc (split fields; FR-1)
  //   - Write force_completed flag (FR-6 ALTERed CHECK accepts this without test/UAT)
  //   - --force-complete writes structured JSON audit trail to verification_notes (FR-2 / TR-3)
  let finalVerificationNotes = verificationNotes || null;
  if (options.forceComplete) {
    finalVerificationNotes = JSON.stringify({
      force_completed: true,
      reason: options.reason,
      operator: process.env.CLAUDE_SESSION_ID || 'unknown',
      timestamp: new Date().toISOString(),
      operator_supplied_notes: verificationNotes || null,
      // SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001: record the merge witness so a forced
      // completion of an unverified/unmerged QF is loudly auditable, not silent.
      merge_witness: mergeWitness.verified
        ? { verified: true, pr_url: mergeWitness.prUrl, merge_sha: mergeWitness.mergeSha }
        : { verified: false, code: mergeWitness.code, reason: mergeWitness.reason }
    });
  } else if (options.overCapReason) {
    // SD-FDBK-ENH-SOURCE-LOC-CAP-001: audit-trail the LOC-only bypass. Distinct from
    // force_completed — this records ONLY a source-LOC-cap waiver; all other gates ran.
    finalVerificationNotes = JSON.stringify({
      over_cap_reason: options.overCapReason,
      over_cap_source_loc: actualSourceLoc,
      operator: process.env.CLAUDE_SESSION_ID || 'unknown',
      timestamp: new Date().toISOString(),
      operator_supplied_notes: verificationNotes || null
    });
  } else if (options.noCodeDeliverable) {
    // QF-20260727-714: audit-trail the zero-code completion. THE EVIDENCE IS THE WHOLE POINT —
    // it is the only artifact a reader can use to check the deliverable actually landed, because
    // there is no commit, no diff and no PR to inspect. cli.js refuses the flag without it, so
    // this field is never empty. no_pr_reason records WHY the PR requirement was exempted rather
    // than leaving a reader to infer that the gate simply failed to run.
    finalVerificationNotes = JSON.stringify({
      no_code_deliverable: true,
      deliverable_evidence: options.deliverableEvidence,
      no_pr_reason: 'deliverable is not a code change — no commit exists to open a PR against',
      operator: process.env.CLAUDE_SESSION_ID || 'unknown',
      timestamp: new Date().toISOString(),
      operator_supplied_notes: verificationNotes || null
    });
  }

  const { error: updateError } = await supabase
    .from('quick_fixes')
    .update({
      status: 'completed',
      actual_loc: actualLoc,
      actual_source_loc: actualSourceLoc,
      actual_test_loc: actualTestLoc,
      // QF-20260727-714: a no-code completion is force_completed too. The row's
      // completed_requires_verification CHECK is satisfied WITHOUT fabricating uat_verified or a
      // commit — same contract this file already documents for --force-complete. Marking it
      // force_completed is also the honest label: no PR was reviewed and no diff was merged, so
      // the row must not read like an ordinary verified completion.
      force_completed: Boolean(options.forceComplete || options.noCodeDeliverable),
      commit_sha: commitSha,
      branch_name: branchName,
      pr_url: finalPrUrl,
      tests_passing: testsPass,
      uat_verified: uatVerified,
      // SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-2, second writer. 'FORCE_COMPLETE' and
      // 'UAT_AGENT' are MODE LABELS, not witnesses — they say HOW the row closed, never WHO closed
      // it, so every forced completion in the table is attributed identically and anonymously.
      // Prefer a real identity when one exists: the scope-accepter, else the operator session that
      // ran the command. The mode is preserved as a suffix so nothing that reads these values for
      // classification loses the distinction it relied on.
      verified_by: completionStampFromOptions(options, process.env.CLAUDE_SESSION_ID || null),
      // FR-1, second writer — same contract as the reconcile path above: always an explicit
      // record, existing evidence never clobbered.
      runtime_observation: buildRuntimeObservation({
        existing: qf?.runtime_observation,
        observation: options.runtimeObservation,
        method: options.observationMethod,
        declaredBy: completionStampFromOptions(options, process.env.CLAUDE_SESSION_ID || null),
        nowIso: new Date().toISOString()
      }),
      verification_notes: finalVerificationNotes,
      files_changed: filesChanged.length > 0 ? filesChanged : null,
      completed_at: new Date().toISOString(),
      // QF-20260711-176: completed QFs must not retain a holder — a lingering
      // claiming_session_id blocks worktree reaping via the live-claim-guard.
      claiming_session_id: null
    })
    .eq('id', qfId);

  if (updateError) {
    console.log('❌ Failed to update quick-fix:', updateError.message);
    process.exit(1);
  }

  // Release QF claim after successful completion
  try {
    const { default: sessionManager } = await import('../../../lib/session-manager.mjs');
    const session = await sessionManager.getOrCreateSession();
    if (session?.session_id) {
      await supabase.rpc('release_sd', {
        p_session_id: session.session_id,
        p_reason: 'qf_completed'
      });
    }
  } catch {
    // Non-fatal — claim release is best-effort
  }

  displayCompletionSummary(qf, actualLoc, commitSha, branchName, finalPrUrl, filesChanged);

  // NOTE: mergeToMain now runs BEFORE the completed write (above) so the merge-verification
  // witness can gate the completion — SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001.

  // SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-1: post-merge feedback auto-resolve.
  // Parse "Closes (feedback|harness backlog) <uuid>" footers from PR body and
  // commit messages. Idempotent + fail-soft — DB errors warn but never fail QF
  // completion. Env opt-out: RESOLVE_FEEDBACK_ON_QF_COMPLETE=0.
  if (process.env.RESOLVE_FEEDBACK_ON_QF_COMPLETE !== '0') {
    try {
      await resolveLinkedFeedbackRows(supabase, qf, qfId, finalPrUrl, commitSha, testDir);
    } catch (err) {
      console.log(`   ⚠️  Feedback auto-resolve skipped: ${err?.message || err}\n`);
    }
  }

  // SD-LEO-INFRA-FIX-RECURRENCE-REWIRING-001 FR-4: outcome-tracker completion hook.
  // ADDITIVE to the feedback auto-resolve block above -- a second, independent
  // resolution-writer; never replaces resolve-feedback.js's own writes.
  // Fail-soft + gated. Env opt-out: OUTCOME_TRACKER_ON_QF_COMPLETE=0.
  if (process.env.OUTCOME_TRACKER_ON_QF_COMPLETE !== '0') {
    try {
      await recordQfOutcomeOnComplete(supabase, qf, qfId);
    } catch (err) {
      console.log(`   ⚠️  Outcome-tracker record skipped: ${err?.message || err}\n`);
    }
  }

  console.log('📍 Quick-Fix Complete!\n');

  return qf;
}

/**
 * SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-1: post-merge auto-resolve.
 *
 * Collects text from (a) PR body via `gh pr view --json body,commits` and
 * (b) the local commit message via `git log -1 --format=%B <sha>`, runs
 * parseAndExpandFeedbackFooters (which also expands 8-char short IDs via DB
 * lookup, QF-20260511-556), and calls resolveFeedback per UUID. All steps are
 * defensive — any failure logs a warning and continues without blocking QF
 * completion (post-merge is informational, not gating).
 *
 * @param {Object} supabase
 * @param {Object} qf  Quick-fix DB row
 * @param {string} qfId
 * @param {string} prUrl
 * @param {string} commitSha
 * @param {string} testDir
 */
async function resolveLinkedFeedbackRows(supabase, qf, qfId, prUrl, commitSha, testDir) {
  const corpus = [];

  // Source 1: PR body + commit messages via gh pr view
  if (prUrl) {
    const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
    if (prNumber && /^\d+$/.test(prNumber)) {
      try {
        const out = execSync(`gh pr view ${prNumber} --json body,commits`, {
          cwd: testDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
        });
        const parsed = JSON.parse(out);
        if (parsed?.body) corpus.push(parsed.body);
        if (Array.isArray(parsed?.commits)) {
          for (const c of parsed.commits) {
            if (c?.messageHeadline) corpus.push(c.messageHeadline);
            if (c?.messageBody) corpus.push(c.messageBody);
          }
        }
      } catch (e) {
        console.log(`   ℹ️  gh pr view fallback (will try local commit): ${e.message}`);
      }
    }
  }

  // Source 2: local commit message (works even when PR is unavailable)
  if (commitSha && /^[a-f0-9]{7,40}$/i.test(commitSha)) {
    try {
      const msg = execSync(`git log -1 --format=%B ${commitSha}`, {
        cwd: testDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
      });
      if (msg) corpus.push(msg);
    } catch {
      /* commit may already be deleted post-merge — non-fatal */
    }
  }

  // Source 3: QF description (may carry the link from issue creation)
  if (qf?.description) corpus.push(qf.description);

  const { uuids, warnings } = await parseAndExpandFeedbackFooters({
    text: corpus.join('\n'),
    supabase,
  });
  for (const w of warnings) {
    console.log(`   ⚠️  ${w}`);
  }
  if (uuids.length === 0) {
    return;
  }

  console.log(`   🔗 Auto-resolving ${uuids.length} linked feedback row(s)...`);
  const prNumberDisplay = prUrl?.match(/\/pull\/(\d+)/)?.[1];
  for (const uuid of uuids) {
    const notes = prNumberDisplay
      ? `Shipped via QF-${qfId} PR #${prNumberDisplay}`
      : `Shipped via QF-${qfId}`;
    const result = await resolveFeedback({
      supabase,
      feedbackId: uuid,
      quickFixId: qfId,
      notes,
    });
    if (result.updated) {
      console.log(`   ✅ feedback ${uuid} → resolved (notes: ${notes})`);
    } else if (result.reason === 'no_row_or_already_resolved') {
      console.log(`   ℹ️  feedback ${uuid} → already resolved or missing (idempotent skip)`);
    } else {
      console.log(`   ⚠️  feedback ${uuid} → resolve failed: ${result.error || 'unknown'}`);
    }
  }
}

/**
 * SD-LEO-INFRA-FIX-RECURRENCE-REWIRING-001 FR-4: post-merge outcome-tracker hook.
 *
 * Additive to resolveLinkedFeedbackRows above -- never replaces resolve-feedback.js's
 * write path. recordQfCompleted always runs: it is the QF's own real linkage
 * (feedback.quick_fix_id), and outcome_signals.sd_id / sd_effectiveness_metrics.sd_id
 * both carry a NOT NULL foreign key to strategic_directives_v2(id), so a bare QF id
 * (e.g. "QF-20260704-300") could never be written there directly.
 *
 * When the QF escalated to a real SD (quick_fixes.escalated_to_sd_id), recordSdCompleted
 * ALSO runs -- but as an addition, not a replacement: recordSdCompleted resolves
 * feedback via feedback.sd_id, a different linkage than the QF's own
 * feedback.quick_fix_id, so routing to it exclusively would silently skip tagging
 * the QF's actual linked feedback (caught in adversarial review of this SD's PR).
 *
 * @param {Object} supabase
 * @param {Object} qf - Quick-fix DB row (must include escalated_to_sd_id)
 * @param {string} qfId
 */
export async function recordQfOutcomeOnComplete(supabase, qf, qfId) {
  const qfResult = await recordQfCompleted({ supabase, qfId, completionTime: new Date() });
  if (qf?.escalated_to_sd_id) {
    const sdResult = await recordSdCompleted({
      supabase,
      sdId: qf.escalated_to_sd_id,
      actor: 'complete-quick-fix',
      completionTime: new Date()
    });
    return { qf: qfResult, sd: sdResult };
  }
  return qfResult;
}

/**
 * Sanitize string for safe shell argument usage
 * SD-SEC-DATA-VALIDATION-001: Escape shell metacharacters
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeForShell(str) {
  if (!str || typeof str !== 'string') return '';
  // Replace shell metacharacters with escaped versions
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/!/g, '\\!')
    .replace(/\n/g, ' ');
}

/**
 * Validate quick-fix ID format
 * SD-SEC-DATA-VALIDATION-001: Input validation
 * @param {string} qfId - Quick-fix ID
 * @returns {string} Validated ID
 * @throws {Error} If invalid
 */
function validateQfId(qfId) {
  if (!qfId || typeof qfId !== 'string') {
    throw new Error('Quick-fix ID is required');
  }
  const sanitized = qfId.trim();
  // QF IDs: QF-YYYYMMDD-NNN or alphanumeric with dashes
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized) || sanitized.length > 50) {
    throw new Error(`Invalid quick-fix ID: ${qfId}`);
  }
  return sanitized;
}

/**
 * Create automatic PR if configured
 */
async function createAutoPR(qfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes) {
  console.log('📝 Automatic PR Creation\n');

  try {
    const { execSync } = await import('child_process');

    // SD-SEC-DATA-VALIDATION-001: Validate qfId
    const validatedQfId = validateQfId(qfId);

    // Check if gh CLI is installed. QF-20260705-716: probe with `gh --version`, not
    // `which gh` — `which` does not exist on win32, so the old probe threw on every
    // Windows worker and --auto-pr always aborted to "create PR manually" even with
    // gh installed and on PATH. `gh --version` is cross-platform and also proves the
    // binary actually executes, which `which` never did.
    execSync('gh --version', { stdio: 'pipe' });

    // Title is still a shell arg, so keep it sanitized.
    const prTitle = sanitizeForShell(`fix(${validatedQfId}): ${qf.title || 'Quick fix'}`);
    // QF-20260523-167 / feedback d66e0850: write the body to a temp file and use
    // --body-file instead of --body "<sanitized>". sanitizeForShell collapsed every
    // newline to a space, flattening the whole PR body — including any
    // "Closes feedback <uuid>" footer — onto one line, so the post-merge resolver's
    // line-anchored FOOTER_REGEX never matched and linked feedback was never closed.
    // A body file preserves newlines and needs no shell escaping.
    const prBody = generatePRBody(validatedQfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes);
    const bodyFile = path.join(os.tmpdir(), `qf-pr-body-${validatedQfId}-${Date.now()}.md`);
    fs.writeFileSync(bodyFile, prBody, 'utf-8');

    console.log(`   Creating PR: fix(${validatedQfId}): ${qf.title}\n`);

    let prOutput;
    try {
      prOutput = execSync(`gh pr create --title "${prTitle}" --body-file "${bodyFile}"`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } finally {
      try { fs.unlinkSync(bodyFile); } catch { /* best-effort temp cleanup */ }
    }

    // Extract PR URL from output
    const urlMatch = prOutput.match(/https:\/\/github\.com\/[^\s]+/);
    if (urlMatch) {
      console.log(`   ✅ PR Created: ${urlMatch[0]}\n`);
      return urlMatch[0];
    }
  } catch (err) {
    console.log(`   ⚠️  Auto-PR creation failed: ${err.message}`);
    console.log('   Please create PR manually: gh pr create\n');
  }

  return null;
}

/**
 * Generate PR body content
 */
function generatePRBody(qfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes) {
  return `## Quick-Fix: ${qfId}

**Type:** ${qf.type}
**Severity:** ${qf.severity}

### Issue Description
${qf.description}

${qf.steps_to_reproduce ? `### Steps to Reproduce
${qf.steps_to_reproduce}
` : ''}
${qf.expected_behavior ? `### Expected Behavior
${qf.expected_behavior}
` : ''}
${qf.actual_behavior ? `### Actual Behavior
${qf.actual_behavior}
` : ''}
### Changes
- **Files Changed:** ${filesChanged.length}
${filesChanged.map(f => `  - ${f}`).join('\n')}
- **LOC:** ${actualLoc} lines
- **Tests:** ${testsPass ? '✅ Passing' : '❌ Failed'}
- **UAT:** ${uatVerified ? '✅ Verified' : '❌ Not verified'}

### Verification
${verificationNotes || 'No additional notes'}

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Quick-Fix Workflow - LEO Protocol`;
}

/**
 * Capture evidence data for compliance check
 */
async function captureEvidenceData(qfId, qf) {
  console.log('\n📸 Evidence Capture - Console Errors\n');

  const evidenceSummary = generateEvidenceSummary(qfId);
  let errorsBeforeFix = [];
  let errorsAfterFix = [];

  if (evidenceSummary.hasBaseline) {
    console.log('   ✅ Found baseline evidence from quick-fix creation');
    try {
      const baselinePath = `${evidenceSummary.evidenceDir}/console-baseline.json`;
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
      errorsBeforeFix = baseline.errors || [];
    } catch (err) {
      console.log(`   ⚠️  Could not load baseline: ${err.message}`);
    }
  }

  // Capture current console state (after fix)
  const afterCaptureResult = await captureConsoleErrorsAfterFix(qfId, 'http://localhost:5173', {
    currentErrors: errorsAfterFix,
    consoleError: qf.actual_behavior
  });

  if (afterCaptureResult.comparison) {
    console.log('\n   📊 Console Error Comparison:');
    console.log(`      Original Error Resolved: ${afterCaptureResult.comparison.originalErrorResolved ? '✅ YES' : '❌ NO'}`);
  }

  return {
    errorsBeforeFix,
    errorsAfterFix: afterCaptureResult.errors || []
  };
}
