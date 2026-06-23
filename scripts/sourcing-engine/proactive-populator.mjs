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
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { populate } from '../../lib/sourcing-engine/proactive-populator.js';

const apply = process.argv.includes('--apply');
const chairmanApproved = process.argv.includes('--chairman-approved') || process.env.POPULATOR_CHAIRMAN_APPROVED === 'true';
const capArg = (process.argv.find((a) => a.startsWith('--cap=')) || '').split('=')[1];
// SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001 (FR-2, chairman policy 2026-06-20): the disposition
// gate drops raw todoist/youtube intake by default (it is personal-productivity intake, not curated
// engineering work). --keep-raw disables that drop (re-includes the raw corpus).
const dropRawIntake = !process.argv.includes('--keep-raw');

const TERMINAL_DISPOSITIONS = ['built', 'already_covered', 'duplicate', 'declined', 'deferred_to_rung'];

async function loadSources(db) {
  // SD-LEO-INFRA-SOURCING-LOADSOURCES-CAP-FIX-001: page every source through fetchAllFiltered so a
  // bare .limit() no longer silently TRUNCATES the newest tail. PostgREST returns rows in an
  // unspecified order and caps a single response, so .limit(N) dropped the most-recent (highest-id)
  // intake — verified: feedback harness_backlog held 1139 rows vs .limit(1000), hiding the latest ~2h
  // from routing/dedup/disposition. This mirrors loadContext's full-corpus paging (fetchAllRows).
  // 1. conversion_ledger — undispositioned backlog
  const ledger = await fetchAllFiltered(() => db.from('conversion_ledger')
    .select('id,source_pool,source_id,source_external_id,title,description,target_rung,dedup_match_sd_key,disposition')
    .is('disposition', null));
  // 2. Wave-6 (highest-rank wave of the LEO Roadmap) — already-staged items, enumerated for the report
  let wave6 = [];
  try {
    const { data: rm } = await db.from('strategic_roadmaps').select('id').eq('title', 'LEO Roadmap').eq('status', 'active').limit(1);
    if (rm && rm[0]) {
      const { data: w } = await db.from('roadmap_waves').select('id').eq('roadmap_id', rm[0].id).order('sequence_rank', { ascending: false }).limit(1);
      if (w && w[0]) {
        const items = await fetchAllFiltered(() => db.from('roadmap_wave_items')
          .select('id,source_type,source_id,title,item_disposition,promoted_to_sd_key,metadata')
          .eq('wave_id', w[0].id));
        wave6 = items.filter((it) => !['promoted', 'dropped'].includes(it.item_disposition));
      }
    }
  } catch { /* fail-soft: wave6 stays empty */ }
  // 3. deferred V2 cluster
  const deferred = await fetchAllFiltered(() => db.from('strategic_directives_v2').select('id,sd_key,title,description,status,metadata').eq('status', 'deferred'));
  // 4. harness backlog (exclude auto-capture noise)
  const backlogRaw = await fetchAllFiltered(() => db.from('feedback').select('id,title,description,status,category,sd_id,metadata').eq('category', 'harness_backlog').eq('status', 'new'));
  const backlog = backlogRaw.filter((r) => !(r.metadata && r.metadata.flag_class) && !/^(Completion flag|Fleet retro|Coordinator review)/i.test(r.title || ''));
  return { ledger, wave6, deferred, backlog };
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

/**
 * SD-LEO-INFRA-SOURCING-LOADSOURCES-CAP-FIX-001: page through ALL rows of a FILTERED query so a bare
 * .limit() can never silently truncate the newest tail (PostgREST returns rows unordered + caps a
 * single response). The fetchAllRows sibling cannot carry .eq()/.is() filters, so loadSources' four
 * filtered sources use this: `buildQuery` is a zero-arg factory returning a FRESH PostgREST builder
 * (select + filters applied) each call — required because a builder is single-use once awaited. A
 * STABLE .order(orderCol) makes range() paging deterministic (no skips/dupes across pages); every
 * row, including the most recent intake, is returned. Throws on a query error (callers fail-soft).
 * @param {() => any} buildQuery  factory returning a fresh filtered PostgREST builder
 * @param {{pageSize?:number, orderCol?:string}} [opts]
 */
export async function fetchAllFiltered(buildQuery, { pageSize = 1000, orderCol = 'id' } = {}) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchAllFiltered: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break; // last page
  }
  return out;
}

async function loadContext(db) {
  // Load EVERY SD (paginated) so dedup matches against the full corpus, not just the first 1000.
  // SD-LEO-INFRA-SOURCING-DEDUP-SEMANTIC-001: also load description so findDedupMatch's semantic
  // problem-key path can catch problem-phrased restatements (not just title matches).
  const sds = await fetchAllRows(db, 'strategic_directives_v2', 'sd_key,title,description,status');
  const existing = sds.map((s) => ({ sd_key: s.sd_key, title: s.title, description: s.description }));
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
  const out = await populate(db, { loadSources, loadContext }, { apply, chairmanApproved, cap: capArg ? Number(capArg) : undefined, dropRawIntake });
  printReport(out);
}

// SD-LEO-INFRA-SOURCING-LOADSOURCES-CAP-FIX-001: guard the entrypoint so importing the module (e.g.
// a unit test of fetchAllFiltered) does NOT run the DB-touching pass + process.exit. Direct
// `node proactive-populator.mjs` still runs main(). argv[1] is undefined under some loaders → guard it.
const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then(() => process.exit(0)).catch((e) => { console.error('[proactive-populator] fatal:', e.message); process.exit(1); });
}
