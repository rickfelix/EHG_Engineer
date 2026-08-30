// QF-20260830-690: backfill owner/review_by (encoded in `risk`) onto existing OPEN manual
// child items that predate the writer enforcement, per the QF's own scope: "existing rows
// backfilled with review_by=created_at+14d". Appends onto any existing risk narrative —
// never overwrites it. Idempotent: skips rows that already carry the meta marker.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { appendManualChildMeta, parseManualChildMeta, MANUAL_CHILD_REVIEW_WINDOW_DAYS } from '../../lib/adam/task-ledger.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await supabase
  .from('adam_task_ledger')
  .select('id, risk, created_at')
  .eq('tier', 'child')
  .eq('source_kind', 'manual')
  .in('status', ['open', 'in_progress', 'blocked']);

if (error) { console.error('FETCH_FAILED', error); process.exit(1); }

let backfilled = 0, skipped = 0;
for (const row of rows) {
  if (parseManualChildMeta(row.risk)) { skipped++; continue; }
  const reviewBy = new Date(new Date(row.created_at).getTime() + MANUAL_CHILD_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const risk = appendManualChildMeta(row.risk, 'unassigned', reviewBy);
  const { error: upErr } = await supabase.from('adam_task_ledger').update({ risk }).eq('id', row.id);
  if (upErr) { console.error('UPDATE_FAILED', row.id, upErr); continue; }
  backfilled++;
  console.log(`backfilled ${row.id} review_by=${reviewBy}`);
}
console.log(`DONE backfilled=${backfilled} skipped=${skipped} total=${rows.length}`);
