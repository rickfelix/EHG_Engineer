#!/usr/bin/env node
/**
 * SD-LEO-INFRA-OKR-KR-ALIGNMENT-WIRE-001 — wire the O-2026-07 KR -> shipped-SD alignment.
 *
 * Makes V1 (Roadmap Phase 1) progress MEASURED, not asserted: the 5 O-2026-07 KRs had ZERO
 * sd_key_result_alignment rows, so there was no machine-traceable link from a KR to the shipped
 * SD that satisfies it. This inserts row-level data records into the EXISTING
 * sd_key_result_alignment table (NO structural DB change, NO new tables/columns, NO migration,
 * NO roadmap ratification). The per-KR true-state assessment lives in the V1-exit gap report:
 * docs/reports/o-2026-07-v1-exit-gap-report.md.
 *
 * FK NOTE (adversarial-review H1): sd_key_result_alignment.sd_id is a FOREIGN KEY to
 * strategic_directives_v2.id — which is a UUID for modern SDs (and the sd_key for legacy
 * key-as-id rows). So we resolve each sd_key -> its .id at runtime and insert the id, NOT the
 * raw sd_key (inserting the sd_key would throw a foreign_key_violation for the modern SDs).
 *
 * HONESTY (adversarial-review M1): only the ACHIEVED KR (KR-01) gets contribution_type='direct';
 * the four pending KRs get 'enabling'/'supporting' — the SDs ship the enabling substrate/capability,
 * not the completed KR outcome.
 *
 * IDEMPOTENT: skip-existing on (sd_id, key_result_id) — a re-run inserts nothing.
 *
 * Usage:
 *   node scripts/okr/wire-o-2026-07-kr-alignment.mjs            # dry-run preview
 *   node scripts/okr/wire-o-2026-07-kr-alignment.mjs --apply    # execute the inserts
 */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const CREATED_BY = 'wire-o-2026-07-kr-alignment.mjs';

// O-2026-07 KR uuids (verified live 2026-06-15 in key_results).
const KR = Object.freeze({
  K01_SUPPORT_TRIAGE: '793bce52-21d9-4708-84ab-58f2a5dc2137',  // achieved 1/1
  K02_BREAKAGE: 'b281b281-6bd1-4e3c-b59b-36a9af6fcb63',        // pending 0/90 %
  K03_SPIKE_REHEARSAL: '9807e65c-e590-4846-b2af-b33ec99c3eaf', // pending 0/1
  K04_FIRST_REVENUE: 'a43a5f5b-0564-474e-bc48-2cd4e9454452',   // pending 0/1
  K05_DISTANCE_TO_QUIT: '9a6e9cb1-1c0e-4b5f-8e8f-610a8cbdcd57', // pending 0/1
});

const VALID_CONTRIBUTION_TYPES = new Set(['direct', 'enabling', 'supporting']);

/**
 * Canonical KR -> SD alignment for O-2026-07. Each SD is COMPLETED (verified live) and grounded in
 * the SD's own rationale (BREAKAGE/SOLO-OPERATOR/PAYMENT-RAIL/ONE-ROADMAP cite their KR codes;
 * VISION-LADDER ships the literal Distance-to-Quit gauge). 'direct' is reserved for the achieved KR.
 */
const ALIGNMENTS = Object.freeze([
  { key_result_id: KR.K01_SUPPORT_TRIAGE, sd_key: 'SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001', contribution_type: 'direct', alignment_confidence: 0.95,
    contribution_note: 'Ships the venture-agnostic support intake->triage->route pipeline end-to-end (no operator-in-loop happy path) — KR-2026-07-01 (achieved 1/1).' },
  { key_result_id: KR.K02_BREAKAGE, sd_key: 'SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001', contribution_type: 'enabling', alignment_confidence: 0.85,
    contribution_note: 'Builds the internal breakage detector + surface board (orchestrator + 6 children A-F); the SD rationale explicitly cites KR-2026-07-02. Enabling, not direct: the 90%-before-customer metric is 0/90 (unmeasured — needs incident-attribution + real customer traffic).' },
  { key_result_id: KR.K03_SPIKE_REHEARSAL, sd_key: 'SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001', contribution_type: 'enabling', alignment_confidence: 0.85,
    contribution_note: 'Ships solo-operator machine-continuity (~80%) + the spike-rehearsal capability (npm continuity:spike-rehearsal); the SD rationale cites KR-2026-07-03. Enabling, not direct: the rehearsal run+documentation (0/1) is unexecuted.' },
  { key_result_id: KR.K04_FIRST_REVENUE, sd_key: 'SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001', contribution_type: 'enabling', alignment_confidence: 0.85,
    contribution_note: 'Lays the payment-rail foundation (the critical path to first dollar; the SD rationale cites KR-2026-07-04). A live revenue-pathway venture (offer+payment live, 0/1) is genuinely pending net-new (irreducible external latency: state filing, Stripe underwriting).' },
  { key_result_id: KR.K04_FIRST_REVENUE, sd_key: 'SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001', contribution_type: 'supporting', alignment_confidence: 0.7,
    contribution_note: 'Adds the structured replacement-net INPUT substrate so the first real dollar lands as net-income data (not a raw charge) — supports KR-2026-07-04.' },
  { key_result_id: KR.K05_DISTANCE_TO_QUIT, sd_key: 'SD-LEO-INFRA-VISION-LADDER-V1-001', contribution_type: 'enabling', alignment_confidence: 0.85,
    contribution_note: 'Ships the literal Distance-to-Quit gauge line on the hourly chairman exec-email (the North-Star tracker) — the most-direct contributor to KR-2026-07-05. Enabling, not direct: chairman-surface liveness is partial and the gauge is projection-fed until a real dollar lands.' },
  { key_result_id: KR.K05_DISTANCE_TO_QUIT, sd_key: 'SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001', contribution_type: 'enabling', alignment_confidence: 0.8,
    contribution_note: 'The Vision Denominator Registry / one-roadmap build-% gauge that feeds the distance-to-quit surface; the SD explicitly cites KR-2026-07-05. Some gauge migrations remain dormant (chairman-gated).' },
  { key_result_id: KR.K05_DISTANCE_TO_QUIT, sd_key: 'SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001', contribution_type: 'supporting', alignment_confidence: 0.7,
    contribution_note: 'Provides the structured replacement-net substrate the distance-to-quit gauge reads (net $ input) — supports KR-2026-07-05.' },
]);

