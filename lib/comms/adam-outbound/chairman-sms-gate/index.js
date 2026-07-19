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
 *   3. TRANSPORT HONESTY (QF-20260719-509, LIVE INCIDENT 2026-07-19) — sent:true is reported ONLY
 *      when the sender actually delivered/durably-enqueued the message. A soft-failed transport
 *      (durable table absent, no recipient, etc.) reports sent:false and fires a REAL fallback
 *      (defaultFallbackSend) — this module previously reported sent:true on a soft-failed
 *      transport while claiming a fallback had fired that never existed.
 *
 * The Twilio sender, the rubric evaluate(), the console, and the fallback sender are all
 * INJECTABLE (opts) so unit tests open zero live Twilio/email connections. Production wires a
 * real Twilio sender via makeDefaultSender() (a private factory); it is NOT exported.
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
    // sms_outbound_obligations migration is not applied pre-go-live), we DO NOT throw. Returns the
    // enqueue outcome so sendChairmanSMS (the caller) can report the truth and fire a real
    // fallback (QF-20260719-509 — this send() previously claimed 'the email fallback has already
    // fired' when NO fallback existed anywhere in the call path; the caller now owns that).
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
 * Private production fallback (QF-20260719-509, LIVE INCIDENT 2026-07-19): when the durable SMS
 * transport soft-fails, fire a REAL email alert — the code previously CLAIMED "the existing
 * chairman EMAIL escalation has already fired" while nothing in the call path ever sent one.
 * Reuses the same Resend adapter as adam-heartbeat-email.mjs. Never throws (a fallback failure
 * must not mask the original soft-fail); no-ops when CLAUDE_NOTIFY_EMAIL is unset.
 */
async function defaultFallbackSend({ message, reason }) {
  try {
    const to = process.env.CLAUDE_NOTIFY_EMAIL;
    if (!to) return { fired: false, reason: 'no_notify_email' };
    const mod = await import('../../../notifications/resend-adapter.js');
    const text = `A chairman-SMS send soft-failed and was NOT delivered.\n\nReason: ${reason}\nKind: ${message.kind || 'n/a'}\n\nOriginal message:\n${message.body || ''}`;
    await mod.sendEmail({
      from: 'Adam — LEO Fleet Advisor <onboarding@resend.dev>',
      to,
      subject: '[ACTION NEEDED - ADAM] chairman SMS failed to send',
      html: `<pre>${text}</pre>`,
      text,
    });
    return { fired: true };
  } catch (err) {
    return { fired: false, reason: `fallback_error: ${err.message}` };
  }
}

/**
 * The sole chairman-SMS send path.
 * @param {object} message - the message (see rubric-engine evaluate() shape)
 * @param {object} context - rubric context (quiet-hours, rate cap, etc.)
 * @param {object} opts - { sender?, evaluate?, console?, fallbackSend? } injectable seams
 * @returns {Promise<{sent:boolean, held?:boolean, routedToConsole?:boolean, transportFailed?:boolean, fallbackFired?:boolean, reason:string, verdict?:string, authorityClass?:string, blockedReasons?:string[]}>}
 */
export async function sendChairmanSMS(message = {}, context = {}, opts = {}) {
  const sender = opts.sender || makeDefaultSender();
  const evaluate = typeof opts.evaluate === 'function' ? opts.evaluate : defaultEvaluate;
  const fallbackSend = typeof opts.fallbackSend === 'function' ? opts.fallbackSend : defaultFallbackSend;
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
  const sendResult = await sender.send(message);
  if (sendResult && sendResult.softFailed) {
    // QF-20260719-509 LIVE INCIDENT: a soft-failed transport must NEVER report sent:true (the
    // exact "false success" the chairman hit — "text me if you need me" dropped silently).
    log.error(`[chairman-sms-gate] TRANSPORT SOFT-FAILED, message NOT delivered: ${sendResult.reason}`);
    const fb = await fallbackSend({ message, reason: sendResult.reason });
    return { sent: false, transportFailed: true, fallbackFired: !!fb.fired, reason: sendResult.reason, verdict: 'pass', authorityClass: 'sms' };
  }
  return { sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' };
}
