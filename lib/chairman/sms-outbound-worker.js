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
 * FAIL-SOFT: while the STAGED sms_outbound_obligations migration is unapplied the table is
 * absent; the liveness probe short-circuits and reconcileOutboundSms returns a no-op summary
 * (never throws), so this is inert pre-apply.
 */
import twilioProvider from '../messaging/providers/twilio-provider.js';
import { smsOutboundObligationsLive } from './sms-bridge.js';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BATCH_LIMIT = 25;

/**
 * Default alert seam — fired when an obligation exhausts its bounded retry budget. Kept as an
 * injectable seam (opts.alert) so the durable runner can wire real chairman-email escalation
 * (lib/notifications) without coupling this module to the email stack; the default is a
 * fail-soft structured log so retry-exhaustion is never SILENT even with no injected alerter.
 * @param {{id: string, recipient_phone: string, attempts: number, last_error?: string}} row
 */
function defaultAlert(row) {
  // eslint-disable-next-line no-console
  console.error(`[sms-outbound-worker] ALERT: obligation ${row.id} to ${row.recipient_phone} exhausted retries (attempts=${row.attempts}, last_error=${row.last_error || 'undelivered'})`);
}

/**
 * Reconcile the outbound SMS obligation queue: retry-or-alert terminal-failure rows, then claim
 * and send owed rows exactly once. Idempotent (a delivered row is never touched) and serialized
 * (concurrent workers never double-send).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service_role client
 * @param {{provider?: object, workerId?: string, maxAttempts?: number, batchLimit?: number,
 *   alert?: Function, now?: number}} [opts]
 * @returns {Promise<{ran: boolean, reason?: string, claimed: number, sent: number,
 *   failed: number, retried: number, alerted: number, skipped: number}>}
 */
export async function reconcileOutboundSms(supabase, opts = {}) {
  const {
    provider = twilioProvider,
    workerId = `worker-${process.pid || 'x'}-${Math.random().toString(36).slice(2, 8)}`,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    batchLimit = DEFAULT_BATCH_LIMIT,
    alert = defaultAlert,
    now = Date.now(),
  } = opts;

  const summary = { ran: false, claimed: 0, sent: 0, failed: 0, retried: 0, alerted: 0, skipped: 0 };

  // FR-1 fail-soft: inert while the STAGED table is absent (never throws).
  if (!(await smsOutboundObligationsLive(supabase))) {
    return { ...summary, reason: 'table_absent' };
  }
  summary.ran = true;

  const nowIso = new Date(now).toISOString();

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
    if ((row.attempts || 0) >= maxAttempts) {
      // Idempotent-ish alert: mark it alerted via last_error prefix so a re-run does not re-alert.
      if (!(row.last_error || '').startsWith('ALERTED:')) {
        try { await alert(row); } catch { /* alert seam is best-effort */ }
        // Mark terminal 'failed' + an ALERTED: prefix so a re-run neither re-sends nor re-alerts.
        await supabase
          .from('sms_outbound_obligations')
          .update({ status: 'failed', last_error: `ALERTED: ${row.last_error || 'undelivered'}` })
          .eq('id', row.id);
        summary.alerted++;
      } else {
        summary.skipped++;
      }
    } else {
      await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'owed', claimed_at: null, claimed_by: null })
        .eq('id', row.id)
        .in('status', ['undelivered', 'failed']);
      summary.retried++;
    }
  }

  // ---- Pass 2: claim + send owed rows (serialized, exactly once) ----
  const { data: owed } = await supabase
    .from('sms_outbound_obligations')
    .select('id, recipient_phone, body, attempts, decision_id, not_before')
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
      .select('id, recipient_phone, body, attempts');

    if (!claimed || claimed.length === 0) {
      summary.skipped++;
      continue; // lost the claim race — the other worker owns this send
    }
    summary.claimed++;

    const c = claimed[0];
    const attempts = (c.attempts || 0) + 1;
    let result;
    try {
      result = await provider.send({ to: c.recipient_phone, body: c.body });
    } catch (err) {
      result = { status: 'failed', reason: err?.message || 'provider_threw' };
    }

    if (!result || result.status === 'failed') {
      // Send failed — mark failed (reconcile pass will retry until the cap), release the claim.
      await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'failed', attempts, last_error: (result && result.reason) || 'provider_failed', claimed_at: null, claimed_by: null })
        .eq('id', row.id);
      summary.failed++;
    } else {
      // 201-ACCEPT (queued/sent). This is NOT delivery — delivered_at is set only by the FR-2
      // status callback. Stamp the Twilio SID so that callback can key delivery-truth to this row.
      await supabase
        .from('sms_outbound_obligations')
        .update({ status: 'sent', provider_message_id: result.provider_message_id || null, sent_at: nowIso, attempts })
        .eq('id', row.id);
      summary.sent++;
    }
  }

  return summary;
}

export default reconcileOutboundSms;
