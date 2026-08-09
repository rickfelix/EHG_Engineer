#!/usr/bin/env node
/**
 * session_coordination lane-lint gauge tick — FR-6.
 *
 * SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001.
 *
 * READ-ONLY (per lib/coordination/lane-lint-gauge.cjs) — prints per-violation-class counts.
 * No writes, no feedback rows, no kill-switch: unlike scripts/coordinator-relay-drop-gauge.cjs
 * this gauge has no write side to gate.
 *
 * Usage: node scripts/coordinator-lane-lint-gauge.cjs [--window-hours 24] [--resurface-window-days 30]
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { runLaneLintGauge } = require('../lib/coordination/lane-lint-gauge.cjs');

function parseHours(argv, flag, fallbackHours) {
  const idx = argv.indexOf(flag);
  const n = idx >= 0 ? Number(argv[idx + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallbackHours;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key);
}

/**
 * Does the measured lint result exceed its budget?
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-6.
 *
 * WHY A BUDGET AT ALL. This gauge was correct and complete and NOTHING INVOKED IT — the same
 * defect shape the parent SD exists to fix. But merely putting it on a cron would have reproduced
 * that defect in a new costume: it writes nothing and emits nothing, so a scheduled run would
 * print into a workflow log no human reads, and "it runs now" would be indistinguishable from "it
 * ran and nobody could tell you what it said". Giving it an exit code gives it a CONSUMER — a red
 * scheduled workflow is a notification channel that already exists — without adding a write path
 * to a deliberately read-only instrument.
 *
 * WHY A RATIO WITH HEADROOM, NOT A ZERO THRESHOLD. Measured baseline at authoring time: 162 of
 * ~3,772 rows (4.3%) carry no payload.kind, and that population is understood — it includes the
 * WORKER_SIGNAL friction channel, which keys on signal_type by design. A zero-tolerance threshold
 * would be red on day one, and a check that is always red gets disabled, which is how the
 * permanent-breach shape this SD warns about gets built. This is a REGRESSION detector: it fires
 * when lane hygiene gets materially worse than the state someone already looked at.
 *
 * Returns null when the budget is disabled or the window is empty — an empty sample yields no
 * verdict rather than a false all-clear, and it must never be reported as "passing".
 *
 * @param {{windowRows?:number, untyped_row?:number, bodyless_row?:number, empty_sender_row?:number}} result
 * @param {number} maxRatio
 * @returns {{violations:number, rows:number, ratio:number, exceeded:boolean}|null}
 */
function exceedsLintBudget(result, maxRatio) {
  if (!result || !Number.isFinite(maxRatio) || maxRatio < 0) return null;
  const rows = Number(result.windowRows) || 0;
  if (rows <= 0) return null;
  const violations = ['untyped_row', 'bodyless_row', 'empty_sender_row']
    .reduce((n, k) => n + (Number(result[k]) || 0), 0);
  const ratio = violations / rows;
  return { violations, rows, ratio, exceeded: ratio > maxRatio };
}

async function main() {
  const windowHours = parseHours(process.argv, '--window-hours', 24);
  const resurfaceWindowDays = parseHours(process.argv, '--resurface-window-days', 30);
  const maxIdx = process.argv.indexOf('--max-violation-ratio');
  const maxRatio = maxIdx >= 0 ? Number(process.argv[maxIdx + 1]) : NaN;
  const supabase = getSupabase();
  const result = await runLaneLintGauge(supabase, {
    windowMs: windowHours * 60 * 60 * 1000,
    resurfaceWindowMs: resurfaceWindowDays * 24 * 60 * 60 * 1000,
  });
  console.log(
    `LANE_LINT_GAUGE window=${windowHours}h rows=${result.windowRows} ` +
    `untyped_row=${result.untyped_row} bodyless_row=${result.bodyless_row} ` +
    `empty_sender_row=${result.empty_sender_row} resurface_dedup_drift=${result.resurface_dedup_drift}` +
    `${result.error ? ' error=' + result.error : ''}`
  );

  const budget = exceedsLintBudget(result, maxRatio);
  if (!budget) {
    if (Number.isFinite(maxRatio)) console.log('LANE_LINT_BUDGET skipped — empty window, no verdict (not a pass)');
    return;
  }
  console.log(
    `LANE_LINT_BUDGET violations=${budget.violations}/${budget.rows} `
    + `ratio=${budget.ratio.toFixed(4)} max=${maxRatio} ${budget.exceeded ? 'EXCEEDED' : 'ok'}`
  );
  if (budget.exceeded) {
    console.error(
      `Lane hygiene regressed: ${budget.violations}/${budget.rows} rows (${(budget.ratio * 100).toFixed(1)}%) `
      + `violate untyped/bodyless/empty-sender, above the ${(maxRatio * 100).toFixed(1)}% budget. `
      + 'Failing so a human sees it — a gauge nobody reads is the defect this check exists to avoid.'
    );
    process.exitCode = 1;
  }
}

module.exports = { exceedsLintBudget };

if (require.main === module) {
  main().catch((e) => {
    console.error('coordinator-lane-lint-gauge failed:', (e && e.message) || e);
    process.exit(1);
  });
}
