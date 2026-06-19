#!/usr/bin/env node
/**
 * SD-EHG-VISION-V2-AUTONOMOUS-MARKETING-CAPABILITY-001 (FR-1) — RATIFY the chairman-approved V2
 * vision capability 'Autonomous customer acquisition & distribution' by recording ONE row in the
 * EXISTING vision_ladder_criteria table at the EXISTING **inactive** V2 rung.
 *
 * COHERENCE-SAFE (the crux): the build gauge (lib/vision/vdr-registry.js) reads criteria via
 * dbVisionSource, which selects ONLY the is_active=true rung (V1); assertRegistryCoherence then
 * compares VDR_REGISTRY to that active set. An inactive-V2 criteria row is therefore NEVER in the
 * parsed set — invisible to the V1 gauge. So:
 *   - This script REFUSES to run if the V2 rung is somehow active (an active rung would demand a
 *     matching VDR_REGISTRY probe; inserting without one would withhold the whole gauge).
 *   - FR-2 deliberately does NOT add a VDR_REGISTRY probe now. The intended probe at V2-activation:
 *       AUTONOMOUS_CAMPAIGN_EXECUTION = code_grep proving lib/eva (or an orchestrator) invokes
 *       publisher.publish()/content-pipeline.executePipeline() from the S24 launch path (today: zero
 *       refs -> would honestly read unbuilt). Secondary candidates (chairman picks at activation):
 *       DISTRIBUTION_CHANNEL_LIVE_COUNT, VENTURE_CUSTOMER_COHORT.
 *
 * IDEMPOTENT: skip-existing on (rung_id, capability) — a re-run inserts nothing.
 *
 * Usage:
 *   node scripts/okr/seed-v2-autonomous-marketing-criteria.mjs            # dry-run preview
 *   node scripts/okr/seed-v2-autonomous-marketing-criteria.mjs --apply    # execute the insert
 */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

/** The single ratified V2 criteria row (capability text is the chairman-ratified label). */
export const V2_CRITERION = Object.freeze({
  ordinal: 1,
  capability: 'Autonomous customer acquisition & distribution',
  today:
    'marketing/distribution is automated at the PLANNING layer only (stages produce strategy/copy/config/playbook artifacts); EXECUTION is unwired — the lib/marketing publisher (X/Bluesky), content-pipeline.executePipeline(), and email-campaigns infra is built but ORPHANED (lib/eva has zero refs); S24 Go-Live records status=activated but invokes no publish/announce/campaign API',
  required:
    'a venture autonomously runs real campaigns, publishes content, registers/activates real distribution channels, and runs ongoing growth WITHOUT the chairman',
});

/** Pure: build the criteria row object for the V2 rung. Testable; no I/O. */
export function buildV2CriteriaRow(rungId) {
  return {
    rung_id: rungId,
    ordinal: V2_CRITERION.ordinal,
    capability: V2_CRITERION.capability,
    today: V2_CRITERION.today,
    required: V2_CRITERION.required,
  };
}

/** Pure: the (rung_id, capability) idempotency key. */
export function criteriaKey(row) {
  return `${row.rung_id}::${row.capability}`;
}

export const _internals = { V2_CRITERION };

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createSupabaseServiceClient();

  // Resolve the V2 rung at runtime by rung_key (the id is gen_random_uuid() at seed time, not a
  // stable literal). REFUSE if it is active — ratifying onto an active rung would require a matching
  // VDR_REGISTRY probe and, without one, withhold the whole gauge (the exact failure FR-2 avoids).
  const { data: rung, error: rungErr } = await supabase
    .from('vision_ladder_rungs')
    .select('id, rung_key, is_active')
    .eq('rung_key', 'V2')
    .maybeSingle();
  if (rungErr) { console.error('FATAL: V2-rung lookup failed:', rungErr.message); process.exit(1); }
  if (!rung) { console.error("FATAL: no V2 rung (vision_ladder_rungs rung_key='V2') — cannot ratify"); process.exit(1); }
  if (rung.is_active !== false) {
    console.error(`FATAL: V2 rung is_active=${rung.is_active} — refusing to add a coherence-bearing criterion to an ACTIVE rung without a matching VDR_REGISTRY probe (FR-2)`);
    process.exit(1);
  }
  const rungId = rung.id;
  const row = buildV2CriteriaRow(rungId);
  console.log(`\n=== seed-v2-autonomous-marketing-criteria (${apply ? 'APPLY' : 'DRY-RUN'}) — rung ${rungId.slice(0, 8)} (V2, inactive) ===\n`);

  // Skip-existing on (rung_id, capability).
  const { data: existing, error: exErr } = await supabase
    .from('vision_ladder_criteria')
    .select('rung_id, capability')
    .eq('rung_id', rungId);
  if (exErr) { console.error('FATAL: read existing criteria failed:', exErr.message); process.exit(1); }
  const have = new Set((existing || []).map(criteriaKey));

  if (have.has(criteriaKey(row))) {
    console.log(`  [EXISTS (skip)] ordinal ${row.ordinal} <- '${row.capability}'\nNothing to insert — already ratified (idempotent no-op).`);
    return;
  }
  console.log(`  [${apply ? 'INSERT' : 'would insert'}] ordinal ${row.ordinal} <- '${row.capability}'`);
  if (!apply) { console.log(`\n=== DRY-RUN — re-run with --apply to insert ===\n`); return; }

  const { error: insErr } = await supabase.from('vision_ladder_criteria').insert(row);
  if (insErr) { console.error('FATAL: insert failed:', insErr.message); process.exit(1); }
  console.log(`\n=== APPLIED — ratified the V2 capability (1 criteria row) ===\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}
