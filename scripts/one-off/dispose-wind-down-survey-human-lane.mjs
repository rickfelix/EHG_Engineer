// QF-20260802-966: one-shot disposition of wind_down_survey rows stranded status='new' in the
// human feedback lane. Companion to QF-20260803-503 (forward lane fix — new rows now insert
// pre-resolved). This script clears the pre-fix residue: everything still status='new' as of
// the cutoff moves to status='resolved' with a recorded disposition reason, satisfying
// chk_feedback_terminal_resolution the same way the forward-lane fix does (non-empty
// resolution_notes, no quick_fix_id/strategic_directive_id link — these are auto-filed
// telemetry, not individually-fixed items).
//
// Idempotent: only touches status='new' rows, so a re-run naturally skips already-disposed
// rows and only catches new arrivals from fleet sessions still running a pre-QF-503 hook copy
// (expected during rollout — see QF-20260803-503's PR description).
//
// Usage:
//   node scripts/one-off/dispose-wind-down-survey-human-lane.mjs --dry-run [--cutoff <ISO>]
//   node scripts/one-off/dispose-wind-down-survey-human-lane.mjs [--cutoff <ISO>]
import { createDatabaseClient } from '../lib/supabase-connection.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cutoffIdx = args.indexOf('--cutoff');
const cutoff = cutoffIdx !== -1 ? args[cutoffIdx + 1] : new Date().toISOString();
if (Number.isNaN(Date.parse(cutoff))) {
  console.error(`Invalid --cutoff value: ${cutoff}`);
  process.exit(1);
}

const BATCH_SIZE = 500;
const BATCH_ID = `qf-966-${new Date().toISOString().slice(0, 10)}`;
const RESOLUTION_NOTES = `Machine-telemetry reclassification, batch ${BATCH_ID}, provenance coordinator route a2f0c86b (QF-20260802-966). Pre-fix residue predating QF-20260803-503's write-time self-resolve — auto-filed wind_down_survey telemetry, not a human action item.`;

const client = await createDatabaseClient('engineer', {
  connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
});

try {
  const { rows: [{ n: totalMatching }] } = await client.query(
    `SELECT count(*) AS n FROM public.feedback
     WHERE category = 'wind_down_survey' AND status = 'new' AND created_at < $1`,
    [cutoff],
  );
  console.log(`Cutoff: ${cutoff}`);
  console.log(`Matching rows (status='new', category='wind_down_survey', created_at < cutoff): ${totalMatching}`);

  if (dryRun) {
    console.log('--dry-run: no rows written.');
    process.exit(0);
  }

  if (Number(totalMatching) === 0) {
    console.log('Nothing to dispose. Already clean as of this cutoff.');
    process.exit(0);
  }

  let totalDisposed = 0;
  for (;;) {
    const { rows } = await client.query(
      `WITH batch AS (
         SELECT id FROM public.feedback
         WHERE category = 'wind_down_survey' AND status = 'new' AND created_at < $1
         ORDER BY created_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE public.feedback f
       SET status = 'resolved',
           resolution_notes = $3,
           updated_at = now()
       FROM batch
       WHERE f.id = batch.id
       RETURNING f.id`,
      [cutoff, BATCH_SIZE, RESOLUTION_NOTES],
    );
    if (rows.length === 0) break;
    totalDisposed += rows.length;
    console.log(`  disposed batch of ${rows.length} (running total: ${totalDisposed})`);
  }

  const { rows: [{ n: remaining }] } = await client.query(
    `SELECT count(*) AS n FROM public.feedback
     WHERE category = 'wind_down_survey' AND status = 'new' AND created_at < $1`,
    [cutoff],
  );
  console.log(`Disposed: ${totalDisposed}`);
  console.log(`Remaining status='new' as of cutoff: ${remaining} (expect 0)`);
  if (Number(remaining) !== 0) {
    console.error('WARNING: remaining > 0 after disposal loop — investigate before re-running.');
    process.exit(1);
  }
} finally {
  await client.end();
}
