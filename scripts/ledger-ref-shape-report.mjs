#!/usr/bin/env node
/**
 * SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001 — the outcome_ref shape report.
 *
 * Reports outcome_sd_key coverage AGAINST ITS DERIVABLE CEILING, plus a three-bucket applicability
 * split. It exists because the same number carries opposite meanings: 3.4% against an implied 100%
 * reads as a broken writer; 3.4% against the ceiling reads as an absent input. The SD was written
 * from the first reading, which is how it arrived at a remedy (wiring) for a writer that works.
 *
 * PAGINATES DELIBERATELY. PostgREST caps a plain select at 1000 rows and returns the cap silently.
 * This table holds ~1,392, so a single fetch would classify 1000 rows, print a confident
 * distribution, and be wrong — measuring the cap instead of the population. The row count is
 * reconciled against an exact COUNT and a mismatch exits non-zero rather than printing a plausible
 * subtotal.
 *
 * Exit 0 = report emitted. 1 = totals do not reconcile. 2 = unreadable (never a pass).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { summarise, formatSummary, SHAPE, BUCKET } from '../lib/ledger/ref-shape.js';

const TABLE = 'solomon_advice_outcome_ledger';
const PAGE = 500;
const argv = process.argv.slice(2);
const APPLICABILITY = argv.includes('--applicability');
const JSON_OUT = argv.includes('--json');

async function fetchAll(sb) {
  const { count, error: cErr } = await sb.from(TABLE).select('*', { count: 'exact', head: true });
  if (cErr) throw new Error(`count failed: ${cErr.message}`);

  const rows = [];
  for (let from = 0; from < count; from += PAGE) {
    const { data, error } = await sb.from(TABLE)
      .select('outcome_ref, outcome_sd_key')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`page ${from} failed: ${error.message}`);
    rows.push(...(data || []));
  }
  return { rows, count };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('UNREADABLE: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.'); process.exit(2); }

  const sb = createClient(url, key);
  let rows; let count;
  try { ({ rows, count } = await fetchAll(sb)); }
  catch (e) { console.error(`UNREADABLE: ${e.message}`); process.exit(2); }

  // The paginate-vs-cap check. A silent truncation here would poison every figure below.
  if (rows.length !== count) {
    console.error(`TOTALS DO NOT RECONCILE: fetched ${rows.length} but COUNT says ${count}. Refusing to report a subtotal as a population.`);
    process.exit(1);
  }

  const s = summarise(rows); // throws if anyone ever asks for the bare population

  if (JSON_OUT) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }

  console.log(`=== ${TABLE}: outcome_sd_key coverage against its DERIVABLE CEILING ===`);
  console.log(formatSummary(s));
  console.log(`\n  reconciled: fetched ${rows.length} = COUNT ${count} (paginated at ${PAGE}; a single select would cap at 1000 and read as the population)`);

  console.log('\n=== outcome_ref shapes (whole column, not sampled) ===');
  const order = [SHAPE.ELIGIBLE, SHAPE.CASE_DRIFT, SHAPE.EXCLUDED_QF, SHAPE.COMMIT_SHA, SHAPE.NARRATIVE, SHAPE.EMPTY];
  for (const k of order) {
    const n = s.shapes[k] || 0;
    console.log(`  ${String(n).padStart(5)}  ${k.padEnd(22)} ${s.total ? (100 * n / s.total).toFixed(1) + '%' : ''}`);
  }

  if (APPLICABILITY) {
    console.log('\n=== applicability — THREE buckets, never two ===');
    console.log(`  ${String(s.buckets[BUCKET.RESOLVABLE]).padStart(5)}  RESOLVABLE      a key is present`);
    console.log(`  ${String(s.buckets[BUCKET.NOT_YET]).padStart(5)}  NOT_YET         in-domain: a ref exists or could, but no key derived yet`);
    console.log(`  ${String(s.buckets[BUCKET.NOT_APPLICABLE]).padStart(5)}  NOT_APPLICABLE  OUT OF DOMAIN: the advice outcome is a narrative, not an artifact`);
    console.log('\n  NOT_APPLICABLE is not a gap. Folding it into NOT_YET turns a CEILING into a BACKLOG,');
    console.log('  and a backlog invites more writer-wiring — the remedy this SD had to refuse.');
  }

  console.log(`\n  THE READING THAT MATTERS: ${s.outcome_sd_key_populated}/${s.total} is ${s.pct_of_total}% of the table but `
    + `${s.pct_of_ceiling === null ? 'n/a' : s.pct_of_ceiling + '%'} of what is achievable from current inputs.`);
  process.exit(0);
}

main().catch((e) => { console.error(`UNREADABLE: ${e.message}`); process.exit(2); });
