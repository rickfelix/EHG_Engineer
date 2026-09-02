#!/usr/bin/env node
/**
 * SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-2.
 *
 * One-time (re-runnable) census: TESTING rows in sub_agent_execution_results carry ~1,490
 * distinct ad-hoc top-level metadata keys table-wide (TESTING sub-agent evidence 42436060,
 * live measurement -- corrected from an earlier ~300 estimate over a narrower 14-day window),
 * because before FR-1's guard nothing forced a single canonical shape. This script enumerates
 * them so a human can see what needs mapping or retiring. READ-ONLY: it performs no
 * insert/update/delete/upsert against any table -- see the no-mutation test in
 * tests/unit/census-testing-execution-keys.test.js, which greps this file's own source for
 * those verbs as a structural proof, not merely an observed run.
 *
 * KEY-DETECTION HEURISTIC (documented per FR-2 AC-3): a metadata top-level key is considered
 * "execution-related" when it case-insensitively matches ANY of: test, exec, pass, fail, skip,
 * mutat(ion), coverage, assert, spec, suite, e2e, unit, regression. This is a heuristic, not an
 * exhaustive list -- it is intentionally broad (over-match over under-match) since the output is
 * for human triage, not an automated gate (low blast radius per the SD's own risk assessment).
 * `test_execution` itself (the canonical FR-1/TR-1 field) also matches and is expected to be the
 * single highest-count key over time as ad-hoc keys are retired.
 *
 * Usage:
 *   node scripts/census-testing-execution-keys.mjs [--days N] [--limit N]
 *   --days N   lookback window in days (default 14, matching the SD's own measurement baseline)
 *   --limit N  cap the number of printed rows (default 50; the live key count, ~1,490, is too
 *              large to dump unbounded and stay reviewable)
 */
import 'dotenv/config';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const EXECUTION_KEY_PATTERN = /test|exec|pass|fail|skip|mutat|coverage|assert|spec|suite|e2e|unit|regression/i;

function parseArgs(argv) {
  const days = Number(argv.find((_, i) => argv[i - 1] === '--days')) || 14;
  const limit = Number(argv.find((_, i) => argv[i - 1] === '--limit')) || 50;
  return { days, limit };
}

/**
 * @param {Array<{metadata: object|null}>} rows
 * @returns {Map<string, number>} distinct execution-related key -> occurrence count, unsorted
 */
export function censusExecutionKeys(rows) {
  const counts = new Map();
  for (const row of rows) {
    const metadata = row?.metadata;
    if (!metadata || typeof metadata !== 'object') continue;
    for (const key of Object.keys(metadata)) {
      if (!EXECUTION_KEY_PATTERN.test(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

async function main() {
  const { days, limit } = parseArgs(process.argv.slice(2));
  const supabase = await getSupabaseClient();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('sub_agent_execution_results')
    .select('metadata')
    .eq('sub_agent_code', 'TESTING')
    .gte('created_at', since);

  if (error) throw error;

  const counts = censusExecutionKeys(rows || []);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`TESTING rows scanned (last ${days}d): ${rows?.length ?? 0}`);
  console.log(`Distinct execution-related metadata keys: ${sorted.length}`);
  console.log(`Showing top ${Math.min(limit, sorted.length)} by occurrence count:\n`);
  for (const [key, count] of sorted.slice(0, limit)) {
    console.log(`  ${String(count).padStart(6)}  ${key}`);
  }
  if (sorted.length > limit) {
    console.log(`\n  ... ${sorted.length - limit} more key(s) not shown (raise --limit to see them)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('census-testing-execution-keys failed:', err.message);
    process.exit(1);
  });
}
