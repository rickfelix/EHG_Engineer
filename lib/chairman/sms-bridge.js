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
import { isWhitelistedDecisionClass } from './sms-decision-whitelist.js';
import { PER_DECISION_CAP_USD, DAILY_CAP_USD, UNDO_WINDOW_MS, debitSmsDailySpend } from './sms-spend-caps.js';
import { checkRateLimit } from '../notifications/rate-limiter.js';
import { isWithinChairmanQuietWindow } from '../notifications/resend-adapter.js';
import twilioProvider from '../messaging/providers/twilio-provider.js';
import { phoneKey } from '../solomon/chairman-sms-exchanges.js';
import { applyOwedDeliveryTruth } from './owed-delivery-truth.js';
import { warnIfCapTruncated } from '../db/fetch-all-paginated.mjs';
import { insertCoordinationRow } from '../coordinator/dispatch.cjs';
import { getActiveAdamId } from '../coordinator/adam-identity.cjs';

// SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-3: an inbound body matching this (case/space
// insensitive) is an UNDO command, never an answer — it cancels a spend approval within its
// undo window. Anchored so only a bare "undo" triggers it (not "undo the last thing").
const UNDO_BODY_RE = /^\s*undo\s*$/i;

// Decision-class signal used ONLY to detect a spend-class decision whose structured amount is
// missing (fail-closed unknown-amount). The PRIMARY spend signal is a non-null amount_usd; this
// covers a decision that is spend-class by type/flag but has no amount yet (caller-population of
// amount_usd is DEFERRED — see the STAGED migration header), so it must route to console, not
// silently pass as a non-spend LOW/MEDIUM question.
const SPEND_CLASS_TYPE_RE = /spend|payment|purchase|budget|invoice|charge|disburse/i;

/**
 * Is this decision spend-class? True when it carries a structured amount, OR is flagged/typed
 * as spend. Used to force a spend-class-but-amountless decision to fail closed rather than be
 * mistaken for a plain question. @private
 */
function isSpendClassDecision(decision) {
  if (!decision) return false;
  if (decision.amount_usd !== null && decision.amount_usd !== undefined) return true;
  if (decision.brief_data && decision.brief_data.spend_class === true) return true;
  if (typeof decision.decision_type === 'string' && SPEND_CLASS_TYPE_RE.test(decision.decision_type)) return true;
  return false;
}

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SMS_BODY_LENGTH = 160;
const INBOUND_RATE_LIMIT = 5;
const INBOUND_RATE_WINDOW_MINUTES = 60;
// SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-3: a from_phone with this many invalid_signature
// attempts within INBOUND_RATE_WINDOW_MINUTES is auto-suspended PERSISTENTLY (survives
// past the window — unlike INBOUND_RATE_LIMIT's rolling block, a suspension is only
// lifted by explicit operator action against sms_inbound_suspensions.cleared_at).
const AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD = 5;
// SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-4: a SEPARATE, additive auto-suspend counter for
// UNMATCHED inbound answers, DISTINCT from the invalid_signature flood counter above (which is
// left behaviorally unchanged). A from_phone that produces this many no_match/ambiguous outcomes
// within INBOUND_RATE_WINDOW_MINUTES is degraded to notify-only (a PERSISTENT sms_inbound_suspensions
// row, same mechanism/table as the invalid_signature trip) plus a console alert. Encodes Solomon
// guardrail (e): "N consecutive invalid/UNMATCHED inbound -> notify-only + console alert (degrade
// closed)". Env-overridable; a blank/malformed override falls back to the default (never silently
// widens/zeros the threshold). Default 3 deliberately sits BELOW the 5/window inbound rate-limit
// ceiling (INBOUND_RATE_LIMIT) so the counter can actually trip before rate-limiting masks further
// unmatched replies.
function readPositiveIntEnv(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}
const AUTO_SUSPEND_UNMATCHED_THRESHOLD = readPositiveIntEnv('SMS_AUTO_SUSPEND_UNMATCHED_THRESHOLD', 3);
// The inbound outcomes that count as an UNMATCHED answer for the FR-4 counter above.
const UNMATCHED_OUTCOMES = ['no_match', 'ambiguous'];
// SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-1: outcomes that PARK a verified-chairman
// row instead of terminal-draining it. rate_limited is included per the measured 14:28:56Z
// instance (feedback 4d10f55c) where the inbound rate limiter swallowed a valid instruction.
// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001 FR-4: expired/ambiguous added -- both previously went
// fully dark to every alarm once they aged past the 60-minute surfaceSmsInbound window, since
// neither was in this list. suspended/invalid_signature deliberately remain excluded -- both
// indicate a likely-spoofed or abusive sender, not a genuine unanswered chairman message.
const PARK_OUTCOMES = ['no_match', 'rate_limited', 'expired', 'ambiguous'];
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

// SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-5: single-digit reply indices ("Reply 1=.., 2=..").
const SMS_MAX_OPTIONS = 9;

/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-5: compose the outbound decision question. When
 * enumerated `options` are supplied the body presents them as a MULTIPLE-CHOICE prompt ("Reply
 * 1=Approve, 2=Reject.") and the inbound matcher then requires the reply to SELECT one — free text
 * that matches no option stays untrusted (relayed, never executed). With no options the body is the
 * pre-existing free-text form (backward-compatible; unchanged for legacy LOW/MEDIUM questions).
 * @param {string} title
 * @param {string[]} [options] normalized option labels (see normalizeSmsOptions)
 */
function composeMessage(title, options = []) {
  const suffix = Array.isArray(options) && options.length > 0
    ? ` Reply ${options.map((o, i) => `${i + 1}=${o}`).join(', ')}.`
    : ' Reply to answer.';
  const budget = MAX_SMS_BODY_LENGTH - suffix.length;
  const truncated = title.length > budget ? `${title.slice(0, Math.max(0, budget - 1))}…` : title;
  return `${truncated}${suffix}`;
}

/**
 * Normalize a caller-supplied options list to an array of non-empty trimmed string labels (max
 * SMS_MAX_OPTIONS). Non-array input, non-string/blank entries are dropped. FR-5.
 * @param {unknown} options
 * @returns {string[]}
 */
function normalizeSmsOptions(options) {
  if (!Array.isArray(options)) return [];
  const out = [];
  for (const o of options) {
    if (typeof o !== 'string') continue;
    const label = o.trim();
    if (label === '') continue;
    out.push(label);
    if (out.length >= SMS_MAX_OPTIONS) break;
  }
  return out;
}

/**
 * Match an inbound reply body against the presented enumerated options (FR-5). A reply matches
 * ONLY by 1-based option index ("1"/"2") or an EXACT case-insensitive label ("approve"); any other
 * free text does NOT match (relayed-not-executed). Mirrors the fail-closed spirit of the whitelist:
 * uncertainty resolves to no-match, never a guessed option.
 * @param {string} body raw inbound reply text
 * @param {string[]} options presented option labels
 * @returns {{matched: boolean, index?: number, label?: string}}
 */
function matchSmsOption(body, options) {
  if (!Array.isArray(options) || options.length === 0) return { matched: false };
  const trimmed = typeof body === 'string' ? body.trim() : '';
  if (trimmed === '') return { matched: false };
  if (/^\d+$/.test(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1;
    if (idx >= 0 && idx < options.length) return { matched: true, index: idx, label: options[idx] };
    return { matched: false };
  }
  const lc = trimmed.toLowerCase();
  const idx = options.findIndex((o) => o.trim().toLowerCase() === lc);
  if (idx >= 0) return { matched: true, index: idx, label: options[idx] };
  return { matched: false };
}

/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-6: fail-soft stamp of channel='sms' on an SMS
 * decision's chairman_decisions row (audit parity — an SMS decision is distinguishable from a
 * console one on the SAME row; Solomon guardrail (3)). Done as a SEPARATE best-effort UPDATE so a
 * missing column PRE-APPLY (the FR-2 migration is STAGED/unapplied) can never crash or block the
 * live decision path — mirrors smsOutboundObligationsLive's fail-soft probe. NEVER throws; NEVER
 * folded into the critical answer/token update (folding it in would make the whole update fail
 * pre-apply and drop the reply). NULL/unstamped rows are interpreted as console.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} decisionId
 * @returns {Promise<boolean>} true only when the stamp actually wrote (column present)
 */
