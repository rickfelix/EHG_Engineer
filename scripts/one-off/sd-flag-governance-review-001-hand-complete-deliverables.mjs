// SD-LEO-FIX-FLAG-GOVERNANCE-REVIEW-001 — hand-complete the 4 remaining sd_scope_deliverables
// rows (FR-1, FR-2, FR-4, FR-5). Escalated from QF-20260906-235: the code for all four was
// already implemented, unit-tested, and live-verified on branch qf/QF-20260906-235 (PR #8781)
// before the SD even existed; sync-deliverables-from-git.js only scans commits already on main
// (post-merge), so it cannot auto-close these pre-merge. Using the canonical helper for
// provenance (never a bare .update()).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { markDeliverableHandCompleted } from '../../lib/deliverables/mark-hand-completed.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-FLAG-GOVERNANCE-REVIEW-001';
const REASON =
  'Code already implemented, unit-tested (25 tests) and live-verified via node scripts/flag-governance-review.mjs --force ' +
  'on branch qf/QF-20260906-235 (PR #8781) before this SD was escalated from QF-20260906-235 on LOC alone. ' +
  'sync-deliverables-from-git.js only auto-closes deliverables from commits already on main; this is still pre-merge.';

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
