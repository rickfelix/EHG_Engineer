#!/usr/bin/env node
/**
 * SD-LEO-INFRA-V1-CAPLAYER-PROBES-001 (FR-1) — wire the 2 capability-layer criteria into the
 * active V1 vision rung so the VDR build-% gauge measures the capabilities that literally name V1
 * ("capability-saturated"): the Capability Registry and Expertise on-demand.
 *
 * Inserts 2 row-level records into the EXISTING vision_ladder_criteria table (NO new tables/columns,
 * NO migration, NO structural change) for the active V1 rung at ordinals 21-22. The capability
 * labels are BYTE-IDENTICAL to the matching VDR_REGISTRY probes in lib/vision/vdr-registry.js — the
 * assertRegistryCoherence invariant withholds the whole gauge if they drift, so these two land
 * together (this script is run right after the registry code merges; the fail-soft withhold is the
 * safety net for the seconds-long window).
 *
 * COHERENCE / ATOMIC LANDING: merge the registry code FIRST, then run this with --apply. Until both
 * sides agree, computeBuildGauge fail-softs (available:false) rather than emit a false number.
 *
 * IDEMPOTENT: skip-existing on (rung_id, capability) — a re-run inserts nothing.
 *
 * Usage:
 *   node scripts/okr/wire-v1-caplayer-criteria.mjs            # dry-run preview
 *   node scripts/okr/wire-v1-caplayer-criteria.mjs --apply    # execute the inserts
 */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

// The active V1 rung (verified live 2026-06-15: vision_ladder_rungs is_active=true, rung_key='V1').
export const V1_RUNG_ID = '0f056dcd-2d8e-470a-8a28-921d322e6461';

/**
 * The 2 capability-layer criteria. `capability` MUST equal the VDR_REGISTRY label byte-for-byte.
 * `today`/`required` carry the honest measurement-strength framing (FR-4): the gauge probe is a
 * registry-POPULATION proxy; full routable/composition realization is the deeper, separate target.
 */
const CRITERIA = Object.freeze([
  {
    ordinal: 21,
    capability: 'Capability Registry',
    today: 'a governed, versioned capability registry exists and is substantially populated (sd_capabilities: capability_key, maturity_score, reuse tracking); its EVA-router/admission-filter routing is not yet independently verified',
    required: 'a versioned, governed, routable capability registry (EVA-router + admission filter) — the gauge probes registry population as a deterministic proxy',
  },
  {
    ordinal: 22,
    capability: 'Expertise on-demand',
    today: 'a specialist registry exists with expertise domains and deliberation history (specialist_registry: expertise_domains, total_deliberations, outcome wins/losses); live combinatorial multi-expert composition is not yet independently verified',
    required: 'on-demand combinatorial composition of multiple domain experts — the gauge probes specialist-registry population as a deterministic proxy',
  },
]);

/**
 * Pure: build the criteria row objects for a given rung. Testable; no I/O.
 * @param {string} [rungId] - the active V1 rung id (defaults to the documented V1_RUNG_ID; main()
 *   passes the LIVE-resolved id so a re-seeded DB with a different rung uuid still inserts correctly).
 * @returns {Array<{rung_id:string, ordinal:number, capability:string, today:string, required:string}>}
 */
export function buildCriteriaRows(rungId = V1_RUNG_ID) {
  return CRITERIA.map((c) => ({
    rung_id: rungId,
    ordinal: c.ordinal,
    capability: c.capability,
    today: c.today,
    required: c.required,
  }));
}

/** Pure: the (rung_id, capability) idempotency key. */
export function criteriaKey(row) {
  return `${row.rung_id}::${row.capability}`;
}

export const _internals = { V1_RUNG_ID, CRITERIA };

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createSupabaseServiceClient();

  // Resolve the ACTIVE V1 rung at runtime. The rung id is gen_random_uuid() at seed time
  // (database/migrations/20260615_vision_ladder_active_pointer.sql), so it is NOT a stable literal —
  // a re-seeded DB (fresh CI/staging) has a different uuid. Hardcoding it would FK-violate on a
  // re-seeded DB and, once the registry code is merged, withhold the gauge forever via staleProbes.
  // Resolve by is_active=true + assert rung_key='V1' (the migration's own robust pattern).
  const { data: rung, error: rungErr } = await supabase
    .from('vision_ladder_rungs')
    .select('id, rung_key, is_active')
    .eq('is_active', true)
    .maybeSingle();
  if (rungErr) { console.error('FATAL: active-rung lookup failed:', rungErr.message); process.exit(1); }
  if (!rung) { console.error('FATAL: no active vision rung (vision_ladder_rungs is_active=true) — cannot wire criteria'); process.exit(1); }
  if (rung.rung_key !== 'V1') { console.error(`FATAL: active rung is '${rung.rung_key}', expected 'V1' — refusing to wire V1 capability-layer criteria onto the wrong rung`); process.exit(1); }
  const rungId = rung.id;
  if (rungId !== V1_RUNG_ID) console.warn(`NOTE: live active V1 rung id ${rungId} differs from the documented ${V1_RUNG_ID} (re-seeded DB?) — using the LIVE id.`);

  const rows = buildCriteriaRows(rungId);
  console.log(`\n=== wire-v1-caplayer-criteria (${apply ? 'APPLY' : 'DRY-RUN'}) — ${rows.length} rows for rung ${rungId.slice(0, 8)} ===\n`);

  // Skip-existing on (rung_id, capability).
  const { data: existing, error: exErr } = await supabase
    .from('vision_ladder_criteria')
    .select('rung_id, capability, ordinal')
    .eq('rung_id', rungId);
  if (exErr) { console.error('FATAL: read existing criteria failed:', exErr.message); process.exit(1); }
  const have = new Set((existing || []).map(criteriaKey));

  for (const r of rows) {
    const status = have.has(criteriaKey(r)) ? 'EXISTS (skip)' : (apply ? 'INSERT' : 'would insert');
    console.log(`  [${status}] ordinal ${r.ordinal} <- '${r.capability}'`);
  }

  const toInsert = rows.filter((r) => !have.has(criteriaKey(r)));
  if (!toInsert.length) { console.log(`\nNothing to insert — both capability-layer criteria already present (idempotent no-op).`); return; }
  if (!apply) { console.log(`\n=== DRY-RUN — re-run with --apply to insert ${toInsert.length} row(s) ===\n`); return; }

  const { error: insErr } = await supabase.from('vision_ladder_criteria').insert(toInsert);
  if (insErr) { console.error('FATAL: insert failed:', insErr.message); process.exit(1); }
  console.log(`\n=== APPLIED — inserted ${toInsert.length} criteria row(s) ===\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}
