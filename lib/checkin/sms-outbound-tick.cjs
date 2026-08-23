/**
 * QF-20260822-955 — standalone owed-row dispatch "worker tick" for
 * sms_outbound_obligations. The send leg previously only ran piggybacked
 * inside adam-chairman-sms.mjs, so an owed heartbeat_status_backstop row
 * strands until a live Adam session happens to send something (measured
 * live: 5+ minute strandings on 2026-08-22/23).
 *
 * A GHA cron was explicitly ruled out by the chairman (decision 8e9eb3a3=B,
 * 2026-08-15): granting NEW repo/CI Twilio secrets to a session-less sender
 * "adds no intelligence". This tick instead runs inside an ALREADY-LIVE,
 * already-authorized fleet worker session at every check-in, reusing that
 * session's own local Twilio env (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/
 * TWILIO_MESSAGING_SERVICE) exactly as adam-chairman-sms.mjs already does —
 * no new CI secret is granted or required. Since fleet workers rotate
 * near-continuously (typically several concurrent seats), the backstop now
 * holds whenever ANY worker seat is live, not only when Adam's specific
 * session happens to be.
 *
 * reconcileOutboundSms (lib/chairman/sms-outbound-worker.js) is already the
 * durable, claim-serialized, idempotent runner this needs — overlapping
 * invocations across concurrent workers are safe by design (atomic
 * single-use row claim). This module only adds the missing periodic
 * invocation point; no new dispatch logic.
 */

// Bounded so a slow/hanging Twilio call can never delay a worker's checkin exit.
const TICK_TIMEOUT_MS = 8000;

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), ms));
}

/**
 * Fail-soft: never throws, never blocks checkin beyond TICK_TIMEOUT_MS.
 * @param {{supabase: object, logger?: object, reconcile?: Function}} params
 *   `reconcile` is injectable (defaults to the real reconcileOutboundSms, dynamically
 *   imported since this file is CJS and that module is ESM) so tests never need a live
 *   DB/Twilio to exercise the fail-soft/timeout contract.
 * @returns {Promise<object|null>} the reconcile summary, or null on error/timeout
 */
async function tickSmsOutboundSweep({ supabase, logger = console, reconcile }) {
  try {
    const reconcileFn = reconcile || (await import('../chairman/sms-outbound-worker.js')).reconcileOutboundSms;
    const outcome = await Promise.race([reconcileFn(supabase, {}), timeout(TICK_TIMEOUT_MS)]);
    if (outcome && outcome.timedOut) {
      logger.warn?.('[sms-outbound-tick] reconcile pass timed out (non-fatal, checkin continues)');
      return null;
    }
    if (outcome && outcome.ran) {
      logger.log?.(`[sms-outbound-tick] ${JSON.stringify({ ts: new Date().toISOString(), ...outcome })}`);
    }
    return outcome || null;
  } catch (err) {
    logger.warn?.(`[sms-outbound-tick] non-fatal error: ${err?.message || err}`);
    return null;
  }
}

module.exports = { tickSmsOutboundSweep, TICK_TIMEOUT_MS };
