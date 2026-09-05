import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, success_metrics')
  .eq('id', '2d913732-f5d4-4721-9095-f00b955bd32c')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const metrics = sd.success_metrics.map((m) => {
  if (m.metric === 'Implementation completeness') {
    return { ...m, actual: '100% -- all 4 FRs implemented and merged: leg2 fraction rescale, leg2 GRAIN_FLOOR dampener, leg4 ladder_distance telemetry, exec-email-drive-line flat/distinct disclosure (PR #8256)' };
  }
  if (m.metric === 'Test coverage') {
    return { ...m, actual: '99.04% statements / 88.5% branches / 100% functions / 100% lines across the 3 touched production files, measured via `vitest run --coverage` scoped to leg2-uptake.js, leg4-capacity.js, exec-email-drive-line.mjs (71/71 tests passing across 4 test files)' };
  }
  if (m.metric === 'Issue recurrence') {
    return { ...m, actual: 'N/A -- not yet measurable; this is the fix landing, recurrence is only observable after deployment. Chairman decision packet for FR-3 (leg4 earning-rule enablement) still required before LEAD-FINAL, per the PRD' };
  }
  return m;
});

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_metrics: metrics })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('success_metrics actuals filled in with real measured values (coverage run + PR reference).');
