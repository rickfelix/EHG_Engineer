/**
 * Durable, claim-serialized, idempotent send/reconcile worker for the chairman outbound SMS
 * channel. SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-3.
 *
 * WHY: FR-1 makes every outbound chairman SMS a durable 'owed' obligation row (written before
 * any provider send, in sms_outbound_obligations). This worker turns those owed rows into
 * actual sends — exactly once, serialized across concurrent workers/sessions — and reconciles
 * undelivered/failed rows with a bounded retry then an alert, so nothing is ever silently lost
 * and no send is ever double-charged.
 *
 * DURABILITY / NO SESSION-LOCAL TIMERS: reconcileOutboundSms is a plain async function invoked
 * by a DURABLE runner (scripts/cron/sms-outbound-reconcile-sweep.mjs --once, or any cron /
 * periodic-process-registry entry). It holds NO setTimeout/setInterval/cron of its own, so a
 * fresh session can run it cold and pick up owed rows left behind by a session that died mid-send
 * (the F1 failure mode). Verified by the git-grep pin in the test file.
 *
 * SERIALIZATION: the claim is the SAME single-use conditional-UPDATE idiom already proven in
 * lib/chairman/sms-bridge.js (consumeSmsReply / handleInboundSmsReply): an atomic
 * `UPDATE ... SET status='sending', claimed_at=now WHERE id=? AND status='owed' AND claimed_at IS NULL
 * RETURNING id`. Two concurrent workers both issue it; the DB serializes on the row so exactly
 * one sees status='owed' and wins — the loser's predicate no longer matches and it claims
 * nothing, so provider.send is called at most once per owed row (no double-charge, TR-3).
 *
 * DELIVERY-TRUTH: a successful provider.send is a Twilio 201-ACCEPT (status 'queued') — this
 * worker stamps status='sent' + sent_at, NEVER 'delivered'. delivered_at is set ONLY by a
 * signature-valid MessageStatus=delivered status callback (api/webhooks/twilio-sms.js, FR-2).
 *
 * STUCK-STATE RECONCILE (SECURITY MEDIUM-1/2 — the two most common stuck states):
 *   - sent-no-callback (MEDIUM-2 / SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A FR-2): a status='sent'
 *     row whose delivered_at is still NULL after SENT_DELIVERY_TIMEOUT no longer blindly re-arms.
 *     It QUERIES Twilio directly by provider_message_id: confirmed 'delivered' stamps
 *     delivered_at directly (the callback was just lost/late); confirmed 'undelivered'/'failed'
 *     takes the normal bounded retry/alert path; a failed or ambiguous provider-check escalates
 *     to 'owed_escalate' (Solomon Pin #3 — never silently closed, never blindly re-armed).
 *   - sending-crash reaper (MEDIUM-1): a status='sending' row whose claimed_at is older than
 *     CLAIM_TIMEOUT was stranded by a worker that died between the claim and the terminal update.
 *     NO-DOUBLE-SEND GUARD: a row that already carries a provider_message_id (or sent_at) WAS
 *     sent before the crash, so it is routed to the sent-no-callback path (flipped to 'sent'),
 *     never re-sent; only a row with NO provider_message_id AND NO sent_at (never sent) is
 *     re-armed for a fresh send.
 *
 * SLEEP-WINDOW AT RELEASE (Solomon Pin #1): every re-arm-to-'owed' (retryOrAlert) stamps
 * not_before from smsQuietWindowReleaseIso(now) — a row re-armed at 9:58PM ET is held for the
 * next 6AM ET release, not fired at the very next sweep tick.
 *
 * DUPLICATE-SEND HISTORY (Solomon Pin #2): a resend (a row whose provider_message_id already
 * carries a prior SID) preserves that prior SID in prior_provider_message_ids before overwriting
 * it, so a late callback for the ORIGINAL send still resolves against this row instead of
 * silently no-op'ing — the exact mechanism behind the live 7-duplicate incident this SD fixes.
 *
 * FAIL-SOFT: while the STAGED sms_outbound_obligations migration is unapplied the table is
 * absent; the liveness probe short-circuits and reconcileOutboundSms returns a no-op summary
 * (never throws), so this is inert pre-apply.
 */
