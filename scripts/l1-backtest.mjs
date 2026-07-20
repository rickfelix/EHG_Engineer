#!/usr/bin/env node
/**
 * L1 backtest CLI — SD-LEO-INFRA-REWARD-SPINE-ONE-001-D.
 *
 * Runs computeL1Outcome over the trailing-7-day completed SD/QF set (windowed by completion
 * date, excluding ghost-completed SDs per plan_note_ghost_completions), and separately reports
 * the known ghost-completed false-green class from v_sd_completion_integrity.
 *
 * Two SEPARATE reports, answering two different questions:
 *   1. Trailing-window L1 outcomes — "is recent work clean?" (honest per-lane coverage)
 *   2. Ghost-completed detection — "does the DB contain known false-greens?"
 *
 * Usage: node scripts/l1-backtest.mjs [--days N]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeL1Outcome } from '../lib/governance/l1-work-outcome.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: strategic_directives_v2 and
// quick_fixes are growing tables, and --days is user-configurable (unbounded window) -- a
// truncated read here silently corrupts the coverage measurement this backtest exists to report.
import { fetchAllPaginated, warnIfCapTruncated } from '../lib/db/fetch-all-paginated.mjs';

const DEFAULT_WINDOW_DAYS = 7;

function parseDays(argv) {
  const idx = argv.indexOf('--days');
  if (idx === -1) return DEFAULT_WINDOW_DAYS;
  const n = Number(argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_DAYS;
}

async function collectWindowedWorkKeys(supabase, days) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  let sdRows;
  try {
    sdRows = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, updated_at')
      .eq('status', 'completed')
      .gte('updated_at', since)
      .order('updated_at', { ascending: true })
      .order('sd_key', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (sdError) {
    throw new Error(`SD query failed: ${sdError.message}`);
  }

  // Exclude ghost-completed SDs (no real LEAD-FINAL evidence) from the trailing-window set --
  // they have no genuine completion signal, so including them would pollute the L1 outcome
  // computation with noise, not new drift.
  const { data: ghostRowsRaw, error: ghostError } = await supabase
    .from('v_sd_completion_integrity')
    .select('sd_key')
    .eq('is_ghost_completed', true);
  if (ghostError) throw new Error(`ghost-completed query failed: ${ghostError.message}`);
  const ghostRows = warnIfCapTruncated(ghostRowsRaw, 'v_sd_completion_integrity (ghost-completed, l1-backtest exclusion set)');
  const ghostKeys = new Set(ghostRows.map((r) => r.sd_key));

  let qfRows;
  try {
    qfRows = await fetchAllPaginated(() => supabase
      .from('quick_fixes')
      .select('id, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', since)
      .order('completed_at', { ascending: true })
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (qfError) {
    throw new Error(`QF query failed: ${qfError.message}`);
  }

  const excludedGhostCount = sdRows.filter((r) => ghostKeys.has(r.sd_key)).length;
  const sdKeys = sdRows.map((r) => r.sd_key).filter((k) => !ghostKeys.has(k));
  const qfKeys = qfRows.map((r) => r.id);

  return { workKeys: [...sdKeys, ...qfKeys], excludedGhostCount, totalBeforeExclusion: sdRows.length + qfRows.length };
}

async function reportGhostCompleted(supabase) {
  const { data, error } = await supabase
    .from('v_sd_completion_integrity')
    .select('sd_key')
    .eq('is_ghost_completed', true)
    .limit(5);
  if (error) throw new Error(`ghost-completed detection query failed: ${error.message}`);

  const { count } = await supabase
    .from('v_sd_completion_integrity')
    .select('*', { count: 'exact', head: true })
    .eq('is_ghost_completed', true);

  console.log('\n=== Ghost-Completed False-Green Detection (separate from trailing-window L1) ===');
  console.log(`Detected ${count ?? '?'} SD(s) marked 'completed' with no real LEAD-FINAL evidence (is_ghost_completed=true).`);
  if (data && data.length > 0) {
    console.log('Example(s):', data.map((r) => r.sd_key).join(', '));
  }
  return count ?? 0;
}

async function main() {
  const days = parseDays(process.argv.slice(2));
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`=== L1 Trailing-${days}-Day Backtest ===`);
  const { workKeys, excludedGhostCount, totalBeforeExclusion } = await collectWindowedWorkKeys(supabase, days);
  console.log(`Completed items in window: ${totalBeforeExclusion} total; ${excludedGhostCount} excluded as ghost-completed; ${workKeys.length} eligible for L1 computation.`);

  const results = [];
  for (const workKey of workKeys) {
    const result = await computeL1Outcome(supabase, workKey);
    results.push({ workKey, ...result });
  }

  const byCoverage = { witnessed: 0, unwitnessed: 0, no_data: 0 };
  const byOutcome = { shipped_clean: 0, unproven: 0, caused_rework: 0 };
  for (const r of results) {
    byCoverage[r.coverage] = (byCoverage[r.coverage] || 0) + 1;
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
  }

  console.log('\n--- Coverage breakdown (honest, never collapsed) ---');
  console.log(`witnessed (real rung verdicts):        ${byCoverage.witnessed}`);
  console.log(`unwitnessed (row exists, empty rungs):  ${byCoverage.unwitnessed}`);
  console.log(`no_data (no telemetry row at all):      ${byCoverage.no_data}`);

  console.log('\n--- Outcome breakdown ---');
  console.log(`shipped_clean:  ${byOutcome.shipped_clean}`);
  console.log(`unproven:       ${byOutcome.unproven}`);
  console.log(`caused_rework:  ${byOutcome.caused_rework}`);

  for (const r of results) {
    console.log(`  ${r.workKey}: outcome=${r.outcome} coverage=${r.coverage}`);
  }

  const ghostCount = await reportGhostCompleted(supabase);

  console.log('\n=== Summary ===');
  console.log(`Trailing window: ${workKeys.length} item(s) computed.`);
  console.log(`Ghost-completed false-greens detected: ${ghostCount}.`);
}

main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
