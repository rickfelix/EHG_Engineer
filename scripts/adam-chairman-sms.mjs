// adam-chairman-sms.mjs — QF-20260719-343
//
// Chairman-directed 2026-07-19 (contract c3/c4, leo_protocol_sections id=601): the routine
// heartbeat and the daily 6:00 AM morning brief both go to the chairman by SMS via the sole
// sanctioned chairman-SMS path (lib/comms/adam-outbound/chairman-sms-gate). Caller composes
// the body; this script never fabricates content. Quiet hours (22:00-06:00 ET) and rate caps
// are enforced INSIDE sendChairmanSMS's rubric gate — this script does not re-derive them.
//
// Fail-soft; --dry-run prints only.
import 'dotenv/config';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { sendChairmanSMS } from '../lib/comms/adam-outbound/chairman-sms-gate/index.js';

enforceCliSendGuard({
  scriptName: 'scripts/adam-chairman-sms.mjs',
  flags: [{ name: '--dry-run' }, { name: '--body', takesValue: true }, { name: '--kind', takesValue: true }, { name: '--dedupe-key', takesValue: true }],
});

const DRY = process.argv.includes('--dry-run');
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const body = argValue('--body');
const kind = argValue('--kind') || 'status_update';
const dedupeKey = argValue('--dedupe-key');

if (!body || !body.trim()) {
  console.warn('[adam-chairman-sms] --body "<text>" is required — nothing sent');
  process.exit(0);
}

const message = { type: 'status', body: body.trim(), kind, dedupeKey };
const context = { now: new Date() };

if (DRY) {
  console.log('=== [ADAM CHAIRMAN SMS — DRY RUN] no send ===\nKIND: ' + kind + '\n---\n' + message.body + '\n---');
} else {
  const r = await sendChairmanSMS(message, context);
  console.log('ADAM-CHAIRMAN-SMS', JSON.stringify(r));
}
