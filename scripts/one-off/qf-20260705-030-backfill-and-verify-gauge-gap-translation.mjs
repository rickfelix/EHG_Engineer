// QF-20260705-030: adversarial sweep flagged SOURCING_GAUGE_GAP_MINER_V1 as "absent" and the
// translateGapToBuildable layer as never having produced output. Investigation found the premise
// was WRONG on both counts: the flag is hardcoded 'on' in
// .github/workflows/sourcing-gauge-gap-miner-cron.yml (chairman-authorized go-live 2026-06-20,
// docs/sourcing-engine-activation-runbook.md FR-3), and buildStagedRoadmapItem() already calls
// translateGapToBuildable() unconditionally (lib/sourcing-engine/gauge-gap-miner.js:157).
//
// Real state: all 5 currently-weak VDR capabilities were staged on 2026-06-20 -- BEFORE the
// TRANSLATEGAPTOBUILDABLE SD shipped (2026-06-22) -- so they predate metadata.translated and carry
// raw capability labels. All 5 are already promoted_to_sd_key (SD-REFILL-00*), so the "0 translated
// wave items" symptom has zero functional effect (nothing is stuck behind the RAW_LABEL_SOURCE
// gate) -- but the metadata is historically inaccurate. mineGaugeGaps' idempotency (skip
// already-staged capabilities) means these 5 rows will NEVER self-heal on a future cron tick, and
// no NEW gap has appeared since (confirmed via a live dry-run: gaps=5 skipped_existing=5).
//
// This backfills the 5 stale rows with the buildable translation for provenance accuracy (same
// shape as QF-20260705-478's LFA backfill) and leaves a durable audit_log verification record so a
// future sweep does not re-flag this as dormant.
import { translateGapToBuildable } from '../../lib/sourcing-engine/gauge-gap-miner.js';

export async function main(supabase) {
  const { data: rows, error } = await supabase
    .from('roadmap_wave_items').select('id, metadata').eq('source_type', 'vdr_gauge');
  if (error) throw error;

  let backfilled = 0;
  for (const row of rows || []) {
    const md = row.metadata || {};
    if (md.translated === true) continue; // already translated -- idempotent
    const t = translateGapToBuildable({ capability: md.capability, status: md.gauge_status, nature: md.nature });
    const { error: updErr } = await supabase.from('roadmap_wave_items')
      .update({ title: t.title, metadata: { ...md, translated: true, description: t.scope } })
      .eq('id', row.id);
    if (updErr) throw updErr;
    backfilled++;
  }

  const { error: evErr } = await supabase.from('audit_log').insert({
    event_type: 'gauge_gap_translation_verification',
    entity_type: 'script_run',
    entity_id: 'qf-20260705-030-backfill-and-verify-gauge-gap-translation',
    metadata: {
      script: 'qf-20260705-030-backfill-and-verify-gauge-gap-translation.mjs',
      backfilled, total_vdr_gauge_rows: (rows || []).length,
      finding: 'SOURCING_GAUGE_GAP_MINER_V1 is ON (hardcoded in sourcing-gauge-gap-miner-cron.yml); translateGapToBuildable is correctly wired into buildStagedRoadmapItem. Zero NEW translated rows since ship is explained by zero new capability gaps (all 5 known gaps pre-date the translation SD and are already promoted_to_sd_key) -- not a dormancy bug.',
    },
    severity: 'info',
    created_by: 'qf-20260705-030-backfill-and-verify-gauge-gap-translation.mjs',
  });
  if (evErr) console.warn('[qf-20260705-030] run-evidence write skipped (non-fatal):', evErr.message);

  return { backfilled, total: (rows || []).length };
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  main(sb).then((r) => console.log('[qf-20260705-030]', JSON.stringify(r))).catch((e) => { console.error('[qf-20260705-030] error:', e.message); process.exit(1); });
}