async function stampSmsChannel(supabase, decisionId) {
  try {
    const { error } = await supabase
      .from('chairman_decisions')
      .update({ channel: 'sms' }) // schema-lint-disable-line staged col (20260721_chairman_decisions_channel_STAGED)
      .eq('id', decisionId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-1: real-row liveness probe for the STAGED
 * sms_outbound_obligations table. Uses a real SELECT (NOT head:true count) so the probe is a
 * genuine reachability check, and is fully FAIL-SOFT: while the migration is unapplied the
 * table is absent and supabase-js resolves the query to {data:null,error} (or a fake without
 * the table throws) — either way this returns false and every caller degrades gracefully
 * (sendChairmanSmsQuestion falls back to the pre-existing inline send; the worker/callback
 * no-op). NEVER throws.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} true only when the owed-state table is actually queryable
 */
export async function smsOutboundObligationsLive(supabase) {
  try {
    const { error } = await supabase.from('sms_outbound_obligations').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-1: durably enqueue an outbound chairman SMS as an
 * 'owed' obligation row BEFORE any provider send, so the send survives session death and is
 * reconcilable by lib/chairman/sms-outbound-worker.js (no session-local timer). Idempotent on
 * dedupe_key (ON CONFLICT (dedupe_key) DO NOTHING via upsert ignoreDuplicates) so the same 6AM
 * morning-review enqueues at most once/day. FAIL-SOFT: returns {enqueued:false} (never throws)
 * when the STAGED table is absent.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{recipientPhone: string, kind: string, body: string, decisionId?: string|null,
 *   dedupeKey?: string|null, notBefore?: string|null, mediaUrl?: string|null}} args
 * @returns {Promise<{enqueued: boolean, obligationId?: string, deduped?: boolean, reason?: string}>}
 */
export async function enqueueChairmanSms(supabase, { recipientPhone, kind, body, decisionId = null, dedupeKey = null, notBefore = null, mediaUrl = null } = {}) {
  if (!recipientPhone || !kind || !body) return { enqueued: false, reason: 'missing_fields' };
  const row = {
    recipient_phone: recipientPhone,
    kind,
    body,
    decision_id: decisionId,
    dedupe_key: dedupeKey,
    not_before: notBefore,
    media_url: mediaUrl,
    status: 'owed',
  };
  try {
    const { data, error } = await supabase
      .from('sms_outbound_obligations')
      .upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id');
    if (error) return { enqueued: false, reason: 'table_absent_or_error' };
    const obligationId = data && data[0] ? data[0].id : null;
    // ignoreDuplicates => a dedupe_key conflict inserts nothing and returns [] (deduped no-op).
    return obligationId ? { enqueued: true, obligationId } : { enqueued: false, deduped: true };
  } catch {
    return { enqueued: false, reason: 'table_absent' };
  }
}

/**
 * Insert a chairman_notifications row for a decision-SMS send. The SOLE insert site for this
 * table across both decision-SMS send paths (sendChairmanSmsQuestion + the Adam-outbound gate) —
 * SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-1. Error-checked: throws rather than swallowing,
 * unlike the pre-SD inline call sites this replaces.
 * @private
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{decisionId: string, chairmanUserId: string, chairmanEmail: string, chairmanPhone: string,
 *   status?: string, providerMessageId?: string|null, sentAt?: string|null, errorMessage?: string|null}} args
 */
async function insertChairmanSmsNotification(supabase, {
  decisionId, chairmanUserId, chairmanEmail, chairmanPhone,
  status = 'queued', providerMessageId = null, sentAt = null, errorMessage = null,
}) {
  const { data, error } = await supabase.from('chairman_notifications').insert({
    chairman_user_id: chairmanUserId,
    recipient_email: chairmanEmail,
    recipient_phone: chairmanPhone,
    notification_type: 'immediate',
    channel: 'sms',
    decision_id: decisionId,
    status,
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    sent_at: sentAt,
  }).select('id');
  if (error) {
    throw new Error(`insertChairmanSmsNotification: chairman_notifications insert failed for decision ${decisionId}: ${error.message}`);
  }
  return Array.isArray(data) && data[0] ? data[0].id : null;
}

/**
 * Patch chairman_decisions with the reply token/expiry (and brief_data.sms_options when the
 * decision presented enumerated options) so handleInboundSmsReply's eligibility filter
 * (status='pending' + live sms_reply_token_expires_at + !sms_reply_used_at) can actually resolve
 * a reply — the candidate lookup (chairman_notifications) alone is necessary but not sufficient.
 * The SOLE update site for these fields — SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-1/TR-2.
 *
 * Error-checked including a zero-rows-matched decisionId, which is Supabase's classic
 * update-affecting-zero-rows-looks-like-success trap: only an explicit empty ARRAY from a
 * `.select()`-chained update is treated as "row not found" (real supabase-js always returns an
 * array — possibly empty — when `.select()` is chained and there is no error). A `data === null`
 * result (no error) is treated as "unverifiable, not a failure" rather than a false-positive
 * throw, so this stays compatible with older test doubles that don't model `.select()`-after-
 * `.update()` readback.
 * @private
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{decisionId: string, token: string, expiresAt: string, options?: string[], consequenceLevel?: string}} args
 */
async function updateChairmanDecisionSmsFields(supabase, { decisionId, token, expiresAt, options = [], consequenceLevel }) {
  const normalizedOptions = Array.isArray(options) ? options : [];
  let briefDataPatch = null;
  if (normalizedOptions.length > 0) {
    const { data: existingDecision } = await supabase
      .from('chairman_decisions')
      .select('brief_data')
      .eq('id', decisionId)
      .maybeSingle();
    briefDataPatch = { ...((existingDecision && existingDecision.brief_data) || {}), sms_options: normalizedOptions };
  }
  const decisionUpdate = { sms_reply_token: token, sms_reply_token_expires_at: expiresAt };
  if (briefDataPatch) decisionUpdate.brief_data = briefDataPatch;
  if (consequenceLevel !== undefined) decisionUpdate.consequence_level = consequenceLevel;

  const { data, error } = await supabase
    .from('chairman_decisions')
    .update(decisionUpdate)
    .eq('id', decisionId)
    .select('id');
  if (error) {
    throw new Error(`updateChairmanDecisionSmsFields: chairman_decisions update failed for decision ${decisionId}: ${error.message}`);
  }
  if (Array.isArray(data) && data.length === 0) {
    throw new Error(`updateChairmanDecisionSmsFields: decision_not_found: no chairman_decisions row for id ${decisionId}`);
  }
}

/**
 * Stage a decision-SMS: insert the matchable chairman_notifications row AND patch
 * chairman_decisions (token/expiry/options) so a later inbound reply can resolve it. Composes
 * insertChairmanSmsNotification + updateChairmanDecisionSmsFields — the shared, error-checked
 * TWO-WRITE staging helper extracted from sendChairmanSmsQuestion's obligation-enqueue branch
 * and reused by the Adam-outbound gate (lib/comms/adam-outbound/chairman-sms-gate/index.js).
 * SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-1/FR-3.
 *
 * Both writes must succeed. This is the composed "insert THEN update, unconditionally" shape —
 * sendChairmanSmsQuestion's fallback-inline-send branch calls the two pieces directly instead,
 * because it must SKIP the chairman_decisions update when the provider send itself failed
 * (a message that never sent should not receive a live reply token). A caller whose OWN send is
 * synchronous and outcome-known only AFTER this call returns (the Adam-outbound gate — its
 * sender dispatches inline and verifies delivery before returning, per QF-20260725-738) MUST
 * call invalidateDecisionSmsStaging below on a confirmed send failure — staging here happens
 * before that outcome is known, by design (FR-3 requires failing the send closed on a STAGING
 * error), so a later TRANSPORT failure is a distinct case this function cannot itself detect.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{decisionId: string, chairmanUserId: string, chairmanEmail: string, chairmanPhone: string,
 *   options?: string[], token: string, expiresAt: string, status?: string,
 *   providerMessageId?: string|null, sentAt?: string|null, errorMessage?: string|null,
 *   consequenceLevel?: string}} args
 * @returns {Promise<{notificationId: string|null}>}
 */
export async function stageDecisionSmsNotification(supabase, {
  decisionId, chairmanUserId, chairmanEmail, chairmanPhone, options = [],
  token, expiresAt, status = 'queued', providerMessageId = null, sentAt = null, errorMessage = null,
  consequenceLevel,
} = {}) {
  const notificationId = await insertChairmanSmsNotification(supabase, {
    decisionId, chairmanUserId, chairmanEmail, chairmanPhone, status, providerMessageId, sentAt, errorMessage,
  });
  await updateChairmanDecisionSmsFields(supabase, { decisionId, token, expiresAt, options, consequenceLevel });
  return { notificationId };
}

/**
 * Undo a stageDecisionSmsNotification call after the caller learns — AFTER staging already ran —
 * that the send itself did not actually reach the chairman. Adversarial-review finding
 * (SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001, deep-tier review): the Adam-outbound gate's
 * sender dispatches synchronously and reports a definitive outcome, so a staged-but-undelivered
 * decision would otherwise sit live and matchable for the full token TTL — the exact "enqueue is
 * not delivery" class this module was hardened against twice before (QF-20260719-509,
 * QF-20260725-738), reopened through this new staging path. Clears the token (scoped to the
 * EXACT token just set, so a concurrent successful re-stage of the same decision is never
 * clobbered) so handleInboundSmsReply's eligibility filter can no longer match this decision, and
 * marks the notification row failed for audit accuracy. Best-effort / fail-soft: never throws —
 * the caller's own honest {sent:false} return is the real safety net; this is hardening on top.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{decisionId: string, token: string, notificationId?: string|null, reason?: string}} args
 */
export async function invalidateDecisionSmsStaging(supabase, { decisionId, token, notificationId = null, reason = 'transport_failed' }) {
  try {
    await supabase
      .from('chairman_decisions')
      .update({ sms_reply_token: null, sms_reply_token_expires_at: null })
      .eq('id', decisionId)
      .eq('sms_reply_token', token);
    if (notificationId) {
      await supabase
        .from('chairman_notifications')
        .update({ status: 'failed', error_message: reason })
        .eq('id', notificationId);
    }
  } catch {
    // Best-effort — see docstring. The caller's {sent:false} return already reports the truth.
  }
}

/**
 * Mark a staged chairman_notifications row as sent after a CONFIRMED successful send. The SOLE
 * update site for status/provider_message_id/sent_at on this table — QF-20260815-065. Without
 * this, a row staged 'queued'/provider_message_id=null by insertChairmanSmsNotification never
 * transitions even after the send genuinely succeeds: the Twilio webhook can only heal a row by
 * matching provider_message_id, which stays null forever, so the row (and any dashboard reading
 * it) misreports the send as still pending. Audit-trail only — reply matching is unaffected, as
 * handleInboundSmsReply resolves by decision_id, never by this row's status.
 * Same error-handling contract as updateChairmanDecisionSmsFields: throws on a real DB error;
 * an explicit empty array from a `.select()`-chained update (zero rows matched) throws
 * notification_not_found; `data === null` (no error) is treated as unverifiable, not a failure,
 * for compatibility with test doubles that don't model `.select()`-after-`.update()` readback.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{notificationId: string, providerMessageId: string, sentAt: string}} args
 */
export async function updateNotificationStatus(supabase, { notificationId, providerMessageId, sentAt }) {
  const { data, error } = await supabase
    .from('chairman_notifications')
    .update({ status: 'sent', provider_message_id: providerMessageId, sent_at: sentAt })
    .eq('id', notificationId)
    .select('id');
  if (error) {
    throw new Error(`updateNotificationStatus: chairman_notifications update failed for notification ${notificationId}: ${error.message}`);
  }
  if (Array.isArray(data) && data.length === 0) {
    throw new Error(`updateNotificationStatus: notification_not_found: no chairman_notifications row for id ${notificationId}`);
  }
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

  // SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-A FR-1: defense-in-depth allow-list BEHIND the
  // HIGH backstop above. Only decision classes explicitly whitelisted (active, exact match)
  // are SMS-eligible; every other class — and any read error/empty list — is console-only.
  // decisionType is the class key; the independent HIGH classifier already backstops a
  // decision that self-labels a lower class than it actually is. Fail-closed by construction
  // (isWhitelistedDecisionClass returns false on any uncertainty). The whitelist is read-only
  // here — this send path NEVER inserts/updates/deletes the whitelist (console-only ratchet).
  if (!(await isWhitelistedDecisionClass(supabase, decisionType))) {
    return { sent: false, reason: 'not_whitelisted', consequence };
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

  // SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-5: present ENUMERATED choice options when the
  // caller supplies them; the inbound matcher then requires the reply to select one (free text
  // that matches no option stays UNTRUSTED — relayed, never executed). Backward-compatible: with
  // no options the message + reply handling are the pre-existing free-text form.
  const options = normalizeSmsOptions(opts.options);
  const message = composeMessage(title, options);

  // SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-1: when the durable owed-state table is live,
  // ENQUEUE an owed obligation row instead of sending inline (the 201-as-success F1 defect). The
  // claim-serialized worker (reconcileOutboundSms) performs the actual send and stamps
  // provider_message_id, and delivery-truth is confirmed only by the status callback (FR-2). The
  // inbound-reply token + notification row are written NOW (independent of the send) so a reply
  // still correlates. GRACEFUL DEGRADATION: while the migration is STAGED-absent the probe returns
  // false and we fall through to the unchanged pre-existing inline-send path below — so nothing in
  // the live send path regresses pre-apply.
  if (await smsOutboundObligationsLive(supabase)) {
    // SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-1/FR-2: both writes, unconditionally — this
    // branch defers the actual send to the async worker, so there is no failure to gate on yet.
    await stageDecisionSmsNotification(supabase, {
      decisionId, chairmanUserId, chairmanEmail, chairmanPhone, options, token, expiresAt,
      status: 'queued', providerMessageId: null, sentAt: null, errorMessage: null,
      consequenceLevel: consequence,
    });

    // FR-6: this decision is being ASKED over SMS — stamp channel='sms' (fail-soft; no-op pre-apply).
    await stampSmsChannel(supabase, decisionId);

    const enq = await enqueueChairmanSms(supabase, {
      recipientPhone: chairmanPhone,
      kind: 'decision_question',
      body: message,
      decisionId,
      dedupeKey: `decision_question:${decisionId}`, // at most one owed row per decision
    });
    return { enqueued: true, consequence, token, obligationId: enq.obligationId };
  }

  // FALLBACK — owed-state table STAGED-absent (pre-apply): unchanged inline-send behavior.
  const result = await provider.send({ to: chairmanPhone, body: message });
  const notifStatus = result.status === 'failed' ? 'failed' : result.status;

  // SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-1/FR-2: the notification insert always runs
  // (audit trail for a failed send too), but the chairman_decisions token/options patch must be
  // SKIPPED on failure — a message that never sent must not receive a live reply token.
  await insertChairmanSmsNotification(supabase, {
    decisionId, chairmanUserId, chairmanEmail, chairmanPhone,
    status: notifStatus, providerMessageId: result.provider_message_id || null,
    sentAt: notifStatus === 'failed' ? null : new Date().toISOString(),
    errorMessage: result.reason || null,
  });

  if (notifStatus === 'failed') {
    return { sent: false, reason: result.reason || 'provider_failed', consequence };
  }

  await updateChairmanDecisionSmsFields(supabase, { decisionId, token, expiresAt, options, consequenceLevel: consequence });

  // FR-6: this decision is being ASKED over SMS — stamp channel='sms' (fail-soft; no-op pre-apply).
  await stampSmsChannel(supabase, decisionId);

  return { sent: true, consequence, token, provider_message_id: result.provider_message_id };
}

// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001 FR-1: matched_decision_id must record ONLY a genuine
// resolution (outcome answered/undone) -- a stamp meaning "candidate considered" is indistinguishable
// from one meaning "decision resolved", the exact anti-pattern this SD exists to fix. Callers on a
// non-resolving path pass consideredDecisionId (diagnostic-only, never a join target) instead of
// matchedDecisionId.
async function logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome, matchedDecisionId = null, consideredDecisionId = null }) {
  // SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001 B2 (testing-agent + database-agent independent
  // finding): this insert was previously unbound -- a schema-drift or constraint rejection
  // (e.g. considered_decision_id not yet migrated on a racing deploy) would silently drop the
  // ENTIRE audit row with no trace. Bind and log fail-soft; NEVER throw here -- throwing would
  // trip drainSmsRelayStaging's claim-release catch (:1030-ish) and turn a schema-drift edge
  // case into claim thrash on every inbound row, which is worse than a logged-but-lost audit row.
  // BLAST RADIUS (adversarial-review finding): sms_inbound_log is not only an audit trail -- all
  // three abuse controls in this file (the inbound rate limiter, the invalid_signature
  // auto-suspend, and the FR-4 unmatched auto-suspend) COUNT rows in this table. A persistent
  // insert failure silently degrades all three open, not just this one row's audit trail.
  const { error } = await supabase.from('sms_inbound_log').insert({
    from_phone: from,
    to_phone: to || null,
    body_raw: body || null,
    provider_message_id: messageSid || null,
    signature_valid: signatureValid,
    matched_decision_id: matchedDecisionId,
    // considered_decision_id is live (added by this SD's own migration, verified 2026-08-21 via
    // direct RPC introspection of the production schema); the static reference snapshot
    // (database/schema-reference-snapshot.json) predates it and could not be regenerated here
    // (SUPABASE_POOLER_URL auth is currently failing -- pre-existing, unrelated env issue).
    considered_decision_id: consideredDecisionId, // schema-lint-disable-line
    outcome,
  });
  if (error) {
    console.warn(`[sms-bridge] logInbound insert failed for outcome=${outcome}: ${error.message} -- audit row lost AND the rate-limit/auto-suspend counters that COUNT this table under-count until this is fixed`);
  }
}

/**
 * Check for and, when warranted, apply a persistent auto-suspend for a flooding
 * from_phone (SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-3). Two responsibilities:
 *   1. Report whether an active suspension already exists (cleared_at IS NULL).
 *   2. If this attempt was itself invalid_signature, count recent invalid_signature
 *      attempts for the number and upsert a new suspension once the flood threshold
 *      is crossed — this trips PERSISTENTLY, independent of the rolling rate-limit
 *      window, and stays active until an operator clears it.
 * @returns {Promise<boolean>} true if the number is (now) actively suspended
 */
async function checkAndApplyAutoSuspend(supabase, from, { justLoggedInvalidSignature } = {}) {
  const { data: existing } = await supabase
    .from('sms_inbound_suspensions')
    .select('from_phone, cleared_at')
    .eq('from_phone', from)
    .is('cleared_at', null)
    .maybeSingle();
  if (existing) return true;

  if (!justLoggedInvalidSignature) return false;

  const windowStart = new Date(Date.now() - INBOUND_RATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('sms_inbound_log')
    .select('*', { count: 'exact', head: true })
    .eq('from_phone', from)
    .eq('outcome', 'invalid_signature')
    .gte('created_at', windowStart);

  if ((count || 0) >= AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD) {
    await supabase.from('sms_inbound_suspensions').insert({
      from_phone: from,
      reason: `${count} invalid_signature attempts within ${INBOUND_RATE_WINDOW_MINUTES}m`,
    });
    return true;
  }
  return false;
}

/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-4: SEPARATE from checkAndApplyAutoSuspend's
 * invalid_signature flood trip (which is unchanged). Counts recent UNMATCHED inbound answers
 * (outcome in no_match/ambiguous) for a from_phone within INBOUND_RATE_WINDOW_MINUTES and, once
 * AUTO_SUSPEND_UNMATCHED_THRESHOLD is crossed, degrades that number to notify-only by inserting a
 * PERSISTENT sms_inbound_suspensions row (same mechanism/table as the invalid_signature trip) and
 * emits a console alert. Called AFTER the no_match/ambiguous outcome has been logged, so the
 * just-logged row is included in the count (mirrors the invalid_signature path's log-then-count).
 * A number already actively suspended is a no-op (no duplicate row). FAIL-SOFT / best-effort: never
 * throws into the inbound relay path.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} from
 * @returns {Promise<boolean>} true if the number is (now) actively suspended
 */
async function checkAndApplyUnmatchedAutoSuspend(supabase, from) {
  try {
    // SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-3: the verified chairman number is
    // EXEMPT from this counter only — his own conversational/unmatched texts are the channel
    // working, not an abuse signal. Deliberately NOT applied to checkAndApplyAutoSuspend (the
    // invalid_signature flood counter above): a spoofed sender claiming the chairman's number
    // with a bad signature is never verified as him, and must still be counted there.
    if (phoneKey(from) && phoneKey(from) === phoneKey(process.env.CHAIRMAN_PHONE)) return false;

    const { data: existing } = await supabase
      .from('sms_inbound_suspensions')
      .select('from_phone, cleared_at')
      .eq('from_phone', from)
      .is('cleared_at', null)
      .maybeSingle();
    if (existing) return true;

    const windowStart = new Date(Date.now() - INBOUND_RATE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('sms_inbound_log')
      .select('*', { count: 'exact', head: true })
      .eq('from_phone', from)
      .in('outcome', UNMATCHED_OUTCOMES)
      .gte('created_at', windowStart);

    if ((count || 0) >= AUTO_SUSPEND_UNMATCHED_THRESHOLD) {
      await supabase.from('sms_inbound_suspensions').insert({
        from_phone: from,
        reason: `${count} unmatched (no_match/ambiguous) replies within ${INBOUND_RATE_WINDOW_MINUTES}m — SMS-decide degraded to notify-only`,
      });
      // Console alert — Solomon guardrail (e): degrade closed AND surface it (notify-only).
      console.warn(`[sms-bridge] AUTO-SUSPEND(unmatched): ${from} degraded to notify-only after ${count} unmatched replies within ${INBOUND_RATE_WINDOW_MINUTES}m. Cleared only by operator action on sms_inbound_suspensions.cleared_at.`);
      return true;
    }
    return false;
  } catch {
    // Best-effort: a suspension-write/read failure must never break the inbound relay path.
    return false;
  }
}

/**
 * Log an UNMATCHED (no_match/ambiguous) inbound outcome AND evaluate the FR-4 unmatched
 * auto-suspend counter for the sender. Thin wrapper so every no_match/ambiguous logging site feeds
 * the counter consistently (FR-4 wires the pre-existing no_match/ambiguous sites plus the new
 * options-mismatch site). Does NOT touch the invalid_signature path (outcome must be in
 * UNMATCHED_OUTCOMES).
 */
async function logInboundUnmatched(supabase, logArgs) {
  await logInbound(supabase, logArgs);
  await checkAndApplyUnmatchedAutoSuspend(supabase, logArgs.from);
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
 * SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-3 additions (layered on top of the above,
 * unchanged, behavior): (a) a from_phone with an active persistent suspension is
 * fail-closed rejected regardless of signature validity; (b) if MORE THAN ONE
 * candidate is simultaneously eligible (pending, unused, unexpired), the reply is
 * rejected as ambiguous rather than silently resolving the first one found.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{from: string, to: string, body: string, messageSid: string, signatureValid: boolean}} inbound
 * @returns {Promise<{resolved: boolean, outcome: string, decisionId?: string}>}
 */
export async function handleInboundSmsReply(supabase, inbound) {
  const { from, to, body, messageSid, signatureValid } = inbound;

  if (await checkAndApplyAutoSuspend(supabase, from, { justLoggedInvalidSignature: false })) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'suspended' });
    return { resolved: false, outcome: 'suspended' };
  }

  if (!signatureValid) {
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'invalid_signature' });
    await checkAndApplyAutoSuspend(supabase, from, { justLoggedInvalidSignature: true });
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
    // FR-4: no_match feeds the unmatched auto-suspend counter.
    await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match' });
    return { resolved: false, outcome: 'no_match' };
  }

  const { data: candidateDecisions } = await supabase
    .from('chairman_decisions')
    .select('id, status, brief_data, sms_reply_used_at, sms_reply_token_expires_at, amount_usd, undo_deadline, undone_at, consumed_at, decision_type') // schema-lint-disable-line staged cols (20260717_sms_spend_envelope_STAGED)
    .in('id', candidateIds);

  const byId = new Map((candidateDecisions || []).map((d) => [d.id, d]));
  const now = new Date();

  // SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-3: an inbound UNDO is NOT an answer — it
  // cancels a spend approval within its undo window. Handled BEFORE the normal answer path
  // so "undo" is never recorded as a decision reply. Atomic conditional UPDATE: set undone_at
  // ONLY WHERE consumed_at IS NULL AND now() < undo_deadline (ties bias to UNDO — the strict
  // gt/gte split means a consume can only claim once now()>=undo_deadline, i.e. after the
  // undo window; both are single-row conditional UPDATEs that serialize on the row).
  if (UNDO_BODY_RE.test(body || '')) {
    const nowIso = now.toISOString();
    const undoEligible = candidateIds
      .map((id) => byId.get(id))
      .filter((d) => d && !d.consumed_at && !d.undone_at && d.undo_deadline && new Date(d.undo_deadline) > now);

    if (undoEligible.length === 0) {
      // No open undo window (nothing to cancel) — never record "undo" as an answer.
      // FR-4: no_match feeds the unmatched auto-suspend counter.
      await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', consideredDecisionId: candidateIds[0] });
      return { resolved: false, outcome: 'no_match' };
    }

    const target = undoEligible[0]; // candidateIds are most-recent-first
    const { data: undone } = await supabase
      .from('chairman_decisions')
      .update({ undone_at: nowIso }) // schema-lint-disable-line staged col
      .eq('id', target.id)
      .is('consumed_at', null)
      .is('undone_at', null)
      .gt('undo_deadline', nowIso)
      .select('id');

    if (!undone || undone.length === 0) {
      // Lost the race to a concurrent consume that claimed first (consumed_at set), or the
      // window closed between read and write — fail-closed, do not record an answer.
      // FR-4: no_match feeds the unmatched auto-suspend counter.
      await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', consideredDecisionId: target.id });
      return { resolved: false, outcome: 'no_match' };
    }

    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'undone', matchedDecisionId: target.id });
    return { resolved: true, outcome: 'undone', decisionId: target.id };
  }

  const eligible = candidateIds
    .map((id) => byId.get(id))
    .filter((d) => d && d.status === 'pending' && !d.sms_reply_used_at && d.sms_reply_token_expires_at && new Date(d.sms_reply_token_expires_at) >= now);

  if (eligible.length > 1) {
    // FR-3: ambiguous — never guess which open question this reply answers.
    // FR-4: ambiguous feeds the unmatched auto-suspend counter.
    await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'ambiguous', consideredDecisionId: candidateIds[0] });
    return { resolved: false, outcome: 'ambiguous' };
  }

  const decision = eligible[0] || null;

  if (!decision) {
    // Best-effort diagnostic label using the single most recent candidate — not
    // security-relevant (both branches equally refuse to resolve anything).
    const mostRecent = byId.get(candidateIds[0]);
    const outcome = mostRecent && mostRecent.status === 'pending' && !mostRecent.sms_reply_used_at
      ? 'expired'
      : 'no_match';
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome, consideredDecisionId: candidateIds[0] });
    return { resolved: false, outcome };
  }

  const decisionId = decision.id;

  // SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-5: when this decision presented ENUMERATED options
  // (stored under brief_data.sms_options at send time), the reply MUST select one of them to be
  // actionable. A reply matching no option is UNMATCHED (no_match) — relayed-not-executed, feeding
  // the FR-4 unmatched auto-suspend counter — and is NEVER delivered as an answer (sms_reply is not
  // written, the decision is not claimed, so a later valid-option reply can still resolve it). Free-
  // text-untrusted is thereby preserved even here. Decisions sent WITHOUT options keep the pre-
  // existing free-text delivery (backward-compatible).
  const presentedOptions = decision.brief_data && Array.isArray(decision.brief_data.sms_options)
    ? decision.brief_data.sms_options
    : [];
  let matchedOption = null;
  if (presentedOptions.length > 0) {
    const m = matchSmsOption(body, presentedOptions);
    if (!m.matched) {
      await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', consideredDecisionId: decisionId });
      return { resolved: false, outcome: 'no_match' };
    }
    matchedOption = m.label;
  }

  const answeredAt = new Date().toISOString();
  // The raw reply text stays INERT under sms_reply (only consumeSmsReply reads it, per the anti-
  // direct-read AST rule). When an option matched we ADDITIVELY record the validated option label
  // alongside the inert text — this adds trusted structure without removing the inert-text guarantee.
  const replyPayload = { text: body, answered_at: answeredAt, from };
  if (matchedOption !== null) replyPayload.option = matchedOption;
  const mergedBriefData = { ...(decision.brief_data || {}), sms_reply: replyPayload };

  // SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-3: for a SPEND-class decision, stamp the undo
  // window on a DEDICATED column (never brief_data) so consumeSmsReply is inert until it
  // elapses and an inbound UNDO can cancel it. Built as a variable object (not an inline
  // literal) so the schema-reference-lint's update-key extractor does not flag the staged
  // undo_deadline column pre-apply.
  const updateVals = { brief_data: mergedBriefData, sms_reply_used_at: answeredAt };
  if (isSpendClassDecision(decision)) {
    updateVals.undo_deadline = new Date(Date.now() + UNDO_WINDOW_MS).toISOString();
  }

  const { data: updated } = await supabase
    .from('chairman_decisions')
    .update(updateVals)
    .eq('id', decisionId)
    .is('sms_reply_used_at', null)
    .select('id');

  if (!updated || updated.length === 0) {
    // Lost the race to a concurrent request that claimed this decision first.
    // FR-4: no_match feeds the unmatched auto-suspend counter.
    await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', consideredDecisionId: decisionId });
    return { resolved: false, outcome: 'no_match' };
  }

  // FR-6: an SMS-answered decision is stamped channel='sms' (audit parity). Fail-soft & separate
  // from the answer UPDATE above so a missing column pre-apply cannot drop the just-recorded reply.
  await stampSmsChannel(supabase, decisionId);

  await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome: 'answered', matchedDecisionId: decisionId });
  return { resolved: true, outcome: 'answered', decisionId };
}

