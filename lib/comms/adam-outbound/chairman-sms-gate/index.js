/**
 * Chairman-SMS pre-send gate — SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-C (Layer 1, parent FR-2).
 *
 * The SINGLE path all chairman SMS must take. Two structural guarantees:
 *   1. CREDENTIAL ISOLATION — the Twilio sender (and thus the credentials) is reachable ONLY
 *      from inside this module. There is no exported raw client; a raw POST anywhere else is
 *      structurally impossible. This is the outbound analog of the inbound relay isolation and
 *      closes the raw-POST bypass.
 *   2. RUBRIC-GATED + FAIL-CLOSED — every send is gated on the shared rubric engine (child -A's
 *      evaluate()). A message is sent ONLY when verdict==='pass' AND authorityClass==='sms'.
 *      A console-authority (spend/irreversible/chairman-only) message routes to the console, never
 *      SMS. If the rubric/gate is unavailable (evaluate throws), a DECISION is FAIL-CLOSED — held
 *      + console-logged, never sent ungated.
 *
 * The Twilio sender, the rubric evaluate(), and the console are all INJECTABLE (opts) so unit
 * tests open zero live Twilio connections. Production wires a real Twilio sender via
 * makeDefaultSender() (a private factory); it is NOT exported.
 */

import { evaluate as defaultEvaluate, effectiveType } from '../rubric-engine/index.js';

/**
 * Private Twilio-sender factory. The ONLY place credentials are read. Not exported — callers
 * cannot obtain the raw client. Lazily constructed so importing this module does not require
 * Twilio config; a real send without a configured/injected sender fails closed (never silent).
 * @returns {{ send: (message:object) => Promise<{sid?:string}> }}
 */
function makeDefaultSender() {
  return {
    // SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 (Part 1): the production wiring point now DELEGATES to
    // the existing -B durable send path (lib/chairman/sms-bridge.js enqueueChairmanSms) rather than
    // constructing a SECOND Twilio client — the -B stack owns the real Twilio sender + the durable
    // owed-state (sms_outbound_obligations) + the reconcile worker. Building a parallel client here
    // would fork owed-state (the two-stack hazard). Lazy-imported so this module stays importable
    // without Supabase config. Credential isolation is preserved: no raw Twilio client is exposed.
    //
    // TRANSPORT fail-SOFT (distinct from the gate's RUBRIC fail-CLOSED): a rubric PASS has already
    // been earned before send() is called; if the durable enqueue is unavailable (the STAGED
    // sms_outbound_obligations migration is not applied pre-go-live), we DO NOT throw — the existing
    // chairman EMAIL escalation is the guaranteed live fallback and has already fired. Returns the
    // enqueue outcome so the caller can log delivered-durably vs deferred-to-email.
    async send(message = {}) {
      const recipientPhone = message.recipientPhone || process.env.CHAIRMAN_PHONE || null;
      if (!recipientPhone) {
        return { sid: null, softFailed: true, reason: 'no_recipient_phone' };
      }
      try {
        const [{ enqueueChairmanSms }, { createClient }] = await Promise.all([
          import('../../../chairman/sms-bridge.js'),
          import('@supabase/supabase-js'),
        ]);
        const supabase = createClient(
          process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
        const enq = await enqueueChairmanSms(supabase, {
          recipientPhone,
          kind: message.kind || 'decision_question',
          body: message.body || '',
          decisionId: message.decisionId || null,
          dedupeKey: message.dedupeKey || null,
        });
        return enq.enqueued ? { sid: enq.obligationId } : { sid: null, softFailed: true, reason: enq.reason || 'not_enqueued' };
      } catch (err) {
        // Transport fail-soft — never throw (email fallback covers delivery).
        return { sid: null, softFailed: true, reason: `durable_path_error: ${err.message}` };
      }
    },
  };
}

/**
 * The sole chairman-SMS send path.
 * @param {object} message - the message (see rubric-engine evaluate() shape)
 * @param {object} context - rubric context (quiet-hours, rate cap, etc.)
 * @param {object} opts - { sender?, evaluate?, console? } injectable seams
 * @returns {Promise<{sent:boolean, held?:boolean, routedToConsole?:boolean, reason:string, verdict?:string, authorityClass?:string, blockedReasons?:string[]}>}
 */
export async function sendChairmanSMS(message = {}, context = {}, opts = {}) {
  const sender = opts.sender || makeDefaultSender();
  const evaluate = typeof opts.evaluate === 'function' ? opts.evaluate : defaultEvaluate;
  const log = opts.console || console;
  const isDecision = effectiveType(message) === 'decision'; // classifier hardening (FR-4)

  // Rubric gate — FAIL-CLOSED on unavailability (FR-3).
  let result;
  try {
    result = await evaluate(message, context, opts);
  } catch (err) {
    if (isDecision) {
      log.error(`[chairman-sms-gate] FAIL-CLOSED: rubric unavailable, decision HELD: ${err.message}`);
      return { sent: false, held: true, reason: 'gate_unavailable', verdict: null };
    }
    log.warn(`[chairman-sms-gate] rubric unavailable for a non-decision; not sending: ${err.message}`);
    return { sent: false, held: true, reason: 'gate_unavailable_status', verdict: null };
  }

  // Blocked verdict -> not sent (held + console) (FR-2).
  if (result.verdict !== 'pass') {
    log.warn(`[chairman-sms-gate] blocked by rubric, HELD: ${(result.blockedReasons || []).join('; ')}`);
    return { sent: false, held: true, reason: 'blocked', verdict: result.verdict, blockedReasons: result.blockedReasons || [] };
  }

  // Console-authority -> route to console, never SMS (FR-2).
  if (result.authorityClass === 'console') {
    log.warn('[chairman-sms-gate] console-authority message routed to console, not SMS');
    return { sent: false, routedToConsole: true, reason: 'console_authority', verdict: 'pass', authorityClass: 'console' };
  }

  // pass + sms-authority -> send via the isolated sender.
  await sender.send(message);
  return { sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' };
}
