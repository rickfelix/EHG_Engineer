// QF-20260904-876: setQuickFixStatus() didn't stamp completed_at on the transition to
// completed (only the orchestrator's own direct-.update() completion path did), so any QF
// completed exclusively through the canonical writer (e.g. a coordinator reaper-acceptance
// close) got completed_at=NULL forever — quick_fixes has no updated_at, so daily-sampling-audit.js
// uses completed_at as its sole completion proxy and silently misses these rows.
//
// Measured 2026-09-08: 6 of 1,523 completed rows lack completed_at. Only ONE of the six
// (QF-20260904-508, the specimen this ticket cites) has a disposed_at value to backfill from —
// the other five (QF-20260531-522, QF-20260531-411, QF-20260713-691, QF-20260601-345,
// QF-20260719-162) predate disposition tracking entirely: disposed_at is also NULL on all five,
// and their only other timestamps are created_at/started_at, which are NOT completion times and
// would misrepresent when the work actually finished. This script backfills ONLY the one row
// with a genuine source value; the other five are left NULL and logged as an unfixable gap.
//
// Run once: node scripts/one-off/qf-20260904-876-backfill-completed-at.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BACKFILL_ID = 'QF-20260904-508';

async function main() {
  const { data: row, error: fetchErr } = await supabase
    .from('quick_fixes')
    .select('id, status, completed_at, disposed_at')
    .eq('id', BACKFILL_ID)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!row) {
    console.log(`${BACKFILL_ID} not found -- nothing to backfill.`);
    return;
  }
  if (row.status !== 'completed') {
    console.log(`${BACKFILL_ID} status is '${row.status}', not 'completed' -- refusing to backfill.`);
    return;
  }
  if (row.completed_at) {
    console.log(`${BACKFILL_ID} already has completed_at=${row.completed_at} -- not overwriting.`);
    return;
  }
  if (!row.disposed_at) {
    console.log(`${BACKFILL_ID} has no disposed_at to backfill from -- nothing to do.`);
    return;
  }

  const { error: updateErr } = await supabase
    .from('quick_fixes')
    .update({ completed_at: row.disposed_at })
    .eq('id', BACKFILL_ID)
    .is('completed_at', null); // re-check at write time; never clobber a concurrent stamp
  if (updateErr) throw updateErr;

  console.log(`Backfilled ${BACKFILL_ID}.completed_at = ${row.disposed_at} (source: disposed_at, cause: QF-20260904-876).`);
  console.log(
    'The other 5 rows lacking completed_at (QF-20260531-522, QF-20260531-411, QF-20260713-691, '
    + 'QF-20260601-345, QF-20260719-162) predate disposition tracking -- disposed_at is also NULL on '
    + 'all five, and no other completion-adjacent timestamp exists on those rows. Left un-backfilled '
    + 'rather than fabricated from created_at/started_at.'
  );
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
