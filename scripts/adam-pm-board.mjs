#!/usr/bin/env node
/**
 * adam-pm-board.mjs — the chairman-curated PM board view.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-4).
 *
 * LIGHT chairman-curated view (per the chairman's locked adam_v1_scope_LOCKED): parents +
 * rolled-up status (task-ledger.js rollupParentStatus) + bubbled blockers (bubbleBlockers)
 * + a one-line benefit/risk per parent + a coarse token-cost rollup (sumTokenCost).
 * Modeled on scripts/fleet-dashboard.cjs's modular CLI-panel pattern. No per-subtask cost
 * attribution, no formal probability x impact risk scoring (v2_DEFERRED).
 *
 * Usage: node scripts/adam-pm-board.mjs [--json]
 */
import { createRequire } from 'node:module';
import 'dotenv/config';
import { TABLE, rollupParentStatus, bubbleBlockers, sumTokenCost } from '../lib/adam/task-ledger.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: unfiltered select('*') over the
// whole ledger, rows are grouped/rendered (not just counted) — paginate.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return createClient(url, key);
}

/**
 * Group a flat list of ledger rows into { parent, children[] } pairs.
 * @param {Array<object>} rows
 * @returns {Array<{parent: object, children: object[]}>}
 */
export function groupByParent(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const parents = list.filter((r) => r.tier === 'parent');
  return parents.map((parent) => ({
    parent,
    children: list.filter((r) => r.tier === 'child' && r.parent_id === parent.id),
  }));
}

/**
 * Build the curated board view from a flat list of adam_task_ledger rows. PURE — no I/O — so
 * it is unit-testable against a fixture without a live client.
 * @param {Array<object>} rows
 * @returns {{ panels: Array<{id, title, status, benefit, risk, blockers, tokenCost}>, totalTokenCost: number }}
 */
export function buildBoardView(rows) {
  const groups = groupByParent(rows);
  const panels = groups.map(({ parent, children }) => ({
    id: parent.id,
    title: parent.title,
    status: rollupParentStatus(children),
    benefit: parent.benefit || null,
    risk: parent.risk || null,
    blockers: bubbleBlockers(children),
    tokenCost: sumTokenCost(children),
  }));
  return { panels, totalTokenCost: panels.reduce((sum, p) => sum + (p.tokenCost || 0), 0) };
}

function renderPanel(p) {
  const lines = [`  [${p.status.toUpperCase()}] ${p.title}`];
  if (p.benefit) lines.push(`    benefit: ${p.benefit}`);
  if (p.risk) lines.push(`    risk: ${p.risk}`);
  for (const b of p.blockers) lines.push(`    blocked: ${b.title || b.id} — ${b.blocker}`);
  lines.push(`    token cost: ${p.tokenCost}`);
  return lines.join('\n');
}

async function fetchLedgerRows(sb) {
  return fetchAllPaginated(() => sb.from(TABLE).select('*').order('id', { ascending: true })); // unique tiebreaker (FR-6)
}

async function main() {
  const asJson = process.argv.includes('--json');
  const sb = makeClient();

  let rows = [];
  let fetchError = null;
  try {
    rows = await fetchLedgerRows(sb);
  } catch (e) {
    fetchError = e && e.message ? e.message : String(e);
  }

  const view = buildBoardView(rows);

  if (asJson) {
    console.log(JSON.stringify({ ...view, error: fetchError }));
    return;
  }

  console.log('═══ ADAM PM BOARD (chairman-curated) ═══');
  if (fetchError) {
    console.log(`  (unavailable: ${fetchError})`);
  } else if (view.panels.length === 0) {
    console.log('  (no parent nodes on the board)');
  } else {
    for (const p of view.panels) console.log(renderPanel(p));
    console.log(`  ─── total token cost: ${view.totalTokenCost} ───`);
  }
}

if (isMainModule(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error('ADAM_PM_BOARD_ERROR', e && e.message ? e.message : e);
    process.exit(1);
  });
}
