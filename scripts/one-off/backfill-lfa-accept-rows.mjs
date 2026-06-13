#!/usr/bin/env node
/**
 * SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 (FR-2) — ghost-completion backfill.
 *
 * Every recorder-path completion since 2026-04-26 skipped the canonical
 * sd_phase_handoffs write for LEAD-FINAL-APPROVAL (fixed forward in PR #4674).
 * This script repairs the backlog: for each completed SD flagged
 * is_ghost_completed=true in v_sd_completion_integrity that has an ACCEPTED
 * leo_handoff_executions LFA row, synthesize the missing accepted
 * sd_phase_handoffs row (to_phase coerced APPROVAL->LEAD, provenance in
 * metadata.backfilled_from). Ghosts WITHOUT an accepted executions row are
 * skipped and reported — never synthesized from nothing.
 *
 * Idempotent: SDs already holding an accepted canonical LFA row are skipped.
 * Dry-run by default.
 *
 * Usage:
 *   node scripts/one-off/backfill-lfa-accept-rows.mjs                 # dry-run, full backlog
 *   node scripts/one-off/backfill-lfa-accept-rows.mjs --sd <SD-KEY>   # target one SD
 *   node scripts/one-off/backfill-lfa-accept-rows.mjs --execute       # apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const execute = process.argv.includes('--execute');
const sdArgIdx = process.argv.indexOf('--sd');
const targetSd = sdArgIdx > -1 ? process.argv[sdArgIdx + 1] : null;

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PostgREST caps at 1000 rows/page — paginate the ghost list (the audit
// script's silent 1000-row clamp is a known trap; don't repeat it here).
async function fetchAllGhosts() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from('v_sd_completion_integrity')
      .select('id, sd_key, uuid_id, is_ghost_completed')
      .eq('is_ghost_completed', true)
      .range(from, from + 999);
    if (targetSd) q = q.eq('sd_key', targetSd);
    const { data, error } = await q;
    if (error) { console.error('ghost query failed:', error.message); process.exit(1); }
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const ghosts = await fetchAllGhosts();
console.log(`ghosts in scope: ${ghosts.length}${targetSd ? ` (target ${targetSd})` : ''}`);

let synthesized = 0, skippedNoSource = 0, skippedAlreadyCanonical = 0, failed = 0;
const noSource = [];

for (const g of ghosts) {
  // sd_phase_handoffs.sd_id FK references strategic_directives_v2.id — a
  // mixed-format TEXT PK (uuid for most rows, sd_key string for auto-filed
  // eras). The view's `id` IS that PK; uuid_id may be derived and non-FK-valid.
  const sdPk = g.id;
  const sdUuid = g.uuid_id || g.id;

  // Idempotency: skip if an accepted canonical LFA row already exists.
  const { data: existing } = await db.from('sd_phase_handoffs')
    .select('id').in('sd_id', [...new Set([sdPk, sdUuid, g.sd_key].filter(Boolean))])
    .eq('handoff_type', 'LEAD-FINAL-APPROVAL').eq('status', 'accepted').limit(1);
  if (existing && existing.length > 0) { skippedAlreadyCanonical += 1; continue; }

  // Source of truth: the accepted executions row written by the recorder.
  // leo_handoff_executions.sd_id is mixed-format across eras (uuid OR sd_key
  // string — verified live 2026-06-12), so match either.
  const { data: exec } = await db.from('leo_handoff_executions')
    .select('id, validation_score, validation_details, accepted_at, created_at')
    .in('sd_id', [...new Set([sdPk, sdUuid, g.sd_key].filter(Boolean))])
    .eq('handoff_type', 'LEAD-FINAL-APPROVAL').eq('status', 'accepted')
    .order('created_at', { ascending: false }).limit(1);
  if (!exec || exec.length === 0) { skippedNoSource += 1; noSource.push(g.sd_key); continue; }
  const src = exec[0];

  if (!execute) { synthesized += 1; continue; }

  const { error: insErr } = await db.from('sd_phase_handoffs').insert({
    id: randomUUID(),
    sd_id: sdPk,
    from_phase: 'LEAD',
    to_phase: 'LEAD', // coerced: completion actions have no transition target
    handoff_type: 'LEAD-FINAL-APPROVAL',
    status: 'accepted',
    accepted_at: src.accepted_at || src.created_at,
    validation_score: src.validation_score ?? 100,
    validation_passed: true,
    validation_details: src.validation_details || {},
    executive_summary: 'Backfilled accepted LEAD-FINAL-APPROVAL (SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 FR-2): the recorder-path COMPLETION_ACTIONS skip omitted the canonical write; synthesized from the accepted leo_handoff_executions row.',
    deliverables_manifest: 'See source execution row (metadata.backfilled_from).',
    key_decisions: 'Backfill reconciliation — no new decisions.',
    known_issues: '',
    resource_utilization: '',
    action_items: '',
    completeness_report: 'Synthesized from accepted execution evidence.',
    metadata: { backfilled_from: src.id, backfill_sd: 'SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001', backfilled_at: new Date().toISOString() },
    // ADMIN_OVERRIDE: the working-on trigger's documented administrative path —
    // backfilled SDs are long completed, so no session claim can exist.
    created_by: 'ADMIN_OVERRIDE',
  });
  if (insErr) { failed += 1; console.error(`  FAIL ${g.sd_key}: ${insErr.message}`); }
  else synthesized += 1;
}

console.log(`${execute ? 'EXECUTED' : 'DRY-RUN'} summary: synthesized=${synthesized} already_canonical=${skippedAlreadyCanonical} no_source=${skippedNoSource} failed=${failed}`);
if (noSource.length) console.log(`no-source ghosts (left flagged, need investigation): ${noSource.slice(0, 20).join(', ')}${noSource.length > 20 ? ` …+${noSource.length - 20}` : ''}`);
