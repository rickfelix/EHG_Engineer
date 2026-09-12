// SD-LEO-FIX-CHAIRMAN-FACING-FIRST-002 — hand-complete the 5 sd_scope_deliverables rows
// (FR-1..FR-5). All implemented and unit-tested on branch qf/QF-20260912-901 (PR #8791) before
// this SD was escalated from QF-20260912-901 on LOC alone.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { markDeliverableHandCompleted } from '../../lib/deliverables/mark-hand-completed.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-FACING-FIRST-002';
const REASON =
  'FR-1..FR-5: code implemented and unit-tested (52 new tests + 129 sibling-suite tests, all passing) ' +
  'on branch qf/QF-20260912-901 (PR #8791) before this SD was escalated from QF-20260912-901 on LOC alone.';

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
