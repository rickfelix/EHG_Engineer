/**
 * SMS channel health — durable sweep schedule, degradation alarm, carrier-filter escalation.
 * SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-B (FR-1/FR-2/FR-3), run-side operator layer over the
 * parent's owed-state substrate (sms_outbound_obligations).
 *
 * All IO is fail-soft (absent STAGED tables degrade to loud logs, never throws — the
 * tableAbsent 42P01/PGRST205 posture of sms-outbound-worker.js); ratio computation and
 * carrier-filter classification are PURE (TR-2) so they unit-test without a DB.
 * Invoked from scripts/cron/sms-outbound-reconcile-sweep.mjs after each reconcile pass.
 */
import { registerArmedMachinery, armedProcessKey } from '../machinery-class/armed-registration.js';
import { stampLastFired } from '../periodic-liveness/stamp-last-fired.js';
import { emitFeedback } from '../governance/emit-feedback.js';

export const SWEEP_SD_KEY = 'SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-B';
/** The sweep's periodic_process_registry key (machinery-class helper derivation). */
export const SWEEP_PROCESS_KEY = armedProcessKey(SWEEP_SD_KEY);
export const DEFAULT_SWEEP_INTERVAL_SECONDS = 900; // 15 min — matches the reconcile cadence
export const DEFAULT_DEGRADATION_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h observation window
export const DEFAULT_DEGRADATION_THRESHOLD = 0.5; // >=50% of windowed sends bad => degraded
export const DEFAULT_MIN_SAMPLE = 3; // never alarm on 1-2 rows (noise floor)
/** One-shot escalation stamp prefix on the owed row (mirrors the worker's ALERTED: guard). */
export const EMAIL_ESCALATED_PREFIX = 'EMAIL_ESCALATED: ';

/**
 * FR-1: register the reconcile sweep as an on-by-default governed cadence
 * (currently_expected_active=true, positive interval). Fail-soft: absent registry
 * table => loud canary, current manual behavior continues.
 * @returns {Promise<{ok: boolean, processKey?: string, error?: string}>}
 */
export async function ensureSweepSchedule(supabase, { intervalSeconds = DEFAULT_SWEEP_INTERVAL_SECONDS, logger = console } = {}) {
  const res = await registerArmedMachinery(supabase, { sd_key: SWEEP_SD_KEY }, {
    activationTrigger: 'sms-outbound-reconcile-sweep run (scripts/cron/sms-outbound-reconcile-sweep.mjs)',
    expectedIntervalSeconds: intervalSeconds,
    owner: 'sms-delivery-truth',
  });
  if (!res.ok) {
    logger.warn?.(`[sms-channel-health] CANARY: sweep-schedule registration unavailable (${res.error}) — reconcile continues on manual/current behavior.`);
  }
  return res;
}

/**
 * FR-1: witness the cadence as fired — stamps last_fired_at on the registry row.
 * Fail-soft (a stamp failure never fails the sweep).
 */
export async function witnessSweepFired(supabase, { logger = console } = {}) {
  try {
    // stampLastFired THROWS on a DB error and returns {stamped:false, reason} on a
    // missing/mismatched registry row — both degrade to the canary here.
    const res = await stampLastFired(supabase, SWEEP_PROCESS_KEY);
    if (res && res.stamped === false) logger.warn?.(`[sms-channel-health] CANARY: last_fired_at not stamped (${res.reason || 'row_missing'})`);
    return res || { stamped: false };
  } catch (e) {
    logger.warn?.(`[sms-channel-health] CANARY: last_fired_at stamp threw (${e?.message || e})`);
    return { stamped: false, reason: e?.message || String(e) };
  }
}

/**
 * FR-2 PURE core: sustained undelivered/failed ratio over the recent window.
 * owed_escalate counts as bad (it is a confirmed-ambiguous non-delivery, never a success).
 * @param {Array<{status: string, created_at: string}>} rows
 * @returns {{ratio: number, total: number, bad: number}}
 */
export function computeDegradationRatio(rows, { windowMs = DEFAULT_DEGRADATION_WINDOW_MS, now = Date.now() } = {}) {
  const cutoff = now - windowMs;
  const windowed = (rows || []).filter((r) => r && r.created_at && new Date(r.created_at).getTime() >= cutoff);
  const bad = windowed.filter((r) => ['undelivered', 'failed', 'owed_escalate'].includes(r.status)).length;
  const total = windowed.length;
  return { ratio: total > 0 ? bad / total : 0, total, bad };
}

/**
 * FR-2: detect sustained channel degradation and raise a DURABLE alarm (a structured
 * feedback row naming the ratio and window — idempotent per day via emitFeedback's
 * dedup_hash). Fail-soft on absent owed-state table (no alarm, no throw).
 * @returns {Promise<{alarmed: boolean, ratio?: number, total?: number, reason?: string}>}
 */
