#!/usr/bin/env node
// adam-chairman-sms.mjs — QF-20260719-343 (contract c3/c4, leo_protocol_sections id=601):
// sends the hourly heartbeat + daily 6AM morning brief to the chairman via the sole sanctioned
// chairman-SMS path. Caller composes the body; quiet hours/rate caps are enforced inside
// sendChairmanSMS's rubric gate. Fail-soft; --dry-run prints only.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { sendChairmanSMS } from '../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { resolveQuietHoursContext } from '../lib/comms/adam-outbound/quiet-hours-extension.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { etDateStr, buildMorningReviewBody } from './cron/chairman-morning-brief-sweep.mjs';

/**
 * QF-20260902-879: the morning-brief kind+dedupe-key envelope, computed through the SAME
 * etDateStr the durable sweep (chairman-morning-brief-sweep.mjs) uses -- so a hand send after
 * a missed cron carries the identical dedupe_key shape and a late sweep tick reads it as
 * deduped (ignoreDuplicates upsert) instead of enqueueing a second brief. Pure/exported so the
 * hand path and the sweep's own envelope can be pinned equal without a live DB.
 * @param {Date} now
 * @returns {{kind: 'morning_brief', dedupeKey: string}}
 */
export function computeMorningBriefEnvelope(now) {
  return { kind: 'morning_brief', dedupeKey: `morning_brief:${etDateStr(now)}` };
}

/**
 * SD-LEO-FIX-QUIET-HOURS-GATE-001 (FR-5/FR-6): a genuinely-held rubric-blocked send
 * (reason==='blocked') has no queue and no retry -- "held" reads like deferral but means the
 * message was never sent and never will be. sendChairmanSMS also returns held:true from three
 * OTHER, semantically different sites (over_ask_held, gate_unavailable, gate_unavailable_status)
 * that are NOT genuinely dropped -- a blanket "held -> DROPPED" label would misinform an
 * operator on those.
 *
 * EXEC-phase TESTING finding (2026-08-17): reason==='blocked' is set whenever ANY of the
 * rubric-engine's 9 blocking lint checks fails (chairman-sms-gate/index.js:325-326), not only
 * quiet_hours -- rate_cap, no_secrets, and length are equally capable of producing it. The
 * original quiet-hours-specific remediation text ("re-send after the quiet window") was WRONG
 * for those three, and actively harmful for no_secrets (instructing a re-send of a
 * secret-bearing body). The wording is now conditional on blockedReasons actually naming
 * quiet_hours; any other blocking reason gets a generic DROPPED message naming the real cause.
 * Pure and exported so it is directly unit-testable without spawning the CLI (the existing
 * subprocess test only exercises --dry-run, which returns before this is reached).
 * @param {{sent?:boolean, held?:boolean, reason?:string, blockedReasons?:string[]}} result - sendChairmanSMS's return value
 * @returns {string|null} a human-facing line to print, or null for a successful/non-held send
 */
export function formatSendResult(result) {
  if (!result || result.sent) return null;
  if (result.held && result.reason === 'blocked') {
    const reasons = Array.isArray(result.blockedReasons) ? result.blockedReasons : [];
    const isQuietHours = reasons.some((r) => typeof r === 'string' && r.startsWith('quiet_hours'));
    if (isQuietHours) {
      return '[adam-chairman-sms] DROPPED — quiet hours blocked this send. The message was NOT queued and will NOT be retried. Re-send after the quiet window, or use --reply-to-inbound only when replying to a genuine chairman inbound.';
    }
    const cause = reasons.length ? reasons.join('; ') : 'rubric check failed';
    return `[adam-chairman-sms] DROPPED — the send rubric blocked this message (${cause}). The message was NOT queued and will NOT be retried; resolve the flagged condition before resending.`;
  }
  if (result.held) {
    return `[adam-chairman-sms] HELD (${result.reason || 'unknown'}) — not a quiet-hours drop; see the gate's own reason for what to do next.`;
  }
  return null;
}

if (isMainModule(import.meta.url)) {
  enforceCliSendGuard({
    scriptName: 'scripts/adam-chairman-sms.mjs',
    flags: [{ name: '--dry-run' }, { name: '--body', takesValue: true }, { name: '--kind', takesValue: true }, { name: '--dedupe-key', takesValue: true }, { name: '--reply-to-inbound' }, { name: '--morning-brief' }],
  });

  const DRY = process.argv.includes('--dry-run');
  // QF-20260810-285: declares a reply-class send so the chairman-sms-gate's measured-presence
  // quiet-hours carve-out (chairman-sms-gate/index.js) is reachable from the CLI at all.
  const REPLY_TO_INBOUND = process.argv.includes('--reply-to-inbound');
  // QF-20260902-879: the canonical durable-brief envelope — kind, dedupe-key, and body are ALL
  // composed from instruments (never hand-typed), so this send is indistinguishable from the
  // sweep's own enqueue and a late sweep tick dedupes against it instead of doubling the brief.
  const MORNING_BRIEF = process.argv.includes('--morning-brief');
  const argValue = (flag) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
  };

  if (MORNING_BRIEF && (argValue('--body') || argValue('--kind') || argValue('--dedupe-key'))) {
    console.warn('[adam-chairman-sms] --morning-brief composes kind/dedupe-key/body from instruments at send time — drop --body/--kind/--dedupe-key rather than hand-typing a number or key for this send. Nothing sent.');
    process.exit(1);
  }

  let body = argValue('--body');
  let kind = argValue('--kind') || 'status_update';
  let dedupeKey = argValue('--dedupe-key');
  const now = new Date();

  if (MORNING_BRIEF) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn('[adam-chairman-sms] --morning-brief requires SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — nothing sent');
      process.exit(0);
    }
    const supabase = createClient(url, key);
    body = await buildMorningReviewBody(supabase, { now });
    ({ kind, dedupeKey } = computeMorningBriefEnvelope(now));
  }

  if (!body || !body.trim()) {
    console.warn('[adam-chairman-sms] --body "<text>" is required — nothing sent');
    process.exit(0);
  }

  const message = { type: 'status', body: body.trim(), kind, dedupeKey };

  if (DRY) {
    console.log('=== [ADAM CHAIRMAN SMS — DRY RUN] no send ===\nKIND: ' + kind + '\n---\n' + message.body + '\n---');
  } else {
    // QF-20260720-824: honor a recorded chairman window-extension; default window unchanged.
    // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-3): also resolves the chairman's location zone
    // in the SAME batched preference read (resolveQuietHoursContext), replacing the narrower
    // resolveAllowQuietHours call -- one round trip, not two.
    const { allowQuietHours, chairmanZone } = await resolveQuietHoursContext(now);
    const context = { now, allowQuietHours, chairmanZone, replyToInbound: REPLY_TO_INBOUND };
    const r = await sendChairmanSMS(message, context);
    console.log('ADAM-CHAIRMAN-SMS', JSON.stringify(r));
    const label = formatSendResult(r);
    if (label) console.warn(label);
  }
}
