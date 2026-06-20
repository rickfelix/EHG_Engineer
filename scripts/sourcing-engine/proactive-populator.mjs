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

async function loadContext(db) {
  const { data: sds } = await db.from('strategic_directives_v2').select('sd_key,title,status').limit(4000);
  const existing = (sds || []).map((s) => ({ sd_key: s.sd_key, title: s.title }));
  const shippedInfraKeys = (sds || []).filter((s) => s.status === 'completed').map((s) => s.sd_key);
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
