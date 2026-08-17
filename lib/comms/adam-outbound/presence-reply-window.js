/**
 * Measured chairman-presence reply window — SD-LEO-INFRA-QUIET-HOURS-GATE-001.
 *
 * The quiet-hours lint (rubric-engine/lint.js check 7) takes context.allowQuietHours as a pure
 * input; quiet-hours-extension.js supplies it from a durable chairman_preferences row (explicit
 * verbal authorization). This module supplies the SECOND, measured source: the chairman texted
 * within the trailing window, so a REPLY to him is not an intrusion — CLAUDE_ADAM.md 5g and the
 * PRESENCE>QUIET ruling, witnessed as a live defect 2026-08-09 (~10:25pm ET ack held to the 6am
 * flush). decision-scheduler/index.js pre-registered this exact signal as a future enhancement.
 *
 * Presence is MEASURED from sms_relay_staging (the inbound-only staging table written solely by
 * the relay RPC), never self-attested by a caller. Fail-closed throughout, mirroring
 * quiet-hours-extension.js: unset CHAIRMAN_PHONE, a query error, or no matching row all return
 * { allowed: false } — only positive, measured evidence opens the window, and the caller
 * (chairman-sms-gate) applies it to reply-class sends only.
 *
 * Phone matching uses the shared phoneKey normalizer (digits, last 10) — provider from_phone
 * formats drift (country codes, spacing), and adam-quiet-tick.mjs pins raw equality as
 * label-grade only. For this gate the no-match failure direction is safe (no bypass), but the
 * normalizer is what keeps the feature functional across formats.
 */

import { phoneKey } from '../../solomon/chairman-sms-exchanges.js';
// SD-LEO-FIX-QUIET-HOURS-GATE-001: the resolver previously could not see message content at
// all (selected id/from_phone/received_at only), so it granted on ANY chairman-phone inbound
// -- including the already-named, already-measured automated "are you still there?" watchdog
// ping, exactly the risk Solomon oracle 9cbe7c25 flagged before this module shipped without a
// discriminator. isWatchdogBody is the same narrow, deliberately-conservative detector
// adam-quiet-tick.mjs already uses (relocated to a shared module, not duplicated).
import { isWatchdogBody } from './watchdog-detector.js';

export const PRESENCE_WINDOW_MINUTES = 15;

/**
 * Resolve whether a chairman inbound message within the trailing window grants a one-reply
 * quiet-hours allowance.
 *
 * @param {Date|number} now - current time (Date or finite epoch ms, matching the etHour convention)
 * @param {object} [opts]
 * @param {object} [opts.supabase] - injectable client (tests); defaults to a service-role client from env
 * @param {string} [opts.chairmanPhone] - injectable identity (tests); defaults to CHAIRMAN_PHONE
 * @param {number} [opts.windowMinutes] - trailing window; defaults to PRESENCE_WINDOW_MINUTES
 * @returns {Promise<{allowed: boolean, reason: string, grantRowId?: string, grantReceivedAt?: string}>}
 */
export async function resolvePresenceReplyWindow(now, opts = {}) {
  try {
    const nowMs = now instanceof Date ? now.getTime()
      : (typeof now === 'number' && Number.isFinite(now)) ? now
        : NaN;
    if (!Number.isFinite(nowMs)) return { allowed: false, reason: 'invalid_now' };

    const chairmanPhone = opts.chairmanPhone ?? process.env.CHAIRMAN_PHONE;
    if (!chairmanPhone) return { allowed: false, reason: 'no_chairman_phone' };
    const want = phoneKey(chairmanPhone);
    if (!want) return { allowed: false, reason: 'no_chairman_phone' };

    const windowMinutes = Number.isFinite(opts.windowMinutes) ? opts.windowMinutes : PRESENCE_WINDOW_MINUTES;

    let supabase = opts.supabase;
    if (!supabase) {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
    }

    const sinceIso = new Date(nowMs - windowMinutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from('sms_relay_staging')
      .select('id, from_phone, received_at, body_raw')
      .gte('received_at', sinceIso)
      .order('received_at', { ascending: false })
      .limit(50);
    if (error) return { allowed: false, reason: `query_error: ${error.message}` };

    // SD-LEO-FIX-QUIET-HOURS-GATE-001: the watchdog exclusion is a CONJUNCTION inside .find(),
    // not a separate pre-filter step -- rows are already ordered received_at DESC, so .find()
    // naturally walks past a watchdog row (regardless of how recent) to the next row that is
    // both phone-matching AND not watchdog-shaped. isWatchdogBody(undefined) is false, so a row
    // with no body_raw (every pre-existing test fixture) is treated as non-watchdog -- kept,
    // evaluated exactly as before this SD (TR-3: fail-closed applies to query errors, not to a
    // single row's missing body field).
    const grant = (data || []).find((r) => phoneKey(r.from_phone) === want && !isWatchdogBody(r.body_raw));
    if (!grant) return { allowed: false, reason: 'no_recent_chairman_inbound' };

    return {
      allowed: true,
      reason: 'measured_presence_reply',
      grantRowId: grant.id,
      grantReceivedAt: grant.received_at,
    };
  } catch (err) {
    // Fail-closed: a resolver failure must land exactly on pre-SD behavior (the send blocks).
    return { allowed: false, reason: `resolver_error: ${err?.message || err}` };
  }
}
