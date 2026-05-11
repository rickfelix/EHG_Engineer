#!/usr/bin/env node
/**
 * Pre-merge migration-readiness probe.
 *
 * Reads database/migrations/*.sql files changed in a PR, extracts declared
 * FUNCTION and TRIGGER objects, queries the live DB, and reports whether
 * each declared object is new (will be applied at merge), idempotent against
 * live state, or diverged (someone forgot to apply).
 *
 * SD-LEO-INFRA-PRE-MERGE-MIGRATION-001 (FR-1, FR-2).
 *
 * MVP scope: FUNCTION + TRIGGER only. TABLE/INDEX/POLICY deferred (VALIDATION R1).
 *
 * Outcome markers:
 *   [MIGRATION_READINESS_PASS]                     — all declared objects new or matching
 *   [MIGRATION_READINESS_PASS_NO_MIGRATIONS]       — no migration files in scope
 *   [MIGRATION_READINESS_FAIL_DRIFT_DETECTED]      — CREATE OR REPLACE body diverges from live (R2)
 *   [MIGRATION_READINESS_FAIL_CONFLICTING_DECLARATION] — CREATE (no OR REPLACE) on existing object (R5)
 *   [MIGRATION_READINESS_INFRA_ERROR]              — DB unreachable / secret missing
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createDatabaseClient } from './lib/supabase-connection.js';

const OUTCOME = {
  PASS: 'MIGRATION_READINESS_PASS',
  PASS_NO_MIGRATIONS: 'MIGRATION_READINESS_PASS_NO_MIGRATIONS',
  FAIL_DRIFT: 'MIGRATION_READINESS_FAIL_DRIFT_DETECTED',
  FAIL_CONFLICTING: 'MIGRATION_READINESS_FAIL_CONFLICTING_DECLARATION',
  INFRA_ERROR: 'MIGRATION_READINESS_INFRA_ERROR'
};

const MIGRATION_PATH_RE = /(^|\/)database\/migrations\/[^/]+\.sql$/;

function parseArgs(argv) {
  const opts = { pr: null, files: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') opts.pr = argv[++i];
    else if (a.startsWith('--pr=')) opts.pr = a.slice('--pr='.length);
    else if (a === '--files') opts.files = argv[++i];
    else if (a.startsWith('--files=')) opts.files = a.slice('--files='.length);
  }
  return opts;
}

export function listMigrationFiles({ pr, files, env = process.env }) {
  if (files) {
    return files.split(',').map(s => s.trim()).filter(Boolean).filter(p => MIGRATION_PATH_RE.test(p));
  }
  if (pr) {
    const repo = env.GITHUB_REPOSITORY || 'rickfelix/EHG_Engineer';
    const r = spawnSync('gh', ['api', `repos/${repo}/pulls/${pr}/files`, '--paginate'], {
      encoding: 'utf-8',
      env
    });
    if (r.status !== 0) throw new Error(`gh api failed: ${r.stderr || r.stdout}`);
    const arr = JSON.parse(r.stdout);
    return arr
      .filter(f => f.status !== 'removed')
      .map(f => f.filename)
      .filter(p => MIGRATION_PATH_RE.test(p));
  }
  const r = spawnSync('git', ['diff', 'origin/main...HEAD', '--name-only'], { encoding: 'utf-8' });
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map(s => s.trim()).filter(p => MIGRATION_PATH_RE.test(p));
}

/**
 * Extract CREATE [OR REPLACE] FUNCTION declarations.
 * Returns: [{ kind:'function', schema, name, body, hasOrReplace, range }]
 *
 * Handles dollar-quote variants: $$, $function$, $body$, $tag$.
 * Schema-qualified or bare names.
 */
