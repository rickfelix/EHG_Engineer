/**
 * Governed release mechanism for held chairman-targeted decision sends —
 * SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-1 release path / FR-6).
 *
 * WHY THIS EXISTS (FR-6). The only prior working release path was a one-off script
 * (.artifacts/w3-go-release-20260824.mjs) that a human hand-curated: it manually cited two Solomon
 * correlation IDs and injected a FABRICATED verdict envelope via sendChairmanSMS's
 * opts.runPreSendConsultLane seam. That seam is real and reused here — but a prospective TESTING
 * sub-agent (evidence 23c47605, finding L-6) correctly flagged that encoding "a governed release
 * mechanism" around that seam without independent verification just makes forging machine-
 * repeatable. This module is the hardened successor.
 *
 * SECURITY HARDENING (SECURITY sub-agent evidence 8c9d89bd, findings S-1/S-2/S-3) — an earlier
 * revision of this file had three real gaps a security review caught before this shipped:
 *   S-2: the original anti-forgery check only verified "the answerer isn't the asker" (a denylist),
 *     not "the answerer is genuinely Solomon" (an allowlist). Because chairman-lane sends often
 *     carry sessionId=CHAIRMAN_LANE_AUTOMATED_SENTINEL (a SHARED constant no real Solomon session
 *     would ever match), that denylist check was INERT for every unattended send — anyone able to
 *     insert one session_coordination row with kind='adam_advisory' and any differing sender_session
 *     could forge a release, arguably MORE repeatable than the one-off script this replaces.
 *     FIXED: resolveVerifiedAnswer() now requires the answering sender_session to be a session this
 *     module INDEPENDENTLY confirms carries claude_sessions.metadata.role='solomon' (an allowlist),
 *     not merely "not equal to the asker".
 *   S-1: decideRelease() treated ANY non-empty answer payload as approval — a genuine Solomon
 *     verdict of "NO, do not send" would have released identically to "GO". FIXED: the verdict text
 *     is now screened with should-consult-solomon.js's own detectVerdictDelta() (the SAME rejection/
 *     amendment marker regex the in-call path already uses for near-miss capture) and refused rather
 *     than auto-sent when it fires — this module NEVER decides "the rejection isn't serious enough
 *     to hold on", it always fails toward human review.
 *   S-3: the original design ran resolveAnswerRows() and a self-answer check as TWO SEPARATE
 *     queries, creating a TOCTOU window where a row inserted between them could redefine "the"
 *     answer. FIXED: ONE query (resolveVerifiedAnswer) now returns the payload AND the sender in the
 *     same read, so there is nothing to reorder between.
 *
 * WHY DISPATCH GOES BACK THROUGH sendChairmanSMS (not a bespoke sender). Re-running the full gate
 * (rubric, over-ask, quiet-hours) on release keeps every guard live for a message that may have sat
 * held for hours; only the consult step is short-circuited, and only with a verdict this module
 * fetched and verified itself in the same call — never a caller-supplied one.
 */

import { detectVerdictDelta } from './should-consult-solomon.js';
import { CHAIRMAN_LANE_AUTOMATED_SENTINEL } from '../comms/adam-outbound/chairman-sms-gate/index.js';
import { enqueueChairmanSms } from '../chairman/sms-bridge.js';

const ANSWER_KIND = 'adam_advisory';

/**
 * ONE query, bounded ASCENDING candidate set: every genuine-shaped answer row for `correlationId`
 * (same matching predicate as lib/coordinator/reply-class.cjs resolveAnswerRows: payload->>reply_to
 * + kind), returning payload AND both sender fields for each — still closing the TOCTOU window a
 * two-query design would leave between "fetch the verdict" and "check who sent it" (S-3): every
 * candidate's sender is read in this same query, nothing is fetched twice.
 *
 * FIX 3 (QF-20260905-746, absorbs QF-20260906-202): previously `.limit(1)` returned ONLY the
 * earliest row, so a corrected LATER genuine-Solomon GO could never displace an earlier
 * marker-tripped answer on the same correlation — the hold was dead by construction (specimen:
 * hold 824c7d54, Solomon 25584a06's real GO refused, only escaped by a re-send under a fresh
 * correlation). resolveVerifiedAnswer() below now walks this candidate set newest-first.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} correlationId
 * @returns {Promise<Array<{id: string, sender_session: string|null, sender_type: string|null, payload: *}>>}
 */
