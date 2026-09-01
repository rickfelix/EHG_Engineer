#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-PER-001 — FR-9. Break-glass revert for the FR-3/FR-4 backfill.
 *
 * NOT part of normal SD completion — this script only needs to EXIST and be TESTED (TS-11)
 * before the live backfill runs. It is the incident path, invoked manually if a downstream
 * consumer misbehaves after the backfill lands.
 *
 * Reads the FR-7 --out-file NDJSON path (one line per updated row:
 * {"id","previous_category","new_category","table":"feedback"}) and, for each row, issues:
 *
 *   UPDATE feedback SET category=previous_category WHERE id=<id> AND category=new_category
 *
 * The WHERE also checks the row's CURRENT category still matches new_category — this is
 * deliberate, never a blind ID-only flip: a row a human or later process already changed AGAIN
 * since the backfill must NOT be clobbered back. Any row whose current category no longer
 * matches is SKIPPED (not an error) and logged as such.
 *
 * Usage:
 *   node scripts/one-off/revert-completion-flag-finding-category.mjs --out-file <path>
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

/**
 * Parse an NDJSON out-file into row descriptors. Throws on malformed JSON (fail loud —
 * a revert run must never silently skip a row because of a parse error).
 * @param {string} contents
 * @returns {Array<{id:string, previous_category:string, new_category:string, table:string}>}
 */
export function parseNdjson(contents) {
  return String(contents || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

/**
 * Revert one row: UPDATE feedback SET category=previous_category WHERE id=id AND
 * category=new_category. Returns the outcome so the caller can log/aggregate without throwing.
 *
 * @param {Object} supabase
 * @param {{id:string, previous_category:string, new_category:string}} row
 * @returns {Promise<{id:string, outcome:'reverted'|'skipped_mismatch'|'error', error?:string}>}
 */
export async function revertRow(supabase, row) {
  const { data, error } = await supabase
    .from('feedback')
    .update({ category: row.previous_category })
    .eq('id', row.id)
    .eq('category', row.new_category)
    .select('id');

  if (error) {
    return { id: row.id, outcome: 'error', error: error.message || JSON.stringify(error) };
  }
  if (!data || data.length === 0) {
    // Current category no longer matches new_category — a human or later process already
    // changed this row again. Skip, never clobber.
    return { id: row.id, outcome: 'skipped_mismatch' };
  }
  return { id: row.id, outcome: 'reverted' };
}

/**
 * Revert every row from a parsed NDJSON out-file, sequentially, logging each outcome.
 * @param {Object} supabase
 * @param {Array<Object>} rows
 * @returns {Promise<{reverted:number, skipped:number, errored:number, results:Array<Object>}>}
 */
export async function revertAll(supabase, rows) {
  const results = [];
  let reverted = 0, skipped = 0, errored = 0;
  for (const row of rows) {
    const r = await revertRow(supabase, row);
    results.push(r);
    if (r.outcome === 'reverted') reverted++;
    else if (r.outcome === 'skipped_mismatch') skipped++;
    else errored++;
    console.log(`[revert] ${r.id}: ${r.outcome}${r.error ? ' — ' + r.error : ''}`);
  }
  return { reverted, skipped, errored, results };
}

async function main() {
  const argv = process.argv.slice(2);
  const outFileIdx = argv.indexOf('--out-file');
  const outFile = outFileIdx >= 0 ? argv[outFileIdx + 1] : null;

  if (!outFile) {
    console.error('revert-completion-flag-finding-category: --out-file <path> is REQUIRED. Refusing to run.');
    process.exitCode = 1;
    return;
  }

  let rows;
  try {
    rows = parseNdjson(readFileSync(outFile, 'utf8'));
  } catch (e) {
    console.error(`FATAL: could not read/parse --out-file '${outFile}': ${e.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${rows.length} row(s) from ${outFile}.`);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { reverted, skipped, errored } = await revertAll(supabase, rows);
  console.log(`Summary: ${reverted} reverted, ${skipped} skipped (category already changed again), ${errored} errored.`);

  process.exitCode = errored > 0 ? 1 : 0;
}

const isMain = process.argv[1]?.endsWith('revert-completion-flag-finding-category.mjs');
if (isMain) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exitCode = 1;
  });
}
