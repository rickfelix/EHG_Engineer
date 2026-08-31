#!/usr/bin/env node
/**
 * Batch-mint sweep cron entry — SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-1/FR-4).
 *
 * TESTING finding D-2: the pure detector (lib/fleet/batch-mint-detector.js) and the hold writer
 * (lib/fleet/hold-writer.js) had ZERO production callers — this script is the missing consumer
 * that makes FR-1/FR-4 reachable. Idempotent: re-running holds only ids not already oracle-held.
 *
 * Usage: node scripts/cron/batch-mint-sweep.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { scanRecentQfMintsForBatches } from '../../lib/fleet/batch-mint-detector.js';
import { writeQfOracleHold, isOracleHeldQF, BOUNDED_WAIT_MS } from '../../lib/fleet/hold-writer.js';

export async function runBatchMintSweep(supabase, { nowMs = Date.now() } = {}) {
  const { heldIds, groups } = await scanRecentQfMintsForBatches(supabase, { nowMs, fetchAll: fetchAllPaginated });
  if (heldIds.size === 0) return { scanned: true, groups: 0, held: 0, alreadyHeld: 0, failed: [] };

  const { data: existing, error } = await supabase
    .from('quick_fixes')
    .select('id, status, owner, release_condition')
    .in('id', Array.from(heldIds));
  if (error) throw new Error(`runBatchMintSweep: ${error.message}`);
  const existingById = new Map((existing || []).map((r) => [r.id, r]));
  const alreadyHeld = new Set((existing || []).filter(isOracleHeldQF).map((r) => r.id));
  // SECURITY finding S-8 (write-amplification): a QF already flowed to a terminal status gains
  // nothing from being stamped owner='chairman' — it only widens the population a write-side bug
  // (S-1) or a manual release-hold call could touch. Skip terminal statuses entirely.
  const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'wont_fix']);
  const toHold = Array.from(heldIds).filter((id) => {
    if (alreadyHeld.has(id)) return false;
    const row = existingById.get(id);
    return !row || !TERMINAL_STATUSES.has(row.status);
  });
  const reviewAt = new Date(nowMs + BOUNDED_WAIT_MS).toISOString();
  const failed = [];
  for (const id of toHold) {
    const result = await writeQfOracleHold(supabase, id, {
      reviewAt,
      releaseCondition: `batch mint detected (group size ${groups.find((g) => g.memberIds.includes(id))?.memberIds.length || '?'})`,
    });
    if (!result.merged) failed.push({ id, cause: result.cause });
  }
  return { scanned: true, groups: groups.length, held: toHold.length - failed.length, alreadyHeld: alreadyHeld.size, failed };
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const result = await runBatchMintSweep(supabase);
  console.log(`[batch-mint-sweep] groups=${result.groups} held=${result.held} alreadyHeld=${result.alreadyHeld} failed=${result.failed.length}`);
  if (result.failed.length) {
    console.error('[batch-mint-sweep] FAILED holds:', JSON.stringify(result.failed));
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('[batch-mint-sweep] FATAL:', e.message);
    process.exit(1);
  });
}
