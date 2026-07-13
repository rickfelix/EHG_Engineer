#!/usr/bin/env node
/**
 * Backfill: classify truly-bare CLIs as currently_expected_active=false
 * (SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001, FR-4).
 *
 * Of the 9 cron_script:* candidate rows investigated during PLAN, 5 have NO invoker found
 * anywhere (no GHA workflow, no STANDARD_LOOPS/COMPOSED_CORES entry, no programmatic caller --
 * only an npm alias or a documented not-yet-wired gap):
 *   - cascade-status.mjs          (only npm alias `cascade:status`)
 *   - cascade-watcher.mjs         (only npm alias `cascade:watch:cron`)
 *   - leo-build-starter.mjs       (only a manual slash-command; venture-build-consumer.js:7-8
 *                                  explicitly documents "NOTHING consumes that signal today")
 *   - quality-findings-aggregator.mjs (only a cross-reference comment in a separate legacy script)
 *   - review-self-tune.js         (weakest footprint of all 9 -- no npm alias, only an .rca/ doc mention)
 *
 * The other 4 candidates (chairman-decision-sla-sweep.mjs, eva-scheduler-watcher.mjs,
 * fr-c-generator.mjs, venture-ops-actuals-sweep.mjs) DO have a real GHA cron workflow invoking
 * them and are deliberately EXCLUDED here -- FR-4's acceptance criteria require rows with a real
 * invoker to be left as-is, not misclassified. Those 4 need FR-3-style stampLastFired()
 * instrumentation instead (added directly in their own scripts), not suppression.
 *
 * Dry-run by default; --apply performs the update. Idempotent: a second run matches 0 rows
 * that still need changing.
 *
 * Usage:
 *   node scripts/backfill-bare-cli-expected-active.mjs           # dry run
 *   node scripts/backfill-bare-cli-expected-active.mjs --apply   # perform the update
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const GENUINELY_BARE_PROCESS_KEYS = [
  'cron_script:cascade-status.mjs',
  'cron_script:cascade-watcher.mjs',
  'cron_script:leo-build-starter.mjs',
  'cron_script:quality-findings-aggregator.mjs',
  'cron_script:review-self-tune.js',
];

export async function run({ apply = false } = {}) {
  const { data: rows, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, currently_expected_active')
    .in('process_key', GENUINELY_BARE_PROCESS_KEYS)
    .eq('currently_expected_active', true);

  if (error) throw new Error(`registry query failed: ${error.message}`);

  const processKeys = (rows || []).map((r) => r.process_key);
  console.log(`[backfill-bare-cli-expected-active] ${processKeys.length}/${GENUINELY_BARE_PROCESS_KEYS.length} genuinely-bare row(s) still currently_expected_active=true`);

  if (processKeys.length === 0) {
    console.log('[backfill-bare-cli-expected-active] nothing to do');
    return { matched: 0, updated: 0 };
  }

  if (!apply) {
    console.log('[backfill-bare-cli-expected-active] DRY RUN -- pass --apply to update:');
    for (const k of processKeys) console.log(`  ${k}`);
    return { matched: processKeys.length, updated: 0 };
  }

  const { data: updated, error: updateError } = await supabase
    .from('periodic_process_registry')
    .update({ currently_expected_active: false, updated_at: new Date().toISOString() })
    .in('process_key', processKeys)
    .select('process_key');

  if (updateError) throw new Error(`update failed: ${updateError.message}`);

  console.log(`[backfill-bare-cli-expected-active] updated ${updated?.length || 0} row(s)`);
  return { matched: processKeys.length, updated: updated?.length || 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  run({ apply }).catch((err) => {
    console.error(`[backfill-bare-cli-expected-active] FAILED: ${err.message}`);
    process.exit(1);
  });
}