async function fetchAnswerRows(supabase, correlationId) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, payload')
    .eq('payload->>reply_to', correlationId)
    .eq('payload->>kind', ANSWER_KIND)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(20);
  if (error || !Array.isArray(data)) return [];
  return data;
}

// FIX 1 (QF-20260905-746): the structured verdict vocabulary solomon-advisory.cjs `send --verdict`
// stamps onto payload.verdict. Only these three values are ever trusted as structured -- anything
// else (a typo, an unrelated string left on payload.verdict by some other caller) is treated as
// ABSENT, never coerced or guessed.
const VALID_STRUCTURED_VERDICTS = new Set(['GO', 'NO', 'AMEND']);
function normalizeStructuredVerdict(v) {
  if (typeof v !== 'string') return null;
  const upper = v.trim().toUpperCase();
  return VALID_STRUCTURED_VERDICTS.has(upper) ? upper : null;
}

// FIX 1, Solomon constraint (a): the ONLY fallback when no structured payload.verdict is present --
// a clean leading token, anchored to the START of the first line (never a substring match anywhere
// in the body, which is what would let "go back and reconsider" misread as approval).
const LEADING_VERDICT_TOKEN_RE = /^\s*(GO|APPROVE|SEND)\b/i;
function hasLeadingGoToken(verdict) {
  const text = typeof verdict === 'string' ? verdict : (verdict && typeof verdict.body === 'string' ? verdict.body : '');
  if (!text) return false;
  return LEADING_VERDICT_TOKEN_RE.test(text.split('\n', 1)[0]);
}

/**
 * ALLOWLIST check (S-2), STRONG form: is `sessionId` a session `claude_sessions` currently marks
 * role='solomon'? Fail-closed: any DB error or absent row is NOT Solomon.
 *
 * KNOWN LIMITATION (VALIDATION sub-agent evidence d09978d0, finding V-1): `claude_sessions.metadata`
 * is CURRENT STATE, not a write-time attestation. Solomon is a rotating singleton role (measured:
 * the seat active at review time was ~2h old; 21 of 27 real verdicts in the live corpus came from a
 * since-retired Solomon session whose role metadata no longer says 'solomon'). A hold that crosses a
 * rotation would be refused by this check ALONE — reintroducing a narrower dead-by-construction class.
 * resolveVerifiedAnswer() below therefore does NOT rely on this function alone; see its combined logic.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|null} sessionId
 * @returns {Promise<boolean>}
 */
export async function isSolomonSession(supabase, sessionId) {
  if (!sessionId) return false;
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id')
    .eq('session_id', sessionId)
    .eq('metadata->>role', 'solomon')
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

/**
 * Combine the answer-row fetch with Solomon-identity verification into one result. Layered check,
 * not a single predicate:
 *   1. STRONG: sender_session currently carries claude_sessions.metadata.role='solomon' (works for
 *      the live seat; independently verified against a source the row's own writer doesn't control).
 *   2. FALLBACK (rotated-out Solomon, V-1): sender_type==='solomon' — a write-time attestation
 *      captured on session_coordination.insertCoordinationRow at the moment the row was written, so
 *      it survives a later role handoff — combined with two cheap denylist guards so this fallback
 *      alone can't reopen S-2's original hole: the sender must differ from BOTH the original asker
 *      AND the shared unattended-sender sentinel (a real Solomon session id is never either).
 * Neither branch alone is sufficient by itself (STRONG is blind to rotation; sender_type alone is
 * self-asserted by the writer) — the AND/OR combination is deliberate, not a shortcut.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} correlationId
 * @param {string|null} askerSessionId
 * @param {object} [deps]
 * @returns {Promise<{found: boolean, isGenuineSolomon: boolean, answerRowId: string|null, verdict: *, structuredVerdict: (string|null)}>}
 */
export async function resolveVerifiedAnswer(supabase, correlationId, askerSessionId, deps = {}) {
  const rows = await (deps.fetchAnswerRows || fetchAnswerRows)(supabase, correlationId);
  const candidates = (rows || []).filter((r) => r && r.payload);
  if (candidates.length === 0) return { found: false, isGenuineSolomon: false, answerRowId: null, verdict: null, structuredVerdict: null };

  const isSolomon = deps.isSolomonSession || isSolomonSession;
  const describe = (row) => ({
    found: true,
    isGenuineSolomon: false, // overwritten by the caller below when genuine
    answerRowId: row.id,
    verdict: row.payload.body ?? row.payload.verdict ?? null,
    structuredVerdict: normalizeStructuredVerdict(row.payload.verdict),
  });

  // FIX 3: walk NEWEST-first so a corrected later genuine-Solomon answer can displace an earlier
  // marker-tripped one -- the first row (from the end) that verifies as genuine wins.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const row = candidates[i];
    const strong = await isSolomon(supabase, row.sender_session ?? null);
    const fallback = row.sender_type === 'solomon'
      && row.sender_session != null
      && row.sender_session !== askerSessionId
      && row.sender_session !== CHAIRMAN_LANE_AUTOMATED_SENTINEL;
    if (strong || fallback) return { ...describe(row), isGenuineSolomon: true };
  }
  // No candidate verified genuine -- surface the LATEST row's data (found=true, unverified),
  // matching the prior single-row semantics for a forged/self-answer.
  return describe(candidates[candidates.length - 1]);
}