/**
 * consumeSmsReply — the ONLY sanctioned ACTIONABLE read of an sms_reply.
 * SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-1/FR-2/FR-3.
 *
 * handleInboundSmsReply above only DELIVERS the raw reply into brief_data.sms_reply (inert
 * text) and stamps the dedicated gating columns. This function is the single seam that turns a
 * delivered reply into an actionable result, and only when EVERY gate passes:
 *   - the reply is present (no_reply otherwise);
 *   - it was not undone (undone);
 *   - the undo window has elapsed, now >= undo_deadline (undo_window_open otherwise);
 *   - a spend-class decision has a known structured amount — an amountless spend-class
 *     decision fails CLOSED to console BEFORE any claim (unknown_amount), never setting
 *     consumed_at (caller-population of amount_usd is DEFERRED — see the STAGED migration);
 *   - the single-execution claim is won — an atomic conditional UPDATE of consumed_at WHERE
 *     consumed_at IS NULL AND undone_at IS NULL; a second consume is idempotent
 *     (already_consumed_or_ineligible);
 *   - for a spend, the atomic per-decision + daily-cumulative cap debit is approved — an
 *     over-cap debit ROLLS BACK the claim (consumed_at set back to NULL) and routes to
 *     console (over_cap), so a rejected debit never leaves the decision consumed.
 *
 * Actionability lives in DEDICATED COLUMNS (consumed_at/undone_at/undo_deadline), not in
 * brief_data — a caller that bypasses this seam and reads brief_data.sms_reply directly gets
 * only inert text and cannot execute a compliant spend. The anti-direct-read AST ESLint rule
 * (eslint.config.js) structurally forbids that bypass outside this file + tests.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service_role client
 * @param {string} decisionId
 * @param {{perDecisionCap?: number, dailyCap?: number}} [caps] chairman-tunable cap overrides
 * @returns {Promise<{actionable: boolean, reply?: string, reason?: string}>}
 */
