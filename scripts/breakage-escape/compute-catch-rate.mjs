#!/usr/bin/env node
/**
 * SD-LEO-INFRA-BREAKAGE-ESCAPE-INSTRUMENT-001 (FR-4)
 *
 * Queries the 4 census-verified source tables for a window, classifies every row via
 * lib/breakage-escape/catch-rate-ledger.mjs, and prints a report naming both extents.
 * --bank writes the result to key_results.current_value for KR-2026-07-02 -- refuses to
 * bank on a vacuity failure (FR-3's clause), so a query bug can never silently move the KR.
 *
 * Usage:
 *   node scripts/breakage-escape/compute-catch-rate.mjs [--days N] [--bank]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { classifyDefectRow, computeCatchRate } from '../../lib/breakage-escape/catch-rate-ledger.mjs';

const KR_CODE = 'KR-2026-07-02';
const DEFAULT_WINDOW_DAYS = 90;

function parseArgs(argv) {
  const days = argv.includes('--days') ? Number(argv[argv.indexOf('--days') + 1]) : DEFAULT_WINDOW_DAYS;
  const bank = argv.includes('--bank');
  return { days: Number.isFinite(days) && days > 0 ? days : DEFAULT_WINDOW_DAYS, bank };
}

async function fetchWindowedRows(supabase, table, dateColumn, windowStart, windowEnd, extraSelect = '*') {
  return fetchAllPaginated(() => supabase
    .from(table)
    .select(extraSelect)
    .gte(dateColumn, windowStart)
    .lte(dateColumn, windowEnd)
    .order(dateColumn, { ascending: true }));
}

export async function run({ supabase, windowStart, windowEnd, bank }) {
  const [sarRows, rcrRows, qfRows, fbRows] = await Promise.all([
    fetchWindowedRows(supabase, 'sub_agent_execution_results', 'created_at', windowStart, windowEnd, 'id,verdict,phase,sub_agent_code'),
    fetchWindowedRows(supabase, 'root_cause_reports', 'created_at', windowStart, windowEnd, 'id,trigger_source'),
    fetchWindowedRows(supabase, 'quick_fixes', 'created_at', windowStart, windowEnd, 'id,found_during'),
    fetchWindowedRows(supabase, 'feedback', 'created_at', windowStart, windowEnd, 'id,category'),
  ]);

  const classifiedRows = [
    ...sarRows.map((r) => classifyDefectRow(r, 'sub_agent_execution_results')),
    ...rcrRows.map((r) => classifyDefectRow(r, 'root_cause_reports')),
    ...qfRows.map((r) => classifyDefectRow(r, 'quick_fixes')),
    ...fbRows.map((r) => classifyDefectRow(r, 'feedback')),
  ];

  const result = computeCatchRate({ classifiedRows, windowStart, windowEnd });

  console.log(`\nBreakage-escape catch-rate report`);
  console.log(`Window: ${result.window.start} -> ${result.window.end}`);
  console.log(`Numerator (caught_pre_ship): ${result.caught} -- ${result.numerator_extent}`);
  console.log(`Denominator (caught+escaped): ${result.total} -- ${result.denominator_extent}`);
  console.log(`Unclassified (excluded): ${result.unclassified}`);
  console.log(`Catch rate: ${result.catch_rate}%\n`);

  if (bank) {
    const { error: bankErr } = await supabase
      .from('key_results')
      .update({ current_value: result.catch_rate, updated_at: new Date().toISOString() })
      .eq('code', KR_CODE);
    if (bankErr) throw new Error(`bank to key_results failed: ${bankErr.message}`);
    console.log(`Banked ${result.catch_rate}% to key_results.current_value (code=${KR_CODE})`);
  }

  return result;
}

if (isMainModule(import.meta.url)) {
  const { days, bank } = parseArgs(process.argv.slice(2));
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createSupabaseServiceClient();
  run({ supabase, windowStart, windowEnd, bank }).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
