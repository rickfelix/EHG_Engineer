#!/usr/bin/env node
/**
 * One-off, idempotent backfill: populate metadata.parked_from_status on every live
 * status='deferred' row currently missing it.
 *
 * SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001 (FR-5).
 *
 * MEASURED (re-verified live, matching PLAN-TO-EXEC TESTING sub-agent review, evidence
 * e03cc24e-6d29-4dd5-ba23-777ffd66c88f): only 1 of the 25 rows missing parked_from_status
 * (SD-EHG-UIUX-RM-ORPHAN-ANALYTICS-001) carries metadata.parked_at/parked_by at all, and even
 * there parked_at is a bare timestamp that cannot encode a PRIOR status -- corrected during
 * EXEC-TO-PLAN review (evidence 8d7007a2-fb78-4339-9d0f-aae830ccbd64); the original PRD/backfill
 * comment claimed 0-of-25, which was imprecise. Either way, current_phase remains the only
 * usable signal: LEAD=22, PLAN_PRD=1, EXEC=2.
 *
 * This script writes ONLY metadata.parked_from_status. It NEVER writes park_reason or
 * park_review_at (FR-6) -- those are read directly by lib/oversight/coordinator-health-
 * sharpenings.mjs's isChildHumanHeld() and lib/governance/hold-state-sweep.js's overdue-
 * hold gauge; writing them here would silently flip live stuck-hold/overdue-hold
 * classification for real rows.
 *
 * Idempotent: only touches rows where metadata.parked_from_status IS NULL; running twice
 * produces no further writes on the second run.
 *
 * SECURITY (EXEC-TO-PLAN review, evidence 8d7007a2-fb78-4339-9d0f-aae830ccbd64, finding C2):
 * every write here is an INFERENCE from current_phase, not a recorded fact from a real
 * park() call. Each written row is marked metadata.parked_from_status_source='backfill_inferred'
 * so lib/sd-park.js's computeUnparkPlan() treats it as requiring an explicit --restore rather
 * than auto-trusting the inferred value — otherwise FR-4's "never silently guess" guarantee
 * would be defeated for exactly the population this backfill covers.
 *
 * Usage:
 *   node scripts/one-off/backfill-parked-from-status.mjs           # dry run (default)
 *   node scripts/one-off/backfill-parked-from-status.mjs --execute # apply writes
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const EXECUTE = process.argv.includes('--execute');

// current_phase -> WORKABLE status. Conservative, documented mapping (see PRD FR-5):
// LEAD-phase rows rest at 'draft' (the normal pre-LEAD-approval starting point);
// PLAN_PRD rows resume at 'planning'; EXEC rows resume at 'in_progress' so real
// in-flight work (e.g. an open PR) is not regressed to draft.
const PHASE_TO_STATUS = {
  LEAD: 'draft',
  PLAN_PRD: 'planning',
  EXEC: 'in_progress',
};

async function main() {
  const { data: rows, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, current_phase, metadata')
    .eq('status', 'deferred');
  if (error) { console.error('FETCH ERROR:', error.message); process.exit(1); }

  const missing = rows.filter((r) => !r.metadata || !r.metadata.parked_from_status);
  console.log(`Live deferred rows: ${rows.length}. Missing parked_from_status: ${missing.length}.`);
  console.log(EXECUTE ? 'MODE: --execute (writes will be applied)' : 'MODE: dry run (pass --execute to apply)');
  console.log('');

  const manualReview = [];
  let applied = 0;
  let skipped = 0;

  for (const row of missing) {
    const target = PHASE_TO_STATUS[row.current_phase];
    if (!target) {
      manualReview.push(row.sd_key);
      console.log(`  [MANUAL REVIEW] ${row.sd_key}: current_phase=${row.current_phase} has no mapping -- writing sentinel "unknown"`);
    } else {
      console.log(`  ${row.sd_key}: current_phase=${row.current_phase} -> parked_from_status="${target}"`);
    }

    if (!EXECUTE) continue;

    // Idempotency guard: re-check parked_from_status is still absent immediately
    // before writing (defends a concurrent writer between the initial SELECT and
    // this UPDATE), and never overwrite an existing value.
    const { data: current, error: reErr } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', row.sd_key)
      .single();
    if (reErr) { console.error(`  SKIP ${row.sd_key}: re-check failed: ${reErr.message}`); skipped++; continue; }
    if (current.metadata && current.metadata.parked_from_status) {
      console.log(`  SKIP ${row.sd_key}: parked_from_status already set (concurrent write) -- not overwriting.`);
      skipped++;
      continue;
    }

    const patch = {
      ...(current.metadata || {}),
      parked_from_status: target || 'unknown',
      parked_from_status_source: 'backfill_inferred',
    };
    const { error: updErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: patch })
      .eq('sd_key', row.sd_key);
    if (updErr) { console.error(`  FAILED ${row.sd_key}: ${updErr.message}`); skipped++; continue; }
    applied++;
  }

  console.log('');
  console.log(`Done. Applied: ${applied}. Skipped: ${skipped}. Manual-review sentinel rows: ${manualReview.length}.`);
  if (manualReview.length) {
    console.log('Manual-review SD keys (wrote "unknown" -- these will still require an explicit --restore on unpark):');
    manualReview.forEach((k) => console.log(`  - ${k}`));
  }
  if (!EXECUTE) console.log('\nDry run only -- re-run with --execute to apply.');
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