export async function detectChannelDegradation(supabase, {
  windowMs = DEFAULT_DEGRADATION_WINDOW_MS, threshold = DEFAULT_DEGRADATION_THRESHOLD,
  minSample = DEFAULT_MIN_SAMPLE, now = Date.now(), emit = emitFeedback, logger = console,
} = {}) {
  let rows;
  try {
    const cutoffIso = new Date(now - windowMs).toISOString();
    const res = await supabase
      .from('sms_outbound_obligations')
      .select('status, created_at')
      .gte('created_at', cutoffIso)
      .limit(500);
    if (res.error) return { alarmed: false, reason: 'table_absent' };
    rows = res.data || [];
  } catch { return { alarmed: false, reason: 'table_absent' }; }

  const { ratio, total, bad } = computeDegradationRatio(rows, { windowMs, now });
  if (total < minSample || ratio < threshold) return { alarmed: false, ratio, total };

  const windowH = Math.round(windowMs / 3600000 * 10) / 10;
  try {
    await emit({
      supabase,
      title: `SMS channel DEGRADED: ${bad}/${total} undelivered/failed (${Math.round(ratio * 100)}%) over ${windowH}h`,
      description: `Sustained SMS non-delivery ratio ${ratio.toFixed(2)} (bad=${bad}, total=${total}) over the last ${windowH}h window crossed the ${threshold} threshold — the chairman SMS channel is degraded; investigate carrier/provider state and rely on email fallback meanwhile.`,
      type: 'issue', category: 'sms_channel_degradation', severity: 'high',
      source_application: 'EHG_Engineer', source_type: 'automated_detector',
      dedup_key: 'sms-channel-degradation',
      metadata: { ratio, bad, total, window_ms: windowMs, threshold, process_key: SWEEP_PROCESS_KEY },
    });
  } catch (e) {
    logger.warn?.(`[sms-channel-health] CANARY: degradation alarm write failed (${e?.message || e}) — ratio ${ratio.toFixed(2)} over ${windowH}h remains UNRECORDED.`);
    return { alarmed: false, ratio, total, reason: 'alarm_write_failed' };
  }
  return { alarmed: true, ratio, total };
}

/**
 * FR-3 PURE core: is this owed row's failure carrier-filtered (Twilio 30007 / carrier-filter
 * classification)? Already-escalated rows (EMAIL_ESCALATED stamp) are excluded — one-shot.
 */
export function isCarrierFiltered(row) {
  const err = (row && row.last_error) || '';
  if (err.includes(EMAIL_ESCALATED_PREFIX.trim())) return false;
  return /\b30007\b/.test(err) || /carrier[\s_-]?filter/i.test(err);
}

/**
 * FR-3: escalate carrier-filtered undelivered owed messages to the existing email-fallback
 * path (lib/notifications sendEmail) so the chairman still receives them, and stamp the
 * escalation on the owed row (idempotent one-shot via the EMAIL_ESCALATED prefix; the stamp
 * is written ONLY after a successful email attempt so a transiently-absent email path retries
 * on a later sweep — "absent email path degrades to a logged non-escalation").
 * @returns {Promise<{scanned: number, escalated: number, emailUnavailable: number}>}
 */
export async function escalateCarrierFiltered(supabase, { sendEmail, logger = console, batchLimit = 25 } = {}) {
  const out = { scanned: 0, escalated: 0, emailUnavailable: 0 };
  let rows;
  try {
    // SECURITY least-data note: recipient_phone deliberately NOT selected — the email
    // fallback needs only the body/error, and the adapter fixes the recipient itself.
    const res = await supabase
      .from('sms_outbound_obligations')
      .select('id, body, last_error, status')
      .in('status', ['undelivered', 'failed', 'owed_escalate'])
      .limit(batchLimit);
    if (res.error) return out; // fail-soft: absent table => nothing to escalate
    rows = res.data || [];
  } catch { return out; }

  let send = sendEmail;
  if (!send) {
    try { send = (await import('../notifications/resend-adapter.js')).sendEmail; }
    catch { send = null; }
  }

  for (const row of rows) {
    if (!isCarrierFiltered(row)) continue;
    out.scanned++;
    if (!send) { out.emailUnavailable++; logger.warn?.(`[sms-channel-health] carrier-filtered obligation ${row.id} NOT escalated — email path unavailable.`); continue; }
    try {
      await send({
        subject: `[SMS carrier-filtered] owed message escalated to email (obligation ${row.id})`,
        text: `The following chairman SMS was blocked by carrier filtering (Twilio 30007) and is delivered here instead:\n\n${row.body || '(no body)'}\n\n(last_error: ${row.last_error})`,
      });
    } catch (e) {
      logger.warn?.(`[sms-channel-health] email-fallback attempt failed for obligation ${row.id} (${e?.message || e}) — will retry next sweep.`);
      out.emailUnavailable++;
      continue; // no stamp on failure — retryable
    }
    await supabase
      .from('sms_outbound_obligations')
      .update({ last_error: `${EMAIL_ESCALATED_PREFIX}${row.last_error || 'carrier_filtered'}` })
      .eq('id', row.id)
      .in('status', ['undelivered', 'failed', 'owed_escalate']);
    out.escalated++;
  }
  return out;
}
