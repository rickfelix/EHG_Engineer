import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-TRIAGE-2026-BULK-001';

// GATE_MECHANISM_CLAIM_VERIFIER requires verified_at to match
//   /\b[\w.-]+(?:\/[\w.-]+)*\.(?:js|cjs|mjs|ts|tsx|sql):\d+\b/
// i.e. a REAL file:LINE citation, and .json is NOT an accepted extension.
// "A bare filename is NOT a citation — the line is the proof." My first pass named files
// without lines, which is exactly the endorsement-not-evidence shape the gate exists to reject.
// Every citation below is a line I actually opened.
const mechanism_verifications = [
  {
    verified_by: 'Bravo (e3610a71) — read the derivation, confirming un-shelving is a SINGLE-file edit',
    verified_at: 'vitest.config.js:26 — loadQuarantineExclude() reads tests/quarantine-manifest.json (path built at vitest.config.js:28, applied at vitest.config.js:35), so the exclude list is DERIVED and there is no second place to edit',
  },
  {
    verified_by: 'Bravo (e3610a71) — read the calibration case in its own words, not via the SD summary',
    verified_at: 'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js:11 — records that on 2026-06-11 the file was quarantined with reason_class "assertion-drift", and pr-merge-verification.test.js:12 states plainly that the label asserted the TEST was stale when the CODE had changed',
  },
  {
    verified_by: 'Bravo (e3610a71) — confirmed the un-shelve mechanism from the worked example itself',
    verified_at: 'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js:23 — "Un-quarantining was ONE change — deleting the tests/quarantine-manifest.json entry"',
  },
  {
    verified_by: 'Bravo (e3610a71) — read the manifest contract that makes per-entry evidence mandatory',
    verified_at: 'scripts/unit-tier-quarantine.mjs:21 — nothing may be skipped without a reason_class + linked_ref; the entry shape (file, reason_class, error_signature, ...) is declared at scripts/unit-tier-quarantine.mjs:13',
  },
  {
    verified_by: 'Bravo (e3610a71) — confirmed assertion-drift is a REGISTERED class with an owning SD, not an ad-hoc label',
    verified_at: 'scripts/unit-tier-quarantine.mjs:46 — maps "assertion-drift" to SD-LEO-FIX-GREEN-MAIN-TRIAGE-001, the SD that performed the 188-file green-main quarantine',
  },
  {
    verified_by: 'Bravo (e3610a71) — read the enforcing suite that pins the manifest contract',
    verified_at: 'tests/unit/quarantine-manifest.test.js:5 — asserts nothing is excluded without a reason_class + linked_ref; the array shape is checked at tests/unit/quarantine-manifest.test.js:51',
  },
];

const { data: sd, error: e0 } = await sb.from('strategic_directives_v2').select('metadata').eq('sd_key', KEY).single();
if (e0) { console.log('lookup failed: ' + e0.message); process.exit(1); }

const FILE_LINE = /\b[\w.-]+(?:\/[\w.-]+)*\.(?:js|cjs|mjs|ts|tsx|sql):\d+\b/;
const bad = mechanism_verifications.filter((r) => !FILE_LINE.test(r.verified_at));
if (bad.length) { console.log('SELF-CHECK FAILED — ' + bad.length + ' citation(s) lack file:LINE'); process.exit(1); }
console.log('self-check: all ' + mechanism_verifications.length + ' citations match the gate regex');

const metadata = { ...(sd.metadata || {}), mechanism_verifications };
const { error } = await sb.from('strategic_directives_v2').update({ metadata }).eq('sd_key', KEY);
console.log(error ? ('ERR: ' + error.message) : 'UPDATED mechanism_verifications(' + mechanism_verifications.length + ') with real file:LINE citations');
