// @wire-check-exempt: one-off historical data backfill CLI -- dry-run by default, --apply is run
// manually under coordinator/human review. Pure logic (deriveHistoricalPhase) is unit-tested.
/**
 * SD-LEO-INFRA-EVIDENCE-PHASE-NEVER-NULL-001 -- backfill the ~24,400 historical
 * sub_agent_execution_results rows with phase=null.
 *
 * SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 (shipped) stopped NEW writes from landing
 * null on the canonical write path, but did nothing for rows already written before it
 * shipped. This script derives a historical phase for each null row:
 *   (a) metadata.phase, if already set (cheapest, most accurate -- no query needed)
 *   (b) otherwise, the most recent ACCEPTED sd_phase_handoffs row for that SD with
 *       COALESCE(accepted_at, created_at) <= the evidence row's created_at (i.e. "the
 *       phase this SD was actually in when the evidence was recorded"), using that
 *       handoff's to_phase. Tie-broken by id DESC on an exact-timestamp collision (73
 *       sampled sd_id groups have >1 accepted handoff sharing the same coalesced
 *       timestamp -- TESTING sub-agent finding, PLAN_PRD phase).
 *   (c) fallback sentinel: 'LEAD' when sd_id is set but no bracketing handoff exists
 *       (evidence written before any handoff was ever accepted for that SD);
 *       'UNKNOWN_HISTORICAL' when sd_id itself is null/un-derivable.
 *
 * current_phase (the SD's CURRENT state) is deliberately NOT used here -- it would
 * misattribute nearly all rows for completed/cancelled SDs to a terminal phase they
 * were never actually in at write time (VALIDATION sub-agent finding, LEAD phase).
 *
 * status='accepted' is a hard filter (12,571 rejected + 1,118 blocked handoffs exist
 * fleet-wide and must never be treated as evidence of a completed phase transition).
 *
 * Dry-run by default; --apply to write. Idempotent (only ever touches rows still
 * phase=null at run time; re-running after a successful apply is a no-op).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { normalizePhaseToken } from '../lib/sub-agent-executor/phase-token.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

/**
 * Pure: derive a historical phase for one null-phase row.
 * @param {{sd_id: string|null, created_at: string, metadata: object|null}} row
 * @param {Array<{to_phase: string, accepted_at: string|null, created_at: string, id: string}>} sortedHandoffsForSd
 *   Handoffs for row.sd_id, status='accepted', PRE-SORTED by
 *   COALESCE(accepted_at, created_at) DESC, then id DESC (caller's responsibility --
 *   see sortHandoffs below).
 * @returns {{phase: string, source: 'metadata'|'handoff'|'fallback_lead'|'fallback_unknown'}}
 */
export function deriveHistoricalPhase(row, sortedHandoffsForSd) {
  const metaPhase = typeof row?.metadata?.phase === 'string' && row.metadata.phase.trim();
  if (metaPhase) {
    return { phase: normalizePhaseToken(metaPhase), source: 'metadata' };
  }

  if (!row?.sd_id) {
    return { phase: 'UNKNOWN_HISTORICAL', source: 'fallback_unknown' };
  }

  const rowCreatedAt = new Date(row.created_at).getTime();
  const bracketing = (sortedHandoffsForSd || []).find((h) => {
    const windowTs = new Date(h.accepted_at || h.created_at).getTime();
    return windowTs <= rowCreatedAt;
  });

  if (bracketing) {
    return { phase: normalizePhaseToken(bracketing.to_phase), source: 'handoff' };
  }

  return { phase: 'LEAD', source: 'fallback_lead' };
}

/** Sort handoffs by COALESCE(accepted_at, created_at) DESC, then id DESC (deterministic tie-break). */
export function sortHandoffs(handoffs) {
  return [...(handoffs || [])].sort((a, b) => {
    const aTs = new Date(a.accepted_at || a.created_at).getTime();
    const bTs = new Date(b.accepted_at || b.created_at).getTime();
    if (bTs !== aTs) return bTs - aTs;
    return String(b.id).localeCompare(String(a.id));
  });
}

async function fetchAllPaginated(sb, table, selectCols, applyFilters) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = sb.from(table).select(selectCols);
    query = applyFilters(query);
    const { data, error } = await query.range(from, from + 999);
    if (error) { console.error(`${table} query failed:`, error.message); process.exit(1); }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {boolean} apply - false runs dry-run (zero writes)
 */