import twilioProvider from '../messaging/providers/twilio-provider.js';
import { smsOutboundObligationsLive } from './sms-bridge.js';
import { smsQuietWindowReleaseIso } from '../time/chairman-et-wall-clock.js';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BATCH_LIMIT = 25;
// SECURITY MEDIUM-2: a row that reaches status='sent' but never receives a delivery callback
// (TWILIO_STATUS_CALLBACK_URL unset, or Twilio never calls back) is reconciled by the
// sent-delivery-timeout pass — the safety net that makes delivery-truth fire even with no
// callback, so F1 is fully (not half) closed.
export const DEFAULT_SENT_DELIVERY_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
// SECURITY MEDIUM-1: a worker crash between the claim (status='sending') and the terminal update
// strands the row in 'sending' forever; the claim-timeout reaper re-selects it after this long.
export const DEFAULT_CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/**
 * SECURITY LOW: never log a chairman phone number in plaintext — last 4 digits only.
 * @param {string} phone
 * @returns {string} masked form e.g. '***4567'
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '<no-phone>';
  const last4 = phone.replace(/\D/g, '').slice(-4);
  return last4 ? `***${last4}` : '<redacted>';
}

/**
 * Default alert seam — fired when an obligation exhausts its bounded retry budget. Kept as an
 * injectable seam (opts.alert) so the durable runner can wire real chairman-email escalation
 * (lib/notifications) without coupling this module to the email stack; the default is a
 * fail-soft structured log so retry-exhaustion is never SILENT even with no injected alerter.
 * The recipient phone is MASKED to last-4 (SECURITY LOW).
 * @param {{id: string, recipient_phone: string, attempts: number, last_error?: string}} row
 */
function defaultAlert(row) {
  // eslint-disable-next-line no-console
  console.error(`[sms-outbound-worker] ALERT: obligation ${row.id} to ${maskPhone(row.recipient_phone)} exhausted retries (attempts=${row.attempts}, last_error=${row.last_error || 'undelivered'})`);
}

/**
 * Shared bounded-retry-or-alert for a reconcile-eligible row: under the attempt cap it is
 * re-armed to 'owed' (claim cleared) guarded by `.in('status', fromStatuses)` so a concurrent
 * worker cannot double-re-arm; at/over the cap it is alerted once (ALERTED: prefix guard) and
 * left terminal 'failed'. Returns the summary bucket to increment.
 *
 * Solomon Pin #1 (sleep-window AT RELEASE, not just at enqueue): the re-arm stamps not_before
 * from smsQuietWindowReleaseIso(now) — null (immediate) outside the 10PM-6AM ET window, or the
 * next 6AM ET instant when `now` falls inside it. Without this, a row re-armed at 9:58PM ET kept
 * its stale/already-elapsed not_before and was immediately reclaimed by the very next sweep tick.
 * @returns {Promise<'retried'|'alerted'|'skipped'>}
 */
async function retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses, reason, now }) {
  if ((row.attempts || 0) >= maxAttempts) {
    if ((row.last_error || '').startsWith('ALERTED:')) return 'skipped';
    try { await alert(row); } catch { /* alert seam is best-effort */ }
    await supabase
      .from('sms_outbound_obligations')
      .update({ status: 'failed', last_error: `ALERTED: ${row.last_error || reason}` })
      .eq('id', row.id);
    return 'alerted';
  }
  await supabase
    .from('sms_outbound_obligations')
    .update({ status: 'owed', claimed_at: null, claimed_by: null, not_before: smsQuietWindowReleaseIso(now) })
    .eq('id', row.id)
    .in('status', fromStatuses);
  return 'retried';
}

