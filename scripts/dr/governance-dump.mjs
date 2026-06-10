#!/usr/bin/env node
/**
 * Governance data dump — weekly off-DB logical copy of irreplaceable tables.
 *
 * SD-LEO-INFRA-RESILIENCE-REVIEW-SPECIAL-001 (FR-2). npm run dr:dump -- <outDir>
 *
 * Reads scripts/dr/governance-dump-allowlist.json and writes one NDJSON file
 * per table (each line = to_jsonb(row)) plus manifest.json with per-table row
 * counts, byte sizes and sha256. The NDJSON format is deliberately the same
 * payload shape the restore rehearsal proves restorable (jsonb_populate_record
 * — see restore-rehearsal.mjs drill A).
 *
 * STRICTLY READ-ONLY: issues only catalog reads and SELECTs against tables
 * named in the committed allowlist (identifier-validated).
 *
 * Connection resolution (in order):
 *   1. DR_DUMP_DATABASE_URL                — explicit connection string
 *   2. PGHOST/PGUSER/PGPASSWORD/PGDATABASE — the housekeeping-prod-promotion
 *                                            secret pattern (PGPORT optional)
 *   3. local .env                          — SUPABASE_DB_PASSWORD via
 *                                            createDatabaseClient('engineer')
 *
 * Usage:
 *   node scripts/dr/governance-dump.mjs <outDir> [--tables a,b,c] [--max-rows N]
 *     --tables    subset filter (must still be allowlisted)
 *     --max-rows  per-table cap for smoke tests (manifest marks truncated:true)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { armCliTeardown } from '../../lib/cli-graceful-exit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = path.join(__dirname, 'governance-dump-allowlist.json');
const SAFE_IDENT = /^[a-z0-9_]+$/;
const BATCH = 1000;

function parseArgs(argv) {
  const args = { outDir: '', tables: null, maxRows: 0 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tables' && argv[i + 1]) args.tables = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--max-rows' && argv[i + 1]) args.maxRows = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (argv[i] === '--out' && argv[i + 1]) positional.push(argv[++i]);
    else if (!argv[i].startsWith('--')) positional.push(argv[i]);
  }
  args.outDir = positional[0] || '';
  return args;
}

function resolveConnection() {
  if (process.env.DR_DUMP_DATABASE_URL) {
    return { connectionString: process.env.DR_DUMP_DATABASE_URL, via: 'DR_DUMP_DATABASE_URL' };
  }
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    // Assemble via the URL API (handles percent-encoding of credentials).
    const u = new URL(`postgresql://${PGHOST}:${PGPORT || 5432}/${PGDATABASE}`);
    u.username = PGUSER;
    u.password = PGPASSWORD;
    return { connectionString: u.toString(), via: 'PG* env (housekeeping secret pattern)' };
  }
  return { connectionString: null, via: 'local .env (SUPABASE_DB_PASSWORD)' };
}

/** First primary-key column for deterministic pagination; ctid fallback. */
async function orderColumn(client, table) {
  const { rows } = await client.query(
    `SELECT a.attname AS col
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = ('public.' || $1)::regclass AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
      LIMIT 1`,
    [table]
  );
  return rows.length ? `"${rows[0].col}"` : 'ctid';
}

async function dumpTable(client, table, outDir, maxRows) {
  if (!SAFE_IDENT.test(table)) throw new Error(`unsafe table identifier: ${table}`);
  const orderBy = await orderColumn(client, table);
  const filePath = path.join(outDir, `${table}.ndjson`);
  const out = fs.createWriteStream(filePath);
  const hash = crypto.createHash('sha256');
  let rowsWritten = 0;
  let truncated = false;

  for (let offset = 0; ; offset += BATCH) {
    const limit = maxRows > 0 ? Math.min(BATCH, maxRows - rowsWritten) : BATCH;
    if (limit <= 0) { truncated = true; break; }
    const { rows } = await client.query(
      `SELECT to_jsonb(t) AS j FROM public."${table}" t ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`
    );
    for (const r of rows) {
      const line = JSON.stringify(r.j) + '\n';
      out.write(line);
      hash.update(line);
      rowsWritten++;
    }
    if (rows.length < limit) break;
    if (maxRows > 0 && rowsWritten >= maxRows) {
      // Did we stop early? Only truncated if the table actually has more rows.
      const probe = await client.query(
        `SELECT 1 FROM public."${table}" t ORDER BY ${orderBy} LIMIT 1 OFFSET ${rowsWritten}`
      );
      truncated = probe.rows.length > 0;
      break;
    }
  }

  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  const bytes = fs.statSync(filePath).size;
  return { table, rows: rowsWritten, bytes, sha256: hash.digest('hex'), truncated, file: path.basename(filePath) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outDir) {
    console.error('Usage: node scripts/dr/governance-dump.mjs <outDir> [--tables a,b,c] [--max-rows N]');
    await armCliTeardown(2);
    return;
  }

  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const allowed = new Set(allowlist.tables.map((t) => t.table));
  let targets = allowlist.tables.map((t) => t.table);
  if (args.tables) {
    const rejected = args.tables.filter((t) => !allowed.has(t));
    if (rejected.length) {
      console.error(`[dr:dump] refusing non-allowlisted tables: ${rejected.join(', ')}`);
      await armCliTeardown(2);
      return;
    }
    targets = args.tables;
  }

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const conn = resolveConnection();
  console.log(`[dr:dump] connecting via ${conn.via}; ${targets.length} table(s); out=${outDir}`);
  let client;
  try {
    client = await createDatabaseClient('engineer', {
      verify: false,
      ...(conn.connectionString ? { connectionString: conn.connectionString } : {}),
    });
  } catch (e) {
    console.error('[dr:dump] could not connect:', e.message);
    await armCliTeardown(2);
    return;
  }

  const manifest = {
    generator: 'scripts/dr/governance-dump.mjs',
    sd: 'SD-LEO-INFRA-RESILIENCE-REVIEW-SPECIAL-001',
    source_project: allowlist.source_project,
    allowlist_version: allowlist.version,
    restore_path: allowlist.restore_path,
    dumped_at: new Date().toISOString(),
    tables: [],
    total_rows: 0,
    total_bytes: 0,
    errors: [],
  };

  let exitCode = 0;
  try {
    for (const table of targets) {
      const started = Date.now();
      try {
        const entry = await dumpTable(client, table, outDir, args.maxRows);
        entry.ms = Date.now() - started;
        manifest.tables.push(entry);
        manifest.total_rows += entry.rows;
        manifest.total_bytes += entry.bytes;
        console.log(`[dr:dump]   ${table}: ${entry.rows} rows, ${(entry.bytes / 1048576).toFixed(1)} MB${entry.truncated ? ' (TRUNCATED — smoke test)' : ''} in ${entry.ms}ms`);
      } catch (e) {
        // Fail-soft per table so one broken table never zeroes the whole weekly artifact —
        // but the run still exits non-zero so the workflow surfaces it.
        manifest.errors.push({ table, error: e.message });
        console.error(`[dr:dump]   ${table}: FAILED — ${e.message}`);
        exitCode = 1;
      }
    }
  } finally {
    try { await client.end(); } catch { /* already closed */ }
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    `[dr:dump] ${manifest.errors.length ? 'PARTIAL' : 'DONE'} — ${manifest.tables.length}/${targets.length} tables, ` +
      `${manifest.total_rows} rows, ${(manifest.total_bytes / 1048576).toFixed(1)} MB; manifest.json written`
  );
  await armCliTeardown(exitCode);
}

main().catch(async (e) => {
  console.error('[dr:dump] fatal:', e);
  await armCliTeardown(2);
});
