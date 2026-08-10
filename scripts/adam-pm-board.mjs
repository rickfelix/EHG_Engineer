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

// FULL-SPECTRUM DRIVE STATE — SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-6.
// This board is the renderer's FIRST CONSUMER, and it is mounted here rather than behind a flag
// because the defect being removed is a board that reports confidently on a NARROW slice. The board
// answers "what is on the ledger"; it did not answer "is anything actually moving", and a chairman
// reading a complete-looking board could not tell the difference. There is deliberately NO env gate:
// a full-spectrum probe that only runs when someone opts in reproduces the partial picture it exists
// to replace.
const { computeDriveState } = require('../lib/governance/drive-state/index.cjs');
const { ADAPTERS } = require('../lib/governance/drive-state/adapters.cjs');
const { renderRefusal } = require('../lib/governance/drive-state/render.cjs');
// SD-LEO-INFRA-DRIVE-STATE-FORCING-001: the board composes through the forcing layer so a stalled
// axis surfaces as an OWED-ACTION hard line and withholds the summary tail. spans/history stay
// null ON PURPOSE — this board must not reference the verdict store (the single-writer invariant,
// test-enforced), so its owed-actions derive from the live verdict alone.
const { composeDriveStateReport } = require('../lib/governance/drive-state/owed-actions.cjs');

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

/**
 * Compute and render the six-axis drive state. NEVER returns hand-formatted output and NEVER
 * returns empty on failure — the two ways a board reverts to a confident partial picture.
 *
 * renderDriveState THROWS on an incomplete verdict by design. Catching that and printing the axes
 * we DID get would be precisely the defect this SD removes, so the catch renders the REFUSAL banner
 * instead: loud, explicitly not-an-all-clear, and carrying the reason.
 *
 * @returns {Promise<{lines: string[], verdict: object|null, refused: string|null}>}
 */
export async function buildDriveStateSection(sb, { now } = {}) {
  let verdict = null;
  try {
    verdict = await computeDriveState({ adapters: ADAPTERS, supabase: sb, now });
    // composeDriveStateReport returns an ARRAY OF LINES, not a string. Joining is the caller's job
    // and forgetting it prints a comma-spliced blob, so it is done once, here. When nothing is
    // owed the lines are byte-identical to renderDriveState; when an axis is stalled the summary
    // tail is withheld and OWED-ACTION lines appear (SD-LEO-INFRA-DRIVE-STATE-FORCING-001 FR-4).
    const composed = composeDriveStateReport({ verdict, spans: null, priorNewestRecordedAt: null, now });
    return { lines: composed.lines, verdict, refused: null, owedActions: composed.owedActions };
  } catch (e) {
    const reason = e && e.message ? e.message : String(e);
    return { lines: renderRefusal(reason), verdict, refused: reason, owedActions: [] };
  }
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
  // Computed BEFORE the early --json return so the machine-readable path cannot silently omit it.
  const drive = await buildDriveStateSection(sb);

  if (asJson) {
    console.log(JSON.stringify({
      ...view,
      error: fetchError,
      drive_state: drive.verdict,
      drive_state_refused: drive.refused
    }));
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

  // Unconditional. A ledger failure above must not suppress the drive state, and vice versa —
  // they answer different questions and a board missing either one is the partial picture again.
  console.log('');
  for (const line of drive.lines) console.log(line);
}

if (isMainModule(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error('ADAM_PM_BOARD_ERROR', e && e.message ? e.message : e);
    process.exit(1);
  });
}