/**
 * Solomon Pin #3 (callback-loss backstop polarity): an obligation with no delivery callback AND
 * a failed/inconclusive provider-check goes to 'owed_escalate' — never silently closed, never
 * blindly re-armed. Fires the same best-effort alert seam as retryOrAlert so the operator is
 * never left unaware.
 */
async function escalate(supabase, row, alert, reason) {
  try { await alert(row); } catch { /* alert seam is best-effort */ }
  await supabase
    .from('sms_outbound_obligations')
    .update({ status: 'owed_escalate', last_error: reason })
    .eq('id', row.id)
    .eq('status', 'sent');
}

/**
 * Reconcile the outbound SMS obligation queue: retry-or-alert terminal-failure rows, then claim
 * and send owed rows exactly once. Idempotent (a delivered row is never touched) and serialized
 * (concurrent workers never double-send).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service_role client
 * @param {{provider?: object, workerId?: string, maxAttempts?: number, batchLimit?: number,
 *   alert?: Function, now?: number, sentDeliveryTimeoutMs?: number, claimTimeoutMs?: number,
 *   statusCallbackUrl?: string, logger?: object}} [opts]
 * @returns {Promise<{ran: boolean, reason?: string, claimed: number, sent: number,
 *   failed: number, retried: number, alerted: number, skipped: number, reaped: number,
 *   sentTimedOut: number, escalated: number, confirmedDelivered: number}>}
 */
