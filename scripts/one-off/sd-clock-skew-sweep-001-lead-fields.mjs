#!/usr/bin/env node
// LEAD-phase field population for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001. Replaces the /leo create
// auto-generated placeholders ([UNPOPULATED] measures/impacts, generic smoke_test_steps) with
// content specific to the 3 deferred pieces (b/c/d of QF-20260912-364) this SD covers.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const rationale = 'SD-LEO-FIX-SECOND-WALL-CLOCK-001 shipped only piece (a) of the coordinator-ratified '
  + '5-piece QF-20260912-364 rewrite (the CI-reporting-blindness half). The remaining pieces are a real '
  + 'gap, not optional polish: (b) the CI timeout ceiling was widened 25->55min without ever measuring '
  + 'the actual overrun -- a guess-fix that could recur; (c) the clock-skew sweep only exercises an '
  + 'offset pin, never an absolute wall-clock instant, so a DST-transition-class or SMS-quiet-window- '
  + 'boundary bug is untested; (d) there is no lint guard against a NEW time-sensitive test being added '
  + 'without a fake-clock token, so the next such gap would recur silently. This ticket closes all three.';

const key_changes = [
  { change: 'Piece (b): run a workflow_dispatch CI job with vitest --reporter=json to measure real per-file test durations before touching timeout-minutes again', impact: 'Replaces the unmeasured 25->55min ceiling widening with a number backed by an actual run' },
  { change: 'Piece (c): extend tests/setup.clock-skew.js with an absolute TEST_CLOCK_PIN_ISO pin (beside the existing offset pin) and run the sweep matrix at +45d and at an instant inside the 22:00-06:00 ET SMS quiet window; extend tests/unit/hygiene/clock-skew-reapplication.test.js to the absolute pin', impact: 'Closes the DST-transition and quiet-window-boundary blind spot in the existing offset-only sweep' },
  { change: 'Piece (d): add scripts/lint/wall-clock-test-lint.mjs, a --diff-mode lint flagging test files that call time-sensitive chairman entry points (reconcileSentRows, retryOrAlert, smsQuietWindowReleaseIso, isInQuietHours, resolveChairmanZone, sms-outbound-worker exports) without a now:/DAY_NOW/FAKE_NOW/useFakeTimers token, checked against the current 13-file baseline', impact: 'Prevents the next time-sensitive test from shipping without fake-clock coverage, the exact class piece (a) already fixed once' },
];

const risks = [
  { risk: 'The workflow_dispatch measurement run could itself be flaky/atypical (cold cache, runner contention), producing a misleading duration number', impact: 'low', likelihood: 'medium', mitigation: 'Run it more than once if the first result looks anomalous vs local timing; the goal is an informed ceiling, not a single-sample guarantee' },
  { risk: 'wall-clock-test-lint.mjs could false-positive on a test that is time-sensitive but already safe via an indirect mocking path the static scan cannot see', impact: 'low', likelihood: 'low', mitigation: 'Ship in --diff mode against the existing baseline (advisory-first, mirrors shell-injection-argv-lint/schema-reference-lint convention) with a documented allowlist escape hatch, not a hard CI block on day one' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Trigger the clock-skew measurement workflow_dispatch run (piece b) and open its vitest --reporter=json artifact', expected_outcome: 'Per-file durations are visible, giving a measured basis for any future timeout-minutes change' },
  { step_number: 2, instruction: 'Run the extended clock-skew sweep matrix locally with TEST_CLOCK_PIN_ISO set to an instant inside 22:00-06:00 ET (piece c)', expected_outcome: 'tests/unit/hygiene/clock-skew-reapplication.test.js and the sweep matrix pass at the absolute pin, not just the offset pin' },
  { step_number: 3, instruction: 'Run node scripts/lint/wall-clock-test-lint.mjs --diff on the current tree (piece d)', expected_outcome: '0 new violations against the 13-file baseline; a newly-added time-sensitive test with no fake-clock token is flagged' },
];

const success_criteria = [
  { criterion: 'Piece (b): a workflow_dispatch run with vitest --reporter=json measures actual per-file test durations, on the record before any further timeout-minutes change', measure: 'CI artifact / run log shows per-file durations captured' },
  { criterion: 'Piece (c): the clock-skew sweep runs at an absolute TEST_CLOCK_PIN_ISO pin (+45d and inside the 22:00-06:00 ET quiet window), not just the existing offset pin', measure: 'tests/unit/hygiene/clock-skew-reapplication.test.js + the sweep matrix pass at both new absolute-pin instants' },
  { criterion: 'Piece (d): a --diff-mode wall-clock-test-lint.mjs flags time-sensitive test files missing a fake-clock token', measure: '0 new violations against the current 13-file baseline; a seeded missing-token fixture is caught by the tool\'s own test' },
];

// Already-tight scoping: 2 of the original 5 pieces (a, e) were excluded at ticket-authoring time
// (a shipped in the predecessor SD, e was closed as a duplicate there too) -- a 40% reduction of the
// original rewrite's surface already happened before this SD existed. No further reduction is
// warranted without dropping ratified, still-open scope.
const scope_reduction_percentage = 40;

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ rationale, key_changes, risks, smoke_test_steps, success_criteria, scope_reduction_percentage })
  .eq('sd_key', SD_KEY)
  .select('sd_key')
  .single();

if (error) { console.error('UPDATE_FAILED', error); process.exit(1); }
console.log('LEAD fields populated for', data.sd_key);
