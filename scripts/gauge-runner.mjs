#!/usr/bin/env node
/**
 * gauge-runner.mjs — SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-2/FR-3/FR-4.
 *
 * Executes every ENABLED entry in lib/governance/gauge-registry.js, prints a uniform GAUGE line
 * per entry (matching the pre-existing `GAUGE <name>=<value>` convention), and routes a finding to
 * the entry's ownerRole when its threshold trips. Idempotent (safe to re-run — findings are
 * observations, not state mutations) and budget-bounded (MAX_DETECTORS_PER_RUN hard cap).
 * Advisory-only: a single detector throwing is caught, logged, and does NOT fail the run or the
 * exit code — mirrors scripts/gauge-unranked-claimable-leaves.mjs's own exitCode=0-on-transient-
 * error contract.
 *
 * Invariant #0 (who-watches-the-watchmen, FR-4): writes a heartbeat snapshot to
 * codebase_health_snapshots on every successful pass. scripts/coordinator-hourly-review.cjs reads
 * this heartbeat from a SEPARATE, independently-cron'd process and alarms if it goes stale — so a
 * dead runner is externally observable, not a silent false-all-clear.
 *
 * Usage: node scripts/gauge-runner.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { GAUGE_REGISTRY } from '../lib/governance/gauge-registry.js';
import { computeClaimableLeaves } from './coordinator-backlog-rank.mjs';
import { countUnrankedClaimableLeaves } from './gauge-unranked-claimable-leaves.mjs';

const JSON_MODE = process.argv.includes('--json');
const MAX_DETECTORS_PER_RUN = 50; // budget-bound: far above the current 3-entry registry, a backstop against runaway growth

const HEARTBEAT_DIMENSION = 'gauge_runner_heartbeat';

/**
 * Maps a registry entry's string detectorFn key to an actual callable. Keeps gauge-registry.js
 * (CommonJS) free of ESM imports — this runner (ESM) does the resolution instead.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function buildDetectorResolvers(supabase) {
  return {
    'unranked-claimable-leaves': async () => {
      const { error, claimable } = await computeClaimableLeaves(supabase);
      if (error) throw new Error('computeClaimableLeaves failed: ' + error.message);
      return countUnrankedClaimableLeaves(claimable, Date.now());
    },
  };
}

/**
 * Pure: given the registry and a resolver map, decide which entries are runnable now.
 * Exported for unit testing without a DB round-trip.
 * @param {object[]} registry
 * @returns {object[]} enabled entries only
 */
export function selectEnabledEntries(registry) {
  return (registry || []).filter((entry) => entry && entry.enabled === true && entry.detectorFn);
}

/**
 * Pure: does this result trip the entry's threshold?
 * @param {object} entry
 * @param {object} result
 * @returns {boolean}
 */
export function tripsThreshold(entry, result) {
  const tripWhen = entry?.thresholdConfig?.tripWhen;
  if (typeof tripWhen !== 'function') return false;
  try { return !!tripWhen(result); } catch { return false; }
}

/**
 * Pure: builds the feedback-table insert row for a tripped gauge finding. Exported so the row
 * shape (critically, `type: 'issue'`) can be unit-tested against the feedback_type_check
 * constraint's known-valid values without a live DB round-trip.
 * @param {object} entry
 * @param {object} result
 * @returns {object}
 */
export function buildFindingRow(entry, result) {
  // feedback.type is constrained to ('issue', 'enhancement') by feedback_type_check
  // (database/migrations/391_quality_lifecycle_schema.sql) -- a tripped gauge is an issue; the
  // gauge-specific discriminator lives in category/metadata.gauge_id instead.
  return {
    type: 'issue',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    category: 'invariant_gauge_finding',
    status: 'new',
    severity: 'medium',
    title: `[GAUGE] ${entry.name} tripped (owner: ${entry.ownerRole})`,
    description: `Detector "${entry.id}" tripped its threshold. Remediation: ${entry.remediation}`,
    metadata: { gauge_id: entry.id, owner_role: entry.ownerRole, result, prevent: entry.prevent, routed_at: new Date().toISOString() },
  };
}

async function routeFinding(supabase, entry, result) {
  const { error } = await supabase.from('feedback').insert(buildFindingRow(entry, result));
  if (error) console.error(`[gauge-runner] finding-route failed for ${entry.id} (non-fatal): ${error.message}`);
}

async function writeHeartbeat(supabase, ranCount) {
  const { error } = await supabase.from('codebase_health_snapshots').insert({
    dimension: HEARTBEAT_DIMENSION,
    target_application: 'EHG_Engineer',
    score: 100,
    findings: [{ ran_count: ranCount, ran_at: new Date().toISOString() }],
    trend_direction: 'stable',
    metadata: { source: 'gauge-runner.mjs' },
  });
  if (error) console.error(`[gauge-runner] heartbeat write failed (non-fatal — invariant #0 will alarm): ${error.message}`);
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[gauge-runner] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);
  const resolvers = buildDetectorResolvers(supabase);

  const enabled = selectEnabledEntries(GAUGE_REGISTRY).slice(0, MAX_DETECTORS_PER_RUN);
  const results = [];

  for (const entry of enabled) {
    const detect = resolvers[entry.detectorFn];
    if (typeof detect !== 'function') {
      console.error(`[gauge-runner] no resolver registered for detectorFn="${entry.detectorFn}" (entry "${entry.id}") — skipping`);
      continue;
    }
    try {
      const result = await detect();
      const tripped = tripsThreshold(entry, result);
      const value = typeof result?.count === 'number' ? result.count : (result?.value ?? 'n/a');
      console.log(`GAUGE ${entry.id}=${value}`);
      results.push({ id: entry.id, value, tripped, result });
      if (tripped) await routeFinding(supabase, entry, result);
    } catch (e) {
      console.error(`[gauge-runner] detector "${entry.id}" threw (non-fatal, advisory-only): ${e?.message || e}`);
      results.push({ id: entry.id, error: e?.message || String(e) });
    }
  }

  await writeHeartbeat(supabase, results.length);

  if (JSON_MODE) console.log(JSON.stringify({ ran: results.length, results }));
  process.exit(0); // advisory: the runner itself never fails the tick
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('[gauge-runner] UNHANDLED: ' + (e?.message || e)); process.exit(0); });
}
