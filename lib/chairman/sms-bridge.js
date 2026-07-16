/**
 * Outbound send + inbound reply resolution for the two-way chairman SMS bridge.
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-4/FR-5.
 *
 * Design note on "resolving" a decision: the webhook's job is to durably record the
 * chairman's raw reply against the correct decision, exactly once — NOT to guess an
 * approved/rejected verdict from free text. chairman_decisions.status stays 'pending';
 * brief_data.sms_reply carries the answer for the agent's next tick to consume (mirrors
 * the archived plan's own wording: "the agent's next tick consumes it and resolves the
 * decision" — the agent resolves it, this module only delivers the reply). This also
 * avoids firing chairman_decisions' approval-side-effect triggers on a guess.
 *
 * Correlation is BY PHONE NUMBER to the most recent channel='sms' chairman_notifications
 * row for that number (per the archived plan: "recipient + most-recent-pending"), not by
 * asking the chairman to type a nonce back — real SMS replies are free text ("yes",
 * "approve the budget"), not codes. sms_reply_token/expires_at/used_at is the single-use,
 * TTL-bound SERVER-SIDE binding that prevents a stale/replayed reply from re-resolving an
 * already-answered or long-expired question.
 */
import crypto from 'crypto';
import { classifyConsequence } from './consequence-classifier.js';
import { checkRateLimit } from '../notifications/rate-limiter.js';
import { isWithinChairmanQuietWindow } from '../notifications/resend-adapter.js';
import twilioProvider from '../messaging/providers/twilio-provider.js';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SMS_BODY_LENGTH = 160;
const INBOUND_RATE_LIMIT = 5;
const INBOUND_RATE_WINDOW_MINUTES = 60;
// How many recent SMS-channel notifications to a phone number to consider when looking
// for the most-recent-PENDING one (not just the most-recently-sent) — see the docstring
// on handleInboundSmsReply below.
//
// KNOWN TRACKED LIMITATION (follow-up verification of PR #6093's adversarial-review
// fixes): if there are MORE than this many outstanding SMS sends to one phone number and
// the genuinely-open pending decision is older than the lookback window, a reply to it
// resolves as 'no_match' rather than being found. Given FR-4's per-hour rate cap
// (default 10/hr) and that only LOW/MEDIUM-consequence questions are SMS-eligible at all,
// having 6+ simultaneously-unanswered SMS questions to the same person is an extreme,
// not-yet-observed operational scenario — raise this constant (or add pagination) if it
// is ever hit in practice.
const CANDIDATE_NOTIFICATION_LOOKBACK = 5;

function composeMessage(title) {
  const suffix = ' Reply to answer.';
  const budget = MAX_SMS_BODY_LENGTH - suffix.length;
  const truncated = title.length > budget ? `${title.slice(0, budget - 1)}…` : title;
  return `${truncated}${suffix}`;
}

/**
 * Send a chairman a LOW/MEDIUM-consequence question over SMS. Never sends HIGH-consequence
 * questions regardless of caller intent (fail-closed — FR-3/FR-4).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{decisionId: string, chairmanUserId: string, chairmanEmail: string, chairmanPhone: string,
 *   title: string, decisionType?: string, context?: string|Object}} opts
 * @param {import('../messaging/messaging-provider.js').MessagingProvider} [provider]
 * @param {{quietWindow?: Function}} [testSeams] - _quietWindow override for deterministic tests
 *   (mirrors lib/chairman/record-pending-decision.mjs's escalateChairmanDecision convention)
 * @returns {Promise<{sent: boolean, reason?: string, consequence: string, token?: string, provider_message_id?: string}>}
 */
export async function sendChairmanSmsQuestion(supabase, opts, provider = twilioProvider, { quietWindow = isWithinChairmanQuietWindow } = {}) {
  const { decisionId, chairmanUserId, chairmanEmail, chairmanPhone, title, decisionType, context } = opts;

  const consequence = classifyConsequence({ decisionType, title, context });
  if (consequence === 'high') {
    return { sent: false, reason: 'high_consequence', consequence };
  }

  if (quietWindow()) {
    return { sent: false, reason: 'quiet_window', consequence };
  }

  const rate = await checkRateLimit(supabase, chairmanEmail, undefined, { channel: 'sms' });
  if (!rate.allowed) {
    return { sent: false, reason: 'rate_limited', consequence };
  }

  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const message = composeMessage(title);

  const result = await provider.send({ to: chairmanPhone, body: message });
  const notifStatus = result.status === 'failed' ? 'failed' : result.status;

  await supabase.from('chairman_notifications').insert({
    chairman_user_id: chairmanUserId,
    recipient_email: chairmanEmail,
    recipient_phone: chairmanPhone,
    notification_type: 'immediate',
    channel: 'sms',
    decision_id: decisionId,
    status: notifStatus,
    provider_message_id: result.provider_message_id || null,
    error_message: result.reason || null,
    sent_at: notifStatus === 'failed' ? null : new Date().toISOString(),
  });

  if (notifStatus === 'failed') {
    return { sent: false, reason: result.reason || 'provider_failed', consequence };
  }

  await supabase
    .from('chairman_decisions')
    .update({
      sms_reply_token: token,
      sms_reply_token_expires_at: expiresAt,
      consequence_level: consequence,
    })
    .eq('id', decisionId);

  return { sent: true, consequence, token, provider_message_id: result.provider_message_id };
}