/**
 * PURE decision core: given a resolveVerifiedAnswer() result, decide the release verdict. No I/O —
 * testable without a database. Three refusal paths (unanswered, not-genuinely-Solomon, negative/
 * amending verdict) plus release, in that order.
 * @param {{found: boolean, isGenuineSolomon: boolean, answerRowId: string|null, verdict: *, structuredVerdict?: (string|null)}} verified
 * @param {Function} [detectDelta] - injectable override of detectVerdictDelta, for pure unit tests
 * @returns {{action:'hold'|'refuse'|'release', reason: string, answerRowId?: string, verdict?: *}}
 */
export function decideRelease(verified, detectDelta = detectVerdictDelta) {
  if (!verified || !verified.found) return { action: 'hold', reason: 'unanswered' };
  if (!verified.isGenuineSolomon) return { action: 'refuse', reason: 'answerer_not_verified_solomon', answerRowId: verified.answerRowId };

  // FIX 1 (QF-20260905-746), Solomon constraint (a): a STRUCTURED payload.verdict (solomon-advisory
  // send --verdict) is authoritative and is NEVER overridden by the amendment-marker regex below --
  // this is checked FIRST, before detectDelta ever runs.
  if (verified.structuredVerdict === 'NO' || verified.structuredVerdict === 'AMEND') {
    return { action: 'refuse', reason: 'verdict_structured_negative_or_amending', answerRowId: verified.answerRowId, verdict: verified.verdict };
  }
  if (verified.structuredVerdict === 'GO') {
    return { action: 'release', reason: 'verdict_cited', answerRowId: verified.answerRowId, verdict: verified.verdict };
  }

  // No structured verdict: constraint (a)'s ONLY fallback is a clean LEADING token -- also never
  // overridden by the amendment regex (a GO that happens to mention "no hold" must not re-refuse).
  if (hasLeadingGoToken(verified.verdict)) {
    return { action: 'release', reason: 'verdict_cited', answerRowId: verified.answerRowId, verdict: verified.verdict };
  }

  // S-1: presence of an answer is NOT approval. A verdict carrying reject/amend/hold/concern
  // language (the SAME marker set the in-call path uses for near-miss capture) is refused, never
  // auto-sent — this module never judges a rejection "not serious enough" to act on; it always
  // fails toward a human reading the held row, never toward dispatch.
  if (detectDelta(verified.verdict)) {
    return { action: 'refuse', reason: 'verdict_appears_negative_or_amending', answerRowId: verified.answerRowId, verdict: verified.verdict };
  }

  // Solomon constraint (b): neither a structured verdict, nor a clean leading token, nor a
  // detected amendment marker -- this is genuinely ambiguous prose, not a confirmed GO. Refuse
  // loudly (a distinct reason naming exactly what is missing), never a silent release.
  return { action: 'refuse', reason: 'no_structured_verdict_or_leading_token', answerRowId: verified.answerRowId, verdict: verified.verdict };
}

/**
 * Attempt to release ONE held row. Independently re-verifies via resolveVerifiedAnswer() — never
 * trusts a pre-computed verdict passed in. Optimistically claims the row (status held->releasing,
 * mirroring sms_outbound_obligations' proven claim shape) before dispatch so a concurrent sweep run
 * cannot double-release the same decision.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} heldRow - a row from public.chairman_held_sends
 * @param {object} [deps]
 * @param {Function} [deps.resolveVerifiedAnswer] - injectable (supabase, correlationId) => verified result
 * @param {Function} [deps.sendChairmanSMS] - injectable dispatch function
 * @param {Function} [deps.getActiveSolomonId] - QF-20260912-079: injectable (supabase) => sessionId|null,
 *   used ONLY at expiry to decide defer-vs-abandon; defaults to solomon-identity.cjs's real resolver
 * @param {object} [deps.sendOpts] - extra opts forwarded to sendChairmanSMS (e.g. a stub sender in tests)
 * @param {object} [deps.context] - forwarded as sendChairmanSMS's second arg
 * @param {string} [deps.claimedBy]
 * @returns {Promise<object>} outcome descriptor
 */
