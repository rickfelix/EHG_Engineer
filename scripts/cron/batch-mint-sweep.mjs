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
import { createRequire } from 'node:module';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { scanRecentQfMintsForBatches } from '../../lib/fleet/batch-mint-detector.js';
import { writeQfOracleHold, isOracleHeldQF, BOUNDED_WAIT_MS } from '../../lib/fleet/hold-writer.js';

const require = createRequire(import.meta.url);
const { getActiveSolomonId } = require('../../lib/coordinator/solomon-identity.cjs');

/**
 * VALIDATION finding V-2: the release-side bounded-wait gate had no producer — nothing ever
 * opened a consult row and cited it, so every real hold was releasable only via --force. Opens
 * ONE consult row per batch group (not per QF — the group is one conversation), targeting the
 * active Solomon (or a broadcast sentinel if none is currently resolvable, matching
 * presend-consult-lane.cjs's own fail-open pattern). Best-effort: a failed insert returns null
 * and the caller falls back to consultRowId=null (writeQfOracleHold embeds 'none'), which is
 * honest — release-oracle-hold.js already refuses a release with no cited row, fail-closed.
 */
async function openConsultRow(supabase, group) {
  try {
    const solomonId = await getActiveSolomonId(supabase, {}).catch(() => null);
    const { data, error } = await supabase
      .from('session_coordination')
      .insert({
        sender_type: 'system',
        sender_session: 'batch-mint-sweep',
        target_session: solomonId || 'broadcast-solomon',
        message_type: 'INFO',
        subject: `[SOLOMON_CONSULT] batch-mint hold: ${group.creator}`,
        body: `Batch-mint detector held ${group.memberIds.length} QF(s) (${group.memberIds.join(', ')}) minted by ${group.creator} within the 10-minute window anchored at ${group.anchorAt}. Review and reply to release early, or the bounded wait auto-permits release after ${BOUNDED_WAIT_MS / 60000} minutes.`,
        payload: { kind: 'oracle_read_pending_consult', qf_ids: group.memberIds, creator: group.creator, consult_purpose: 'batch_mint_hold' },
      })
      .select('id, created_at')
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function runBatchMintSweep(supabase, { nowMs = Date.now(), openConsult = openConsultRow } = {}) {
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
  const toHoldSet = new Set(toHold);
  let held = 0;
  for (const group of groups) {
    const groupToHold = group.memberIds.filter((id) => toHoldSet.has(id));
    if (groupToHold.length === 0) continue;
    // One consult row per GROUP (a shared conversation), not per QF — every member cites the
    // same consult, matching the batch's real provenance rather than N independent requests.
    const consultRow = await openConsult(supabase, group);
    for (const id of groupToHold) {
      const result = await writeQfOracleHold(supabase, id, {
        reviewAt,
        releaseCondition: `batch mint detected (group size ${group.memberIds.length})`,
        consultRowId: consultRow?.id || null,
      });
      if (!result.merged) failed.push({ id, cause: result.cause });
      else held += 1;
    }
  }
  return { scanned: true, groups: groups.length, held, alreadyHeld: alreadyHeld.size, failed };
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
