#!/usr/bin/env node
/**
 * Backfill claude_sessions rows that violate the worktree-state invariant.
 *
 * Part of SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-6). Must run BEFORE the
 * FR-5 CHECK constraint deploys.
 *
 * INVARIANT: sd_key IS NOT NULL OR (worktree_path IS NULL AND worktree_branch IS NULL)
 *
 * Violation = sd_key IS NULL AND (worktree_path IS NOT NULL OR worktree_branch IS NOT NULL).
 *
 * For each violator:
 *   1. UPDATE row to set worktree_path=NULL, worktree_branch=NULL
 *   2. INSERT WORKTREE_STATE_BACKFILL row in session_lifecycle_events with the
 *      prior values preserved in metadata (so diagnostic value is retained
 *      through the audit log even though the live row clears)
 *
 * Idempotent: re-running produces zero updates and zero events.
 *
 * Usage:
 *   node scripts/one-off/backfill-stale-worktree-state.mjs
 *   node scripts/one-off/backfill-stale-worktree-state.mjs --dry-run
 */

import 'dotenv/config';
import os from 'os';
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 500;

async function findViolators(supabase) {
  // Pull violators in pages so we don't blow memory on a long-stale fleet.
  // Filter: sd_key IS NULL AND (worktree_path IS NOT NULL OR worktree_branch IS NOT NULL)
  const all = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, sd_key, worktree_path, worktree_branch, machine_id, terminal_id, pid')
      .is('sd_key', null)
      .or('worktree_path.not.is.null,worktree_branch.not.is.null')
      .range(from, to);

    if (error) {
      throw new Error(`Failed to query violators (page ${page}): ${error.message}`);
    }

    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    page += 1;
  }

  return all;
}

async function clearOne(supabase, row) {
  // 1. UPDATE the row
  const { error: updateError } = await supabase
    .from('claude_sessions')
    .update({ worktree_path: null, worktree_branch: null })
    .eq('session_id', row.session_id)
    .is('sd_key', null);  // refuse if sd_key got set between query and update

  if (updateError) {
    return { ok: false, error: `update failed: ${updateError.message}` };
  }

  // 2. Audit row in session_lifecycle_events
  const { error: eventError } = await supabase
    .from('session_lifecycle_events')
    .insert({
      event_type: 'WORKTREE_STATE_BACKFILL',
      session_id: row.session_id,
      machine_id: row.machine_id || null,
      terminal_id: row.terminal_id || null,
      pid: row.pid || null,
      reason: 'backfill_pre_invariant',
      metadata: {
        backfill_script: 'scripts/one-off/backfill-stale-worktree-state.mjs',
        backfill_host: os.hostname(),
        worktree_path_before: row.worktree_path,
        worktree_branch_before: row.worktree_branch,
        sd_key_at_backfill: null
      }
    });

  if (eventError) {
    // The UPDATE already succeeded; surface the audit failure but do not
    // attempt to roll back the clear (the goal IS to clear).
    return { ok: false, error: `audit insert failed: ${eventError.message}` };
  }

  return { ok: true };
}

async function main() {
  const supabase = await createSupabaseServiceClient('engineer');

  console.error(`[backfill] starting ${DRY_RUN ? '(DRY RUN)' : ''}`);
  const startedAt = Date.now();

  const violators = await findViolators(supabase);
  console.error(`[backfill] found ${violators.length} violators`);

  if (violators.length === 0) {
    console.error('[backfill] nothing to do (idempotent re-run)');
    return;
  }

  if (DRY_RUN) {
    for (const row of violators.slice(0, 10)) {
      console.error(`  - ${row.session_id} path=${row.worktree_path || '(null)'} branch=${row.worktree_branch || '(null)'}`);
    }
    if (violators.length > 10) {
      console.error(`  ... and ${violators.length - 10} more`);
    }
    console.error('[backfill] dry-run complete; no writes performed');
    return;
  }

  let cleared = 0;
  let failed = 0;
  for (const row of violators) {
    const result = await clearOne(supabase, row);
    if (result.ok) {
      cleared += 1;
    } else {
      failed += 1;
      console.error(`[backfill] FAILED ${row.session_id}: ${result.error}`);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.error(`[backfill] complete: cleared=${cleared} failed=${failed} elapsed_ms=${elapsedMs}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[backfill] fatal: ${err.message}`);
  process.exit(1);
});
