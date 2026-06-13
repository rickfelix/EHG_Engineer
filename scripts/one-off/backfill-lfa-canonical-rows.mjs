#!/usr/bin/env node
/**
 * backfill-lfa-canonical-rows.mjs — SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 (b)
 *
 * Synthesizes accepted sd_phase_handoffs LEAD-FINAL-APPROVAL rows for ghost-completed
 * SDs from their accepted leo_handoff_executions rows. The recorder skipped the
 * canonical write since 2026-04-26 (COMPLETION_ACTIONS), so ~275 completed SDs read
 * is_ghost_completed=true despite recorded acceptances.
 *
 * Usage:
 *   node scripts/one-off/backfill-lfa-canonical-rows.mjs                # dry-run, all ghosts
 *   node scripts/one-off/backfill-lfa-canonical-rows.mjs --sd <SD-KEY>  # dry-run, one SD
 *   node scripts/one-off/backfill-lfa-canonical-rows.mjs --execute      # write (all ghosts)
 *   node scripts/one-off/backfill-lfa-canonical-rows.mjs --sd <K> --execute
 *
 * Safety: dry-run by default; only inserts where (1) the view says ghost, (2) an
 * accepted leo_handoff_executions LFA row exists, (3) no accepted sd_phase_handoffs
 * LFA row exists (idempotent re-runs). created_by='ADMIN_OVERRIDE' (the documented
 * administrative path through the sd_phase_handoffs claim-guard trigger), with
 * metadata.backfill provenance.
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const sdFilter = args.includes('--sd') ? args[args.indexOf('--sd') + 1] : null;

const supabase = createSupabaseServiceClient();

async function main() {
  let q = supabase
    .from('v_sd_completion_integrity')
    .select('sd_key, uuid_id, status, is_ghost_completed')
    .eq('is_ghost_completed', true);
  if (sdFilter) q = q.eq('sd_key', sdFilter);
  const { data: ghosts, error } = await q;
  if (error) { console.error('view read failed:', error.message); process.exit(1); }
  console.log(`${ghosts.length} ghost-completed SD(s)${sdFilter ? ` (filter ${sdFilter})` : ''} — mode: ${EXECUTE ? 'EXECUTE' : 'dry-run'}`);

  let inserted = 0, skippedNoLhe = 0, skippedHasRow = 0, failed = 0;
  for (const g of ghosts) {
    // Resolve the SD's REAL id from strategic_directives_v2 — the view's uuid_id is a
    // different surrogate and does NOT match leo_handoff_executions.sd_id (verified live).
    const { data: sdRow } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', g.sd_key)
      .maybeSingle();
    const sdId = (sdRow && sdRow.id) || g.sd_key;
    // leo_handoff_executions.sd_id is mixed-format historically (uuid for some writers,
    // sd_key for others) — match both.
    const idCandidates = [...new Set([sdId, g.sd_key].filter(Boolean))];
    const { data: lhe } = await supabase
      .from('leo_handoff_executions')
      .select('id, validation_score, accepted_at, created_by, created_at')
      .in('sd_id', idCandidates)
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1);
    if (!lhe || lhe.length === 0) { skippedNoLhe++; console.log(`  SKIP (no accepted LHE): ${g.sd_key}`); continue; }

    // Idempotency: existing accepted canonical row
    const { data: existing } = await supabase
      .from('sd_phase_handoffs')
      .select('id')
      .eq('sd_id', sdId)
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .eq('status', 'accepted')
      .limit(1);
    if (existing && existing.length > 0) { skippedHasRow++; continue; }

    const src = lhe[0];
    console.log(`  ${EXECUTE ? 'INSERT' : 'would insert'}: ${g.sd_key} (LHE ${src.id}, score ${src.validation_score})`);
    if (!EXECUTE) continue;

    const { error: insErr } = await supabase.from('sd_phase_handoffs').insert({
      sd_id: sdId,
      from_phase: 'LEAD',
      to_phase: 'LEAD', // APPROVAL->LEAD coercion, parity with the live recorder fix
      handoff_type: 'LEAD-FINAL-APPROVAL',
      status: 'accepted',
      executive_summary: `Backfill (SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001): canonical row synthesized from accepted leo_handoff_executions ${src.id} (score ${src.validation_score}). The recorder skipped the sd_phase_handoffs write for completion actions between 2026-04-26 and PR #4674, ghosting this completion.`,
      deliverables_manifest: { backfill: true, items: [{ name: 'canonical LFA row synthesized from recorded acceptance', status: 'completed' }] },
      key_decisions: [{ decision: `Backfill authorized by SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 (b): acceptance evidence = leo_handoff_executions ${src.id} (score ${src.validation_score}, accepted ${src.accepted_at || src.created_at})` }],
      known_issues: [{ issue: 'Row synthesized post-hoc; original completion-time gate context lives on the source execution row' }],
      resource_utilization: { source_execution_id: src.id },
      action_items: [{ item: 'None — historical reconciliation; recorder dual-writes going forward (PR #4674)' }],
      completeness_report: { validation_score: src.validation_score, source: 'leo_handoff_executions' },
      metadata: { backfill: true, source_execution_id: src.id, backfilled_at: new Date().toISOString(), sd_ref: 'SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001' },
      accepted_at: src.accepted_at || src.created_at,
      created_by: 'ADMIN_OVERRIDE',
      validation_score: src.validation_score,
      validation_passed: true,
      validation_details: { backfill: true },
    });
    if (insErr) { failed++; console.error(`  FAILED ${g.sd_key}: ${insErr.message}`); }
    else inserted++;
  }
  console.log(`\nDone: inserted=${inserted} skipped_no_lhe=${skippedNoLhe} skipped_existing=${skippedHasRow} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Unexpected:', e.message); process.exit(1); });
