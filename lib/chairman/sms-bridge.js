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
    .limit(1);
  const decisionId = notifRows?.[0]?.decision_id;

  if (!decisionId) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match' });
    return { resolved: false, outcome: 'no_match' };
  }

  const { data: decision } = await supabase
    .from('chairman_decisions')
    .select('id, status, brief_data, sms_reply_used_at, sms_reply_token_expires_at')
    .eq('id', decisionId)
    .maybeSingle();

  if (!decision || decision.status !== 'pending' || decision.sms_reply_used_at) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', matchedDecisionId: decisionId });
    return { resolved: false, outcome: 'no_match' };
  }

  if (!decision.sms_reply_token_expires_at || new Date(decision.sms_reply_token_expires_at) < new Date()) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'expired', matchedDecisionId: decisionId });
    return { resolved: false, outcome: 'expired' };
  }

  const answeredAt = new Date().toISOString();
  const mergedBriefData = { ...(decision.brief_data || {}), sms_reply: { text: body, answered_at: answeredAt, from } };
  await supabase
    .from('chairman_decisions')
    .update({ brief_data: mergedBriefData, sms_reply_used_at: answeredAt })
    .eq('id', decisionId);

  await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'answered', matchedDecisionId: decisionId });
  return { resolved: true, outcome: 'answered', decisionId };
}

export { composeMessage, TOKEN_TTL_MS, MAX_SMS_BODY_LENGTH, INBOUND_RATE_LIMIT };
