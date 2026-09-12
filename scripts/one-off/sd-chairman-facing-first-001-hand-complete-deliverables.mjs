// SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001 — hand-complete the 5 sd_scope_deliverables rows
// (FR-1..FR-5). FR-1..FR-4 are implemented and unit-tested on branch qf/QF-20260912-079
// (PR #8788). FR-5 (file a follow-up for the deliberately-deferred FIX SHAPE (a)) is satisfied
// by QF-20260912-901, created in this same session before this hand-completion runs.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { markDeliverableHandCompleted } from '../../lib/deliverables/mark-hand-completed.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001';
const REASON =
  'FR-1..FR-4: code implemented and unit-tested (43/43 in the touched file\'s suite, 118/118 scoped TESTING sub-agent run) ' +
  'on branch qf/QF-20260912-079 (PR #8788) before this SD was escalated from QF-20260912-079 on LOC alone. ' +
  'FR-5: follow-up filed as QF-20260912-901 for the deliberately-deferred FIX SHAPE (a) (composer measured_by[] ' +
  'stamping + pre-send refusal gate), which this SD explicitly does not deliver.';

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw new Error(sdErr.message);

  const { data: rows, error: rowsErr } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, completion_status')
    .eq('sd_id', sd.id)
    .neq('completion_status', 'completed');
  if (rowsErr) throw new Error(rowsErr.message);

  for (const row of rows) {
    const { error } = await markDeliverableHandCompleted(supabase, row.id, {
      actor: 'worker:81425e08-c5b5-4fde-bafc-f0b9d5e9c349',
      reason: REASON
    });
    if (error) throw new Error(`${row.id}: ${error.message}`);
    console.log(`OK: hand-completed ${row.id} (${row.deliverable_name.slice(0, 60)}...)`);
  }
  console.log(`Done: ${rows.length} deliverable(s) hand-completed.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