export function parseFunctions(sql) {
  const results = [];
  const headerRe = /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(?:([a-z_][\w]*)\s*\.\s*)?([a-z_][\w]*)\s*\(/gi;
  let m;
  while ((m = headerRe.exec(sql)) !== null) {
    const hasOrReplace = !!m[1];
    const schema = (m[2] || 'public').toLowerCase();
    const name = m[3].toLowerCase();
    const tagRe = /\$([A-Za-z_][\w]*)?\$/g;
    tagRe.lastIndex = headerRe.lastIndex;
    const open = tagRe.exec(sql);
    if (!open) continue;
    const tag = open[0];
    const bodyStart = open.index + tag.length;
    const closeIdx = sql.indexOf(tag, bodyStart);
    if (closeIdx === -1) continue;
    const body = sql.slice(bodyStart, closeIdx);
    results.push({ kind: 'function', schema, name, body, hasOrReplace, range: [m.index, closeIdx + tag.length] });
    headerRe.lastIndex = closeIdx + tag.length;
  }
  return results;
}

/**
 * Extract CREATE [OR REPLACE] TRIGGER declarations.
 * Returns: [{ kind:'trigger', name, body, hasOrReplace }]
 */
export function parseTriggers(sql) {
  const results = [];
  const re = /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER\s+([a-z_][\w]*)\b([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const hasOrReplace = !!m[1];
    const name = m[2].toLowerCase();
    const body = m[0];
    results.push({ kind: 'trigger', name, body, hasOrReplace });
  }
  return results;
}

export function parseDeclaredObjects(sql) {
  return [...parseFunctions(sql), ...parseTriggers(sql)];
}

export function normalizeBody(text) {
  if (text == null) return '';
  return String(text)
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function compareBodies(prBody, liveBody) {
  return normalizeBody(prBody) === normalizeBody(liveBody);
}

async function queryLiveFunction(client, schema, name) {
  const r = await client.query(
    `SELECT p.prosrc AS body
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2
      LIMIT 1`,
    [schema, name]
  );
  return r.rows[0]?.body ?? null;
}

async function queryLiveTrigger(client, name) {
  const r = await client.query(
    `SELECT t.tgname
       FROM pg_trigger t
      WHERE NOT t.tgisinternal AND t.tgname = $1
      LIMIT 1`,
    [name]
  );
  return r.rowCount > 0;
}

export function shortDiff(a, b, lines = 6) {
  const an = normalizeBody(a).split('\n');
  const bn = normalizeBody(b).split('\n');
  const out = [`--- live`, `+++ migration`];
  const max = Math.max(an.length, bn.length);
  let printed = 0;
  for (let i = 0; i < max && printed < lines; i++) {
    if (an[i] !== bn[i]) {
      if (an[i] != null) out.push(`-${an[i]}`);
      if (bn[i] != null) out.push(`+${bn[i]}`);
      printed++;
    }
  }
  if (printed === 0) out.push('(differences are in collapsed whitespace only — should not occur after normalization)');
  return out.join('\n');
}

export async function evaluateMigration({ filePath, sql, client }) {
  const declared = parseDeclaredObjects(sql);
  const findings = [];
  for (const obj of declared) {
    if (obj.kind === 'function') {
      const live = await queryLiveFunction(client, obj.schema, obj.name);
      if (live == null) {
        findings.push({ ...obj, status: 'NEW' });
        continue;
      }
      if (!obj.hasOrReplace) {
        findings.push({ ...obj, status: 'CONFLICTING' });
        continue;
      }
      findings.push({ ...obj, status: compareBodies(obj.body, live) ? 'MATCHES' : 'DIVERGED', live });
    } else if (obj.kind === 'trigger') {
      const exists = await queryLiveTrigger(client, obj.name);
      if (!exists) findings.push({ ...obj, status: 'NEW' });
      else if (!obj.hasOrReplace) findings.push({ ...obj, status: 'CONFLICTING' });
      else findings.push({ ...obj, status: 'MATCHES' });
    }
  }
  return { filePath, declared, findings };
}

function classifyOutcome(reports) {
  if (reports.length === 0) return OUTCOME.PASS_NO_MIGRATIONS;
  let hasDrift = false, hasConflict = false;
  for (const r of reports) for (const f of r.findings) {
    if (f.status === 'DIVERGED') hasDrift = true;
    if (f.status === 'CONFLICTING') hasConflict = true;
  }
  if (hasConflict) return OUTCOME.FAIL_CONFLICTING;
  if (hasDrift) return OUTCOME.FAIL_DRIFT;
  return OUTCOME.PASS;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let files;
  try {
    files = listMigrationFiles(opts);
  } catch (err) {
    console.error(`[${OUTCOME.INFRA_ERROR}] ${err.message}`);
    console.log(JSON.stringify({ outcome: OUTCOME.INFRA_ERROR, error: err.message }));
    process.exit(2);
  }

  if (files.length === 0) {
    console.log(`[${OUTCOME.PASS_NO_MIGRATIONS}] no migration files in scope`);
    console.log(JSON.stringify({ outcome: OUTCOME.PASS_NO_MIGRATIONS, files: [] }));
    process.exit(0);
  }

  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: true });
  } catch (err) {
    console.error(`[${OUTCOME.INFRA_ERROR}] could not connect to live DB: ${err.message}`);
    console.log(JSON.stringify({ outcome: OUTCOME.INFRA_ERROR, error: err.message }));
    process.exit(2);
  }

  const reports = [];
  try {
    for (const filePath of files) {
      if (!existsSync(filePath)) continue;
      const sql = readFileSync(filePath, 'utf-8');
      reports.push(await evaluateMigration({ filePath, sql, client }));
    }
  } finally {
    await client.end().catch(() => {});
  }

  const outcome = classifyOutcome(reports);
  for (const r of reports) {
    for (const f of r.findings) {
      const tag = `${f.kind}:${f.schema || ''}.${f.name}`.replace(/^:\./, '');
      if (f.status === 'DIVERGED') {
        console.error(`[${OUTCOME.FAIL_DRIFT}] ${r.filePath} ${tag}\n${shortDiff(f.live, f.body)}`);
      } else if (f.status === 'CONFLICTING') {
        console.error(`[${OUTCOME.FAIL_CONFLICTING}] ${r.filePath} ${tag} — CREATE without OR REPLACE on existing object`);
      } else {
        console.log(`[${outcome}] ${r.filePath} ${tag} (${f.status})`);
      }
    }
  }
  console.log(JSON.stringify({ outcome, files: reports.map(r => ({ filePath: r.filePath, findings: r.findings.map(f => ({ kind: f.kind, schema: f.schema, name: f.name, status: f.status })) })) }));
  process.exit(outcome === OUTCOME.PASS || outcome === OUTCOME.PASS_NO_MIGRATIONS ? 0 : 1);
}

export { OUTCOME };

const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main().catch(err => {
    console.error(`[${OUTCOME.INFRA_ERROR}] unhandled: ${err.message}`);
    console.log(JSON.stringify({ outcome: OUTCOME.INFRA_ERROR, error: err.message }));
    process.exit(2);
  });
}
