#!/usr/bin/env node
/**
 * gauge-unranked-claimable-leaves.mjs — eligible-but-unranked-leaf-count invariant gauge
 * (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-D, FR-4).
 *
 * Guarantee-every-claimable-SD-is-ranked (parent SD) ships belt-and-suspenders: rank-on-transition
 * (-C) + a hardened periodic rank cron (-A) + a worker-checkin pool-window fix (-B). This gauge is
 * the OBSERVABILITY leg — it answers "did the belt-and-suspenders actually hold?" by counting how
 * many currently-claimable leaf SDs have NO fresh dispatch_rank right now. A non-zero count is DRIFT:
 * either rank-on-transition missed a gap, or the periodic cron has not caught up yet.
 *
 * STANDALONE by design (parent SD scope: "the broader coordinator-Solomon invariant-gauges
 * FRAMEWORK does not exist as code yet ... ship this as a standalone gauge that a future framework
 * SD can adopt/wrap"). No new schema, no new registration mechanism — just a machine-readable GAUGE
 * line, matching the existing convention (coordinator-capacity-forecast.mjs's GAUGE line).
 *
 * REUSE, do not re-derive: the claimable set comes from coordinator-backlog-rank.mjs's
 * computeClaimableLeaves() (the SAME function the ranker itself acts on), and "fresh" uses the SAME
 * DISPATCH_RANK_TTL_MS worker-checkin.cjs already enforces when deciding whether to trust a rank.
 *
 * Usage: node scripts/gauge-unranked-claimable-leaves.mjs [--json]
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { computeClaimableLeaves } from './coordinator-backlog-rank.mjs';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

const require = createRequire(import.meta.url);
const { DISPATCH_RANK_TTL_MS } = require('./worker-checkin.cjs');

const JSON_MODE = process.argv.includes('--json');

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Is this claimable SD's dispatch_rank fresh enough for worker-checkin to actually trust it?
 * Mirrors worker-checkin.cjs's own freshness check verbatim (same field names, same TTL) so the
 * gauge can never disagree with what the consumer actually honors.
 * @param {{ metadata?: { dispatch_rank?: number, dispatch_rank_at?: string } }} sd
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isFreshlyRanked(sd, nowMs) {
  const m = (sd && sd.metadata) || {};
  return !!(m.dispatch_rank != null && m.dispatch_rank_at
    && (nowMs - new Date(m.dispatch_rank_at).getTime()) < DISPATCH_RANK_TTL_MS);
}

/**
 * The gauge itself: of the given claimable leaves, how many lack a fresh dispatch_rank right now?
 * Pure/sync — exported for unit testing without a DB round-trip.
 * @param {object[]} claimable
 * @param {number} nowMs
 * @returns {{ count: number, keys: string[] }}
 */
export function countUnrankedClaimableLeaves(claimable, nowMs) {
  const unranked = (claimable || []).filter((sd) => !isFreshlyRanked(sd, nowMs));
  return { count: unranked.length, keys: unranked.map((sd) => sd.sd_key) };
}

async function main() {
  const nowMs = Date.now();
  const { error, claimable } = await computeClaimableLeaves(sb);
  if (error) {
    console.error('[UNRANKED-GAUGE] load failed:', error.message);
    process.exitCode = 0; // advisory gauge: never fail the tick over a transient read error
    return;
  }
  const { count, keys } = countUnrankedClaimableLeaves(claimable, nowMs);
  if (JSON_MODE) {
    console.log(JSON.stringify({ gauge: 'unranked_claimable_leaves', value: count, drift: count > 0, keys }));
    return;
  }
  if (count > 0) {
    console.log(`[UNRANKED-GAUGE] DRIFT: ${count} claimable leaf SD(s) have no fresh dispatch_rank: ${keys.join(', ')}`);
  } else {
    console.log('[UNRANKED-GAUGE] clean: every claimable leaf SD has a fresh dispatch_rank');
  }
  console.log(`GAUGE unranked_claimable_leaves=${count}`);
}

// process.argv[1] is undefined under `node -e`/some loaders, so guard it before pathToFileURL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(async () => {
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every completed tick, including
    // the fail-open "transient read error" branch (advisory gauge — the tick still ran).
    try {
      await stampLastFired(sb, 'standard_loop:unranked-gauge');
    } catch (err) {
      console.error(`[UNRANKED-GAUGE] stampLastFired failed (non-fatal): ${err.message}`);
    }
  });
}
