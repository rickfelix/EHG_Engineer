#!/usr/bin/env node
/**
 * scripts/sourcing-engine-deferred-watcher-sweep.mjs
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-DEFERRED-WATCHER-001 (FR-2/FR-3) — the deferred/blocked-on lane
 * watcher cron. DEFAULT-OFF behind SOURCING_DEFERRED_WATCHER_V1 (mirrors the adam opportunity-scan /
 * canary-trigger default-off pattern): when the flag is off it prints SUPPRESSED_FLAG_OFF and exits 0.
 *
 * When ON it re-evaluates conversion_ledger rows on a 'blocked-on-<X>' lane and, for any whose blocker
 * has CLEARED (the blocking SD completed, or a recorded non-SD descriptor cleared), re-lanes the row
 * via the pure reEvaluateBlockedCandidate (which re-routes through the shipped router). The re-lane is:
 *   - IDEMPOTENT: once re-laned off 'blocked-on-%', the row is no longer selected, so a re-run is a no-op.
 *   - ADVISORY: it only re-labels the registry lane. It does NOT create an SD and does NOT promote
 *     staged->belt — the promotion policy + chairman gate still govern actual belt entry.
 *
 * DORMANT-SAFE: conversion_ledger.lane ships via a TIER-2 migration that may be unapplied. We reuse the
 * shipped ledgerLaneColumnExists probe and no-op cleanly (exit 0) until the column lands.
 */
import { reEvaluateBlockedCandidate, isWatcherFlagEnabled } from '../lib/sourcing-engine/deferred-watcher.js';
import { ledgerLaneColumnExists } from '../lib/sourcing-engine/dedup-autostamp.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

/**
 * Run the sweep. Pure-DI (supabase + env injected) so it unit-tests without a live DB.
 *
 * @param {{ supabase:object, env?:object, dryRun?:boolean }} opts
 * @returns {Promise<{ suppressed:boolean, lane_column_missing:boolean, scanned:number,
 *   re_laned:number, stayed:number, skipped:number, dry_run:boolean, errors:Array }>}
 */
export async function runDeferredWatcherSweep({ supabase, env = process.env, dryRun = false } = {}) {
  const result = {
    suppressed: false, lane_column_missing: false,
    scanned: 0, re_laned: 0, stayed: 0, skipped: 0, dry_run: dryRun, errors: [],
  };

  if (!isWatcherFlagEnabled(env)) {
    result.suppressed = true;
    return result;
  }

  // DORMANT-SAFE: bail cleanly until the lane column migration is applied.
  const laneColumnPresent = await ledgerLaneColumnExists(supabase);
  if (!laneColumnPresent) {
    result.lane_column_missing = true;
    result.dry_run = true;
    dryRun = true;
    return result;
  }

  // Completed SD-keys = the cleared-blocker universe for SD blockers.
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: strategic_directives_v2 status=
  // 'completed' accumulates forever (never shrinks) and is already >1000 live — a capped read
  // here silently misses newer completions, causing false-negative "blocker not cleared" verdicts.
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .eq('status', 'completed')
      .order('sd_key', { ascending: true }));
  } catch (e) {
    throw new Error(`load completed SDs failed: ${e.message}`);
  }
  const completedSdKeys = new Set(sds.map((s) => s.sd_key));

  // Blocked-on registry rows. NOTE: conversion_ledger has `target_rung`, NOT `rung` (selecting a
  // non-existent column 42703-throws); and routeCandidate only passes rung THROUGH (never routes on
  // it), so we omit it entirely — the re-lane decision is identical without it.
  // Paginated too (FR-6 batch 9): the blocked-on-% lane is currently small but self-clearing is
  // watcher-dependent (default-OFF flag) — an unbounded accumulation path if the watcher is off.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('conversion_ledger')
      .select('id, source_id, title, disposition, lane')
      .like('lane', 'blocked-on-%')
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`load blocked rows failed: ${e.message}`);
  }

  for (const row of rows) {
    result.scanned++;
    try {
      const decision = reEvaluateBlockedCandidate(
        { id: row.id, lane: row.lane, classified: { source_id: row.source_id, title: row.title, disposition: row.disposition } },
        { completedSdKeys },
      );
      if (decision.action === 're-lane') {
        if (!dryRun) {
          const { error: uErr } = await supabase.from('conversion_ledger').update({ lane: decision.to }).eq('id', row.id);
          if (uErr) { result.errors.push({ id: row.id, error: uErr.message }); continue; }
        }
        result.re_laned++;
      } else if (decision.action === 'stay') {
        result.stayed++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.errors.push({ id: row.id, error: err?.message || String(err) });
    }
  }
  return result;
}

// CLI tail (FR-2): default-off, prints SUPPRESSED_FLAG_OFF + exits 0 when the flag is off.
const isMain = (() => {
  try { return isMainModule(import.meta.url); }
  catch { return false; }
})();

if (isMain) {
  (async () => {
    if (!isWatcherFlagEnabled(process.env)) {
      console.log('SUPPRESSED_FLAG_OFF (SOURCING_DEFERRED_WATCHER_V1 not enabled)');
      process.exit(0);
    }
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const dryRun = process.argv.includes('--dry-run');
    const res = await runDeferredWatcherSweep({ supabase, env: process.env, dryRun });
    if (res.lane_column_missing) {
      console.log('NO-OP: conversion_ledger.lane column is dormant (migration unapplied) — nothing to sweep.');
      process.exit(0);
    }
    console.log(`[deferred-watcher] scanned=${res.scanned} re_laned=${res.re_laned} stayed=${res.stayed} skipped=${res.skipped} dry_run=${res.dry_run} errors=${res.errors.length}`);
    if (res.errors.length) console.error(JSON.stringify(res.errors, null, 2));
    process.exit(0);
  })().catch((err) => { console.error(`[deferred-watcher] FATAL: ${err?.message || err}`); process.exit(1); });
}
