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
 *      when the sender actually handed the message to Twilio. A soft-failed transport
 *      (durable table absent, no recipient, etc.) reports sent:false and fires a REAL fallback
 *      (defaultFallbackSend) — this module previously reported sent:true on a soft-failed
 *      transport while claiming a fallback had fired that never existed.
 *      QF-20260725-738 (LIVE INCIDENT 2026-07-25) NARROWED THIS: the clause above used to read
 *      "delivered/durably-enqueued", and that OR is precisely what licensed the bug — a durable
 *      enqueue counted as sent, so sent:true was returned for a message still at status='owed'
 *      that had not reached Twilio. Enqueue is NOT delivery. send() now dispatches inline and
 *      verifies the obligation reached status='sent' before any sid is returned.
 *
 * The Twilio sender, the rubric evaluate(), the console, and the fallback sender are all
 * INJECTABLE (opts) so unit tests open zero live Twilio/email connections. Production wires a
 * real Twilio sender via makeDefaultSender() (a private factory); it is NOT exported.
 */

import crypto from 'crypto';
import { evaluate as defaultEvaluate, effectiveType } from '../rubric-engine/index.js';
import { inQuietHours } from '../rubric-engine/lint.js';
import { stageDecisionSmsNotification, invalidateDecisionSmsStaging, updateNotificationStatus, TOKEN_TTL_MS } from '../../../chairman/sms-bridge.js';

/**
 * Lazily construct a real Supabase client for the FR-3 staging guard — matching the EXACT
 * pattern makeDefaultSender().send() already uses below, not a second/different client
 * construction (SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 TR-4). Only called when the guard
 * actually needs to stage a decision notification and no opts.supabase was injected; unit tests
 * always inject opts.supabase and never reach this.
 */
async function makeDefaultSupabaseClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * message.options may carry either bare label strings or {label} objects (the rubric-engine's
 * own lint tolerates both — see rubric-engine/lint.js's `o.label ?? o`). The matcher
 * (lib/chairman/sms-bridge.js matchSmsOption) and brief_data.sms_options require plain strings.
 * @param {unknown} options
 * @returns {string[]}
 */
function extractOptionLabels(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => (typeof o === 'string' ? o : o && typeof o.label === 'string' ? o.label : null))
    .filter((label) => typeof label === 'string' && label.trim() !== '');
}

/**
 * Private Twilio-sender factory. The ONLY place credentials are read. Not exported — callers
 * cannot obtain the raw client. Lazily constructed so importing this module does not require
 * Twilio config; a real send without a configured/injected sender fails closed (never silent).
 * @returns {{ send: (message:object) => Promise<{sid?:string}> }}
 */
/**
 * QF-20260725-738: did THIS obligation actually leave for Twilio? Pure, so the judgment the fix
 * turns on is testable without a live Twilio/Supabase connection.
 *
 * 'sent' is the bar: the outbound worker stamps it only after Twilio accepts the message
 * (provider_message_id set). 'delivered' (callback-only) also counts. Everything else — notably
 * 'owed', the exact state the live incident sat in for 33 minutes — is NOT dispatched. Fail-closed
 * on a missing/!malformed row: never report a send we cannot evidence.
 * @param {{status?:string}|null} row an sms_outbound_obligations row
 */
