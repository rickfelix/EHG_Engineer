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

/**
 * Outcomes that are RETURNED rather than THROWN but are still real faults.
 *
 * WHY THIS SET HAS TO EXIST. The exit-code contract above splits on how the outcome ARRIVES —
 * returned means expected, threw means fault. `registered_principal_missing` breaks that
 * equivalence: it is returned (so the guard can log context and refuse cleanly) but it means the
 * allowlist names a principal with no auth.users row, which is a DEFECT, not an empty queue.
 * Left in the returned-is-fine bucket it would print the reason and exit 0 — the scheduled job
 * goes GREEN while the seam it exists to drive is dead. That is the exact failure the in-invoker
 * existence guard was written to end, reproduced one layer up at the consumer, which is why the
 * fix had to be checked HERE and not only where it was made.
 *
 * `no_registered_service_principal` deliberately stays a ZERO. An EMPTY registry is the
 * designed-safe resting state ("this cannot enqueue, by construction"); a DANGLING one is a
 * broken reference. Same shape of return value, opposite meanings.
 */
const FAULT_REASONS = new Set(['registered_principal_missing']);

try {
  const out = await invokeNurseryReeval({ dryRun }, { supabase });
  const tail = out.nurseryId ? ` nursery=${out.nurseryId}` : '';
  const req = out.requestId ? ` request=${out.requestId}` : '';
  if (FAULT_REASONS.has(out.reason)) {
    console.error(
      `[nursery-reeval-invoker] FAULT: ${out.reason}${tail}` +
      `${out.principal ? ` principal=${out.principal}` : ''}` +
      `${out.detail ? ` (${out.detail})` : ''}`
    );
    process.exitCode = 1;
  } else {
    console.log(`[nursery-reeval-invoker] ${out.reason}${tail}${req}`);
    process.exitCode = 0;
  }
} catch (err) {
  // A fault, not an empty queue. Name it loudly — this is the case that must go red.
  console.error(`[nursery-reeval-invoker] FAILED: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
}
