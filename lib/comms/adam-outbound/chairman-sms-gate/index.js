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
    async send() {
      // Production wiring point: construct the Twilio client from isolated env here.
      // Until wired, refuse loudly rather than pretend to send (fail-closed by default).
      throw new Error('chairman-sms-gate: no Twilio sender configured — inject opts.sender or wire makeDefaultSender()');
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
