#!/usr/bin/env node
/**
 * One-time backfill for WORK_ASSIGNMENT rows the worker could never read.
 * SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-6).
 *
 * WHY THIS IS PART OF THE FIX AND NOT A FOLLOW-ON. Refusing unreadable assignments at write
 * time prevents NEW ones and does nothing about the ones already stored. Measured: 46 of 121
 * live WORK_ASSIGNMENTs were inert-and-unacked.
 *
 * WHAT THE SHIPPED CODE ALREADY HANDLES — read this before assuming the backfill must repair:
 *   - The shared resolver now reads the top-level target_sd column and single-key text, so 25 of
 *     the 46 become READABLE retroactively with no row edit at all.
 *   - FR-8 makes selection skip an unreadable row instead of stopping on it, so the remaining 21
 *     no longer SHADOW good dispatches either.
 * So "repair" in the row-editing sense is not required for readability or for unblocking seats.
 * What remains is DISPOSITION.
 *
 * *** WHY THIS DOES NOT AUTO-CLAIM THE 25 NEWLY-READABLE ROWS. ***
 * They are up to 33 hours old, and the coordinator re-dispatched several of them in the
 * meantime. Making them claimable is correct; silently ACTING on stale intent is not — it would
 * risk duplicate work on items that already moved. The SD's original instruction was the
 * opposite error in the same family ("find inert rows and RETIRE them"), which run today would
 * have destroyed those 25 plus 12 more that need human routing. Both directions are the same
 * mistake: acting on a row without establishing whether its intent still holds. So this reports
 * them and leaves the decision to the coordinator.
 *
 * *** WHAT --apply DOES: RETIRES KEYLESS ONLY. AMBIGUOUS IS REPORT-ONLY. ***
 * The first version of this script also retired the AMBIGUOUS bucket, and the dry run caught
 * that as over-reach: of the ambiguous rows, most were NOT stuck before this SD — the old
 * first-match text scan resolved them (to a guess) and they were being actioned. FR-5 is what
 * made them ambiguous. Retiring them would delete live dispatches the coordinator still expects
 * picked up, using a classification this SD itself introduced. Ambiguity is a ROUTING question,
 * never a retirement criterion. They are reported with BOTH candidates so a human decides.
 * KEYLESS is different in kind: those rows name no work item anywhere and never could be
 * claimed by anyone — they were not assignments, whatever they were typed as.
 *
 * A LIVE EXAMPLE OF WHY FR-5 REFUSES RATHER THAN GUESSES, straight out of the AMBIGUOUS bucket:
 *   "STAND DOWN — do NOT claim SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 ..."
 *   candidates=[SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001, SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001]
 * A first-match text scan resolves that to the FIRST key — the one the message exists to tell
 * the worker NOT to claim. The guess does not merely pick the wrong target; on a stand-down it
 * inverts the instruction entirely.
 *
 * Read-only by default. Usage:
 *   node scripts/one-off/backfill-unreadable-work-assignments.mjs            # dry run (default)
 *   node scripts/one-off/backfill-unreadable-work-assignments.mjs --apply    # retire KEYLESS only
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const require_ = createRequire(import.meta.url);
const { resolveAssignmentTarget } = require_('../../lib/fleet/assignment-target.cjs');
const { createClient } = require_('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');

function classify(row) {
  const v = resolveAssignmentTarget(row, { profile: 'worker' });
  if (v.key) return { klass: 'READABLE_NOW', key: v.key, source: v.source, candidates: [] };
  if (v.ambiguous) return { klass: 'AMBIGUOUS', key: null, source: null, candidates: v.candidates };
  return { klass: 'KEYLESS', key: null, source: null, candidates: [] };
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id,target_session,target_sd,subject,body,payload,created_at,acknowledged_at')
    .eq('message_type', 'WORK_ASSIGNMENT')
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) { console.error('read failed:', error.message); process.exit(1); }

  const measuredAt = new Date().toISOString();
  const buckets = { READABLE_NOW: [], AMBIGUOUS: [], KEYLESS: [] };
  for (const row of data) buckets[classify(row).klass].push({ row, ...classify(row) });

  console.log(`measured_at_utc=${measuredAt}`);
  console.log(`unacked WORK_ASSIGNMENTs examined: ${data.length}`);
  console.log(`  READABLE_NOW : ${buckets.READABLE_NOW.length}  (resolver already handles these — reported, NOT acted on)`);
  console.log(`  AMBIGUOUS    : ${buckets.AMBIGUOUS.length}  (multi-key — REPORT-ONLY, never retired, never auto-picked)`);
  console.log(`  KEYLESS      : ${buckets.KEYLESS.length}  (no work item named anywhere — not an assignment)`);
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN (default; pass --apply to retire)'}`);

  if (buckets.READABLE_NOW.length) {
    console.log('\n--- READABLE_NOW (for coordinator disposition; stale intent is NOT auto-acted) ---');
    for (const b of buckets.READABLE_NOW) {
      const ageH = Math.round((Date.now() - new Date(b.row.created_at)) / 3600000);
      console.log(`  ${b.row.id.slice(0, 8)} age=${ageH}h -> ${b.key}  (via ${b.source})`);
    }
  }
  if (buckets.AMBIGUOUS.length) {
    console.log('\n--- AMBIGUOUS (needs human routing — both candidates shown) ---');
    for (const b of buckets.AMBIGUOUS) {
      console.log(`  ${b.row.id.slice(0, 8)} candidates=[${b.candidates.join(', ')}]  "${String(b.row.subject || '').slice(0, 70)}"`);
    }
  }

  // KEYLESS only. See the header: retiring AMBIGUOUS would delete live dispatches on the
  // strength of a classification this SD itself introduced.
  const toRetire = buckets.KEYLESS;
  if (!APPLY) {
    console.log(`\nDRY RUN — would retire ${toRetire.length} KEYLESS row(s). AMBIGUOUS (${buckets.AMBIGUOUS.length}) is report-only and is NEVER retired. No writes performed.`);
    return;
  }

  let retired = 0, failed = 0;
  for (const b of toRetire) {
    // Idempotent: the .is(acknowledged_at, null) guard means a concurrent ack wins harmlessly
    // and re-running the script is a no-op rather than a double-write.
    const { error: e } = await supabase
      .from('session_coordination')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', b.row.id)
      .is('acknowledged_at', null);
    if (e) { failed++; console.error(`  retire FAILED ${b.row.id.slice(0, 8)}: ${e.message}`); }
    else retired++;
  }
  console.log(`\nAPPLIED: retired ${retired}, failed ${failed}. READABLE_NOW rows left untouched by design.`);
}

// SD-FDBK-ENH-578-SCRIPTS-ONE-001: guard against a bare import()/require() executing main()
// against live prod. Behavior when run directly is unchanged.
if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
