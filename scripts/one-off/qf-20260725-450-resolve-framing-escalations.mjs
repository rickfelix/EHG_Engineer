#!/usr/bin/env node
/**
 * QF-20260725-450 backfill: clear misrouted framing_escalation rows out of the
 * chairman decision queue.
 *
 * WHY: scripts/adam-advisory.cjs::recordFramingEscalation wrote one pending
 * chairman_decisions row per flagged inter-role advisory (~1 per 15-min sweep
 * tick, 114 accumulated ≈ 28h of ticks). None are chairman-actionable — they are
 * comms-quality flags carrying verbatim excerpts of inter-role engineering
 * correspondence. The writer is fixed to emit feedback(category='comms_quality');
 * this clears the rows already queued.
 *
 * CONSTITUTIONAL: this does NOT decide anything. These rows were never chairman
 * questions, so they are marked 'cancelled' (an existing status) with a rationale —
 * never 'approved'/'rejected', which would assert a decision the chairman never made.
 * `decision` is left untouched.
 *
 * Dry-run by default. Pass --apply to write.
 *   node scripts/one-off/qf-20260725-450-resolve-framing-escalations.mjs [--apply]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: rows, error } = await db
  .from('chairman_decisions')
  .select('id, created_at')
  .eq('status', 'pending')
  .eq('decision_type', 'framing_escalation');

if (error) {
  console.error('QUERY FAILED: ' + error.message);
  process.exit(1);
}

console.log(`pending framing_escalation rows: ${rows.length}`);
if (rows.length === 0) {
  console.log('nothing to do.');
  process.exit(0);
}
console.log(`oldest: ${rows.map((r) => r.created_at).sort()[0]}`);

if (!APPLY) {
  console.log('DRY RUN — re-run with --apply to cancel these rows.');
  process.exit(0);
}

// Scoped UPDATE: the same two predicates that selected the rows, so a row that
// changed decision_type/status between select and update is not swept up.
const { data: updated, error: upErr } = await db
  .from('chairman_decisions')
  .update({
    status: 'cancelled',
    rationale: 'QF-20260725-450: misrouted comms-quality flag — never a chairman decision. '
      + 'Framing flags now land in feedback(category=comms_quality).',
    updated_at: new Date().toISOString(),
  })
  .eq('status', 'pending')
  .eq('decision_type', 'framing_escalation')
  .select('id');

if (upErr) {
  console.error('UPDATE FAILED: ' + upErr.message);
  process.exit(1);
}
console.log(`cancelled ${updated.length} rows.`);