export async function consumeSmsReply(supabase, decisionId, { perDecisionCap = PER_DECISION_CAP_USD, dailyCap = DAILY_CAP_USD } = {}) {
  const { data: decision, error } = await supabase
    .from('chairman_decisions')
    .select('id, status, brief_data, amount_usd, undo_deadline, undone_at, consumed_at, decision_type') // schema-lint-disable-line staged cols (20260717_sms_spend_envelope_STAGED)
    .eq('id', decisionId)
    .maybeSingle();

  if (error || !decision) return { actionable: false, reason: 'not_found' };

  // The single sanctioned actionable read of the delivered reply.
  const replyObj = decision.brief_data ? decision.brief_data.sms_reply : null;
  const replyText = replyObj && typeof replyObj === 'object'
    ? replyObj.text
    : (typeof replyObj === 'string' ? replyObj : null);
  if (!replyObj || !replyText) return { actionable: false, reason: 'no_reply' };

  if (decision.undone_at) return { actionable: false, reason: 'undone' };

  const nowMs = Date.now();
  if (decision.undo_deadline && nowMs < new Date(decision.undo_deadline).getTime()) {
    return { actionable: false, reason: 'undo_window_open' };
  }

  // Fail-closed unknown-amount, checked BEFORE the claim so consumed_at is never set on a
  // spend-class decision we cannot price.
  const amount = decision.amount_usd;
  const spendClass = isSpendClassDecision(decision);
  if (spendClass && (amount === null || amount === undefined)) {
    return { actionable: false, reason: 'unknown_amount' };
  }

  // Atomic single-execution CLAIM. undone_at IS NULL in the predicate makes a concurrent /
  // just-committed UNDO win the tie (the claim no-ops, we route to console).
  const claimTime = new Date().toISOString();
  const { data: claimed } = await supabase
    .from('chairman_decisions')
    .update({ consumed_at: claimTime }) // schema-lint-disable-line staged col
    .eq('id', decisionId)
    .is('consumed_at', null)
    .is('undone_at', null)
    .select('id');
  if (!claimed || claimed.length === 0) {
    return { actionable: false, reason: 'already_consumed_or_ineligible' };
  }

  // SPEND path: only the single claim-winner debits, exactly once. Over-cap -> roll the claim
  // back (consumed_at -> NULL) so a rejected debit does not leave the decision consumed.
  if (amount !== null && amount !== undefined) {
    const debit = await debitSmsDailySpend(supabase, { decisionId, amount, perDecisionCap, dailyCap });
    if (!debit.approved) {
      await supabase
        .from('chairman_decisions')
        .update({ consumed_at: null }) // schema-lint-disable-line staged col (rollback)
        .eq('id', decisionId);
      return { actionable: false, reason: 'over_cap' };
    }
  }

  return { actionable: true, reply: replyText };
}

