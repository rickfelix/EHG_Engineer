// adam-chairman-sms.mjs — QF-20260719-343 (contract c3/c4, leo_protocol_sections id=601):
// sends the hourly heartbeat + daily 6AM morning brief to the chairman via the sole sanctioned
// chairman-SMS path. Caller composes the body; quiet hours/rate caps are enforced inside
// sendChairmanSMS's rubric gate. Fail-soft; --dry-run prints only.
import 'dotenv/config';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { sendChairmanSMS } from '../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { resolveAllowQuietHours } from '../lib/comms/adam-outbound/quiet-hours-extension.js';

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

if (DRY) {
  console.log('=== [ADAM CHAIRMAN SMS — DRY RUN] no send ===\nKIND: ' + kind + '\n---\n' + message.body + '\n---');
} else {
  // QF-20260720-824: honor a recorded chairman window-extension; default window unchanged.
  const now = new Date();
  const context = { now, allowQuietHours: await resolveAllowQuietHours(now) };
  const r = await sendChairmanSMS(message, context);
  console.log('ADAM-CHAIRMAN-SMS', JSON.stringify(r));
}
