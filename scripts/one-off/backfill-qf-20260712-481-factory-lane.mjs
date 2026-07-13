/**
 * One-off backfill: QF-20260712-481.factory_lane = true.
 * SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001 FR-5.
 *
 * RUN ONLY AFTER database/migrations/20260713_quick_fixes_factory_lane.sql has
 * been applied live (requires chairman/Adam-delegated authorization -- see the
 * migration's @staged header). Idempotent: safe to re-run.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('quick_fixes')
  .update({ factory_lane: true })
  .eq('id', 'QF-20260712-481')
  .select('id, factory_lane');

if (error) {
  console.error('Backfill failed:', error.message);
  process.exit(1);
}
if (!data || data.length === 0) {
  console.error('QF-20260712-481 not found -- nothing backfilled.');
  process.exit(1);
}
console.log('Backfilled:', JSON.stringify(data[0]));