export async function releaseHeldSend(supabase, heldRow, deps = {}) {
  if (!heldRow.consult_correlation_id) {
    return { action: 'skip', reason: 'no_consult_anchor', heldSendId: heldRow.id };
  }

  const verified = await (deps.resolveVerifiedAnswer || resolveVerifiedAnswer)(supabase, heldRow.consult_correlation_id, heldRow.session_id);
  const decision = decideRelease(verified, deps.detectVerdictDelta);
  if (decision.action !== 'release') {
    // FIX 2 (QF-20260905-746): a consult-bearing hold that has aged past hold_expires_at with
    // GENUINELY no answer is not left immortal in status='held' forever -- it is abandoned, loudly.
    // QF-20260912-079: but an unanswered expiry means two different things -- Solomon was LIVE and
    // simply never answered (an implicit decline: abandon stands), or Solomon was ABSENT (no live
    // heartbeat -- a freeze/outage), in which case the silence proves nothing and the decision must
    // be DELAYED, not lost. Deferred at most once per hold (hasAlreadyDeferredOnce); a still-absent
    // oracle on the second expiry abandons like any other genuinely-unanswered hold.
    if (decision.action === 'hold' && isConsultHoldExpired(heldRow, deps.context)) {
      const getSolomonId = deps.getActiveSolomonId
        || (await import('../coordinator/solomon-identity.cjs')).getActiveSolomonId;
      let liveSolomonId = null;
      try { liveSolomonId = await getSolomonId(supabase); } catch { liveSolomonId = null; }
      if (!liveSolomonId && !hasAlreadyDeferredOnce(heldRow)) {
        return (deps.deferExpiredConsultHoldForAbsentOracle || deferExpiredConsultHoldForAbsentOracle)(supabase, heldRow, deps);
      }
      return (deps.abandonExpiredConsultHold || abandonExpiredConsultHold)(supabase, heldRow, deps);
    }
    // Solomon constraint (b): a refusal is STAMPED on the row itself (last_error), never left as
    // only an aggregate refused=1 in the sweep's summary log line with nothing on the row a human
    // would actually go read. Best-effort -- a stamp failure must never change the decision.
    if (decision.action === 'refuse') {
      const stampReason = `refused: ${decision.reason}${decision.answerRowId ? ` (answer row ${decision.answerRowId})` : ''}`;
      await supabase.from('chairman_held_sends').update({ last_error: stampReason.slice(0, 500) }).eq('id', heldRow.id);
    }
    return { ...decision, heldSendId: heldRow.id };
  }

  // .maybeSingle() (not a bare .select('id')): the .eq('id', ...) predicate already scopes this to
  // at most one row, so the response is genuinely single-or-none, not an unbounded read -- lint
  // finding count-truncation-diff-lint (this PR's own CI).
  const { data: claimed, error: claimErr } = await supabase
    .from('chairman_held_sends')
    .update({ status: 'releasing', claimed_at: new Date().toISOString(), claimed_by: deps.claimedBy || 'chairman-held-sends-release-sweep' })
    .eq('id', heldRow.id).eq('status', 'held').is('claimed_at', null)
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) {
    return { action: 'skip', reason: 'claim_failed_or_already_claimed', heldSendId: heldRow.id };
  }

  const sendChairmanSMSFn = deps.sendChairmanSMS
    || (await import('../comms/adam-outbound/chairman-sms-gate/index.js')).sendChairmanSMS;
  const message = {
    type: 'decision',
    body: heldRow.body,
    options: heldRow.options,
    decisionId: heldRow.decision_id,
    subject: heldRow.subject,
    chairmanUserId: heldRow.chairman_user_id,
    chairmanEmail: heldRow.chairman_email,
    recipientPhone: heldRow.recipient_phone,
    senderCallsign: heldRow.sender_callsign,
    sessionId: heldRow.session_id,
    // SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3): restore the rubric-required reply fields
    // from the hold row so the rubric re-evaluation this release triggers (lint.js checks 3
    // "reply_instruction" and 9 "reply_ids"/message.replyId) doesn't block on fields that were
    // present at hold time but never made it into the release-path reconstruction.
    replyInstruction: heldRow.reply_instruction ?? undefined,
    replyId: heldRow.reply_id ?? undefined,
    noReplyConsequence: heldRow.no_reply_consequence ?? undefined,
  };
  let sendResult = null;
  let sendThrew = null;
  try {
    sendResult = await sendChairmanSMSFn(message, deps.context || {}, {
      ...deps.sendOpts,
      supabase,
      // SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-4): heldRow.body was ALREADY composed once
      // (chairman-sms-gate's composeDecisionSmsBody ran BEFORE the hold — see FR-4 in
      // chairman-sms-gate/index.js). Re-dispatching through sendChairmanSMS without skipCompose
      // would fold message.options/replyInstruction/noReplyConsequence into the body a SECOND
      // time, doubling the text the chairman receives.
      skipCompose: true,
      // The ONE injection point: a verdict THIS FUNCTION independently fetched and verified above,
      // never one supplied by a caller. This is what makes forging non-machine-repeatable — a caller
      // cannot pass a fabricated verdict through releaseHeldSend at all.
      runPreSendConsultLane: async () => ({ action: 'send', consultRecorded: true, verdict: decision.verdict }),
    });
  } catch (err) {
    sendThrew = err;
  }

  // A verdict was genuinely resolved and the row was claimed, but DISPATCH did not succeed --
  // sendChairmanSMS has ~8 distinct sent:false shapes (rubric-blocked, over-ask-held, quiet-hours,
  // transport soft-fail, etc.) plus a throw. None of these may EVER be recorded as
  // status='released'/disposition='send': that would mark an undelivered decision as sent and
  // remove it from the held pool forever, with no retry -- the exact "made unreconcilable by
  // construction" failure class this SD exists to close, one step later. Unclaim back to 'held'
  // (never abandon silently) so the next sweep run retries; attempts/last_error make repeated
  // failures visible instead of an infinite silent loop.
  if (sendThrew || !sendResult || sendResult.sent !== true) {
    const detail = sendThrew ? `dispatch_threw: ${sendThrew.message}` : `dispatch_not_sent: ${JSON.stringify(sendResult)}`;
    // .select('id') is REQUIRED here, not cosmetic: without it a 0-row match (e.g. a prior stuck
    // row this same predicate can't find) reports success identically to a real unclaim, and the
    // row is left silently stranded in status='releasing' forever -- invisible to both this sweep
    // (which only scans status='held') and v_chairman_held_sends_unreconcilable (which doesn't
    // watch 'releasing' either). .maybeSingle() (not a bare array): the .eq('id', ...) predicate
    // already scopes this to at most one row -- lint finding count-truncation-diff-lint (this PR's
    // own CI) -- and a null result makes the 0-row case observable just as well as an empty array.
    const { data: unclaimedRow, error: unclaimErr } = await supabase
      .from('chairman_held_sends')
      .update({
        status: 'held', claimed_at: null, claimed_by: null,
        attempts: (heldRow.attempts || 0) + 1,
        last_error: detail.slice(0, 500),
      })
      .eq('id', heldRow.id).eq('status', 'releasing')
      .select('id')
      .maybeSingle();
    const unclaimFailed = Boolean(unclaimErr) || !unclaimedRow;
    return {
      action: sendThrew ? 'dispatch_threw_unclaimed' : 'dispatch_not_sent_unclaimed',
      heldSendId: heldRow.id,
      sendResult,
      ...(sendThrew ? { error: sendThrew.message } : {}),
      ...(unclaimFailed ? { unclaimError: unclaimErr ? unclaimErr.message : 'row_not_found_stranded_in_releasing' } : {}),
    };
  }

  const { error: releaseErr } = await supabase
    .from('chairman_held_sends')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
      release_disposition: 'send',
      release_verdict: typeof decision.verdict === 'string' ? decision.verdict : JSON.stringify(decision.verdict),
      release_verdict_answer_row_id: decision.answerRowId,
      released_send_result: sendResult,
    })
    .eq('id', heldRow.id);
  if (releaseErr) {
    return { action: 'released_but_audit_write_failed', heldSendId: heldRow.id, sendResult, error: releaseErr.message };
  }
  return { action: 'released', heldSendId: heldRow.id, sendResult, answerRowId: decision.answerRowId };
}