/**
 * Pure: build the alignment row objects keyed by sd_key (no DB id resolution yet). Testable; no I/O.
 * @returns {Array<object>}
 */
export function buildAlignmentRows() {
  return ALIGNMENTS.map((a) => ({
    sd_key: a.sd_key,
    key_result_id: a.key_result_id,
    contribution_type: a.contribution_type,
    contribution_weight: 1,
    contribution_note: a.contribution_note,
    alignment_confidence: a.alignment_confidence,
    aligned_by: 'ai_auto',
    created_by: CREATED_BY,
  }));
}

/**
 * Pure: resolve sd_key -> sd_id (the FK-referenced strategic_directives_v2.id) and drop sd_key.
 * Throws if any sd_key is unresolved (so the apply fails loudly rather than on a FK violation).
 * @param {Array<object>} rows  output of buildAlignmentRows()
 * @param {Record<string,string>} idBySdKey  sd_key -> id map
 * @returns {Array<object>} rows with sd_id (FK-valid), no sd_key
 */
export function toInsertRows(rows, idBySdKey) {
  return rows.map((r) => {
    const sd_id = idBySdKey[r.sd_key];
    if (!sd_id) throw new Error(`unresolved sd_key (no strategic_directives_v2.id): ${r.sd_key}`);
    const { sd_key, ...rest } = r; // eslint-disable-line no-unused-vars
    return { sd_id, ...rest };
  });
}

/** Pure: the (sd, key_result) idempotency key — accepts pre-resolve (sd_key) or post-resolve (sd_id). */
export function alignmentKey(row) {
  return `${row.sd_id || row.sd_key}::${row.key_result_id}`;
}

export const _internals = { KR, ALIGNMENTS, VALID_CONTRIBUTION_TYPES };

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = buildAlignmentRows();
  console.log(`\n=== wire-o-2026-07-kr-alignment (${apply ? 'APPLY' : 'DRY-RUN'}) — ${rows.length} rows ===\n`);

  const supabase = createSupabaseServiceClient();

  // Resolve sd_key -> id (FK target). FATAL if any is unresolved.
  const sdKeys = [...new Set(rows.map((r) => r.sd_key))];
  const { data: sds, error: sdErr } = await supabase.from('strategic_directives_v2').select('sd_key, id').in('sd_key', sdKeys);
  if (sdErr) { console.error('FATAL: resolve sd_key->id failed:', sdErr.message); process.exit(1); }
  const idBySdKey = Object.fromEntries((sds || []).map((r) => [r.sd_key, r.id]));
  const missing = sdKeys.filter((k) => !idBySdKey[k]);
  if (missing.length) { console.error('FATAL: unresolved sd_keys (not in strategic_directives_v2):', missing.join(', ')); process.exit(1); }

  const insertRows = toInsertRows(rows, idBySdKey);

  // Skip-existing on (sd_id, key_result_id).
  const krIds = [...new Set(insertRows.map((r) => r.key_result_id))];
  const { data: existing, error: exErr } = await supabase.from('sd_key_result_alignment').select('sd_id, key_result_id').in('key_result_id', krIds);
  if (exErr) { console.error('FATAL: read existing failed:', exErr.message); process.exit(1); }
  const have = new Set((existing || []).map(alignmentKey));

  for (const r of insertRows) {
    const status = have.has(alignmentKey(r)) ? 'EXISTS (skip)' : (apply ? 'INSERT' : 'would insert');
    const aln = rows.find((x) => idBySdKey[x.sd_key] === r.sd_id && x.key_result_id === r.key_result_id);
    console.log(`  [${status}] ${r.key_result_id.slice(0, 8)} <- ${aln.sd_key} (${r.contribution_type})  [sd_id=${String(r.sd_id).slice(0, 12)}]`);
  }

  const toInsert = insertRows.filter((r) => !have.has(alignmentKey(r)));
  if (!toInsert.length) { console.log(`\nNothing to insert — all ${insertRows.length} alignments already present (idempotent no-op).`); return; }
  if (!apply) { console.log(`\n=== DRY-RUN — re-run with --apply to insert ${toInsert.length} row(s) ===\n`); return; }

  const { error: insErr } = await supabase.from('sd_key_result_alignment').insert(toInsert);
  if (insErr) { console.error('FATAL: insert failed:', insErr.message); process.exit(1); }
  console.log(`\n=== APPLIED — inserted ${toInsert.length} alignment row(s) ===\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}
