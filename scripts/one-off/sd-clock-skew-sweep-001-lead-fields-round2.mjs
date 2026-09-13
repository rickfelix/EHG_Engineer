#!/usr/bin/env node
// Round 2 field correction, after VALIDATION sub-agent evidence (da990b0f): drops piece (b) from
// key_changes/smoke_test_steps (deferred, see sd-clock-skew-sweep-001-lead-scope-reduction.mjs)
// and corrects scope_reduction_percentage to reflect it (60%, not 40%: of the original 5 pieces,
// a+e were already handled by the predecessor SD, and b is now ALSO deferred beyond this SD).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const key_changes = [
  { change: 'Piece (c): extend tests/setup.clock-skew.js with an absolute TEST_CLOCK_PIN_ISO pin (beside the existing offset pin) and extend tests/unit/hygiene/clock-skew-reapplication.spawn.test.js (the real filename -- corrected from the ticket text, which also propagated into the setup file\'s own header comment, now fixed) to the absolute pin at a +45d-class instant AND an instant inside the 22:00-06:00 ET SMS quiet window', impact: 'Closes the DST-transition and quiet-window-boundary blind spot the existing offset-only sweep cannot reach' },
  { change: 'Piece (d): add scripts/lint/wall-clock-test-lint.mjs, a --diff-mode lint flagging test files that call reconcileOutboundSms/isInQuietHours/resolveChairmanZone/smsQuietWindowReleaseIso (corrected from the ticket\'s reconcileSentRows, which does not exist in the codebase) without a now:/DAY_NOW/FAKE_NOW/useFakeTimers token, checked against a MEASURED 11-file baseline (not the ticket\'s estimated 13)', impact: 'Prevents the next time-sensitive test from shipping without fake-clock coverage, the exact class piece (a) already fixed once' },
  { change: 'Piece (b) DEFERRED to a follow-up ticket: a live scope collision was found with SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 (active/EXEC), which independently plans its own new job on the SAME .github/workflows/unit-tier-clock-skew.yml file', impact: 'Avoids a guaranteed two-SD collision on one workflow file; the measurement ticket is filed once the quarantine SD\'s edit lands' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Run the extended clock-skew reapplication spawn suite locally: npx vitest run tests/unit/hygiene/clock-skew-reapplication.spawn.test.js', expected_outcome: 'All 8 tests pass, including the 4 new absolute-pin cases (general instant, SMS-quiet-window instant, precedence-over-offset, malformed-fails-safe)' },
  { step_number: 2, instruction: 'Run node scripts/lint/wall-clock-test-lint.mjs --all on the current tree (piece d)', expected_outcome: 'Reports the measured baseline (11 violations / 4173 test files scanned) -- a diagnostic census, not a blocking check' },
  { step_number: 3, instruction: 'Run node scripts/lint/wall-clock-test-lint.mjs (diff mode) against this PR\'s own diff', expected_outcome: '0 new violations -- this SD\'s own new/changed test files all carry a fake-clock token' },
];

const scope_reduction_percentage = 60; // a+e (predecessor SD) + b (this SD, deferred) = 3 of the original 5 pieces excluded

const { error } = await supabase
  .from('strategic_directives_v2').update({ key_changes, smoke_test_steps, scope_reduction_percentage }).eq('sd_key', SD_KEY);
if (error) { console.error('UPDATE_FAILED', error); process.exit(1); }
console.log('Round-2 fields corrected for', SD_KEY);