/**
 * FIX 2 (QF-20260905-746): is this consult-bearing hold past its hold_expires_at? Pure/injectable
 * clock (context.now) so tests never race a real one. A missing/invalid hold_expires_at is treated
 * as NOT expired (fail toward continuing to hold, never toward abandoning a row with no known TTL).
 * @param {object} heldRow
 * @param {{now?: number}} [context]
 * @returns {boolean}
 */
function isConsultHoldExpired(heldRow, context) {
  const nowMs = context && Number.isFinite(context.now) ? context.now : Date.now();
  const expiresMs = heldRow.hold_expires_at ? new Date(heldRow.hold_expires_at).getTime() : NaN;
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

// QF-20260912-079: matches database/migrations/20260824_chairman_held_sends.sql's own
// hold_expires_at DEFAULT (now() + interval '24 hours') -- the ONE deferral extends by the same
// window the hold was originally granted, never a shorter/arbitrary re-check interval.
const DEFER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * QF-20260912-079: has this hold already been deferred once for an absent oracle? Metadata-only
 * marker (no schema change) -- mirrors abandonExpiredConsultHold's own metadata.void_reason
 * convention. A hold deferred once and STILL expired with the oracle STILL absent abandons on the
 * second check, matching decideExpiryOutcome's contract.
 * @param {object} heldRow
 * @returns {boolean}
 */
function hasAlreadyDeferredOnce(heldRow) {
  return Boolean(heldRow.metadata && heldRow.metadata.qf_20260912_079_deferred_at);
}

/**
 * QF-20260912-079: defer (not abandon) a consult-bearing hold whose expiry coincided with the
 * Solomon oracle being ABSENT (no live heartbeat), rather than a genuine implicit decline. Extends
 * hold_expires_at by DEFER_WINDOW_MS ONCE (stamped in metadata so a second expiry check knows not
 * to defer again) and enqueues a chairman-visible notice distinguishing "delayed" from "lost".
 * Mirrors abandonExpiredConsultHold's claim-then-write + best-effort-notify shape.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} heldRow
 * @param {object} [deps]
 * @param {Function} [deps.enqueueChairmanSms] - injectable, for tests
 * @returns {Promise<object>} outcome descriptor
 */
export async function deferExpiredConsultHoldForAbsentOracle(supabase, heldRow, deps = {}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const newExpiresAt = new Date(now.getTime() + DEFER_WINDOW_MS).toISOString();
  const deferReason = `deferred by ${deps.claimedBy || 'chairman-held-sends-release-sweep'}: consult correlation ${heldRow.consult_correlation_id} produced no genuine Solomon answer before hold_expires_at (${heldRow.hold_expires_at}), and the Solomon oracle appears ABSENT (no live heartbeat) rather than having declined -- deferring once so a chairman decision is delayed, never lost (QF-20260912-079).`;
  const { data: claimed, error: claimErr } = await supabase
    .from('chairman_held_sends')
    .update({
      hold_expires_at: newExpiresAt,
      last_error: deferReason.slice(0, 500),
      metadata: { ...(heldRow.metadata || {}), qf_20260912_079_deferred_at: nowIso, qf_20260912_079_defer_reason: deferReason },
    })
    .eq('id', heldRow.id).eq('status', 'held')
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) {
    return { action: 'skip', reason: 'claim_failed_or_already_claimed', heldSendId: heldRow.id };
  }
  const notify = deps.enqueueChairmanSms || enqueueChairmanSms;
  const notice = await notify(supabase, {
    recipientPhone: heldRow.recipient_phone,
    kind: 'heartbeat_status',
    body: `A held chairman decision (${(heldRow.subject || '(no subject)').slice(0, 60)}) is DELAYED, not lost -- its Solomon consult never answered and the Solomon oracle appears offline. It will be re-checked by ${newExpiresAt}.`,
    decisionId: heldRow.decision_id || null,
    dedupeKey: `chairman-held-sends-deferred:${heldRow.id}`,
  }).catch((e) => ({ enqueued: false, reason: (e && e.message) || String(e) }));
  return { action: 'deferred', reason: 'consult_hold_expired_oracle_absent', heldSendId: heldRow.id, newExpiresAt, noticeEnqueued: Boolean(notice && notice.enqueued) };
}

