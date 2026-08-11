// adam-chairman-sms.mjs — QF-20260719-343 (contract c3/c4, leo_protocol_sections id=601):
// sends the hourly heartbeat + daily 6AM morning brief to the chairman via the sole sanctioned
// chairman-SMS path. Caller composes the body; quiet hours/rate caps are enforced inside
// sendChairmanSMS's rubric gate. Fail-soft; --dry-run prints only.
import 'dotenv/config';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { sendChairmanSMS } from '../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { resolveQuietHoursContext } from '../lib/comms/adam-outbound/quiet-hours-extension.js';

enforceCliSendGuard({
  scriptName: 'scripts/adam-chairman-sms.mjs',
  flags: [{ name: '--dry-run' }, { name: '--body', takesValue: true }, { name: '--kind', takesValue: true }, { name: '--dedupe-key', takesValue: true }, { name: '--reply-to-inbound' }],
});

const DRY = process.argv.includes('--dry-run');
// QF-20260810-285: declares a reply-class send so the chairman-sms-gate's measured-presence
// quiet-hours carve-out (chairman-sms-gate/index.js) is reachable from the CLI at all.
const REPLY_TO_INBOUND = process.argv.includes('--reply-to-inbound');
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
  // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-3): also resolves the chairman's location zone
  // in the SAME batched preference read (resolveQuietHoursContext), replacing the narrower
  // resolveAllowQuietHours call -- one round trip, not two.
  const now = new Date();
  const { allowQuietHours, chairmanZone } = await resolveQuietHoursContext(now);
  const context = { now, allowQuietHours, chairmanZone, replyToInbound: REPLY_TO_INBOUND };
  const r = await sendChairmanSMS(message, context);
  console.log('ADAM-CHAIRMAN-SMS', JSON.stringify(r));
}