export async function reconcileOutboundSms(supabase, opts = {}) {
  const {
    provider = twilioProvider,
    workerId = `worker-${process.pid || 'x'}-${Math.random().toString(36).slice(2, 8)}`,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    batchLimit = DEFAULT_BATCH_LIMIT,
    alert = defaultAlert,
    now = Date.now(),
    sentDeliveryTimeoutMs = DEFAULT_SENT_DELIVERY_TIMEOUT_MS,
    claimTimeoutMs = DEFAULT_CLAIM_TIMEOUT_MS,
    statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL || '',
    logger = console,
  } = opts;

  const summary = { ran: false, claimed: 0, sent: 0, failed: 0, retried: 0, alerted: 0, skipped: 0, reaped: 0, sentTimedOut: 0, escalated: 0, confirmedDelivered: 0 };

  // FR-1 fail-soft: inert while the STAGED table is absent (never throws).
  if (!(await smsOutboundObligationsLive(supabase))) {
    return { ...summary, reason: 'table_absent' };
  }
  summary.ran = true;

  const nowIso = new Date(now).toISOString();

  // MEDIUM-2 (approach b + loud log): with no callback URL configured, delivery-truth can only
  // come from the sent-delivery-timeout safety net below. Log loudly so the operator knows the
  // callback path is disabled (fail-soft — never throws).
  if (!statusCallbackUrl) {
    logger.warn?.('[sms-outbound-worker] TWILIO_STATUS_CALLBACK_URL is unset — delivery callbacks are DISABLED; sent rows are reconciled only by the sent-delivery-timeout safety net.');
  }

  // ---- Pass 1: reconcile terminal-failure rows (bounded retry, then alert) ----
  // An undelivered/failed row under the attempt cap is re-armed to 'owed' (claim cleared) so the
  // send pass re-attempts it; at/over the cap it is left 'failed' and alerted — never silently
  // dropped (FR-3).
  const { data: failedRows } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, attempts, last_error, status')
    .in('status', ['undelivered', 'failed'])
    .limit(batchLimit);

  for (const row of failedRows || []) {
    const outcome = await retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses: ['undelivered', 'failed'], reason: 'undelivered', now });
    summary[outcome]++;
  }

  // ---- Pass 1b: sending-crash reaper (SECURITY MEDIUM-1) ----
  // A status='sending' row whose claimed_at is older than the claim-timeout was stranded by a
  // worker that died between the claim and the terminal update.
  const { data: stuckSending } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, attempts, last_error, status, claimed_at, provider_message_id, sent_at')
    .eq('status', 'sending')
    .limit(batchLimit);

  for (const row of stuckSending || []) {
    // Only reap rows whose claim has genuinely timed out — an active worker's fresh claim is left alone.
    if (!row.claimed_at || new Date(row.claimed_at).getTime() > (now - claimTimeoutMs)) { summary.skipped++; continue; }

    if (row.provider_message_id || row.sent_at) {
      // NO-DOUBLE-SEND GUARD: this row WAS already sent before the crash (the provider returned a
      // SID). Route it to the sent-delivery-timeout path — flip to 'sent' (never re-send). If
      // sent_at was never persisted, best-estimate it from claimed_at so the timeout pass can age it.
      await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'sent', sent_at: row.sent_at || row.claimed_at || nowIso })
        .eq('id', row.id)
        .eq('status', 'sending');
      summary.reaped++;
    } else {
      // Never sent (no SID, no sent_at) — safe to re-arm for a fresh send (bounded), or alert at cap.
      const outcome = await retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses: ['sending'], reason: 'sending_crash_timeout', now });
      summary[outcome === 'retried' ? 'reaped' : outcome]++;
    }
  }

  // ---- Pass 1c: sent-no-callback delivery-timeout (SECURITY MEDIUM-2 / FR-2) ----
  // A status='sent' row whose delivered_at is still NULL after the sent-delivery-timeout never
  // got a delivery callback. FR-2: query Twilio directly by provider_message_id instead of
  // blindly re-arming — re-owe happens ONLY on a provider-CONFIRMED non-delivery. Solomon Pin #3:
  // a failed/inconclusive provider-check (not a confirmed answer either way) escalates to
  // 'owed_escalate', never silently closed and never blindly re-armed.
  const { data: sentRows } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, attempts, last_error, status, sent_at, delivered_at, provider_message_id')
    .eq('status', 'sent')
    .is('delivered_at', null)
    .limit(batchLimit);

  for (const row of sentRows || []) {
    // Within the timeout (still awaiting a legitimate callback) — leave it alone.
    if (!row.sent_at || new Date(row.sent_at).getTime() > (now - sentDeliveryTimeoutMs)) { summary.skipped++; continue; }

    if (!row.provider_message_id) {
      // No SID to check against — cannot confirm either way. Escalate rather than guess.
      await escalate(supabase, row, alert, 'sent_no_delivery_callback_no_provider_message_id');
      summary.escalated++;
      continue;
    }

    let checkedStatus;
    try {
      const check = await provider.checkMessageStatus(row.provider_message_id);
      checkedStatus = check.status;
    } catch (err) {
      // The provider-check itself failed — Pin #3's literal "no callback AND a failed
      // provider-check" case. Escalate, never silently closed.
      await escalate(supabase, row, alert, `provider_check_failed:${err?.message || 'unknown'}`);
      summary.escalated++;
      continue;
    }

    if (checkedStatus === 'delivered') {
      // The callback was lost/late but Twilio confirms delivery — stamp delivered-truth
      // directly. Never re-owe a message that actually delivered.
      await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'delivered', delivered_at: nowIso })
        .eq('id', row.id)
        .eq('status', 'sent');
      summary.confirmedDelivered++;
    } else if (checkedStatus === 'undelivered' || checkedStatus === 'failed') {
      // Provider-CONFIRMED non-delivery (never blind) — the normal bounded retry/alert path.
      const outcome = await retryOrAlert(supabase, row, { maxAttempts, alert, fromStatuses: ['sent'], reason: 'sent_no_delivery_callback_provider_confirmed', now });
      summary[outcome === 'retried' ? 'sentTimedOut' : outcome]++;
    } else {
      // Twilio itself reports a non-terminal status despite our own timeout having elapsed —
      // genuinely ambiguous. Escalate rather than silently retry or silently close.
      await escalate(supabase, row, alert, `provider_check_ambiguous_status:${checkedStatus}`);
      summary.escalated++;
    }
  }

  // ---- Pass 2: claim + send owed rows (serialized, exactly once) ----
  const { data: owed } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, body, attempts, decision_id, not_before, media_url, provider_message_id, prior_provider_message_ids')
    .eq('status', 'owed')
    .order('created_at', { ascending: true })
    .limit(batchLimit);

  // not_before honored: a row queued inside the 10PM-6AM ET sleep window is not eligible until
  // its not_before elapses (FR-3 / sleep-window). Filtered here so an un-due row is never claimed.
  const claimable = (owed || []).filter((r) => !r.not_before || new Date(r.not_before).getTime() <= now);

  for (const row of claimable) {
    // Atomic single-use claim — the serialization point. A concurrent worker that already
    // claimed this row flipped status off 'owed', so this UPDATE matches 0 rows and we skip it
    // (no send, no double-charge).
    const { data: claimed } = await supabase
      .from('sms_outbound_obligations')
      .update({ status: 'sending', claimed_at: nowIso, claimed_by: workerId })
      .eq('id', row.id)
      .eq('status', 'owed')
      .is('claimed_at', null)
      .select('id, recipient_phone, body, attempts, media_url, provider_message_id, prior_provider_message_ids');

    if (!claimed || claimed.length === 0) {
      summary.skipped++;
      continue; // lost the claim race — the other worker owns this send
    }
    summary.claimed++;

    const c = claimed[0];
    const attempts = (c.attempts || 0) + 1;
    let result;
    try {
      result = await provider.send({ to: c.recipient_phone, body: c.body, mediaUrl: c.media_url });
    } catch (err) {
      result = { status: 'failed', reason: err?.message || 'provider_threw' };
    }

    if (!result || result.status === 'failed') {
      // Send failed — mark failed (reconcile pass will retry until the cap), release the claim.
      // STATUS GUARD (adversarial-review finding, SECURITY sub-agent): this write is conditioned
      // on the row still being 'sending' — the exact status THIS claim just set. If a concurrent
      // webhook callback for a prior SID already moved the row to 'delivered'/'canceled' while the
      // send was in flight, this update matches zero rows instead of clobbering that outcome.
      await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'failed', attempts, last_error: (result && result.reason) || 'provider_failed', claimed_at: null, claimed_by: null })
        .eq('id', row.id)
        .eq('status', 'sending');
      summary.failed++;
    } else {
      // 201-ACCEPT (queued/sent). This is NOT delivery — delivered_at is set only by the FR-2
      // status callback. Stamp the Twilio SID so that callback can key delivery-truth to this row.
      //
      // FR-3 / Solomon Pin #2: this is a RESEND whenever c.provider_message_id already carries a
      // prior SID (the row went through a re-arm-to-owed cycle since it was last sent). Overwriting
      // provider_message_id in place — the pre-fix behavior — silently orphans that prior SID: a
      // late-arriving callback for it then matches zero rows and no-ops even if the original send
      // actually delivered, producing a REAL duplicate SMS to the chairman. Preserve it in
      // prior_provider_message_ids so applyOwedDeliveryTruth (api/webhooks/twilio-sms.js) can still
      // resolve a late callback against this row by either SID.
      const priorSid = c.provider_message_id;
      const priorHistory = Array.isArray(c.prior_provider_message_ids) ? c.prior_provider_message_ids : [];
      const priorProviderMessageIds = (priorSid && priorSid !== result.provider_message_id)
        ? [...priorHistory, priorSid]
        : priorHistory;
      // STATUS GUARD: same reasoning as the failure branch above — a concurrent callback for a
      // prior SID that already stamped 'delivered'/'canceled' while this send was in flight wins;
      // this completion write becomes a no-op instead of overwriting it back to 'sent'.
      await supabase
        .from('sms_outbound_obligations')
        .update({
          status: 'sent',
          provider_message_id: result.provider_message_id || null,
          prior_provider_message_ids: priorProviderMessageIds,
          sent_at: nowIso,
          attempts,
        })
        .eq('id', row.id)
        .eq('status', 'sending');
      summary.sent++;
    }
  }

  return summary;
}

export default reconcileOutboundSms;