/**
 * FIX 2 (QF-20260905-746): a consult-bearing hold (releaseHeldSend's own path, NOT the
 * quiet_hour-only releaseExpiredQuietHourHold below) whose consult NEVER got an answer and has now
 * aged past hold_expires_at. Without this, such a row is IMMORTAL: decideRelease keeps returning
 * {action:'hold', reason:'unanswered'} forever (measured: hold 5f657b74 sat seven days past its
 * hold_expires_at, zero answers, before being hand-voided). Mirrors the claim-then-write shape of
 * releaseExpiredQuietHourHold, but the terminal status is 'abandoned' (matching the same-named
 * one-off precedent, scripts/one-off/void-stranded-chairman-held-sends-decision-002.mjs) rather
 * than 'released'/'expired' -- nothing was ever cited to release. NEVER silent: best-effort
 * enqueues a chairman-visible sms_outbound_obligations kind=heartbeat_status notice via the
 * existing durable, idempotent enqueueChairmanSms helper (dedupe_key keyed on this row's id, so a
 * retried sweep pass never double-notifies) alongside the DB abandonment.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} heldRow
 * @param {object} [deps]
 * @param {Function} [deps.enqueueChairmanSms] - injectable, for tests
 * @returns {Promise<object>} outcome descriptor
 */