export async function main(sb, apply = APPLY) {
  console.log(`[backfill-null-phase] mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

  const nullRows = await fetchAllPaginated(sb, 'sub_agent_execution_results', 'id, sd_id, created_at, metadata',
    (q) => q.is('phase', null));
  console.log(`[backfill-null-phase] found ${nullRows.length} null-phase rows`);

  const sdIds = [...new Set(nullRows.map((r) => r.sd_id).filter(Boolean))];
  const handoffsBySd = new Map();
  for (const sdId of sdIds) handoffsBySd.set(sdId, []);
  if (sdIds.length > 0) {
    // Bulk-fetch accepted handoffs for exactly the SDs we need, in chunks of 50 ids per query
    // (small enough that even the SD with the most accepted handoffs -- 10, per a live-data
    // sample -- keeps a chunk's total well under Supabase's 1000-row default page size), each
    // paginated in its own right in case a chunk's combined handoff count still exceeds 1000.
    for (let i = 0; i < sdIds.length; i += 50) {
      const chunk = sdIds.slice(i, i + 50);
      const chunkHandoffs = await fetchAllPaginated(sb, 'sd_phase_handoffs', 'sd_id, to_phase, accepted_at, created_at, id',
        (q) => q.eq('status', 'accepted').in('sd_id', chunk));
      for (const h of chunkHandoffs) {
        if (!handoffsBySd.has(h.sd_id)) handoffsBySd.set(h.sd_id, []);
        handoffsBySd.get(h.sd_id).push(h);
      }
    }
    for (const [sdId, handoffs] of handoffsBySd) handoffsBySd.set(sdId, sortHandoffs(handoffs));
  }

  const derived = nullRows.map((row) => ({
    id: row.id,
    ...deriveHistoricalPhase(row, handoffsBySd.get(row.sd_id)),
  }));

  const bySource = derived.reduce((acc, d) => { acc[d.source] = (acc[d.source] || 0) + 1; return acc; }, {});
  console.log('[backfill-null-phase] derivation breakdown:', JSON.stringify(bySource));

  if (!apply) {
    console.log('[backfill-null-phase] sample (first 10):');
    for (const d of derived.slice(0, 10)) console.log(`  ${d.id} -> phase='${d.phase}' (${d.source})`);
    console.log('\nDRY RUN -- re-run with --apply to write.');
    return { found: nullRows.length, bySource, written: 0, failed: 0, applied: false };
  }

  // Group by derived phase value so each write is a single bulk UPDATE covering many rows
  // (one round-trip per BATCH_SIZE-sized id chunk within a phase group) instead of one
  // network round-trip per row -- 24k+ individual updates would take far too long.
  const idsByPhase = new Map();
  for (const d of derived) {
    if (!idsByPhase.has(d.phase)) idsByPhase.set(d.phase, []);
    idsByPhase.get(d.phase).push(d.id);
  }

  let written = 0, failed = 0;
  for (const [phase, ids] of idsByPhase) {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      // Idempotent re-check via .is('phase', null): only rows still null get touched
      // (protects against concurrent writers landing a phase on a row between fetch and write).
      const { data, error } = await sb.from('sub_agent_execution_results')
        .update({ phase, updated_at: new Date().toISOString() })
        .in('id', chunk)
        .is('phase', null)
        .select('id');
      if (error) { failed += chunk.length; console.log(`  ✗ batch (phase=${phase}, ${chunk.length} ids): ${error.message}`); }
      else written += (data || chunk).length;
    }
  }
  console.log(`[backfill-null-phase] APPLIED: written=${written} failed=${failed}`);

  try {
    const { error: evErr } = await sb.from('audit_log').insert({
      event_type: 'backfill_run',
      entity_type: 'script_run',
      entity_id: 'backfill-null-phase-evidence',
      metadata: { script: 'backfill-null-phase-evidence.mjs', found: nullRows.length, by_source: bySource, written, failed },
      severity: failed > 0 ? 'warning' : 'info',
      created_by: 'backfill-null-phase-evidence.mjs',
    });
    if (evErr) console.warn('[backfill-null-phase] run-evidence write skipped (non-fatal):', evErr.message);
  } catch (e) { console.warn('[backfill-null-phase] run-evidence write skipped (non-fatal):', e.message); }

  return { found: nullRows.length, bySource, written, failed, applied: true };
}

async function run() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  await main(createClient(url, key), APPLY);
}

if (isMainModule(import.meta.url)) {
  run();
}
