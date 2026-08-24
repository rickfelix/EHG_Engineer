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
 * repeatable. This module is the hardened successor: it calls resolveAnswerRows() ITSELF, refuses
 * release on an unanswered/not-found correlation, and additionally refuses a SELF-ANSWERED
 * correlation (the asking session and the answering session being the same party) — a class the
 * one-off script had no way to detect at all.
 *
 * WHY DISPATCH GOES BACK THROUGH sendChairmanSMS (not a bespoke sender). Re-running the full gate
 * (rubric, over-ask, quiet-hours) on release keeps every guard live for a message that may have sat
 * held for hours; only the consult step is short-circuited, and only with a verdict this module
 * fetched and verified itself in the same call — never a caller-supplied one.
 */

const ANSWER_KIND = 'adam_advisory';

/**
 * Fetch the earliest genuine answer row for `correlationId` (mirrors lib/coordinator/reply-class.cjs
 * resolveAnswerRows' matching predicate) and report whether its sender is the SAME session that
 * asked — i.e. a self-answer. Deliberately a separate, narrower query rather than widening the
 * shared resolveAnswerRows (which returns payload only, not sender_session, and is relied on
 * elsewhere): this module needs one extra column for exactly one anti-forgery check.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} correlationId
 * @param {string|null} askerSessionId
 * @returns {Promise<{answerRowId: string|null, selfAnswered: boolean}>}
 */
export async function checkSelfAnswered(supabase, correlationId, askerSessionId) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session')
    .eq('payload->>reply_to', correlationId)
    .eq('payload->>kind', ANSWER_KIND)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return { answerRowId: null, selfAnswered: false };
  const row = data[0];
  return {
    answerRowId: row.id,
    selfAnswered: askerSessionId != null && row.sender_session === askerSessionId,
  };
}

/**
 * PURE decision core: given a resolved answer payload (or undefined/null) and the self-answer
 * check, decide the release verdict. No I/O — testable without a database.
 * @param {*} answerPayload
 * @param {{answerRowId: string|null, selfAnswered: boolean}} selfCheck
 * @returns {{action:'hold'|'refuse'|'release', reason: string, answerRowId?: string, verdict?: *}}
 */
export function decideRelease(answerPayload, selfCheck) {
  if (!answerPayload) return { action: 'hold', reason: 'unanswered' };
  if (selfCheck.selfAnswered) return { action: 'refuse', reason: 'self_answered', answerRowId: selfCheck.answerRowId };
  if (!selfCheck.answerRowId) return { action: 'refuse', reason: 'answer_row_unconfirmed' };
  return {
    action: 'release',
    reason: 'verdict_cited',
    answerRowId: selfCheck.answerRowId,
    verdict: answerPayload.body ?? answerPayload.verdict ?? null,
  };
}

/**
 * Attempt to release ONE held row. Independently re-verifies via resolveAnswerRows() and
 * checkSelfAnswered() — never trusts a pre-computed verdict passed in. Optimistically claims the
 * row (status held->releasing, mirroring sms_outbound_obligations' proven claim shape) before
 * dispatch so a concurrent sweep run cannot double-release the same decision.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} heldRow - a row from public.chairman_held_sends
 * @param {object} [deps]
 * @param {Function} [deps.resolveAnswerRows] - injectable (supabase, ids) => Map<corr, payload>
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

  const resolveAnswerRowsFn = deps.resolveAnswerRows
    || (await import('../coordinator/reply-class.cjs')).resolveAnswerRows;
  const answers = await resolveAnswerRowsFn(supabase, [heldRow.consult_correlation_id]);
  const answerPayload = answers.get(heldRow.consult_correlation_id);

  const selfCheck = answerPayload
    ? await (deps.checkSelfAnswered || checkSelfAnswered)(supabase, heldRow.consult_correlation_id, heldRow.session_id)
    : { answerRowId: null, selfAnswered: false };

  const decision = decideRelease(answerPayload, selfCheck);
  if (decision.action !== 'release') {
    return { ...decision, heldSendId: heldRow.id };
  }

  const { data: claimed, error: claimErr } = await supabase
    .from('chairman_held_sends')
    .update({ status: 'releasing', claimed_at: new Date().toISOString(), claimed_by: deps.claimedBy || 'chairman-held-sends-release-sweep' })
    .eq('id', heldRow.id).eq('status', 'held').is('claimed_at', null)
    .select('id');
  if (claimErr || !Array.isArray(claimed) || claimed.length === 0) {
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
    const { error: unclaimErr } = await supabase
      .from('chairman_held_sends')
      .update({
        status: 'held', claimed_at: null, claimed_by: null,
        attempts: (heldRow.attempts || 0) + 1,
        last_error: detail.slice(0, 500),
      })
      .eq('id', heldRow.id).eq('status', 'releasing');
    return {
      action: sendThrew ? 'dispatch_threw_unclaimed' : 'dispatch_not_sent_unclaimed',
      heldSendId: heldRow.id,
      sendResult,
      ...(sendThrew ? { error: sendThrew.message } : {}),
      ...(unclaimErr ? { unclaimError: unclaimErr.message } : {}),
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
