#!/usr/bin/env node
/**
 * scripts/sourcing-engine/gauge-gap-miner-sweep.mjs
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-GAUGE-GAP-MINER-001 (FR-5) — the VDR gauge-gap miner cron.
 * DEFAULT-OFF behind SOURCING_GAUGE_GAP_MINER_V1 (mirrors the deferred-watcher / adam opportunity-scan
 * default-off pattern): when the flag is off it prints SUPPRESSED_FLAG_OFF and exits 0.
 *
 * When ON it mines the live VDR gauge for unbuilt/partial active-rung capabilities and registers each
 * as a STAGED roadmap_wave_items candidate (router-laned, dedup-reused). It NEVER promotes staged->belt
 * and NEVER mints an SD — the chairman baseline gate governs promotion.
 *
 * DRY-RUN by default; pass --apply to write. Dormant-safe: the runner forces dry-run until BOTH the
 * roadmap_wave_items.lane column and the 'vdr_gauge' source_type CHECK migrations are applied, so it can
 * never prematurely mutate the chairman-visible roadmap.
 *
 * Usage:  npm run sourcing:gauge-gap-miner -- --dry-run     # report only (default)
 *         npm run sourcing:gauge-gap-miner -- --apply        # live (effective once migrations applied + flag on)
 */
import 'dotenv/config';
import { mineGaugeGaps, isGaugeGapMinerFlagEnabled } from '../../lib/sourcing-engine/gauge-gap-miner.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const isMain = (() => {
  try { return isMainModule(import.meta.url); }
  catch { return false; }
})();

if (isMain) {
  (async () => {
    if (!isGaugeGapMinerFlagEnabled(process.env)) {
      console.log('SUPPRESSED_FLAG_OFF (SOURCING_GAUGE_GAP_MINER_V1 not enabled)');
      process.exit(0);
    }
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const apply = process.argv.includes('--apply');
    const res = await mineGaugeGaps({ supabase, apply });
    const mode = res.dry_run ? 'DRY-RUN' : 'APPLIED';
    console.log(
      `[gauge-gap-miner] ${mode}: gaps=${res.gaps} staged=${res.staged} chairman_routed=${res.chairman_routed} ` +
      `deduped=${res.deduped} re_emit=${res.re_emit} skipped_existing=${res.skipped_existing} ` +
      `available=${res.available} wave=${res.wave_id ? res.wave_id.slice(0, 8) : 'none'} errors=${res.errors.length}`,
    );
    if (res.lane_column_missing) console.log('  note: roadmap_wave_items.lane column dormant — forced dry-run (apply the lane migration to enable lane stamping).');
    if (res.source_type_unsupported) console.log("  note: source_type CHECK does not yet admit 'vdr_gauge' — forced dry-run (apply 20260620_roadmap_wave_items_vdr_gauge_source_type.sql).");
    if (res.errors.length) for (const e of res.errors) console.warn(`  [error] ${e.capability}: ${e.error}`);
    process.exit(0);
  })().catch((err) => { console.error(`[gauge-gap-miner] FATAL: ${err?.message || err}`); process.exit(1); });
}