export function obligationDispatched(row) {
  return Boolean(row && (row.status === 'sent' || row.status === 'delivered'));
}

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
    // been earned before send() is called; if the durable enqueue is unavailable we DO NOT throw.
    // (This previously cited "the STAGED sms_outbound_obligations migration is not applied
    // pre-go-live" as the reason it would be unavailable. That is FALSE — measured 2026-08-02:
    // 17 columns, 395 rows. The fail-soft branch stands as a defensive path; the stated cause
    // does not. SD-LEO-INFRA-DECISION-RESURFACE-GUARDS-001 FR-3.) Returns the
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
        if (!enq.enqueued) return { sid: null, softFailed: true, reason: enq.reason || 'not_enqueued' };

        // QF-20260725-738 (LIVE INCIDENT 2026-07-25): enqueue is NOT delivery. This returned
        // sid=obligationId here, so sendChairmanSMS reported sent:true for a message still sitting
        // at status='owed'. One observed message stayed unsent for 33 minutes — surfaced only by a
        // Twilio ground-truth check — while the chairman texted three times asking if anyone was
        // there. An operator reading sent:true reasonably stops, which is exactly the failure mode.
        //
        // So DISPATCH INLINE and then VERIFY THIS obligation actually left. reconcileOutboundSms is
        // idempotent and serialized (claim predicate `WHERE status='owed' AND claimed_at IS NULL`),
        // so calling it here cannot double-send and cannot race the cron sweep. Verification reads
        // the row back rather than trusting the sweep's aggregate counts — per the sweep's own
        // header the sweep has a FAIL-SOFT branch, so its aggregate counters are not authoritative
        // for a specific message. (That header used to attribute the fail-soft to the obligations
        // migration being unapplied; the table is in fact live — 395 rows, measured 2026-08-02 —
        // so the sweep does real work. Reading the row back remains correct regardless: an
        // aggregate count was never evidence about one message.)
        //
        // status='sent' is the honest bar: the worker stamps it only after Twilio accepts the
        // message (provider_message_id set). 'delivered' is callback-only and NOT required here —
        // claiming delivery would be the same over-claim in a new place.
        try {
          const { reconcileOutboundSms } = await import('../../../chairman/sms-outbound-worker.js');
          await reconcileOutboundSms(supabase, { batchLimit: 25 });
        } catch (err) {
          return { sid: null, softFailed: true, reason: `dispatch_error: ${err.message}` };
        }
        const { data: row } = await supabase
          .from('sms_outbound_obligations')
          .select('status, provider_message_id')
          .eq('id', enq.obligationId)
          .maybeSingle();
        if (!obligationDispatched(row)) {
          // Enqueued but still owed/failed — report the truth so the email fallback fires.
          return { sid: null, softFailed: true, reason: `enqueued_not_dispatched: status=${row ? row.status : 'row_missing'}` };
        }
        return { sid: row.provider_message_id || enq.obligationId, dispatched: true };
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
 * QF-20260725-652 — the OVER-ASK gate on the CHAIRMAN lane.
 *
 * The deterministic 3-gate execute-vs-escalate rubric already guards the COORDINATOR lane
 * (scripts/adam-advisory.cjs -> lib/coordinator/adam-outbound-gate.js). It was absent here, on the
 * lane where an over-ask is expensive: an unguarded ask converts the chairman from exception-
 * governor into an approval gate, inverting vision principle 2 ("override authority, not approval
 * authority"). The post-hoc decision_rubric probe DOES catch these, but hours later — detection
 * after delivery cannot prevent delivery.
 *
 * Reuses classifyDecisionQuestion (lib/adam/adherence-probes.js) as the SINGLE authority — it
 * already routes its verdict through classifyDecision via gatesFromSignals. No second classifier.
 * Its `overAsk` is conservative by construction: it requires NO COMES-TO-HIM trigger, an
 * ADAM-DECIDES default sitting PROXIMATE to a decision-ASK, *and* an EXECUTE verdict. A heartbeat,
 * a status line, or a genuine ESCALATE-class packet therefore never trips it.
 *
 * Degrade-safe: FAILS OPEN. A gate bug must never hard-block Adam's comms (CONST-002).
 * @returns {Promise<{held:boolean, reason:string, decision?:object}>}
 */
async function evalOverAsk(message, context, opts) {
  // Scope: this gates ADAM-INITIATED asks only. A chairman-initiated exchange is never held.
  if (context.chairmanInitiated === true) return { held: false, reason: 'chairman-initiated exchange' };
  if (opts.overAskAttested === true || process.env.ADAM_OVERASK_VERIFIED === '1') {
    return { held: false, reason: 'attested (ADAM_OVERASK_VERIFIED)' };
  }
  const classify = typeof opts.classifyOverAsk === 'function'
    ? opts.classifyOverAsk
    : (await import('../../../adam/adherence-probes.js')).classifyDecisionQuestion;
  const c = classify(message.body);
  if (!c || c.overAsk !== true) return { held: false, reason: 'not an over-ask' };
  return { held: true, reason: 'decision classifies EXECUTE — Adam should act and inform', decision: c.decision };
}

/**
 * The sole chairman-SMS send path.
 * @param {object} message - the message (see rubric-engine evaluate() shape)
 * @param {object} context - rubric context (quiet-hours, rate cap, chairmanInitiated?)
 * @param {object} opts - { sender?, evaluate?, console?, fallbackSend?, classifyOverAsk?, overAskAttested?, presenceResolver?, presenceResolverOpts?, resolveChairmanZone? } injectable seams
 * @returns {Promise<{sent:boolean, held?:boolean, routedToConsole?:boolean, transportFailed?:boolean, fallbackFired?:boolean, reason:string, verdict?:string, authorityClass?:string, blockedReasons?:string[], overAsk?:boolean}>}
 */
export async function sendChairmanSMS(message = {}, context = {}, opts = {}) {
  const sender = opts.sender || makeDefaultSender();
  const evaluate = typeof opts.evaluate === 'function' ? opts.evaluate : defaultEvaluate;
  const fallbackSend = typeof opts.fallbackSend === 'function' ? opts.fallbackSend : defaultFallbackSend;
  const log = opts.console || console;
  const isDecision = effectiveType(message) === 'decision'; // classifier hardening (FR-4)

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-141 (PAT-LES-435dd6fee19f): resolve chairmanZone once,
  // here at the choke point, instead of at every individual caller. A caller that omits both
  // chairmanZone and the synchronous nowHourET override would otherwise silently fall through to
  // lint.js's own DEFAULT_ET_ZONE two layers downstream -- raised at 3 separate review phases and
  // each time patched at one more caller instead of the root. All 5 current callers already
  // resolve zone themselves, so this fallback is inert for them today; its value is closing the
  // gap for a future caller. Must run before BOTH downstream zone readers below (the presence
  // reply-window check and the rubric gate) -- guarding only before evaluate() would leave the
  // presence-reply branch on the silent ET default. Also guarded on !Number.isInteger(nowHourET):
  // etHour() (lint.js) short-circuits on that override before ever reading chairmanZone, so this
  // keeps the resolver off the hot path for every existing test that sets nowHourET. Degrade-safe
  // (CONST-002): a resolver failure never blocks the send, matching the presence-resolver pattern
  // immediately below.
  if (context.chairmanZone === undefined && !Number.isInteger(context.nowHourET)) {
    try {
      const resolveZone = typeof opts.resolveChairmanZone === 'function'
        ? opts.resolveChairmanZone
        : (await import('../quiet-hours-extension.js')).resolveChairmanZone;
      const { zone } = await resolveZone(new Date(context.now || Date.now()));
      context = { ...context, chairmanZone: zone };
    } catch (err) {
      log.warn(`[chairman-sms-gate] chairmanZone resolution unavailable, proceeding without it (fail-open): ${err.message}`);
    }
  }

  // SD-LEO-INFRA-QUIET-HOURS-GATE-001: measured-presence reply window. Consulted ONLY when the
  // caller declares a reply-class send (context.replyToInbound === true), no allowance is already
  // in force, and the send is inside the quiet window — daytime and unsolicited paths take zero
  // new code. On a measured grant (chairman inbound within the trailing window, read from
  // sms_relay_staging by the resolver — never self-attested), the context gains
  // allowQuietHours + quietHoursAllowReason='measured_presence_reply', and the message gains a
  // dedupeKey riding the durable obligation upsert (onConflict dedupe_key, ignoreDuplicates) so
  // ONE granting inbound row licenses at most ONE reply. Fail-closed: any resolver error or an
  // unreadable window leaves the context untouched and the send blocks exactly as pre-SD.
  if (context.replyToInbound === true && !context.allowQuietHours) {
    try {
      if (inQuietHours(context)) {
        const resolvePresence = typeof opts.presenceResolver === 'function'
          ? opts.presenceResolver
          : (await import('../presence-reply-window.js')).resolvePresenceReplyWindow;
        const presence = await resolvePresence(
          context.now instanceof Date || Number.isFinite(context.now) ? context.now : Date.now(),
          opts.presenceResolverOpts || {},
        );
        if (presence && presence.allowed === true && presence.grantRowId) {
          context = { ...context, allowQuietHours: true, quietHoursAllowReason: presence.reason || 'measured_presence_reply' };
          message = { ...message, dedupeKey: message.dedupeKey || `presence_reply:${presence.grantRowId}` };
          log.warn(`[chairman-sms-gate] quiet-hours reply allowed by measured presence (grant ${presence.grantRowId}, inbound ${presence.grantReceivedAt || 'n/a'})`);
        }
      }
    } catch (err) {
      // inQuietHours throws without a usable clock — same condition makes evaluate() throw below,
      // so behavior stays byte-identical to pre-SD; resolver errors land here too (fail-closed).
      log.warn(`[chairman-sms-gate] presence reply-window unavailable, quiet-hours unchanged (fail-closed): ${err.message}`);
    }
  }

  // QF-20260725-652: over-ask gate — runs BEFORE the rubric gate, mirroring how adam-advisory.cjs
  // runs the Adam Outbound Gate before dispatch. HELD (not sent) when the ask was Adam's to execute.
  try {
    const overAsk = await evalOverAsk(message, context, opts);
    if (overAsk.held) {
      log.warn(`[chairman-sms-gate] OVER-ASK HELD (execute-vs-escalate): ${overAsk.reason}. Execute and inform instead.`);
      return { sent: false, held: true, overAsk: true, reason: 'over_ask_held', verdict: null };
    }
  } catch (err) {
    log.warn(`[chairman-sms-gate] over-ask gate unavailable, failing OPEN: ${err.message}`);
  }

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

  // SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-3: a decision packet without a matchable
  // chairman_notifications row must never go out. Scoped to type='decision' with a decisionId —
  // status/heartbeat sends (TR-3) and decision sends already held above are untouched, and no
  // supabase client is ever constructed for them. Runs BEFORE dispatch; never throws out of
  // sendChairmanSMS (TR-3) — not every caller of this function wraps it in try/catch.
  //
  // decisionStaging is captured (not just discarded) because this gate's default sender
  // DISPATCHES SYNCHRONOUSLY and reports a definitive outcome (makeDefaultSender().send() below,
  // QF-20260725-738) — unlike sendChairmanSmsQuestion's obligation branch, staging here can be
  // proven wrong by the time send() returns. Adversarial-review finding: without rolling back on
  // a confirmed transport failure, a staged-but-undelivered decision stays live and matchable for
  // the full token TTL — the "enqueue is not delivery" class this module was hardened against
  // twice before, reopened through this new staging path.
  let decisionStaging = null;
  if (isDecision && message.decisionId) {
    try {
      const supabase = opts.supabase || await makeDefaultSupabaseClient();
      // TR-5: resolve chairman identity ONCE, via the same env-var fallback already proven in
      // lib/switch-automation/switchon-decision-packet.js, and reuse it for BOTH staging and
      // dispatch below — a caller (e.g. the decision-scheduler) supplying none of these must not
      // have staging and dispatch silently resolve to two different phone numbers.
      const chairmanUserId = message.chairmanUserId || process.env.CHAIRMAN_USER_ID;
      const chairmanEmail = message.chairmanEmail || process.env.CHAIRMAN_EMAIL;
      const recipientPhone = message.recipientPhone || process.env.CHAIRMAN_PHONE;
      const token = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

      const { notificationId } = await stageDecisionSmsNotification(supabase, {
        decisionId: message.decisionId,
        chairmanUserId,
        chairmanEmail,
        chairmanPhone: recipientPhone,
        options: extractOptionLabels(message.options),
        token,
        expiresAt,
        // QF-20260815-065: staged 'queued' here because sender.send() below hasn't run yet
        // (FR-3 requires staging BEFORE dispatch so a staging failure fails closed). This gate's
        // sender dispatches SYNCHRONOUSLY (:391) -- the stale "async obligation path" framing this
        // comment previously carried belonged to sendChairmanSmsQuestion's separate obligation-
        // queue branch, not this call site. The success path below (updateNotificationStatus)
        // transitions this row to 'sent' once the send is CONFIRMED, not assumed at staging time.
        status: 'queued',
        providerMessageId: null,
        sentAt: null,
        errorMessage: null,
      });
      decisionStaging = { supabase, decisionId: message.decisionId, token, notificationId };

      if (!message.recipientPhone) message = { ...message, recipientPhone };
    } catch (err) {
      log.error(`[chairman-sms-gate] decision notification staging failed, NOT sending: ${err.message}`);
      return { sent: false, reason: 'notification_stage_failed', detail: err.message, verdict: 'pass', authorityClass: 'sms' };
    }
  }

  // pass + sms-authority -> send via the isolated sender. Wrapped in try/catch so a sender that
  // THROWS (rather than resolving to {softFailed:true}, the documented contract every current
  // caller's makeDefaultSender() honours) still rolls back a staged token instead of bypassing
  // the check below entirely (adversarial-review hardening — defensive, not currently reachable
  // via any production caller, but the invariant should not depend on every future sender
  // honouring an unenforced contract).
  let sendResult;
  try {
    sendResult = await sender.send(message);
  } catch (err) {
    sendResult = { sid: null, softFailed: true, reason: `sender_threw: ${err.message}` };
  }
  if (sendResult && sendResult.softFailed) {
    // QF-20260719-509 LIVE INCIDENT: a soft-failed transport must NEVER report sent:true (the
    // exact "false success" the chairman hit — "text me if you need me" dropped silently).
    log.error(`[chairman-sms-gate] TRANSPORT SOFT-FAILED, message NOT delivered: ${sendResult.reason}`);
    if (decisionStaging) {
      await invalidateDecisionSmsStaging(decisionStaging.supabase, {
        decisionId: decisionStaging.decisionId, token: decisionStaging.token,
        notificationId: decisionStaging.notificationId, reason: sendResult.reason,
      });
    }
    const fb = await fallbackSend({ message, reason: sendResult.reason });
    return { sent: false, transportFailed: true, fallbackFired: !!fb.fired, reason: sendResult.reason, verdict: 'pass', authorityClass: 'sms' };
  }
  // QF-20260815-065: a confirmed successful send must transition the staged notification row
  // out of 'queued' — otherwise it (and provider_message_id) stays null forever, since the
  // Twilio webhook can only heal a row by matching provider_message_id. Audit-trail only: never
  // lets a bookkeeping failure downgrade an already-genuinely-successful send to {sent:false}.
  if (decisionStaging && decisionStaging.notificationId) {
    try {
      await updateNotificationStatus(decisionStaging.supabase, {
        notificationId: decisionStaging.notificationId,
        providerMessageId: sendResult && sendResult.sid,
        sentAt: new Date().toISOString(),
      });
    } catch (err) {
      log.error(`[chairman-sms-gate] notification status update failed (non-fatal, send already succeeded): ${err.message}`);
    }
  }
  return { sent: true, reason: 'sent', verdict: 'pass', authorityClass: 'sms' };
}
