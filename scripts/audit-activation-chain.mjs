#!/usr/bin/env node
/**
 * audit-activation-chain.mjs
 *
 * SD-LEO-INFRA-REQUIRE-END-END-001 / FR-4
 *
 * For any SD, reports a 0-5 activation-chain coverage score across these dimensions:
 *   - schema:   schema migration(s) touched by the SD
 *   - worker:   worker/consumer/job file(s) touched
 *   - ui:       UI component / route / page file(s) touched
 *   - test:     e2e or activation-invariant test file(s) touched
 *   - data:     post-migration row counts for catalog tables declared in
 *               activation_catalog_expectations (or referenced in migrations) > 0
 *
 * The score is a coarse heuristic; FR-4 acceptance criterion is "produces
 * score <4/5 for SD-GVOS-COMPOSER-SNAPSHOTLOCKED-REGISTRY-ORCH-001" (a
 * known-incomplete chain). Future tuning may add acorn-based call-graph
 * analysis; this Stage-1 implementation uses path heuristics + DB row
 * counts which is enough to surface the empirical premise.
 *
 * Usage:
 *   node scripts/audit-activation-chain.mjs <SD-KEY-or-UUID>
 *   node scripts/audit-activation-chain.mjs <SD-KEY> --json
 *
 * Exit codes:
 *   0 — score >= 4/5
 *   1 — score < 4/5
 *   2 — invocation or connection error
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PATH_HEURISTICS = {
  schema: /(database\/migrations|migrations|\.sql$)/i,
  worker: /(worker|consumer|job|orchestrator|service)/i,
  ui: /(src\/components|src\/pages|\.tsx$|\.jsx$|panel|component|page|route)/i,
  test: /(\.test\.[jt]s$|\.spec\.[jt]s$|tests\/)/i,
};

function parseArgs(argv) {
  const args = { sdRef: null, json: false };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.sdRef) args.sdRef = a;
  }
  return args;
}

async function resolveSd(supabase, sdRef) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdRef);
  const filter = isUuid ? 'id' : 'sd_key';
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, metadata, key_changes')
    .eq(filter, sdRef)
    .maybeSingle();
  if (error) throw new Error(`SD lookup failed: ${error.message}`);
  return data;
}

function collectTouchedFiles(sd) {
  const meta = sd?.metadata || {};
  const files = [];
  if (Array.isArray(meta.files_to_modify)) files.push(...meta.files_to_modify.map(f => f.path || f));
  if (Array.isArray(meta.files_modified)) files.push(...meta.files_modified.map(f => f.path || f));
  // Scan key_changes free-text for path hints.
  if (Array.isArray(sd?.key_changes)) {
    for (const kc of sd.key_changes) {
      const text = [kc?.change, kc?.detail, kc?.title, kc?.impact, kc?.description].filter(Boolean).join(' ');
      const pathMatches = text.match(/[\w/-]+\.(?:sql|tsx?|jsx?|mjs|cjs|ts|js)\b/g) || [];
      files.push(...pathMatches);
    }
  }
  return [...new Set(files)].filter(Boolean);
}

function scoreFromFiles(files) {
  const dims = { schema: [], worker: [], ui: [], test: [] };
  for (const f of files) {
    for (const [dim, regex] of Object.entries(PATH_HEURISTICS)) {
      if (regex.test(f)) dims[dim].push(f);
    }
  }
  return dims;
}

async function scoreData(supabase, sdId, sdKey) {
  // Two sources for "data" dimension:
  //   1. activation_catalog_expectations rows declared by this SD — check COUNT > 0.
  //   2. Tables mentioned in any migration touched by the SD — best-effort.
  const { data: expectations } = await supabase
    .from('activation_catalog_expectations')
    .select('table_name, seed_migration_path')
    .eq('sd_id', sdId);

  if (!expectations || expectations.length === 0) {
    return { passed: null, reason: 'no_catalog_expectations_declared', tables: [] };
  }

  const tables = [];
  let allPass = true;
  for (const exp of expectations) {
    let count = null;
    try {
      const { count: n } = await supabase.from(exp.table_name).select('*', { count: 'exact', head: true });
      count = n ?? 0;
    } catch (e) {
      count = null;
    }
    const passed = count !== null && count > 0;
    if (!passed) allPass = false;
    tables.push({ table_name: exp.table_name, count, passed });
  }
  return { passed: allPass, reason: allPass ? 'all_catalog_tables_non_empty' : 'one_or_more_catalog_tables_empty', tables };
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help || !args.sdRef) {
    console.log('Usage: node scripts/audit-activation-chain.mjs <SD-KEY-or-UUID> [--json]');
    process.exit(args.help ? 0 : 2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }
  const supabase = createClient(url, key);

  let sd;
  try {
    sd = await resolveSd(supabase, args.sdRef);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(2);
  }
  if (!sd) {
    console.error(`ERROR: SD not found: ${args.sdRef}`);
    process.exit(2);
  }

  const files = collectTouchedFiles(sd);
  const dims = scoreFromFiles(files);
  const data = await scoreData(supabase, sd.id, sd.sd_key);

  // Score: 1 point per non-empty dimension; data dimension scores 1 if all catalogs non-empty,
  // 0 if any empty, and is excluded (denominator 4 not 5) if not_declared.
  const baseDims = [
    { name: 'schema', passed: dims.schema.length > 0, evidence: dims.schema },
    { name: 'worker', passed: dims.worker.length > 0, evidence: dims.worker },
    { name: 'ui', passed: dims.ui.length > 0, evidence: dims.ui },
    { name: 'test', passed: dims.test.length > 0, evidence: dims.test },
  ];
  const dataDim = { name: 'data', passed: data.passed, evidence: data.tables, reason: data.reason };
  const dimensionList = data.passed === null ? baseDims : [...baseDims, dataDim];
  const passedCount = dimensionList.filter(d => d.passed === true).length;
  const total = dimensionList.length;
  const ratio = total > 0 ? passedCount / total : 0;

  const passing = ratio >= 0.8; // 4/5 or 4/4

  const payload = {
    sd_key: sd.sd_key,
    sd_id: sd.id,
    title: sd.title,
    files_examined: files,
    dimensions: dimensionList,
    score: passedCount,
    total,
    coverage_ratio: ratio,
    passing,
    missing: dimensionList.filter(d => d.passed === false).map(d => d.name),
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`[ACTIVATION_CHAIN_AUDIT] SD=${sd.sd_key}`);
    console.log('─'.repeat(60));
    for (const d of dimensionList) {
      const status = d.passed === true ? '✓' : d.passed === false ? '✗' : '·';
      const ev = Array.isArray(d.evidence) ? `${d.evidence.length} item(s)` : 'n/a';
      console.log(`  ${status} ${d.name.padEnd(8)} ${ev}`);
    }
    console.log('─'.repeat(60));
    console.log(`[ACTIVATION_CHAIN_COVERAGE] ${passedCount}/${total}${passing ? ' PASS' : ' FAIL'}`);
    if (payload.missing.length) {
      console.log(`Missing dimensions: ${payload.missing.join(', ')}`);
    }
  }

  process.exit(passing ? 0 : 1);
}

main().catch(err => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(2);
});
