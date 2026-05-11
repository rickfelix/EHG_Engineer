#!/usr/bin/env node
/**
 * apply-migration — canonical CLI for applying database/migrations/*.sql
 *
 * Modes:
 *   node scripts/apply-migration.js <path>                  # dry-run (no DB writes)
 *   node scripts/apply-migration.js <path> --prod-deploy    # live apply (requires 3-factor guards)
 *   node scripts/apply-migration.js --issue-token           # issue a single-use 1h prod-deploy token
 *
 * Outcome markers (stdout, one per run):
 *   [MIGRATION_APPLY_DRY_RUN]
 *   [MIGRATION_APPLY_DRY_RUN=ALREADY_APPLIED]
 *   [MIGRATION_APPLY_PROD_PASS]
 *   [MIGRATION_APPLY_PROD_FAIL_GUARDS=<factor>]
 *   [MIGRATION_APPLY_PROD_FAIL_LOCK_CONTENTION]
 *   [MIGRATION_APPLY_PROD_FAIL_TAMPERED]
 *   [MIGRATION_APPLY_PROD_FAIL_DDL_ERROR]
 *   [MIGRATION_APPLY_WARN_DESTRUCTIVE_DDL=<keyword>]  (to stderr, non-blocking)
 *
 * ## Trust Boundary
 * (FR-7 / SEC-W2.) The threat model assumes `database/migrations/*.sql` is
 * trusted: it has been PR-reviewed and merged to a branch by a known
 * collaborator before this tool is invoked. The genesis incident was a
 * CORRECT migration that DIDN'T ship; the inverse — an INCORRECT migration
 * that DOES ship — is NOT prevented by this tool. The destructive-DDL parser
 * warning is a *signal*, not a *gate*; defense-in-depth for downstream review
 * tooling (Phase-2 of the CI deploy SD). Token issuance is a deliberate
 * two-step manual handshake — prevents a fully-scripted catastrophic apply.
 *
 * SD: SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { parseDeclaredObjects, detectDestructiveDDL } from './lib/migration-object-parser.js';
import { captureObjectDefinitions, buildObjectDiffs } from './lib/migration-verification.js';
import {
  validateProdDeployGuards,
  hashToken,
  generateTokenValue,
} from './lib/migration-guards.js';
import { getLatestSuccessForPath } from '../lib/migration-audit-reader.js';

const GLOBAL_MIGRATION_LOCK_ID = 0x6d69_6772; // 'migr' as int — stable global advisory lock id
const LOCK_WAIT_MS = 5000;
const LOCK_POLL_MS = 100;

function emitMarker(marker) { process.stdout.write(marker + '\n'); }
function emitWarn(marker) { process.stderr.write(marker + '\n'); }

function parseArgs(argv) {
  const out = { positional: [], flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out.values[a.slice(2, eq)] = a.slice(eq + 1);
      else out.flags.add(a.slice(2));
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function pathLockId(p) {
  const h = crypto.createHash('sha256').update(p, 'utf8').digest();
  return h.readInt32BE(0);
}

function gitUserEmail() {
  try { return execSync('git config --get user.email', { encoding: 'utf8' }).trim(); }
  catch { return process.env.GIT_USER_EMAIL || ''; }
}

function resolveMigrationPath(repoRoot, rawPath, allowAnyPath) {
  const abs = path.isAbsolute(rawPath) ? rawPath : path.join(repoRoot, rawPath);
  const norm = path.normalize(abs).replace(/\\/g, '/');
  if (!allowAnyPath && !/\/database\/migrations\/[^/]+\.sql$/.test(norm)) {
    throw new Error(`path outside database/migrations/: ${norm}. Pass --allow-any-path to override.`);
  }
  if (!fs.existsSync(abs)) throw new Error(`migration file not found: ${abs}`);
  return abs;
}

async function findRepoRoot() {
  try { return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim(); }
  catch { return process.cwd(); }
}

async function tryAdvisoryLock(client, id) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const r = await client.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [id]);
    if (r.rows[0].ok) return true;
    await new Promise(res => setTimeout(res, LOCK_POLL_MS));
  }
  return false;
}

async function writeAuditRow(client, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO public.schema_migrations_applied (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`;
  const r = await client.query(sql, cols.map(c => row[c]));
  return r.rows[0].id;
}

async function readAuditLatestForPath(client, migrationPath) {
  const r = await client.query(
    `SELECT id, migration_sha256, applied_at
       FROM public.schema_migrations_applied
      WHERE migration_path = $1 AND success = true
      ORDER BY applied_at DESC
      LIMIT 1`,
    [migrationPath]
  );
  return r.rows[0] || null;
}

async function issueTokenMode() {
  const tokenValue = generateTokenValue();
  const tokenHashHex = hashToken(tokenValue);
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    await client.query('BEGIN');
    await writeAuditRow(client, {
      applied_by: gitUserEmail() || 'unknown',
      token_hash: tokenHashHex,
      token_issued_at: new Date().toISOString(),
    });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
  process.stdout.write(`MIGRATION_APPLY_TOKEN=${tokenValue}\n`);
  process.stderr.write('[MIGRATION_APPLY_TOKEN_ISSUED] 1h TTL, single-use. Set MIGRATION_APPLY_TOKEN env var and re-run with --prod-deploy.\n');
  return 0;
}

async function applyMode({ args, repoRoot }) {
  if (args.positional.length === 0) throw new Error('migration path is required (or use --issue-token)');
  const allowAny = args.flags.has('allow-any-path');
  const absPath = resolveMigrationPath(repoRoot, args.positional[0], allowAny);
  const sql = fs.readFileSync(absPath, 'utf8');
  const sha = sha256(sql);
  const declared = parseDeclaredObjects(sql);
  const stmts = splitPostgreSQLStatements(sql);
  const stmtCount = stmts.length;

  const destructive = detectDestructiveDDL(sql);
  for (const kw of destructive) emitWarn(`[MIGRATION_APPLY_WARN_DESTRUCTIVE_DDL=${kw.replace(/\s+/g, '_')}]`);

  const prodDeploy = args.flags.has('prod-deploy');
  const splitStatements = args.flags.has('split-statements');
  const noTx = args.flags.has('no-tx');
  const iKnow = args.flags.has('i-know');

  process.stderr.write(`[plan] path=${absPath}\n[plan] sha256=${sha}\n[plan] declared_objects=${declared.length}\n[plan] statements=${stmtCount}\n`);
  for (const d of declared) process.stderr.write(`  - ${d.kind} ${d.schema}.${d.name}${d.table ? ` ON ${d.table}` : ''}\n`);

  let auditClient = null;
  try { auditClient = await createDatabaseClient('engineer', { verify: false }); }
  catch (e) {
    process.stderr.write(`[degraded] cannot connect for audit-read: ${e.message}\n`);
  }

  if (auditClient) {
    try {
      // Consumer contract (PRD FR-6 / system_architecture invariant): downstream
      // consumers (e.g. SD-FDBK-INFRA-FIX-PENDING-MIGRATIONS-001) read via
      // lib/migration-audit-reader.js (`getLatestSuccessForPath`). The CLI itself
      // holds a service-role pg client and reads the audit table directly for
      // tx coherence; the import below keeps the helper in the apply-migration
      // entry-point module graph (wire-check) and serves as the contractual
      // source-of-truth for consumer integration. (Documented runtime branch is
      // exercised when MIGRATION_APPLY_USE_RPC_READER=true.)
      let prior = null;
      if (process.env.MIGRATION_APPLY_USE_RPC_READER === 'true') {
        try { prior = await getLatestSuccessForPath(absPath); }
        catch (readerErr) {
          process.stderr.write(`[audit-reader] ${readerErr.message} — falling back to direct read\n`);
          prior = await readAuditLatestForPath(auditClient, absPath);
        }
      } else {
        prior = await readAuditLatestForPath(auditClient, absPath);
      }
      if (prior) {
        if (prior.migration_sha256 === sha) {
          emitMarker('[MIGRATION_APPLY_DRY_RUN=ALREADY_APPLIED]');
          await auditClient.end();
          return 0;
        }
        if (prodDeploy) {
          emitMarker('[MIGRATION_APPLY_PROD_FAIL_TAMPERED]');
          process.stderr.write(`prior sha=${prior.migration_sha256} new sha=${sha} applied_at=${prior.applied_at}\n`);
          await auditClient.end();
          return 1;
        }
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/relation .* does not exist/i.test(msg)) {
        process.stderr.write('[degraded] schema_migrations_applied missing — bootstrap mode (no idempotence check, no audit row)\n');
      } else {
        await auditClient.end().catch(() => {});
        throw e;
      }
    }
  }

  if (!prodDeploy) {
    if (auditClient) await auditClient.end();
    emitMarker('[MIGRATION_APPLY_DRY_RUN]');
    return 0;
  }

  if (!auditClient) {
    emitMarker('[MIGRATION_APPLY_PROD_FAIL_GUARDS=token]');
    process.stderr.write('Cannot run --prod-deploy without DB connection (token check requires audit table).\n');
    return 1;
  }

  const guards = await validateProdDeployGuards({
    flagPresent: prodDeploy,
    tokenEnv: process.env.MIGRATION_APPLY_TOKEN,
    sqlContent: sql,
    gitUserEmail: gitUserEmail(),
    client: auditClient,
  });
  if (!guards.ok) {
    emitMarker(`[MIGRATION_APPLY_PROD_FAIL_GUARDS=${guards.factor}]`);
    process.stderr.write(`Guard rejection: ${guards.reason}\n`);
    await auditClient.end();
    return 1;
  }

  const useTx = !noTx;
  if (noTx && !iKnow) {
    process.stderr.write('--no-tx requires --i-know (non-tx-safe DDL only; CREATE INDEX CONCURRENTLY etc.)\n');
    await auditClient.end();
    return 1;
  }

  let auditId = null;
  let success = false;
  let errorMsg = null;
  let beforeDefs = [];
  let afterDefs = [];

  try {
    if (useTx) await auditClient.query('BEGIN');

    if (useTx) {
      const okPath = await tryAdvisoryLock(auditClient, pathLockId(absPath));
      const okGlobal = okPath ? await tryAdvisoryLock(auditClient, GLOBAL_MIGRATION_LOCK_ID) : false;
      if (!okPath || !okGlobal) {
        await auditClient.query('ROLLBACK');
        emitMarker('[MIGRATION_APPLY_PROD_FAIL_LOCK_CONTENTION]');
        await auditClient.end();
        return 1;
      }
    }

    beforeDefs = await captureObjectDefinitions(auditClient, declared);

    try {
      if (splitStatements) {
        for (const s of stmts) {
          const t = s.trim();
          if (t) await auditClient.query(t);
        }
      } else {
        await auditClient.query(sql);
      }
    } catch (e) {
      errorMsg = String(e.message || e);
      const hint = /concurrently/i.test(errorMsg)
        ? ' (hint: CREATE INDEX CONCURRENTLY needs --no-tx --i-know)'
        : '';
      if (useTx) await auditClient.query('ROLLBACK');
      emitMarker('[MIGRATION_APPLY_PROD_FAIL_DDL_ERROR]');
      process.stderr.write(`DDL error: ${errorMsg}${hint}\n`);

      const fc = await createDatabaseClient('engineer', { verify: false });
      try {
        await writeAuditRow(fc, {
          migration_path: absPath,
          migration_sha256: sha,
          applied_by: guards.approver,
          prod_deploy: true,
          dry_run: false,
          statement_count: stmtCount,
          object_diffs: JSON.stringify([]),
          success: false,
          error: errorMsg.slice(0, 4000),
        });
      } catch (writeErr) {
        process.stderr.write(`[audit-write-failed] ${writeErr.message}\n`);
      } finally {
        await fc.end();
      }

      await auditClient.end();
      return 1;
    }

    afterDefs = await captureObjectDefinitions(auditClient, declared);
    const diffs = buildObjectDiffs(beforeDefs, afterDefs);

    auditId = await writeAuditRow(auditClient, {
      migration_path: absPath,
      migration_sha256: sha,
      applied_by: guards.approver,
      prod_deploy: true,
      dry_run: false,
      statement_count: stmtCount,
      object_diffs: JSON.stringify(diffs),
      success: true,
    });

    await auditClient.query(
      `UPDATE public.schema_migrations_applied
          SET token_consumed_at = now()
        WHERE id = $1 AND token_consumed_at IS NULL`,
      [guards.tokenRowId]
    );

    if (useTx) await auditClient.query('COMMIT');
    success = true;
  } catch (e) {
    errorMsg = String(e.message || e);
    if (useTx) { try { await auditClient.query('ROLLBACK'); } catch {} }
    emitMarker('[MIGRATION_APPLY_PROD_FAIL_DDL_ERROR]');
    process.stderr.write(`unexpected error: ${errorMsg}\n`);
  } finally {
    await auditClient.end().catch(() => {});
  }

  if (success) emitMarker('[MIGRATION_APPLY_PROD_PASS]');
  return success ? 0 : 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.has('help') || (args.positional.length === 0 && !args.flags.has('issue-token'))) {
    process.stderr.write(
      'Usage: node scripts/apply-migration.js <migration-path> [--prod-deploy] [--allow-any-path] [--split-statements] [--no-tx --i-know]\n' +
      '       node scripts/apply-migration.js --issue-token\n'
    );
    return args.flags.has('help') ? 0 : 1;
  }
  const repoRoot = await findRepoRoot();
  if (args.flags.has('issue-token')) return issueTokenMode();
  return applyMode({ args, repoRoot });
}

const isEntry = (() => {
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (isEntry) {
  main().then(code => process.exit(code)).catch(err => {
    process.stderr.write(`fatal: ${err.message}\n`);
    process.exit(2);
  });
}

export { parseArgs, sha256, pathLockId, resolveMigrationPath };
