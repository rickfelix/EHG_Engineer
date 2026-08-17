#!/usr/bin/env node
// adam-chairman-sms.mjs — QF-20260719-343 (contract c3/c4, leo_protocol_sections id=601):
// sends the hourly heartbeat + daily 6AM morning brief to the chairman via the sole sanctioned
// chairman-SMS path. Caller composes the body; quiet hours/rate caps are enforced inside
// sendChairmanSMS's rubric gate. Fail-soft; --dry-run prints only.
import 'dotenv/config';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { sendChairmanSMS } from '../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { resolveQuietHoursContext } from '../lib/comms/adam-outbound/quiet-hours-extension.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

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
    flags: [{ name: '--dry-run' }, { name: '--body', takesValue: true }, { name: '--kind', takesValue: true }, { name: '--dedupe-key', takesValue: true }, { name: '--reply-to-inbound' }],
  });

  const DRY = process.argv.includes('--dry-run');
  // QF-20260810-285: declares a reply-class send so the chairman-sms-gate's measured-presence
  // quiet-hours carve-out (chairman-sms-gate/index.js) is reachable from the CLI at all.
  const REPLY_TO_INBOUND = process.argv.includes('--reply-to-inbound');
  const argValue = (flag) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
  };
  const body = argValue('--body');
  const kind = argValue('--kind') || 'status_update';
  const dedupeKey = argValue('--dedupe-key');

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
    const now = new Date();
    const { allowQuietHours, chairmanZone } = await resolveQuietHoursContext(now);
    const context = { now, allowQuietHours, chairmanZone, replyToInbound: REPLY_TO_INBOUND };
    const r = await sendChairmanSMS(message, context);
    console.log('ADAM-CHAIRMAN-SMS', JSON.stringify(r));
    const label = formatSendResult(r);
    if (label) console.warn(label);
  }
}
