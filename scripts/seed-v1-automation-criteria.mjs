#!/usr/bin/env node
/**
 * SD-LEO-INFRA-V1-AUTOMATION-PROBES-001 (FR-1) — idempotent seed of the 4 automation/intelligence
 * criteria (ordinals 17-20) into the ACTIVE V1 vision-ladder rung.
 *
 * These are DATA rows into the existing vision_ladder_criteria table (no schema change). The
 * vision_ladder_criteria_service_write RLS policy permits the service-role INSERT — no chairman
 * attestation is required for data rows. UNIQUE(rung_id, capability) makes the upsert idempotent
 * (ON CONFLICT DO NOTHING): re-running inserts 0.
 *
 * COHERENCE: the 4 capability labels MUST match the 4 new VDR_REGISTRY entries EXACTLY, or
 * assertRegistryCoherence withholds the whole gauge. SHIP SEQUENCE (FR-4): run this IMMEDIATELY
 * after the VDR_REGISTRY code merges, so the coherence-drift window stays to seconds (self-heals
 * on the hourly gauge cron).
 *
 * Usage:
 *   npm run vision:seed-v1-automation         # seed (idempotent)
 *   node scripts/seed-v1-automation-criteria.mjs --dry-run   # print rows, do NOT write
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

// The active V1 rung at authoring time. The seed resolves is_active=true dynamically AND asserts it
// equals this id, so it can NEVER write to the wrong rung if the active pointer has moved.
export const EXPECTED_V1_RUNG_ID = '0f056dcd-2d8e-470a-8a28-921d322e6461';

/**
 * PURE: the 4 automation/intelligence criteria rows for a given rung. Labels match VDR_REGISTRY exactly.
 * @param {string} rungId
 * @returns {Array<{rung_id:string, ordinal:number, capability:string, today:string, required:string}>}
 */
export function buildCriteriaRows(rungId) {
  return [
    { rung_id: rungId, ordinal: 17, capability: 'Automation-by-default',
      today: 'Auto-proceed enforcement hooks exist (pause-point lint + resume); the realized auto-proceed transition rate is unmeasured.',
      required: '>=90% of phase transitions auto-proceed without manual confirmation.' },
    { rung_id: rungId, ordinal: 18, capability: 'Active intelligence per stage',
      today: 'Stage analysis-step machinery present (getAnalysisStep / analyzeStage); per-stage activation coverage unverified.',
      required: 'Every venture stage runs an active intelligence/analysis step.' },
    { rung_id: rungId, ordinal: 19, capability: 'Cross-stage data contracts',
      today: 'Stage-contract module present (STAGE_CONTRACTS / validateCrossStageContract); enforcement across all boundaries unverified.',
      required: 'Typed data contracts validated across all stage boundaries.' },
    { rung_id: rungId, ordinal: 20, capability: 'CLI authoritative',
      today: 'Handoff CLI is the entry point (cli-main command handlers); authority over all gate/handoff ops not fully proven.',
      required: 'The CLI is the single authoritative interface for all handoff/gate operations.' },
  ];
}

/**
 * Idempotent service-role seed. Resolves the active rung, asserts it is the expected V1 rung
 * (fail-loud — never writes to a wrong/moved rung), then upserts ON CONFLICT (rung_id,capability) DO NOTHING.
 * @param {object} [io] - { supabase } injectable client (defaults to a service-role client)
 * @returns {Promise<{rungId:string, attempted:number, inserted:number}>}
 */
export async function seedV1AutomationCriteria(io = {}) {
  const supabase = io.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: rung, error: rErr } = await supabase
    .from('vision_ladder_rungs')
    .select('id, rung_key')
    .eq('is_active', true)
    .maybeSingle();
  if (rErr) throw new Error(`seed: active-rung query error: ${rErr.message}`);
  if (!rung) throw new Error('seed: no active vision rung (refusing to guess)');
  if (rung.id !== EXPECTED_V1_RUNG_ID) {
    throw new Error(`seed: active rung ${rung.id} (${rung.rung_key}) != expected V1 ${EXPECTED_V1_RUNG_ID} — refusing to write to a different rung`);
  }
  const rows = buildCriteriaRows(rung.id);
  const { data, error } = await supabase
    .from('vision_ladder_criteria')
    .upsert(rows, { onConflict: 'rung_id,capability', ignoreDuplicates: true })
    .select();
  if (error) throw new Error(`seed: upsert error: ${error.message}`);
  return { rungId: rung.id, attempted: rows.length, inserted: (data || []).length };
}

// CLI entry (reachable via package.json `vision:seed-v1-automation`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log(JSON.stringify(buildCriteriaRows(EXPECTED_V1_RUNG_ID), null, 2));
    console.log('[seed-v1-automation] --dry-run: not persisted');
  } else {
    seedV1AutomationCriteria()
      .then((r) => { console.log(`[seed-v1-automation] rung=${r.rungId} attempted=${r.attempted} inserted=${r.inserted} (idempotent)`); process.exit(0); })
      .catch((e) => { console.error('[seed-v1-automation] FAILED: ' + (e?.message || e)); process.exit(1); });
  }
}
