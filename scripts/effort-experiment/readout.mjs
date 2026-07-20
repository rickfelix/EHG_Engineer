#!/usr/bin/env node
/**
 * readout.mjs — stratified effort-tier quality-vs-cost readout
 * (SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001 FR-4).
 *
 * Reads the FR-1 execution_context stamps (NOT llm-cost-report's pricing
 * rollups — different axis, no duplicated aggregation) and joins
 * sd_phase_handoffs for quality measures. Cells with n < MIN_N print
 * INSUFFICIENT-N and are NEVER concluded.
 *
 * PRE-REGISTERED DECISION RULE (immutable during the experiment):
 *   a lower tier is adopted as a class default ONLY if its first-pass gate
 *   rate is within 5 percentage points of xhigh on that class, with n >= 30
 *   per arm-class cell.
 *
 * Usage:
 *   node scripts/effort-experiment/readout.mjs [--since YYYY-MM-DD] [--json]
 *   npm run effort:readout
 */
import dotenv from 'dotenv';
dotenv.config();
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — both reads below carry a
// client-side .limit() ABOVE the PostgREST 1000-row server cap (2000, 10000), which the
// server silently clamps to 1000 — the exact incident this SD exists to close. Paginate
// with maxRows preserving each site's originally-declared sampling cap.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

export const MIN_N = 30;
export const DELTA_PP = 5;
export const RULE_TEXT =
  `PRE-REGISTERED RULE: adopt a lower tier as class default ONLY if first-pass gate rate is within ${DELTA_PP}pp of xhigh on that class with n>=${MIN_N} per arm-class cell. Cells below n=${MIN_N} are INSUFFICIENT-N and never concluded.`;

const ARMS = ['xhigh', 'high', 'medium'];

/** Pure: bucket completed SDs (with execution_context) into arm x class cells. */
export function buildCells(sds, handoffsBySd) {
  const cells = {}; // `${arm}|${cls}` -> { n, firstPass, rejections, handoffs, cycleMs, tokens, tokenN }
  for (const sd of sds) {
    const ec = sd.metadata && sd.metadata.execution_context;
    if (!ec) continue;
    const arm = ec.effort_arm || 'unassigned';
    const cls = ec.item_class || 'unknown';
    const key = `${arm}|${cls}`;
    const c = (cells[key] ||= { arm, item_class: cls, n: 0, firstPass: 0, rejections: 0, handoffs: 0, cycleMs: 0, cycleN: 0, tokens: 0, tokenN: 0 });
    c.n++;
    const hs = handoffsBySd[sd.id] || [];
    c.handoffs += hs.length;
    const rejected = hs.filter(h => (h.status || '').match(/reject|fail/i)).length;
    c.rejections += rejected;
    if (hs.length > 0 && rejected === 0) c.firstPass++;
    const start = (sd.metadata.claim_history && sd.metadata.claim_history[0] && sd.metadata.claim_history[0].claimed_at) || sd.created_at;
    const end = sd.metadata.completed_stamp_at || sd.completion_date;
    if (start && end) { c.cycleMs += Date.parse(end) - Date.parse(start); c.cycleN++; }
    if (ec.tokens && ec.tokens.source === 'jsonl') {
      c.tokens += (ec.tokens.input_tokens || 0) + (ec.tokens.output_tokens || 0);
      c.tokenN++;
    }
  }
  return cells;
}

/** Pure: evaluate the pre-registered rule per class. Returns recommendations. */
export function evaluateRule(cells) {
  const recs = [];
  const classes = [...new Set(Object.values(cells).map(c => c.item_class))];
  for (const cls of classes) {
    const base = cells[`xhigh|${cls}`];
    if (!base || base.n < MIN_N) continue; // baseline itself insufficient — no conclusions
    const baseRate = (base.firstPass / base.n) * 100;
    for (const arm of ['high', 'medium']) {
      const cell = cells[`${arm}|${cls}`];
      if (!cell || cell.n < MIN_N) continue;
      const rate = (cell.firstPass / cell.n) * 100;
      if (baseRate - rate <= DELTA_PP) {
        recs.push({ item_class: cls, adopt_arm: arm, xhigh_rate: baseRate.toFixed(1), arm_rate: rate.toFixed(1), n: cell.n });
      }
    }
  }
  return recs;
}

export function renderTable(cells) {
  const lines = [];
  lines.push('ARM      | CLASS | n    | first-pass | rej/handoff | cycle(med-ish) | tokens/SD');
  lines.push('---------|-------|------|------------|-------------|----------------|----------');
  const keys = Object.keys(cells).sort();
  for (const k of keys) {
    const c = cells[k];
    const insufficient = c.n < MIN_N;
    const fp = insufficient ? 'INSUFFICIENT-N' : `${((c.firstPass / c.n) * 100).toFixed(1)}%`;
    const rej = c.handoffs ? (c.rejections / c.handoffs).toFixed(2) : '-';
    const cyc = c.cycleN ? `${Math.round(c.cycleMs / c.cycleN / 60000)}m` : '-';
    const tok = c.tokenN ? Math.round(c.tokens / c.tokenN).toLocaleString() : '-';
    lines.push(`${c.arm.padEnd(8)} | ${c.item_class.padEnd(5)} | ${String(c.n).padEnd(4)} | ${fp.padEnd(10)} | ${rej.padEnd(11)} | ${cyc.padEnd(14)} | ${tok}`);
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf('--since');
  const since = sinceIdx >= 0 ? args[sinceIdx + 1] : '2026-06-11'; // experiment start
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, created_at, completion_date, metadata')
      .eq('status', 'completed')
      .gte('completion_date', since)
      .not('metadata->execution_context', 'is', null)
      .order('id', { ascending: true }), { maxRows: 2000 });
  } catch (e) { console.error(e.message); process.exit(1); }

  const ids = (sds || []).map(s => s.id);
  const handoffsBySd = {};
  if (ids.length) {
    let hs;
    try {
      hs = await fetchAllPaginated(() => supabase
        .from('sd_phase_handoffs')
        .select('sd_id, status, handoff_type')
        .in('sd_id', ids)
        .order('id', { ascending: true }), { maxRows: 10000 });
    } catch { hs = []; }
    for (const h of hs || []) (handoffsBySd[h.sd_id] ||= []).push(h);
  }

  const cells = buildCells(sds || [], handoffsBySd);
  const recs = evaluateRule(cells);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ rule: RULE_TEXT, since, cells, recommendations: recs }, null, 2));
    return;
  }
  console.log('EFFORT-TIER EXPERIMENT READOUT');
  console.log(RULE_TEXT);
  console.log(`Window: completed since ${since} | instrumented SDs: ${(sds || []).length}\n`);
  console.log(Object.keys(cells).length ? renderTable(cells) : '(no instrumented completions yet — stamps accumulate from FR-1 merge)');
  console.log('\nRECOMMENDATIONS:');
  console.log(recs.length ? recs.map(r => `  ADOPT ${r.adopt_arm} for class=${r.item_class} (xhigh ${r.xhigh_rate}% vs ${r.arm_rate}%, n=${r.n})`).join('\n') : '  none — no arm-class cell meets the pre-registered bar yet');
}

import path from 'path';
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exit(1); });