export async function abandonExpiredConsultHold(supabase, heldRow, deps = {}) {
  const now = new Date().toISOString();
  // QF-20260912-079 FIX SHAPE (d): name WHICH of the two abandon paths this is, in both the
  // durable void_reason and the chairman-visible notice -- a genuine implicit decline (the oracle
  // was live and simply never answered) reads differently from a second-expiry abandon after a
  // deferral already gave the oracle one more window while it appeared absent.
  const wasDeferredOnce = hasAlreadyDeferredOnce(heldRow);
  const oracleClause = wasDeferredOnce
    ? 'the Solomon oracle was already given one deferral window while appearing absent and STILL produced no answer'
    : 'a live Solomon oracle simply never answered (an implicit decline)';
  const voidReason = `abandoned by ${deps.claimedBy || 'chairman-held-sends-release-sweep'}: consult correlation ${heldRow.consult_correlation_id} produced no genuine Solomon answer before hold_expires_at (${heldRow.hold_expires_at}) -- ${oracleClause} -- FIX 2, QF-20260905-746 (consult-bearing holds previously had no expiry path); QF-20260912-079 (declined-vs-absent distinction).`;
  const { data: claimed, error: claimErr } = await supabase
    .from('chairman_held_sends')
    .update({
      status: 'abandoned',
      released_at: now,
      last_error: voidReason.slice(0, 500),
      metadata: { ...(heldRow.metadata || {}), void_reason: voidReason, voided_at: now, voided_by: 'QF-20260905-746' },
    })
    .eq('id', heldRow.id).eq('status', 'held')
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) {
    return { action: 'skip', reason: 'claim_failed_or_already_claimed', heldSendId: heldRow.id };
  }
  const notify = deps.enqueueChairmanSms || enqueueChairmanSms;
  const noticeDetail = wasDeferredOnce
    ? 'its Solomon consult never answered even after being re-checked once while the oracle appeared offline'
    : 'its Solomon consult never answered';
  const notice = await notify(supabase, {
    recipientPhone: heldRow.recipient_phone,
    kind: 'heartbeat_status',
    body: `A held chairman decision (${(heldRow.subject || '(no subject)').slice(0, 60)}) never reached you -- ${noticeDetail} and the hold has expired. It was NOT sent.`,
    decisionId: heldRow.decision_id || null,
    dedupeKey: `chairman-held-sends-abandoned:${heldRow.id}`,
  }).catch((e) => ({ enqueued: false, reason: (e && e.message) || String(e) }));
  return { action: 'abandoned', reason: 'consult_hold_expired_unanswered', heldSendId: heldRow.id, noticeEnqueued: Boolean(notice && notice.enqueued) };
}

/**
 * QF-20260902-939: release a hold_reason='quiet_hour' row once its window has passed. Keyed on
 * hold_expires_at ONLY -- unlike releaseHeldSend above, no Solomon verdict is ever consulted here
 * because none was ever sought at hold time (the chairman-sms-gate wrote this row directly off a
 * quiet_hours-only rubric block, not a pre-send consult). Same optimistic claim / unclaim-on-
 * failure shape as releaseHeldSend so the sweep's D2 per-row isolation and outcome buckets need no
 * change; the terminal success status is 'expired' (not 'released') because the
 * chairman_held_sends_released_requires_citation_check CHECK constraint (database/migrations/
 * 20260824_chairman_held_sends.sql) hard-requires release_verdict_answer_row_id NOT NULL for
 * status='released' -- a citation this hold, having no Solomon consult, can never produce. 'expired'
 * carries no such constraint and is literally true: hold_expires_at was reached.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} heldRow - a row from public.chairman_held_sends with hold_reason='quiet_hour'
 * @param {object} [deps] - same shape as releaseHeldSend's deps (sendChairmanSMS, sendOpts, context, claimedBy)
 * @returns {Promise<object>} outcome descriptor, same action vocabulary as releaseHeldSend
 */
