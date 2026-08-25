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

const ANSWER_KIND = 'adam_advisory';

/**
 * ONE query: the earliest genuine answer row for `correlationId` (same matching predicate as
 * lib/coordinator/reply-class.cjs resolveAnswerRows: payload->>reply_to + kind, earliest-first),
 * returning the payload AND both sender fields together — closing the TOCTOU window a two-query
 * design would leave between "fetch the verdict" and "check who sent it" (S-3).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} correlationId
 * @returns {Promise<{answerRowId: string|null, senderSession: string|null, senderType: string|null, payload: *|null}>}
 */
async function fetchAnswerRow(supabase, correlationId) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, payload')
    .eq('payload->>reply_to', correlationId)
    .eq('payload->>kind', ANSWER_KIND)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return { answerRowId: null, senderSession: null, senderType: null, payload: null };
  const row = data[0];
  return { answerRowId: row.id, senderSession: row.sender_session ?? null, senderType: row.sender_type ?? null, payload: row.payload ?? null };
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
 * @returns {Promise<{found: boolean, isGenuineSolomon: boolean, answerRowId: string|null, verdict: *}>}
 */
export async function resolveVerifiedAnswer(supabase, correlationId, askerSessionId, deps = {}) {
  const { answerRowId, senderSession, senderType, payload } = await (deps.fetchAnswerRow || fetchAnswerRow)(supabase, correlationId);
  if (!payload) return { found: false, isGenuineSolomon: false, answerRowId: null, verdict: null };
  const strong = await (deps.isSolomonSession || isSolomonSession)(supabase, senderSession);
  const fallback = senderType === 'solomon'
    && senderSession != null
    && senderSession !== askerSessionId
    && senderSession !== CHAIRMAN_LANE_AUTOMATED_SENTINEL;
  return { found: true, isGenuineSolomon: strong || fallback, answerRowId, verdict: payload.body ?? payload.verdict ?? null };
}

/**
 * PURE decision core: given a resolveVerifiedAnswer() result, decide the release verdict. No I/O —
 * testable without a database. Three refusal paths (unanswered, not-genuinely-Solomon, negative/
 * amending verdict) plus release, in that order.
 * @param {{found: boolean, isGenuineSolomon: boolean, answerRowId: string|null, verdict: *}} verified
 * @param {Function} [detectDelta] - injectable override of detectVerdictDelta, for pure unit tests
 * @returns {{action:'hold'|'refuse'|'release', reason: string, answerRowId?: string, verdict?: *}}
 */
export function decideRelease(verified, detectDelta = detectVerdictDelta) {
  if (!verified || !verified.found) return { action: 'hold', reason: 'unanswered' };
  if (!verified.isGenuineSolomon) return { action: 'refuse', reason: 'answerer_not_verified_solomon', answerRowId: verified.answerRowId };
  // S-1: presence of an answer is NOT approval. A verdict carrying reject/amend/hold/concern
  // language (the SAME marker set the in-call path uses for near-miss capture) is refused, never
  // auto-sent — this module never judges a rejection "not serious enough" to act on; it always
  // fails toward a human reading the held row, never toward dispatch.
  if (detectDelta(verified.verdict)) {
    return { action: 'refuse', reason: 'verdict_appears_negative_or_amending', answerRowId: verified.answerRowId, verdict: verified.verdict };
  }
  return { action: 'release', reason: 'verdict_cited', answerRowId: verified.answerRowId, verdict: verified.verdict };
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
  };
  let sendResult = null;
  let sendThrew = null;
  try {
    sendResult = await sendChairmanSMSFn(message, deps.context || {}, {
      ...deps.sendOpts,
      supabase,
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