async function logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome, matchedDecisionId = null }) {
  await supabase.from('sms_inbound_log').insert({
    from_phone: from,
    to_phone: to || null,
    body_raw: body || null,
    provider_message_id: messageSid || null,
    signature_valid: signatureValid,
    matched_decision_id: matchedDecisionId,
    outcome,
  });
}

/**
 * Resolve an inbound SMS reply against its originating pending decision.
 * ALWAYS logs to sms_inbound_log regardless of outcome (audit requirement, including
 * rejected/expired/spoofed attempts). NEVER stamps decided_by_user_id — SMS is
 * unauthenticated and that field is reserved for the authenticated-console path.
 *
 * Correlates against the most-recent-PENDING SMS question sent to that phone number
 * (looking back over CANDIDATE_NOTIFICATION_LOOKBACK recent sends), not simply the
 * single most-recently-sent one — a reply to an earlier still-open question must not
 * be misattributed to a later one that has already been answered or expired
 * (adversarial review finding, deep-tier PR #6093).
 *
 * The single-use claim is an atomic `UPDATE ... WHERE sms_reply_used_at IS NULL`
 * (via `.is('sms_reply_used_at', null)`), not a read-check-then-unconditional-write —
 * closing the TOCTOU window a separate read/write pair would leave open under two
 * concurrent inbound requests for the same decision (same adversarial review pass).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{from: string, to: string, body: string, messageSid: string, signatureValid: boolean}} inbound
 * @returns {Promise<{resolved: boolean, outcome: string, decisionId?: string}>}
 */
export async function handleInboundSmsReply(supabase, inbound) {
  const { from, to, body, messageSid, signatureValid } = inbound;

  if (!signatureValid) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'invalid_signature' });
    return { resolved: false, outcome: 'invalid_signature' };
  }

  const windowStart = new Date(Date.now() - INBOUND_RATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('sms_inbound_log')
    .select('*', { count: 'exact', head: true })
    .eq('from_phone', from)
    .gte('created_at', windowStart);
  if ((count || 0) >= INBOUND_RATE_LIMIT) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'rate_limited' });
    return { resolved: false, outcome: 'rate_limited' };
  }

  const { data: notifRows } = await supabase
    .from('chairman_notifications')
    .select('decision_id')
    .eq('channel', 'sms')
    .eq('recipient_phone', from)
    .not('decision_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(CANDIDATE_NOTIFICATION_LOOKBACK);

  const candidateIds = [...new Set((notifRows || []).map((r) => r.decision_id))];
  if (candidateIds.length === 0) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match' });
    return { resolved: false, outcome: 'no_match' };
  }

  const { data: candidateDecisions } = await supabase
    .from('chairman_decisions')
    .select('id, status, brief_data, sms_reply_used_at, sms_reply_token_expires_at')
    .in('id', candidateIds);

  const byId = new Map((candidateDecisions || []).map((d) => [d.id, d]));
  const now = new Date();
  let decision = null;
  for (const id of candidateIds) {
    const d = byId.get(id);
    if (d && d.status === 'pending' && !d.sms_reply_used_at && d.sms_reply_token_expires_at && new Date(d.sms_reply_token_expires_at) >= now) {
      decision = d;
      break;
    }
  }

  if (!decision) {
    // Best-effort diagnostic label using the single most recent candidate — not
    // security-relevant (both branches equally refuse to resolve anything).
    const mostRecent = byId.get(candidateIds[0]);
    const outcome = mostRecent && mostRecent.status === 'pending' && !mostRecent.sms_reply_used_at
      ? 'expired'
      : 'no_match';
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome, matchedDecisionId: candidateIds[0] });
    return { resolved: false, outcome };
  }

  const decisionId = decision.id;
  const answeredAt = new Date().toISOString();
  const mergedBriefData = { ...(decision.brief_data || {}), sms_reply: { text: body, answered_at: answeredAt, from } };

  const { data: updated } = await supabase
    .from('chairman_decisions')
    .update({ brief_data: mergedBriefData, sms_reply_used_at: answeredAt })
    .eq('id', decisionId)
    .is('sms_reply_used_at', null)
    .select('id');

  if (!updated || updated.length === 0) {
    // Lost the race to a concurrent request that claimed this decision first.
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', matchedDecisionId: decisionId });
    return { resolved: false, outcome: 'no_match' };
  }

  await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'answered', matchedDecisionId: decisionId });
  return { resolved: true, outcome: 'answered', decisionId };
}

export { composeMessage, TOKEN_TTL_MS, MAX_SMS_BODY_LENGTH, INBOUND_RATE_LIMIT };