export async function releaseExpiredQuietHourHold(supabase, heldRow, deps = {}) {
  const nowMs = deps.context && Number.isFinite(deps.context.now) ? deps.context.now : Date.now();
  const expiresMs = heldRow.hold_expires_at ? new Date(heldRow.hold_expires_at).getTime() : NaN;
  if (!Number.isFinite(expiresMs) || expiresMs > nowMs) {
    return { action: 'skip', reason: 'not_yet_expired', heldSendId: heldRow.id };
  }

  const { data: claimed, error: claimErr } = await supabase
    .from('chairman_held_sends')
    .update({ status: 'releasing', claimed_at: new Date().toISOString(), claimed_by: deps.claimedBy || 'chairman-held-sends-release-sweep' })
    .eq('id', heldRow.id).eq('status', 'held').is('claimed_at', null)
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) {
    return { action: 'skip', reason: 'claim_failed_or_already_claimed', heldSendId: heldRow.id };
  }

  const sendChairmanSMSFn = deps.sendChairmanSMS
    || (await import('../comms/adam-outbound/chairman-sms-gate/index.js')).sendChairmanSMS;
  const message = {
    type: 'decision',
    body: heldRow.body,
    options: heldRow.options,
    decisionId: heldRow.decision_id,
    subject: heldRow.subject,
    chairmanUserId: heldRow.chairman_user_id,
    chairmanEmail: heldRow.chairman_email,
    recipientPhone: heldRow.recipient_phone,
    senderCallsign: heldRow.sender_callsign,
    sessionId: heldRow.session_id,
    replyInstruction: heldRow.reply_instruction ?? undefined,
    replyId: heldRow.reply_id ?? undefined,
    noReplyConsequence: heldRow.no_reply_consequence ?? undefined,
  };
  let sendResult = null;
  let sendThrew = null;
  try {
    // allowQuietHours:true -- the window this hold was queued FOR has now passed (that is what
    // expired means here), so the rubric must not re-block this exact dispatch on the same check.
    sendResult = await sendChairmanSMSFn(message, { ...(deps.context || {}), allowQuietHours: true }, {
      ...deps.sendOpts,
      supabase,
      skipCompose: true,
    });
  } catch (err) {
    sendThrew = err;
  }

  if (sendThrew || !sendResult || sendResult.sent !== true) {
    const detail = sendThrew ? `dispatch_threw: ${sendThrew.message}` : `dispatch_not_sent: ${JSON.stringify(sendResult)}`;
    const { data: unclaimedRow, error: unclaimErr } = await supabase
      .from('chairman_held_sends')
      .update({
        status: 'held', claimed_at: null, claimed_by: null,
        attempts: (heldRow.attempts || 0) + 1,
        last_error: detail.slice(0, 500),
      })
      .eq('id', heldRow.id).eq('status', 'releasing')
      .select('id')
      .maybeSingle();
    const unclaimFailed = Boolean(unclaimErr) || !unclaimedRow;
    return {
      action: sendThrew ? 'dispatch_threw_unclaimed' : 'dispatch_not_sent_unclaimed',
      heldSendId: heldRow.id,
      sendResult,
      ...(sendThrew ? { error: sendThrew.message } : {}),
      ...(unclaimFailed ? { unclaimError: unclaimErr ? unclaimErr.message : 'row_not_found_stranded_in_releasing' } : {}),
    };
  }

  const { error: releaseErr } = await supabase
    .from('chairman_held_sends')
    .update({
      status: 'expired',
      released_at: new Date().toISOString(),
      release_disposition: 'send',
      release_verdict: 'quiet_hour_window_expired',
      released_send_result: sendResult,
    })
    .eq('id', heldRow.id);
  if (releaseErr) {
    return { action: 'released_but_audit_write_failed', heldSendId: heldRow.id, sendResult, error: releaseErr.message };
  }
  return { action: 'released', heldSendId: heldRow.id, sendResult };
}
