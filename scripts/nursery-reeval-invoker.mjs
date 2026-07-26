#!/usr/bin/env node
/**
 * SD-EHG-IDEATION-PIPELINE-SEAMS-001 (FR-6) — headless entry point for the nursery invoker.
 *
 * The "without a human" half of the AC. lib/eva/stage-zero/nursery-reeval-invoker.js holds the
 * decision logic and is unit-tested against a double; this file is the thin CLI the scheduler
 * actually runs, kept separate so the logic stays testable without a process boundary.
 *
 * EXIT CODES ARE DELIBERATE. A scheduled job that exits non-zero on the ordinary "nothing was
 * due" path trains its operator to ignore red, which is how a genuinely broken scheduler hides.
 * So: 0 for every expected outcome (enqueued, nothing due, already queued, dry run), 1 ONLY for
 * a real fault — an unreadable nursery, a failed dedupe read, a rejected insert. The one-line
 * summary names which outcome occurred so a green run is still legible.
 *
 * Usage:
 *   node scripts/nursery-reeval-invoker.mjs            # enqueue if a candidate is due
 *   node scripts/nursery-reeval-invoker.mjs --dry-run  # resolve + build + validate, write nothing
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { invokeNurseryReeval } from '../lib/eva/stage-zero/nursery-reeval-invoker.js';

const dryRun = process.argv.includes('--dry-run') || process.env.NURSERY_REEVAL_DRY_RUN === '1';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

try {
  const out = await invokeNurseryReeval({ dryRun }, { supabase });
  const tail = out.nurseryId ? ` nursery=${out.nurseryId}` : '';
  const req = out.requestId ? ` request=${out.requestId}` : '';
  console.log(`[nursery-reeval-invoker] ${out.reason}${tail}${req}`);
  process.exitCode = 0;
} catch (err) {
  // A fault, not an empty queue. Name it loudly — this is the case that must go red.
  console.error(`[nursery-reeval-invoker] FAILED: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
}
