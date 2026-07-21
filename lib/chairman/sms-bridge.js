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

  // Persist the presented options on the decision so handleInboundSmsReply can enforce the
  // multiple-choice match. Stored under brief_data.sms_options (NOT sms_reply) — this is presented-
  // QUESTION metadata, never the reply, so it is outside the free-text-untrusted seam and the
  // anti-direct-read AST rule (which guards sms_reply only). Read+merge so existing brief_data keys
  // are preserved; only touched when options are actually presented (legacy path unchanged).
  let briefDataPatch = null;
  if (options.length > 0) {
    const { data: existingDecision } = await supabase
      .from('chairman_decisions')
      .select('brief_data')
      .eq('id', decisionId)
      .maybeSingle();
    briefDataPatch = { ...((existingDecision && existingDecision.brief_data) || {}), sms_options: options };
  }
  const decisionUpdate = { sms_reply_token: token, sms_reply_token_expires_at: expiresAt, consequence_level: consequence };
  if (briefDataPatch) decisionUpdate.brief_data = briefDataPatch;

  // SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-1: when the durable owed-state table is live,
  // ENQUEUE an owed obligation row instead of sending inline (the 201-as-success F1 defect). The
  // claim-serialized worker (reconcileOutboundSms) performs the actual send and stamps
  // provider_message_id, and delivery-truth is confirmed only by the status callback (FR-2). The
  // inbound-reply token + notification row are written NOW (independent of the send) so a reply
  // still correlates. GRACEFUL DEGRADATION: while the migration is STAGED-absent the probe returns
  // false and we fall through to the unchanged pre-existing inline-send path below — so nothing in
  // the live send path regresses pre-apply.
  if (await smsOutboundObligationsLive(supabase)) {
    await supabase.from('chairman_notifications').insert({
      chairman_user_id: chairmanUserId,
      recipient_email: chairmanEmail,
      recipient_phone: chairmanPhone,
      notification_type: 'immediate',
      channel: 'sms',
      decision_id: decisionId,
      status: 'queued', // not yet accepted by the provider — the worker sends it
      provider_message_id: null,
      error_message: null,
      sent_at: null,
    });

    await supabase
      .from('chairman_decisions')
      .update(decisionUpdate)
      .eq('id', decisionId);

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
    .update(decisionUpdate)
    .eq('id', decisionId);

  // FR-6: this decision is being ASKED over SMS — stamp channel='sms' (fail-soft; no-op pre-apply).
  await stampSmsChannel(supabase, decisionId);

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
      await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', matchedDecisionId: candidateIds[0] });
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
      await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', matchedDecisionId: target.id });
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
    await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'ambiguous', matchedDecisionId: candidateIds[0] });
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
    await logInbound(supabase, { from, to, body, messageSid, signatureValid, outcome, matchedDecisionId: candidateIds[0] });
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
      await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', matchedDecisionId: decisionId });
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
    await logInboundUnmatched(supabase, { from, to, body, messageSid, signatureValid, outcome: 'no_match', matchedDecisionId: decisionId });
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
 * each row drained_at regardless of outcome so it is never reprocessed. Rows are
 * processed oldest-first and sequentially — concurrency across rows is unnecessary
 * (the single-use claim inside handleInboundSmsReply already serializes correctly per
 * decision) and sequential draining keeps the ambiguity check's candidate snapshot
 * consistent within one drain pass.
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
    const outcome = await handleInboundSmsReply(supabase, {
      from: row.from_phone,
      to: row.to_phone,
      body: row.body_raw,
      messageSid: row.provider_message_id,
      signatureValid: row.signature_valid,
    });
    await supabase
      .from('sms_relay_staging')
      .update({ drained_at: new Date().toISOString() })
      .eq('id', row.id);
    results.push({ id: row.id, outcome: outcome.outcome });
  }

  return { drained: results.length, results };
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
};