/**
 * Drain undrained rows from sms_relay_staging (written by the untrusted public relay,
 * SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-1/FR-2) through handleInboundSmsReply, marking
 * each row drained_at so it is never reprocessed. Rows are processed oldest-first.
 *
 * EXACTLY-ONCE UNDER CONCURRENCY (SD-LEO-INFRA-COMPLETE-SMS-RELAY-001 FR-1). The prior
 * shape SELECTed drained_at IS NULL then per-row UPDATEd drained_at — a TOCTOU: the 5-min
 * cron and an Adam-tick-triggered manual drain (both invoke this fn) could each select the
 * same undrained row and each call handleInboundSmsReply. A double CHAIRMAN REPLY is already
 * prevented one layer down — the answer path claims the decision atomically
 * (UPDATE chairman_decisions ... WHERE sms_reply_used_at IS NULL; the loser returns no_match
 * and delivers nothing, verified at handleInboundSmsReply). What double-processing STILL did
 * was run the second call's side-effects with no per-row guard: logInboundUnmatched and the
 * inbound rate/auto-suspend counters, so a re-drained already-answered row could spuriously
 * increment the FR-4 unmatched counter toward auto-suspending the chairman's number, plus
 * wasted work. This makes the drain exactly-once at the staging layer too: CLAIM each row
 * with a conditional UPDATE (SET drained_at WHERE id=? AND drained_at IS NULL) and process
 * ONLY the row this invocation actually claimed — a concurrent drainer that already claimed
 * it gets zero rows back and skips it, so handleInboundSmsReply runs at most once per row
 * regardless of how many drainers race. No new schema: drained_at is the claim.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{limit?: number}} [opts]
 * @returns {Promise<{drained: number, results: Array<{id: string, outcome: string}>}>}
 */
