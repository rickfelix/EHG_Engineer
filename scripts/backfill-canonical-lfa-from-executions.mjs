// @wire-check-exempt: one-off, gated completion-integrity backfill CLI — dry-run by default, the
// --apply (123 corroborated ghosts) is run manually under human/coordinator review (no production
// caller by design). The pure logic (buildCanonicalLfaRow, isBackfillable) is unit-tested.
/**
 * SD-REFILL-00LTDQZ5 — backfill the canonical sd_phase_handoffs LEAD-FINAL-APPROVAL accept row for
 * COMPLETION GHOSTS whose approval genuinely ran.
 *
 * A ghost = a completed SD with an ACCEPTED leo_handoff_executions LFA row (the approval happened +
 * was recorded in the execution table) but NO accepted sd_phase_handoffs LFA row (the canonical
 * write was skipped — cross-repo / pre-#4681-ordering completions). Witnessed: cross-repo child
 * SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-E (target_application=EHG, score 99). The LFA executor's
 * canonical write is already repo-agnostic, so this is a HISTORICAL backfill, not a recorder fix.
 *
 * HONESTY: we ONLY backfill where the approval is CORROBORATED by an accepted execution row — the
 * score/accepted_at are copied from it; an SD without that corroboration is NEVER touched (no
 * fabricated approval evidence). The write uses created_by='ADMIN_OVERRIDE' — the enforce_is_working
 * _on_for_handoffs trigger's own documented escape for a completed/unclaimed SD.
 *
 * Dry-run by default; --apply to write. Idempotent (re-checks the missing-canonical condition).
 */
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the completed-SD scan below is
// UNBOUNDED-PROCESSED (strategic_directives_v2 grows without bound); paginate to completion so
// a capped read never silently under-counts the backfill target set.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const LFA = 'LEAD-FINAL-APPROVAL';

// Pure: build the canonical sd_phase_handoffs insert payload from the corroborating execution row.
// Parity with the LFA executor's pre-completion canonical write (lead-final-approval/index.js).
export function buildCanonicalLfaRow(sd, executionRow) {
  const score = Number.isFinite(executionRow?.validation_score) ? executionRow.validation_score : null;
  return {
    sd_id: sd.id,
    from_phase: 'LEAD',
    to_phase: 'LEAD', // APPROVAL->LEAD coercion (sd_phase_handoffs to_phase CHECK)
    handoff_type: LFA,
    status: 'accepted',
    executive_summary: `Canonical LEAD-FINAL-APPROVAL row backfilled for ${sd.sd_key} from corroborating leo_handoff_executions evidence (score ${score}). The approval ran (accepted execution row) but the canonical sd_phase_handoffs row was skipped (cross-repo / historical). SD-REFILL-00LTDQZ5.`,
    deliverables_manifest: { items: [{ name: 'final approval accepted (backfilled from execution evidence)', status: 'completed' }] },
    key_decisions: [{ decision: `Final approval corroborated by accepted leo_handoff_executions row (validation score ${score})` }],
    known_issues: [{ issue: 'None — canonical record backfilled from corroborating evidence' }],
    resource_utilization: { execution_table: 'leo_handoff_executions' },
    action_items: [{ item: 'None — completion-integrity record reconciled' }],
    completeness_report: { validation_score: score },
    validation_score: score,
    validation_passed: true,
    validation_details: { written_by: 'backfill-canonical-lfa-from-executions.mjs (corroborated)' },
    accepted_at: executionRow?.accepted_at || executionRow?.created_at || new Date().toISOString(),
    created_by: 'ADMIN_OVERRIDE', // documented trigger escape for a completed/unclaimed SD
    metadata: {
      canonical_backfill: true,
      source: 'leo_handoff_executions corroboration',
      sd_ref: 'SD-REFILL-00LTDQZ5',
      target_application: sd.target_application || null,
    },
  };
}

