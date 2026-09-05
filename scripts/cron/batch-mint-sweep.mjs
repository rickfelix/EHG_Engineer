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
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { scanRecentQfMintsForBatches } from '../../lib/fleet/batch-mint-detector.js';
import {
  writeQfOracleHold, isOracleHeldQF, BOUNDED_WAIT_MS, QF_ORACLE_HOLD_PREFIX,
  extractConsultRowIdFromQfCondition, lookupConsultRowRecord, findConsultReply, releaseQfOracleHold,
} from '../../lib/fleet/hold-writer.js';

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
    // SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-2): correlation_id lets a reply route back to
    // this row (matches scripts/worker-signal.cjs's existing payload.correlation_id/reply_to
    // convention) -- without it the review this row solicits could never be matched to a release,
    // even after FR-3 added a reader.
    const correlationId = crypto.randomUUID();
    const { data, error } = await supabase
      .from('session_coordination')
      .insert({
        sender_type: 'system',
        sender_session: 'batch-mint-sweep',
        target_session: solomonId || 'broadcast-solomon',
        message_type: 'INFO',
        subject: `[SOLOMON_CONSULT] batch-mint hold: ${group.creator}`,
        // FR-4b: the batch-mint WINDOW ANCHOR (grouping detail) is not the RELEASE TIMER's anchor
        // (this row's own created_at) -- conflating the two caused a real false-early-release
        // retry loop when a reader computed the wait from the window anchor instead. State only
        // what is true: the window anchor for context, and point at this row's own created_at
        // (queryable on the row itself) as the sole timing anchor.
        body: `Batch-mint detector held ${group.memberIds.length} QF(s) (${group.memberIds.join(', ')}) minted by ${group.creator}, grouped within a 10-minute window anchored at ${group.anchorAt} (grouping detail only -- NOT the release timer). Review and reply (cite correlation_id ${correlationId}) to release early, or the bounded wait auto-permits release ${BOUNDED_WAIT_MS / 60000} minutes after THIS row's own created_at (query this row directly for the exact timestamp the timer counts from).`,
        payload: {
          kind: 'oracle_read_pending_consult', qf_ids: group.memberIds, creator: group.creator,
          consult_purpose: 'batch_mint_hold', correlation_id: correlationId,
        },
      })
      .select('id, created_at')
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-3): the specified PRIMARY release path -- a
 * recorded Solomon reply releases the hold immediately, before the bounded-wait timer. Runs on
 * every sweep tick against ALL currently oracle-held QFs (not just this tick's newly-detected
 * ones), since a reply can arrive on a hold opened by an earlier tick. The review HAVING
 * HAPPENED is what releases the hold, not any particular verdict content -- any matching
 * coordinator_reply counts (see findConsultReply's own docstring).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{checked:number, released:number, failed:Array}>}
 */
export async function checkVerdictsAndRelease(supabase) {
  // count-truncation-diff-lint: 999 (just under the PostgREST 1000-row cap) mirrors
  // runBatchMintSweep's own existing bound above -- the currently oracle-held QF population is
  // operationally small, but the lint requires an explicit, visible bound on every new read.
  const { data: held, error } = await supabase
    .from('quick_fixes')
    .select('id, release_condition')
    .eq('owner', 'chairman')
    .like('release_condition', `${QF_ORACLE_HOLD_PREFIX}%`)
    .limit(999);
  if (error || !held || held.length === 0) return { checked: 0, released: 0, failed: [] };

  // Group QFs by their shared consult row (one consult row per batch group).
  const byConsultRow = new Map();
  for (const qf of held) {
    const consultRowId = extractConsultRowIdFromQfCondition(qf.release_condition);
    if (!consultRowId) continue;
    if (!byConsultRow.has(consultRowId)) byConsultRow.set(consultRowId, []);
    byConsultRow.get(consultRowId).push(qf.id);
  }

  const failed = [];
  let released = 0;
  for (const [consultRowId, qfIds] of byConsultRow) {
    const record = await lookupConsultRowRecord(supabase, consultRowId);
    if (!record?.correlation_id) continue;
    const reply = await findConsultReply(supabase, record.correlation_id);
    if (!reply) continue;
    for (const qfId of qfIds) {
      const result = await releaseQfOracleHold(supabase, qfId, {
        consultRowId, consultRowCreatedAt: record.created_at, releasedBy: 'solomon-verdict',
      });
      if (result.merged) released += 1;
      else failed.push({ id: qfId, cause: result.cause });
    }
  }
  return { checked: held.length, released, failed };
}

export async function runBatchMintSweep(supabase, { nowMs = Date.now(), openConsult = openConsultRow } = {}) {
  const { heldIds, groups } = await scanRecentQfMintsForBatches(supabase, { nowMs });
  if (heldIds.size === 0) return { scanned: true, groups: 0, held: 0, alreadyHeld: 0, failed: [] };

  // count-truncation-diff-lint: an explicit numeric limit provably bounds this read. The .in()
  // list is already bounded to heldIds.size in practice (a batch-mint group within one lookback
  // window), but 999 (just under the PostgREST 1000-row cap) is the honest ceiling this read
  // could ever need — it can never truncate a real match at realistic batch sizes.
  const { data: existing, error } = await supabase
    .from('quick_fixes')
    .select('id, status, owner, release_condition')
    .in('id', Array.from(heldIds))
    .limit(999);
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

  // FR-3: check for a recorded verdict on every existing hold, on every tick -- non-fatal, since a
  // verdict-check failure must never block the (already-working) timer path from still releasing.
  const verdictResult = await checkVerdictsAndRelease(supabase).catch((e) => {
    console.error('[batch-mint-sweep] verdict-check error (non-fatal):', e.message);
    return { checked: 0, released: 0, failed: [] };
  });
  console.log(`[batch-mint-sweep] verdict-check: checked=${verdictResult.checked} released=${verdictResult.released} failed=${verdictResult.failed.length}`);

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