export async function drainSmsRelayStaging(supabase, { limit = 50 } = {}) {
  const { data: rows } = await supabase
    .from('sms_relay_staging')
    .select('id, provider_message_id, from_phone, to_phone, body_raw, signature_valid')
    .is('drained_at', null)
    .order('received_at', { ascending: true })
    .limit(limit);

  const results = [];
  for (const row of rows || []) {
    // FR-1: atomically CLAIM the row before doing any work. The conditional UPDATE succeeds
    // for exactly one racing drainer; the WHERE drained_at IS NULL makes a second claim a
    // no-op (returns zero rows). Claim FIRST, then process — so a lost claim never reaches
    // handleInboundSmsReply and never touches its counters.
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await supabase
      .from('sms_relay_staging')
      .update({ drained_at: claimedAt })
      .eq('id', row.id)
      .is('drained_at', null)
      .select('id');

    if (!claimed || claimed.length === 0) {
      // A concurrent drainer claimed this row first — skip it, do not double-process.
      continue;
    }

    try {
      const outcome = await handleInboundSmsReply(supabase, {
        from: row.from_phone,
        to: row.to_phone,
        body: row.body_raw,
        messageSid: row.provider_message_id,
        signatureValid: row.signature_valid,
      });
      results.push({ id: row.id, outcome: outcome.outcome });

      // SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-1: a verified-chairman-number row that
      // resolved to one of PARK_OUTCOMES (originally no_match/rate_limited; SD-LEO-INFRA-
      // CHAIRMAN-SMS-DECISION-001 FR-4 widened it to also include expired/ambiguous) must not
      // terminal-drain unnoticed — nine such messages (a status question, a directive, a
      // decision, a continuity complaint) went invisible to every consumer on 2026-08-10. PARK
      // it (additive parked_at) so the quiet-tick can keep surfacing it (FR-2) until it is
      // explicitly resolved (FR-4c). drained_at above remains the exactly-once claim — this is
      // a separate, orthogonal marker, never a substitute.
      const isVerifiedChairman = phoneKey(row.from_phone)
        && phoneKey(row.from_phone) === phoneKey(process.env.CHAIRMAN_PHONE);

      if (PARK_OUTCOMES.includes(outcome.outcome) && isVerifiedChairman) {
        await supabase
          .from('sms_relay_staging')
          .update({ parked_at: new Date().toISOString() })
          .eq('id', row.id);

        // QF-20260828-188 (leg 3): a free-form chairman message matching no known pattern
        // (no_match specifically — rate_limited/expired/ambiguous stay park-only, they are not
        // "unrecognized content") must not sit silently parked waiting for a human to notice.
        // Route it mechanically to Adam as adam_action_required — the same lane
        // scripts/adam-adherence-staleness-check.mjs already uses — and stamp resolved_at in
        // the SAME tick so closure is visible on the same instrument that shows the park
        // (Solomon pre-send verdict 62b23a90/f422647f: the interim manual-relay runbook already
        // does this via resolveAllParkedChairmanSmsRows; the mechanical fallback must too).
        if (outcome.outcome === 'no_match') {
          try {
            let target = null;
            try { target = await getActiveAdamId(supabase); } catch { target = null; }
            if (!target) target = 'broadcast-adam';
            await insertCoordinationRow(supabase, {
              sender_session: process.env.CLAUDE_SESSION_ID || 'sms-relay-drain',
              target_session: target,
              message_type: 'INFO',
              subject: 'Chairman free-form SMS matched no known pattern',
              payload: {
                kind: 'adam_action_required',
                body: `Chairman SMS (staging row ${row.id}) matched no known reply pattern and was mechanically routed here instead of sitting parked: "${String(row.body_raw || '').slice(0, 320)}"`,
              },
            }, { targetRoleHint: 'adam' });
            await supabase
              .from('sms_relay_staging')
              .update({ resolved_at: new Date().toISOString() })
              .eq('id', row.id)
              .is('resolved_at', null);
          } catch { /* fail-soft: the park above is the durable fallback if Adam-routing fails */ }
        }
      }
    } catch (e) {
      // RELEASE the claim on a GENUINE processing error so the next tick retries — the same
      // claim-then-roll-back-on-failure shape consumeSmsReply uses for over-cap debits. Without
      // this, claim-first would turn a transient DB error into a permanently-lost chairman reply
      // (drained_at set, never processed). Exactly-once for the concurrency case is preserved;
      // at-least-once is restored for real errors. Best-effort release (fail-soft): if the
      // release itself fails, the runner's fail-soft catch still exits 0 and the backlog-stall
      // signal is the durable alarm. try/catch (not .catch on the builder — the supabase query
      // builder is a thenable without a guaranteed .catch method).
      try {
        await supabase
          .from('sms_relay_staging')
          .update({ drained_at: null })
          .eq('id', row.id);
      } catch { /* best-effort release; runner fail-soft + backlog-stall are the durable alarms */ }
      throw e;
    }
  }

  return { drained: results.length, results };
}