// Pure: is this SD backfillable? Only when the approval is corroborated AND the canonical row is
// missing. Uncorroborated ghosts (no accepted execution row) are excluded — never fabricate.
export function isBackfillable({ hasExecAccepted, hasCanonicalAccepted }) {
  return Boolean(hasExecAccepted) && !hasCanonicalAccepted;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const sb = createClient(url, key);

  // Corroborated ghosts: completed + accepted execution LFA row + no accepted canonical LFA row.
  // Set-based (3 bulk reads) to avoid an N+1 query per completed SD.
  const fetchAcceptedSdIds = async (table) => {
    const ids = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await sb.from(table)
        .select('sd_id').eq('handoff_type', LFA).eq('status', 'accepted')
        .range(from, from + 999);
      if (e) { console.error(`${table} query failed:`, e.message); process.exit(1); }
      for (const r of data || []) if (r.sd_id) ids.add(r.sd_id);
      if (!data || data.length < 1000) break;
    }
    return ids;
  };
  let completed;
  try {
    completed = await fetchAllPaginated(() => sb
      .from('strategic_directives_v2')
      .select('id, sd_key, target_application')
      .eq('status', 'completed')
      .order('id', { ascending: true }));
  } catch (e) { console.error('query failed:', e.message); process.exit(1); }
  const [execAccepted, canonAccepted] = await Promise.all([
    fetchAcceptedSdIds('leo_handoff_executions'),
    fetchAcceptedSdIds('sd_phase_handoffs'),
  ]);

  const targets = (completed || []).filter(sd => isBackfillable({
    hasExecAccepted: execAccepted.has(sd.id),
    hasCanonicalAccepted: canonAccepted.has(sd.id),
  }));

  const crossRepo = targets.filter(t => t.target_application && t.target_application !== 'EHG_Engineer').length;
  console.log(`[backfill-canonical-lfa] corroborated ghosts: ${targets.length} (cross-repo: ${crossRepo})  mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  if (!APPLY) {
    for (const t of targets.slice(0, 40)) console.log(`  would-backfill ${t.sd_key} (${t.target_application})`);
    if (targets.length > 40) console.log(`  …and ${targets.length - 40} more`);
    console.log('\nDRY RUN — re-run with --apply to write the canonical rows.');
    return;
  }

  let written = 0, skipped = 0, failed = 0;
  for (const sd of targets) {
    // re-check immediately before write (idempotent under concurrency)
    const { count: canonNow } = await sb.from('sd_phase_handoffs').select('*', { count: 'exact', head: true })
      .eq('sd_id', sd.id).eq('handoff_type', LFA).eq('status', 'accepted');
    if ((canonNow || 0) > 0) { skipped++; continue; }
    const { data: exec } = await sb.from('leo_handoff_executions')
      .select('validation_score, accepted_at, created_at')
      .eq('sd_id', sd.id).eq('handoff_type', LFA).eq('status', 'accepted')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!exec) { skipped++; continue; } // corroboration vanished — never fabricate
    const { error: insErr } = await sb.from('sd_phase_handoffs').insert(buildCanonicalLfaRow(sd, exec));
    if (insErr) { failed++; console.log(`  ✗ ${sd.sd_key}: ${insErr.message}`); }
    else { written++; }
  }
  console.log(`[backfill-canonical-lfa] APPLIED: written=${written} skipped=${skipped} failed=${failed}`);

  // QF-20260705-478: leave a durable run-evidence row so "did it run, and with what result" is
  // answerable next time without re-deriving it from git blame — best-effort, never fails the run.
  try {
    const { error: evErr } = await sb.from('audit_log').insert({
      event_type: 'backfill_run',
      entity_type: 'script_run',
      entity_id: 'backfill-canonical-lfa-from-executions',
      metadata: { script: 'backfill-canonical-lfa-from-executions.mjs', corroborated: targets.length, cross_repo: crossRepo, written, skipped, failed },
      severity: failed > 0 ? 'warning' : 'info',
      created_by: 'backfill-canonical-lfa-from-executions.mjs',
    });
    if (evErr) console.warn('[backfill-canonical-lfa] run-evidence write skipped (non-fatal):', evErr.message);
  } catch (e) { console.warn('[backfill-canonical-lfa] run-evidence write skipped (non-fatal):', e.message); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('[backfill-canonical-lfa] error:', e.message); process.exit(1); });
}
