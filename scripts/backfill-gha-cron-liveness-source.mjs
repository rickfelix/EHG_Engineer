#!/usr/bin/env node
/**
 * Backfill: flip gha_cron:* periodic_process_registry rows from liveness_source='self_stamped'
 * to 'github_actions_api' (SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001, FR-2).
 *
 * FR-1's migration only widens the liveness_source CHECK constraint to ALLOW the new value (a
 * schema/DDL change, deliberately no data mutation per its own acceptance criteria). This script
 * is the separate DML step that actually flips the 68 existing gha_cron:* rows once the CHECK
 * permits it -- without this, FR-2's resolver (which stamps via stampFromGithubActionsRun(),
 * filtered on liveness_source='github_actions_api') would match 0 rows.
 *
 * Dry-run by default; --apply performs the update. Idempotent: a second run matches 0 rows
 * (already flipped), so re-running is always safe.
 *
 * Usage:
 *   node scripts/backfill-gha-cron-liveness-source.mjs           # dry run
 *   node scripts/backfill-gha-cron-liveness-source.mjs --apply   # perform the update
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function run({ apply = false } = {}) {
  const { data: rows, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, liveness_source')
    .like('process_key', 'gha_cron:%')
    .eq('liveness_source', 'self_stamped');

  if (error) throw new Error(`registry query failed: ${error.message}`);

  const processKeys = (rows || []).map((r) => r.process_key);
  console.log(`[backfill-gha-cron-liveness-source] ${processKeys.length} gha_cron:* row(s) still self_stamped`);

  if (processKeys.length === 0) {
    console.log('[backfill-gha-cron-liveness-source] nothing to do');
    return { matched: 0, updated: 0 };
  }

  if (!apply) {
    console.log('[backfill-gha-cron-liveness-source] DRY RUN -- pass --apply to update. Sample:');
    for (const k of processKeys.slice(0, 10)) console.log(`  ${k}`);
    if (processKeys.length > 10) console.log(`  ...and ${processKeys.length - 10} more`);
    return { matched: processKeys.length, updated: 0 };
  }

  const { data: updated, error: updateError } = await supabase
    .from('periodic_process_registry')
    .update({ liveness_source: 'github_actions_api', updated_at: new Date().toISOString() })
    .like('process_key', 'gha_cron:%')
    .eq('liveness_source', 'self_stamped')
    .select('process_key');

  if (updateError) throw new Error(`update failed: ${updateError.message}`);

  console.log(`[backfill-gha-cron-liveness-source] updated ${updated?.length || 0} row(s)`);
  return { matched: processKeys.length, updated: updated?.length || 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  run({ apply }).catch((err) => {
    console.error(`[backfill-gha-cron-liveness-source] FAILED: ${err.message}`);
    process.exit(1);
  });
}