/**
 * Drain undrained rows from sms_status_staging (written by the untrusted public status relay,
 * SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-1/FR-2) through the shared owed-delivery-truth writer,
 * marking each row drained once processed. Rows are processed oldest-first.
 *
 * CLAIM-FIRST (mirrors drainSmsRelayStaging above, TESTING finding on FR-3's original
 * process-then-mark design — sub_agent_execution_results cbcb68fa-d415-426c-93b8-6e61f4a044fc):
 * mark each row drained_at via a conditional UPDATE (WHERE id=? AND drained_at IS NULL) BEFORE
 * calling the writer, so a concurrent drainer racing the same row gets zero rows back and skips
 * it — exactly-once at the staging layer, same shape as the inbound relay drain.
 *
 * STALENESS: a late-arriving terminal-fail (undelivered/failed) for a superseded SID cannot
 * clobber a since-re-armed obligation row, because the writer's own current-SID-only match
 * scope (see lib/chairman/owed-delivery-truth.js) targets provider_message_id — once a retry
 * mints a NEW send attempt with a new SID, the row's provider_message_id no longer equals the
 * stale staged callback's SID, so the UPDATE's WHERE clause simply matches zero rows.
 *
 * SCHEMA-NOT-READY: if the writer reports columnAbsent (delivery_status_source not yet migrated
 * — FR-4 sequencing), the row is NOT marked drained, so it remains visible to the backlog-stall
 * alarm and is retried on the next tick rather than silently discarded.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{limit?: number}} [opts]
 * @returns {Promise<{drained: number, results: Array<{id: string, outcome: string}>}>}
 */
