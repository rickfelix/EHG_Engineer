#!/usr/bin/env node
/**
 * proactive-populator — SD-LEO-INFRA-SOURCING-ENGINE-PROACTIVE-POPULATOR-001 (FR-1..FR-5 CLI).
 *
 * DRY-RUN BY DEFAULT: the bare command enumerates the 4 corpus sources, routes each via the shipped
 * router, and prints a per-lane / per-rung baseline REPORT (the chairman's review artifact). It
 * STAGES NOTHING. Staging requires BOTH --apply AND --chairman-approved (or POPULATOR_CHAIRMAN_APPROVED=
 * true) — and even then it only INSERTs staged roadmap_wave_items rows (item_disposition='pending');
 * it NEVER promotes staged->belt and NEVER creates an SD (those remain separate chairman-gated steps).
 *
 * Usage:  npm run sourcing:populate                         # dry-run REPORT only
 *         npm run sourcing:populate -- --apply --chairman-approved   # stage (chairman-gated)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { populate } from '../../lib/sourcing-engine/proactive-populator.js';

const apply = process.argv.includes('--apply');
const chairmanApproved = process.argv.includes('--chairman-approved') || process.env.POPULATOR_CHAIRMAN_APPROVED === 'true';
const capArg = (process.argv.find((a) => a.startsWith('--cap=')) || '').split('=')[1];

const TERMINAL_DISPOSITIONS = ['built', 'already_covered', 'duplicate', 'declined', 'deferred_to_rung'];

async function loadSources(db) {
  // 1. conversion_ledger — undispositioned backlog
  const { data: ledger } = await db.from('conversion_ledger')
    .select('id,source_pool,source_id,source_external_id,title,target_rung,dedup_match_sd_key,disposition')
    .is('disposition', null).limit(2000);
  // 2. Wave-6 (highest-rank wave of the LEO Roadmap) — already-staged items, enumerated for the report
  let wave6 = [];
  try {
    const { data: rm } = await db.from('strategic_roadmaps').select('id').eq('title', 'LEO Roadmap').eq('status', 'active').limit(1);
    if (rm && rm[0]) {
      const { data: w } = await db.from('roadmap_waves').select('id').eq('roadmap_id', rm[0].id).order('sequence_rank', { ascending: false }).limit(1);
      if (w && w[0]) {
        const { data: items } = await db.from('roadmap_wave_items')
          .select('id,source_type,source_id,title,item_disposition,promoted_to_sd_key,metadata')
          .eq('wave_id', w[0].id).limit(2000);
        wave6 = (items || []).filter((it) => !['promoted', 'dropped'].includes(it.item_disposition));
      }
    }
  } catch { /* fail-soft: wave6 stays empty */ }
  // 3. deferred V2 cluster
  const { data: deferred } = await db.from('strategic_directives_v2').select('id,sd_key,title,status,metadata').eq('status', 'deferred').limit(500);
  // 4. harness backlog (exclude auto-capture noise)
  const { data: backlogRaw } = await db.from('feedback').select('id,title,description,status,category,sd_id,metadata').eq('category', 'harness_backlog').eq('status', 'new').limit(1000);
  const backlog = (backlogRaw || []).filter((r) => !(r.metadata && r.metadata.flag_class) && !/^(Completion flag|Fleet retro|Coordinator review)/i.test(r.title || ''));
  return { ledger: ledger || [], wave6, deferred: deferred || [], backlog };
}

/**
 * SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001 (FR-2): page through ALL rows of a table.
 * PostgREST silently caps a single response at 1000 rows regardless of .limit(), so the prior
 * single-shot load returned only the first 1000 of ~4000 SDs — which is WHY the dedup context was
 * incomplete and dry-run reported dedup_matches=0 (NOT the dormant lane column, as the SD hypothesized:
 * the lane column governs PERSISTENCE, the existing-SD set governs MATCHING). A duplicate that lives
 * past row 1000 was simply invisible to findDedupMatch, so the belt would flood with already-covered work.
 * @param {object} db  @param {string} table  @param {string} select  @param {number} [pageSize]
 */
export async function fetchAllRows(db, table, select, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchAllRows(${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break; // last page
  }
  return out;
}

async function loadContext(db) {
  // Load EVERY SD (paginated) so dedup matches against the full corpus, not just the first 1000.
  const sds = await fetchAllRows(db, 'strategic_directives_v2', 'sd_key,title,status');
  const existing = sds.map((s) => ({ sd_key: s.sd_key, title: s.title }));
  const shippedInfraKeys = sds.filter((s) => s.status === 'completed').map((s) => s.sd_key);
  // outcomeRealizedKeys left empty = the SAFE direction (a shipped-but-unrealized SD re-emits; never falsely closes work).
  return { existing, inFlight: [], shippedInfraKeys, outcomeRealizedKeys: [] };
}

function printReport(out) {
  const { report: r, staging: s, wave_id, lane_column_present } = out;
  const fmt = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ');
  console.log('=== PROACTIVE POPULATOR — baseline corpus report ===');
  console.log(`total corpus candidates: ${r.total}`);
  console.log(`by corpus : ${fmt(r.by_corpus)}`);
  console.log(`by lane   : ${fmt(r.by_lane)}`);
  console.log(`by rung   : ${fmt(r.by_rung)}`);
  console.log(`dedup matches: ${r.dedup_matches}  |  decline: ${r.decline}  |  re-emit: ${r.re_emit}  |  register-first warns: ${r.register_first_warn}`);
  // FR-2: disposition / quality gate — how the raw routed corpus curates to keepers before staging.
  console.log(`disposition: kept=${r.disposition_kept} dropped=${r.disposition_dropped}  by-reason: ${fmt(r.drop_by_reason) || '(none)'}`);
  console.log(`wave: ${wave_id ? wave_id.slice(0, 8) : 'none'}  |  lane column: ${lane_column_present ? 'present' : 'DORMANT'}`);
  console.log(`staging: ${s.dry_run ? 'DRY-RUN' : 'APPLIED'} (chairman_approved=${s.chairman_approved}) — staged=${s.staged} skipped=${s.skipped} errors=${s.errors.length}`);
  if (s.dry_run && (apply && !chairmanApproved)) console.log('  note: --apply given but NOT chairman-approved -> dry-run. Add --chairman-approved to stage.');
  if (s.errors.length) for (const e of s.errors.slice(0, 5)) console.warn(`  [error] ${e.source_id}: ${e.error}`);
}

async function main() {
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const out = await populate(db, { loadSources, loadContext }, { apply, chairmanApproved, cap: capArg ? Number(capArg) : undefined });
  printReport(out);
}

main().then(() => process.exit(0)).catch((e) => { console.error('[proactive-populator] fatal:', e.message); process.exit(1); });
