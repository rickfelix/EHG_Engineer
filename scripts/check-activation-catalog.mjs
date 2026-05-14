#!/usr/bin/env node
/**
 * check-activation-catalog.mjs
 *
 * SD-LEO-INFRA-REQUIRE-END-END-001 / FR-3
 *
 * Reads `activation_catalog_expectations` rows for an SD and asserts each
 * declared catalog/registry table has `COUNT(*) > 0` post-migration.
 *
 * Usage:
 *   node scripts/check-activation-catalog.mjs <SD-KEY-or-UUID>
 *   node scripts/check-activation-catalog.mjs <SD-KEY> --json
 *
 * Exit codes:
 *   0 — all expected tables are non-empty (or no expectations declared)
 *   1 — at least one expected table is empty (fails the catalog guard)
 *   2 — invocation or connection error
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const args = { sdRef: null, json: false };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') { args.help = true; }
    else if (!args.sdRef) args.sdRef = a;
  }
  return args;
}

function exitWith({ ok, json, payload, message }) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (message) {
    console.log(message);
  }
  process.exit(ok ? 0 : (payload?.error ? 2 : 1));
}

async function resolveSdUuid(supabase, sdRef) {
  // Accept either UUID or sd_key.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdRef)) {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .eq('id', sdRef)
      .maybeSingle();
    return data || null;
  }
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('sd_key', sdRef)
    .maybeSingle();
  return data || null;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help || !args.sdRef) {
    console.log('Usage: node scripts/check-activation-catalog.mjs <SD-KEY-or-UUID> [--json]');
    process.exit(args.help ? 0 : 2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    exitWith({ ok: false, json: args.json, payload: { error: 'missing_supabase_credentials' }, message: 'ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.' });
  }

  const supabase = createClient(url, key);

  const sd = await resolveSdUuid(supabase, args.sdRef);
  if (!sd) {
    exitWith({ ok: false, json: args.json, payload: { error: 'sd_not_found', sd_ref: args.sdRef }, message: `ERROR: SD not found: ${args.sdRef}` });
  }

  const { data: expectations, error: expErr } = await supabase
    .from('activation_catalog_expectations')
    .select('table_name, seed_migration_path')
    .eq('sd_id', sd.id);

  if (expErr) {
    exitWith({ ok: false, json: args.json, payload: { error: 'expectations_query_failed', message: expErr.message } });
  }

  if (!expectations || expectations.length === 0) {
    const payload = { sd_key: sd.sd_key, sd_id: sd.id, expectations: [], result: 'no_expectations_declared', passed: true };
    if (args.json) console.log(JSON.stringify(payload, null, 2));
    else console.log(`[ACTIVATION_CATALOG_GUARD] PASS — no expectations declared for ${sd.sd_key}`);
    process.exit(0);
  }

  const results = [];
  for (const exp of expectations) {
    let count = null;
    let err = null;
    try {
      const { count: n, error } = await supabase
        .from(exp.table_name)
        .select('*', { count: 'exact', head: true });
      if (error) err = error.message;
      else count = n ?? 0;
    } catch (e) {
      err = e.message;
    }
    const passed = count !== null && count > 0;
    results.push({
      table_name: exp.table_name,
      seed_migration_path: exp.seed_migration_path,
      count,
      passed,
      error: err,
    });
  }

  const failed = results.filter(r => !r.passed);
  const overallPass = failed.length === 0;
  const payload = {
    sd_key: sd.sd_key,
    sd_id: sd.id,
    total_expectations: results.length,
    failed_count: failed.length,
    results,
    passed: overallPass,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`[ACTIVATION_CATALOG_GUARD] SD=${sd.sd_key}`);
    console.log('─'.repeat(60));
    for (const r of results) {
      const status = r.passed ? '✓' : '✗';
      const countStr = r.count === null ? `ERROR: ${r.error}` : `${r.count} rows`;
      console.log(`  ${status} ${r.table_name.padEnd(40)} ${countStr}`);
      if (!r.passed && r.seed_migration_path) {
        console.log(`     ↳ expected seed migration: ${r.seed_migration_path}`);
      }
    }
    console.log('─'.repeat(60));
    console.log(overallPass
      ? `PASS — all ${results.length} declared catalog table(s) are non-empty`
      : `FAIL — ${failed.length}/${results.length} catalog table(s) empty or missing`);
  }

  process.exit(overallPass ? 0 : 1);
}

main().catch(err => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(2);
});