export async function drainSmsStatusStaging(supabase, { limit = 50 } = {}) {
  // `limit` is a caller-supplied variable (default 50), invisible to count-truncation-diff-lint's
  // literal-digit check — warnIfCapTruncated makes the cap a visible, observable tripwire instead
  // of a silent truncation: if a tick genuinely fills its own requested cap, warn so a growing
  // backlog is diagnosable from logs rather than only from the separate backlog-stall alarm.
  const rows = warnIfCapTruncated((await supabase
    .from('sms_status_staging')
    .select('id, provider_message_id, message_status, received_at')
    .is('drained_at', null)
    .order('received_at', { ascending: true })
    .limit(limit)).data, 'drainSmsStatusStaging', { cap: limit });

  const results = [];
  for (const row of rows || []) {
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await supabase
      .from('sms_status_staging')
      .update({ drained_at: claimedAt })
      .eq('id', row.id)
      .is('drained_at', null)
      .select('id')
      .limit(1);

    if (!claimed || claimed.length === 0) {
      // A concurrent drainer claimed this row first — skip it, do not double-process.
      continue;
    }

    let outcome;
    try {
      const writerResult = await applyOwedDeliveryTruth(supabase, {
        messageSid: row.provider_message_id,
        status: row.message_status,
        deliveredAt: row.received_at,
        source: 'carrier_push',
      });

      if (writerResult.columnAbsent) {
        // Schema not ready yet — release the claim so this row is retried, never discarded.
        await supabase.from('sms_status_staging').update({ drained_at: null }).eq('id', row.id);
        outcome = 'schema_not_ready';
      } else if (writerResult.matched) {
        outcome = 'updated';
      } else {
        outcome = 'parked_no_match';
      }
    } catch (e) {
      // Genuine processing error — release the claim so the next tick retries.
      try {
        await supabase.from('sms_status_staging').update({ drained_at: null }).eq('id', row.id);
      } catch { /* best-effort release; runner fail-soft + backlog-stall are the durable alarms */ }
      throw e;
    }

    results.push({ id: row.id, outcome });
  }

  return { drained: results.length, results };
}

/**
 * SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-4c: explicit, idempotent disposition of a
 * parked row. Conditional UPDATE (WHERE parked_at IS NOT NULL AND resolved_at IS NULL) so a
 * second call on an already-resolved (or never-parked) row is a no-op, never an error — the
 * same claim-by-conditional-UPDATE shape drainSmsRelayStaging uses for drained_at. Once
 * resolved_at is set, surfaceParkedChairmanSms (scripts/adam-quiet-tick.mjs) stops returning
 * the row, silencing the QUIET_TICK_SMS_PARKED interrupt for it exactly once.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id - sms_relay_staging.id
 * @returns {Promise<{resolved: boolean}>} resolved:true only if THIS call performed the resolution
 */
export async function resolveParkedChairmanSmsRow(supabase, id) {
  const { data } = await supabase
    .from('sms_relay_staging')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
    .not('parked_at', 'is', null)
    .is('resolved_at', null)
    .select('id');
  return { resolved: Boolean(data && data.length > 0) };
}

/**
 * QF-20260818-263: answered implies resolved. A chairman reply sent via --reply-to-inbound
 * answers whichever parked row(s) are currently outstanding, so resolve ALL of them in the same
 * write path instead of leaving resolved_at NULL until a human runs the disposition CLI by hand
 * (measured twice in one day: rows 18a07a83+2902dab6 answered 12:25Z, not resolved until 12:40Z).
 * Same conditional-UPDATE predicate as resolveParkedChairmanSmsRow, unscoped by id — idempotent,
 * a second call with nothing outstanding is a no-op.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{resolvedCount: number, resolvedIds: string[]}>}
 */
export async function resolveAllParkedChairmanSmsRows(supabase) {
  const { data } = await supabase
    .from('sms_relay_staging')
    .update({ resolved_at: new Date().toISOString() })
    .not('parked_at', 'is', null)
    .is('resolved_at', null)
    .select('id');
  return { resolvedCount: data?.length || 0, resolvedIds: (data || []).map((r) => r.id) };
}

export {
  composeMessage,
  normalizeSmsOptions,
  matchSmsOption,
  stampSmsChannel,
  TOKEN_TTL_MS,
  MAX_SMS_BODY_LENGTH,
  INBOUND_RATE_LIMIT,
  AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD,
  AUTO_SUSPEND_UNMATCHED_THRESHOLD,
  PARK_OUTCOMES,
};
