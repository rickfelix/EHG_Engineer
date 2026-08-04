#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STRUCTURED-FIELDS-HONEST-001 / FR-3 — count and list SDs carrying filler in their
 * structured fields. READ-ONLY BY CONSTRUCTION: this script issues SELECTs only.
 *
 * IT DOES NOT RETRO-FILL, AND THAT IS A DESIGN DECISION, NOT AN OMISSION. Inventing criteria after
 * the fact is the same lie with a later timestamp. The measured split also removes the incentive:
 * of the affected rows, only ~3% are still live (not completed/cancelled), so a migration would be
 * rewriting history for no operational gain. Any cleanup is separate work with its own approval.
 *
 * EXACT-EQUALITY, NEVER SUBSTRING — empirically justified, not a style preference. Measured on the
 * whole table: substring matching returns 1,097 where exact-equality returns 1,096, and the single
 * false positive is THIS SD, whose honest criterion QUOTES the filler phrase while describing it.
 * A detector that cannot tell a row DESCRIBING the defect from a row HAVING it misreports the very
 * population it exists to count.
 *
 * Usage:
 *   node scripts/detect-boilerplate-sd-fields.mjs            # summary + counts
 *   node scripts/detect-boilerplate-sd-fields.mjs --list     # also print sd_keys
 *   node scripts/detect-boilerplate-sd-fields.mjs --json     # machine-readable
 *   node scripts/detect-boilerplate-sd-fields.mjs --live     # only non-completed/cancelled
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyEntry, VALUE_KEY_BY_FIELD } from '../lib/sd-fields/unpopulated.js';

const FIELDS = Object.keys(VALUE_KEY_BY_FIELD);
const TERMINAL = new Set(['completed', 'cancelled']);

/**
 * Classify one SD row. Pure and exported so tests drive the REAL classifier rather than a
 * reimplementation of it — a test that re-derives the logic proves only that I can write the same
 * bug twice.
 */
export function classifySd(row) {
  const hits = [];
  for (const field of FIELDS) {
    const valueKey = VALUE_KEY_BY_FIELD[field];
    const arr = row[field];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    for (const entry of arr) {
      const verdict = classifyEntry(entry, valueKey);
      if (verdict === 'legacy_filler' || verdict === 'unpopulated') {
        hits.push({ field, valueKey, verdict });
      }
    }
  }
  return hits;
}

async function main() {
  const argv = process.argv.slice(2);
  const wantList = argv.includes('--list');
  const wantJson = argv.includes('--json');
  const liveOnly = argv.includes('--live');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // POPULATION FIRST, via a real COUNT. A default-limited select grouped in memory measures the
  // CAP, not the population — so the count is taken independently and the fetch is asserted
  // against it below.
  const { count: total, error: countErr } = await supabase
    .from('strategic_directives_v2').select('*', { count: 'exact', head: true });
  if (countErr) throw new Error('count failed: ' + countErr.message);

  // FULL pagination. Never a single unbounded select.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key,status,success_criteria,key_changes,success_metrics')
      .range(from, from + 999);
    if (error) throw new Error('fetch failed: ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  // FAIL LOUD on a short read rather than reporting a number derived from a partial fetch.
  if (rows.length !== total) {
    throw new Error(`FETCH INCOMPLETE: counted ${total} rows but fetched ${rows.length}. Refusing to report a population figure measured on a partial read.`);
  }

  const affected = [];
  for (const row of rows) {
    if (liveOnly && TERMINAL.has(row.status)) continue;
    const hits = classifySd(row);
    if (hits.length) affected.push({ sd_key: row.sd_key, status: row.status, hits });
  }

  const byField = {};
  const byVerdict = { legacy_filler: 0, unpopulated: 0 };
  for (const a of affected) {
    for (const h of a.hits) {
      byField[h.field] = (byField[h.field] || 0) + 1;
      byVerdict[h.verdict] += 1;
    }
  }
  const live = affected.filter((a) => !TERMINAL.has(a.status));

  const report = {
    scanned: rows.length,
    counted: total,
    scope: liveOnly ? 'live only (not completed/cancelled)' : 'all SDs',
    affected_sds: affected.length,
    affected_live_sds: live.length,
    entries_by_field: byField,
    entries_by_verdict: byVerdict,
    rows_modified: 0,
    ...(wantList ? { sd_keys: affected.map((a) => a.sd_key) } : {}),
  };

  if (wantJson) { console.log(JSON.stringify(report, null, 2)); return; }

  console.log('SD structured-field filler detection (READ-ONLY — rows modified: 0)');
  console.log('  scanned            : ' + report.scanned + ' of ' + report.counted + ' (full pagination, count-verified)');
  console.log('  scope              : ' + report.scope);
  console.log('  affected SDs       : ' + report.affected_sds);
  console.log('  of which still live: ' + report.affected_live_sds);
  console.log('  entries by field   : ' + JSON.stringify(byField));
  console.log('  entries by verdict : ' + JSON.stringify(byVerdict));
  if (wantList) {
    console.log('');
    for (const a of affected) console.log('    ' + a.sd_key + '  [' + a.status + ']  ' + a.hits.map((h) => h.field + ':' + h.verdict).join(', '));
  }
}

// Only run when invoked directly — importing this for tests must not hit the network.
// (Guard added deliberately: a barrel with no main-module check is a documented CLI that
// silently does nothing, which cost this fleet real time on lib/sub-agent-executor.js.)
// argv[1] is UNDEFINED under `node -e` and in some test loaders — the first version of this guard
// dereferenced it unguarded and threw on import, which is a smaller version of the same defect
// (a module that cannot be imported is as useless as a CLI that cannot be run).
const invokedPath = process.argv[1];
if (typeof invokedPath === 'string' && invokedPath.endsWith('detect-boilerplate-sd-fields.mjs')) {
  main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
}
