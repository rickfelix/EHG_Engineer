// adam-set-chairman-location.mjs — SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-6): the sole
// governed setter for the chairman's notifications.timezone preference. Adam runs this ONLY on
// a captured chairman-location ruling (a verbal "I'm in <place> until <date>" statement already
// recorded elsewhere, e.g. the chairman verbal-scribe ceremony) — NEVER inferred from message
// metadata, timestamps, or IP/phone-area-code heuristics. --ruling-ref is REQUIRED (for both a
// set and a clear) so every write is traceable to the specific capture that authorized it.
import 'dotenv/config';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { ChairmanPreferenceStore } from '../lib/eva/chairman-preference-store.js';
import { CHAIRMAN_ID, ZONE_KEY } from '../lib/comms/adam-outbound/quiet-hours-extension.js';

enforceCliSendGuard({
  scriptName: 'scripts/adam-set-chairman-location.mjs',
  flags: [
    { name: '--dry-run' }, { name: '--clear' },
    { name: '--zone', takesValue: true }, { name: '--until', takesValue: true },
    { name: '--ruling-ref', takesValue: true },
  ],
});

const DRY = process.argv.includes('--dry-run');
const CLEAR = process.argv.includes('--clear');
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  const next = process.argv[i + 1];
  // SEC-QW-04: a value that itself looks like another flag (e.g. misordered/omitted flags
  // leaving `--ruling-ref --zone` adjacent) must never be silently accepted as the literal
  // value -- that would defeat --ruling-ref's whole traceability purpose.
  if (next.startsWith('-')) return null;
  return next;
}

const zone = argValue('--zone');
const until = argValue('--until');
const rulingRef = argValue('--ruling-ref');

if (!rulingRef || !rulingRef.trim()) {
  console.warn('[adam-set-chairman-location] --ruling-ref <id> is required — a location preference is set or cleared ONLY on a captured chairman ruling, never inferred — nothing written');
  process.exit(0);
}
if (!CLEAR && (!zone || !zone.trim())) {
  console.warn('[adam-set-chairman-location] --zone <IANA> is required unless --clear — nothing written');
  process.exit(0);
}

if (DRY) {
  const intent = CLEAR
    ? { action: 'clear', key: ZONE_KEY, rulingRef }
    : { action: 'set', key: ZONE_KEY, value: until ? { zone: zone.trim(), until: until.trim() } : zone.trim(), rulingRef };
  console.log('=== [ADAM SET CHAIRMAN LOCATION — DRY RUN] no write ===\n' + JSON.stringify(intent, null, 2));
} else {
  const store = new ChairmanPreferenceStore();
  let result;
  if (CLEAR) {
    result = await store.deletePreference({ chairmanId: CHAIRMAN_ID, ventureId: null, key: ZONE_KEY });
  } else {
    const value = until ? { zone: zone.trim(), until: until.trim() } : zone.trim();
    result = await store.setPreference({
      chairmanId: CHAIRMAN_ID, ventureId: null, key: ZONE_KEY,
      value, valueType: until ? 'object' : 'string', source: 'chairman_directive',
    });
  }
  // rulingRef is logged (chairman_preferences has no audit-ref column) so this write traces
  // to its authorizing capture via the operational log, mirroring how the two sibling
  // chairman CLIs (adam-chairman-sms.mjs / adam-chairman-decision.mjs) trace sends.
  console.log('ADAM-SET-CHAIRMAN-LOCATION', JSON.stringify({ ...result, rulingRef, action: CLEAR ? 'clear' : 'set' }));
  if (!result.success) process.exitCode = 1;
}
