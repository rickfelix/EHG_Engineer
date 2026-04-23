#!/usr/bin/env node
/**
 * verify-marketing-schema.mjs
 *
 * SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A Phase 0.
 *
 * Introspection-based schema contract verifier for the 14 marketing tables.
 * Diffs the live DB (via Supabase pooler URL) against
 * `config/marketing-schema-manifest.json`. Exits 0 when aligned, 1 on drift.
 *
 * Flags:
 *   --manifest <path>   Override manifest path (default: config/marketing-schema-manifest.json)
 *   --json              Emit machine-readable JSON instead of human-readable report
 *   --help              Print usage and exit 0
 *
 * Design notes:
 *   - Uses information_schema.columns + pg_catalog.pg_class (rowsecurity).
 *   - Never SELECTs from the tables themselves (keeps runtime cheap).
 *   - Single batched query per table-set, not per-table.
 *   - Target p95 runtime: <5s on the pooler URL.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

loadEnv({ path: resolve(REPO_ROOT, '.env') });
loadEnv();

function parseArgs(argv) {
  const args = { manifestPath: 'config/marketing-schema-manifest.json', json: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--manifest') args.manifestPath = argv[++i];
    else if (a.startsWith('--manifest=')) args.manifestPath = a.slice('--manifest='.length);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`verify-marketing-schema.mjs — schema contract verifier for 14 marketing tables

USAGE
  node scripts/verify-marketing-schema.mjs [--manifest <path>] [--json]

FLAGS
  --manifest <path>   Manifest JSON path (default: config/marketing-schema-manifest.json)
  --json              Emit machine-readable JSON
  --help              Print this help

EXITS
  0  schema aligned with manifest
  1  drift detected OR connection failure
`);
}

async function connect() {
  const url = process.env.SUPABASE_POOLER_URL;
  if (!url) {
    throw new Error('SUPABASE_POOLER_URL not set — required for schema introspection');
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function introspect(client, tableNames) {
  const colsRes = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
      ORDER BY table_name, ordinal_position`,
    [tableNames]
  );
  const rlsRes = await client.query(
    `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1)`,
    [tableNames]
  );

  const byTable = new Map();
  for (const name of tableNames) byTable.set(name, { exists: false, rls_enabled: false, columns: [] });
  for (const row of rlsRes.rows) {
    byTable.get(row.table_name).exists = true;
    byTable.get(row.table_name).rls_enabled = row.rls_enabled === true;
  }
  for (const row of colsRes.rows) {
    const entry = byTable.get(row.table_name);
    if (!entry) continue;
    entry.columns.push({
      name: row.column_name,
      data_type: row.data_type,
      is_nullable: row.is_nullable === 'YES'
    });
  }
  return byTable;
}

function compareTable(manifest, live) {
  const diffs = [];
  if (!live.exists) {
    diffs.push({ severity: 'error', message: `table missing in live DB: ${manifest.table}` });
    return diffs;
  }
  if (manifest.rls_enabled !== live.rls_enabled) {
    diffs.push({
      severity: 'error',
      message: `rls_enabled mismatch on ${manifest.table}: manifest=${manifest.rls_enabled}, live=${live.rls_enabled}`
    });
  }
  const liveByName = new Map(live.columns.map((c) => [c.name, c]));
  const manifestByName = new Map(manifest.columns.map((c) => [c.name, c]));

  for (const mc of manifest.columns) {
    const lc = liveByName.get(mc.name);
    if (!lc) {
      diffs.push({ severity: 'error', message: `${manifest.table}.${mc.name} missing in live DB` });
      continue;
    }
    if (lc.data_type !== mc.data_type) {
      diffs.push({
        severity: 'error',
        message: `${manifest.table}.${mc.name} data_type mismatch: manifest=${mc.data_type}, live=${lc.data_type}`
      });
    }
    if (lc.is_nullable !== mc.is_nullable) {
      diffs.push({
        severity: 'error',
        message: `${manifest.table}.${mc.name} nullability mismatch: manifest=${mc.is_nullable}, live=${lc.is_nullable}`
      });
    }
  }
  for (const lc of live.columns) {
    if (!manifestByName.has(lc.name)) {
      diffs.push({
        severity: 'error',
        message: `${manifest.table}.${lc.name} present in live DB but absent from manifest`
      });
    }
  }
  return diffs;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const started = Date.now();

  let manifest;
  const manifestPath = resolve(REPO_ROOT, args.manifestPath);
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    const msg = `failed to read manifest at ${manifestPath}: ${err.message}`;
    if (args.json) process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
    else process.stderr.write(msg + '\n');
    process.exit(1);
  }

  if (!Array.isArray(manifest.tables) || manifest.tables.length === 0) {
    const msg = 'manifest has no tables';
    if (args.json) process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
    else process.stderr.write(msg + '\n');
    process.exit(1);
  }

  const tableNames = manifest.tables.map((t) => t.table);
  let client;
  try {
    client = await connect();
  } catch (err) {
    const msg = `DB connect failed: ${err.message}`;
    if (args.json) process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
    else process.stderr.write(msg + '\n');
    process.exit(1);
  }

  let live;
  try {
    live = await introspect(client, tableNames);
  } finally {
    await client.end().catch(() => {});
  }

  const allDiffs = [];
  let aligned = 0;
  for (const m of manifest.tables) {
    const l = live.get(m.table);
    const diffs = compareTable(m, l);
    if (diffs.length === 0) aligned += 1;
    allDiffs.push(...diffs);
  }
  const elapsedMs = Date.now() - started;

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: allDiffs.length === 0,
          tables_total: manifest.tables.length,
          tables_aligned: aligned,
          elapsed_ms: elapsedMs,
          diffs: allDiffs
        },
        null,
        2
      ) + '\n'
    );
  } else if (allDiffs.length === 0) {
    process.stdout.write(
      `OK: ${aligned}/${manifest.tables.length} marketing tables aligned with manifest (${elapsedMs}ms)\n`
    );
  } else {
    process.stdout.write(
      `DRIFT: ${manifest.tables.length - aligned}/${manifest.tables.length} tables drifted (${elapsedMs}ms)\n`
    );
    for (const d of allDiffs) process.stdout.write(`  - [${d.severity}] ${d.message}\n`);
  }

  process.exit(allDiffs.length === 0 ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`unexpected error: ${err.stack || err.message}\n`);
  process.exit(1);
});
