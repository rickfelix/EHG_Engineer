import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('id, test_scenarios')
  .eq('directive_id', 'SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const scenarios = prd.test_scenarios.map((ts) => {
  if (ts.id === 'TS-5') {
    return {
      ...ts,
      scenario: 'leg4 verdict=TIGHT',
      expected: 'earned/points=2 (byte-identical to today), ladder-distance telemetry field present and separate, always computed'
    };
  }
  if (ts.id === 'TS-6') {
    return {
      ...ts,
      scenario: 'leg4 verdict=DEFICIT-URGENT/DEFICIT/SURPLUS',
      expected: 'earned/points=0 (byte-identical to today) for all three, ladder-distance telemetry differs by state'
    };
  }
  return ts;
});

scenarios.push(
  {
    id: 'TS-10',
    type: 'unit',
    scenario: 'leg4 given an unrecognized verdict string (not in VERDICTS)',
    expected: 'throws (existing behavior, unchanged by this SD -- regression-locks that the new telemetry field does not silently swallow an invalid verdict into a default score)'
  },
  {
    id: 'TS-11',
    type: 'unit',
    scenario: 'composeDriveLine() when fewer than 10 drive_reports rows exist (e.g. early fleet history) or the trailing-10 query returns zero rows',
    expected: "does not throw (composeDriveLine is documented fail-soft); 'distinct/10 = N' clause uses the actual available row count as its denominator context rather than asserting a false 10, and 'flat' is never asserted true on fewer than 6 available readings"
  }
);

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({ test_scenarios: scenarios })
  .eq('id', prd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log(`test_scenarios corrected: TS-5/TS-6 stale "ratified-marker OFF" wording removed, TS-10 (error case) and TS-11 (edge case) added. Total scenarios: ${scenarios.length}`);
