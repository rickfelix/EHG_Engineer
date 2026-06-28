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
 *   [MIGRATION_READINESS_PASS_CHAIRMAN_GATED_PENDING] — body diverges, but the migration is an
 *                                                    intentionally chairman-gated staged-not-applied
 *                                                    migration (advisory, exit 0) (CHAIRMAN-GATED-EXEMPT-001)
 *   [MIGRATION_READINESS_FAIL_DRIFT_DETECTED]      — CREATE OR REPLACE body diverges from live (R2)
 *   [MIGRATION_READINESS_FAIL_CONFLICTING_DECLARATION] — CREATE (no OR REPLACE) on existing object (R5)
 *   [MIGRATION_READINESS_INFRA_ERROR]              — DB unreachable / secret missing
 *
 * SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-GATED-EXEMPT-001: a chairman-gated DB-function SD ships
 * its migration STAGED and defers the apply to a separate chairman GO (the requires_chairman_apply
 * convention), so live != migration is the EXPECTED state at merge time, not drift. When a migration
 * is chairman-gated — detected via the SD's metadata.requires_chairman_apply=true OR a dedicated
 * in-file header marker (-- @chairman-gated / -- requires-chairman-apply) — its body divergence is
 * downgraded to an advisory EXPECTED_PENDING (exit 0). Real-drift detection for every other migration
 * is UNCHANGED (still exit 1), and CONFLICTING is never exempted.
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createDatabaseClient } from './lib/supabase-connection.js';

const OUTCOME = {
  PASS: 'MIGRATION_READINESS_PASS',
  PASS_NO_MIGRATIONS: 'MIGRATION_READINESS_PASS_NO_MIGRATIONS',
  PASS_CHAIRMAN_GATED_PENDING: 'MIGRATION_READINESS_PASS_CHAIRMAN_GATED_PENDING',
  FAIL_DRIFT: 'MIGRATION_READINESS_FAIL_DRIFT_DETECTED',
  FAIL_CONFLICTING: 'MIGRATION_READINESS_FAIL_CONFLICTING_DECLARATION',
  INFRA_ERROR: 'MIGRATION_READINESS_INFRA_ERROR'
};

/**
 * SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-GATED-EXEMPT-001:
 * Detect a DEDICATED chairman-gated header marker on its own (near-bare) comment line.
 * Accepts `-- @chairman-gated`, `-- requires-chairman-apply`, `-- requires_chairman_apply`
 * (case-insensitive, leading whitespace tolerated). Deliberately does NOT match the broad
 * `-- @approved-by` marker (present on every prod migration) and does NOT match the tokens when
 * they merely appear inside prose/description sentences — the marker must be essentially the whole
 * comment line, so a normal migration cannot accidentally exempt its own drift.
 * @param {string} sql
 * @returns {boolean}
 */
export function parseChairmanGatedMarker(sql) {
  if (!sql) return false;
  // A comment line whose payload is just the marker token (optional trailing ':'/'=' + value),
  // e.g. "-- @chairman-gated", "-- requires-chairman-apply: codestreetlabs@gmail.com".
  const re = /^\s*--\s*(@chairman-gated|requires[-_]chairman[-_]apply)\b\s*[:=]?.*$/im;
  return re.test(sql);
}

const MIGRATION_PATH_RE = /(^|\/)database\/migrations\/[^/]+\.sql$/;

function parseArgs(argv) {
  const opts = { pr: null, files: null, sd: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') opts.pr = argv[++i];
    else if (a.startsWith('--pr=')) opts.pr = a.slice('--pr='.length);
    else if (a === '--files') opts.files = argv[++i];
    else if (a.startsWith('--files=')) opts.files = a.slice('--files='.length);
    else if (a === '--sd') opts.sd = argv[++i];
    else if (a.startsWith('--sd=')) opts.sd = a.slice('--sd='.length);
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
 * CHAIRMAN-GATED-EXEMPT-001: best-effort resolve the SD key for this run. An explicit `--sd <key>`
 * wins; otherwise infer a `SD-*` key from the head branch (GITHUB_HEAD_REF / GITHUB_REF_NAME, or the
 * current git branch — branches are `feat/SD-...`). Returns null when nothing resolves — the gate
 * then falls back to the in-file header marker only.
 * @returns {string|null}
 */
export function inferSdKey({ sd, env = process.env } = {}) {
  if (sd) return sd.trim();
  const candidates = [env.GITHUB_HEAD_REF, env.GITHUB_REF_NAME];
  if (!candidates.some(Boolean)) {
    const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' });
    if (r.status === 0) candidates.push(r.stdout.trim());
  }
  for (const c of candidates) {
    if (!c) continue;
    const m = /\b(SD-[A-Z0-9][A-Z0-9-]*)\b/i.exec(c);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/**
 * CHAIRMAN-GATED-EXEMPT-001: best-effort read of strategic_directives_v2.metadata.requires_chairman_apply
 * for the resolved SD. Any failure (no key, unreadable, missing row) returns false and is non-fatal —
 * the gate never errors on SD resolution; the header-marker path still applies per-file.
 * @returns {Promise<boolean>}
 */
export async function resolveSdGated({ sdKey, client }) {
  if (!sdKey || !client) return false;
  try {
    const r = await client.query(
      `SELECT (metadata->>'requires_chairman_apply') AS flag
         FROM strategic_directives_v2
        WHERE sd_key = $1
        LIMIT 1`,
      [sdKey]
    );
    return r.rows[0]?.flag === 'true' || r.rows[0]?.flag === true;
  } catch {
    return false;
  }
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

/**
 * SD-REFILL-00EAHZRZ: collect objects that are idempotently dropped before (re)creation.
 * A `DROP {TRIGGER|FUNCTION} IF EXISTS <name>` makes a following bare `CREATE` of that object
 * idempotent — semantically equivalent to `CREATE OR REPLACE` — so the bare CREATE must NOT be
 * flagged CONFLICTING just because the object already exists live. Keyed `${kind}:${name}` to
 * match the lowercased name parseTriggers/parseFunctions store (function names are matched
 * unqualified, mirroring how an unqualified DROP ... IF EXISTS resolves on the search_path).
 * @param {string} sql
 * @returns {Set<string>}
 */
export function parseDropIfExists(sql) {
  const set = new Set();
  const trigRe = /DROP\s+TRIGGER\s+IF\s+EXISTS\s+([a-z_][\w]*)/gi;
  const funcRe = /DROP\s+FUNCTION\s+IF\s+EXISTS\s+(?:[a-z_][\w]*\.)?([a-z_][\w]*)/gi;
  let m;
  while ((m = trigRe.exec(sql)) !== null) set.add(`trigger:${m[1].toLowerCase()}`);
  while ((m = funcRe.exec(sql)) !== null) set.add(`function:${m[1].toLowerCase()}`);
  return set;
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

export async function evaluateMigration({ filePath, sql, client, chairmanGated = false }) {
  const declared = parseDeclaredObjects(sql);
  // SD-REFILL-00EAHZRZ: a `DROP ... IF EXISTS <name>` ahead of a bare CREATE of the same object
  // makes that CREATE idempotent — treat it like CREATE OR REPLACE (status IDEMPOTENT, not CONFLICTING).
  const droppedIfExists = parseDropIfExists(sql);
  const isIdempotentRecreate = (obj) => droppedIfExists.has(`${obj.kind}:${obj.name}`);
  // CHAIRMAN-GATED-EXEMPT-001: this migration is gated if the SD requires a chairman apply OR the
  // file carries the dedicated header marker. When gated, a diverged CREATE OR REPLACE FUNCTION body
  // is EXPECTED (staged-not-applied), so it is downgraded to EXPECTED_PENDING. CONFLICTING is a real
  // declaration error and is NEVER exempted.
  const gated = chairmanGated || parseChairmanGatedMarker(sql);
  const findings = [];
  for (const obj of declared) {
    if (obj.kind === 'function') {
      const live = await queryLiveFunction(client, obj.schema, obj.name);
      if (live == null) {
        findings.push({ ...obj, status: 'NEW' });
        continue;
      }
      if (!obj.hasOrReplace) {
        findings.push({ ...obj, status: isIdempotentRecreate(obj) ? 'IDEMPOTENT' : 'CONFLICTING' });
        continue;
      }
      const matches = compareBodies(obj.body, live);
      const divergedStatus = gated ? 'EXPECTED_PENDING' : 'DIVERGED';
      findings.push({ ...obj, status: matches ? 'MATCHES' : divergedStatus, live });
    } else if (obj.kind === 'trigger') {
      const exists = await queryLiveTrigger(client, obj.name);
      if (!exists) findings.push({ ...obj, status: 'NEW' });
      else if (!obj.hasOrReplace) findings.push({ ...obj, status: isIdempotentRecreate(obj) ? 'IDEMPOTENT' : 'CONFLICTING' });
      else findings.push({ ...obj, status: 'MATCHES' });
    }
  }
  return { filePath, declared, findings };
}

export function classifyOutcome(reports) {
  if (reports.length === 0) return OUTCOME.PASS_NO_MIGRATIONS;
  let hasDrift = false, hasConflict = false, hasExpectedPending = false;
  for (const r of reports) for (const f of r.findings) {
    if (f.status === 'DIVERGED') hasDrift = true;
    if (f.status === 'CONFLICTING') hasConflict = true;
    if (f.status === 'EXPECTED_PENDING') hasExpectedPending = true;
  }
  // Priority: a real declaration error or genuine (non-gated) drift always dominates a gated
  // advisory — a mixed PR with any non-gated DIVERGED still red-blocks (CHAIRMAN-GATED-EXEMPT-001).
  if (hasConflict) return OUTCOME.FAIL_CONFLICTING;
  if (hasDrift) return OUTCOME.FAIL_DRIFT;
  if (hasExpectedPending) return OUTCOME.PASS_CHAIRMAN_GATED_PENDING;
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
    // QF-20260513-258: In CI (pre-merge-migration-readiness.yml) the
    // pooler/admin password isn't a configured secret — only DATABASE_URL /
    // SUPABASE_POOLER_URL are exposed. Pass connectionString explicitly so
    // supabase-connection.js skips the SUPABASE_DB_PASSWORD requirement.
    const connectionString =
      process.env.SUPABASE_POOLER_URL ||
      process.env.DATABASE_URL ||
      undefined;
    client = await createDatabaseClient('engineer', { verify: true, connectionString });
  } catch (err) {
    console.error(`[${OUTCOME.INFRA_ERROR}] could not connect to live DB: ${err.message}`);
    console.log(JSON.stringify({ outcome: OUTCOME.INFRA_ERROR, error: err.message }));
    process.exit(2);
  }

  // CHAIRMAN-GATED-EXEMPT-001: resolve the SD-level chairman-apply flag once (best-effort, non-fatal).
  // A true flag gates ALL of this PR's migrations; each file is ALSO gated individually if it carries
  // the in-file header marker (handled inside evaluateMigration).
  const sdKey = inferSdKey({ sd: opts.sd });
  const sdGated = await resolveSdGated({ sdKey, client });

  const reports = [];
  try {
    for (const filePath of files) {
      if (!existsSync(filePath)) continue;
      const sql = readFileSync(filePath, 'utf-8');
      reports.push(await evaluateMigration({ filePath, sql, client, chairmanGated: sdGated }));
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
      } else if (f.status === 'EXPECTED_PENDING') {
        // Advisory (NOT a failure): body diverges from live because the chairman-gated apply is
        // deferred to a separate GO. Stated clearly so a green-with-advisory is not read as applied.
        console.log(`[${OUTCOME.PASS_CHAIRMAN_GATED_PENDING}] ${r.filePath} ${tag} — expected-pending: chairman-gated apply deferred (live differs from migration BY DESIGN)`);
      } else {
        console.log(`[${outcome}] ${r.filePath} ${tag} (${f.status})`);
      }
    }
  }
  if (sdGated) console.log(`[${OUTCOME.PASS_CHAIRMAN_GATED_PENDING}] SD ${sdKey} metadata.requires_chairman_apply=true — body divergence treated as expected-pending`);
  console.log(JSON.stringify({ outcome, sdKey, sdGated, files: reports.map(r => ({ filePath: r.filePath, findings: r.findings.map(f => ({ kind: f.kind, schema: f.schema, name: f.name, status: f.status })) })) }));
  const passing = outcome === OUTCOME.PASS || outcome === OUTCOME.PASS_NO_MIGRATIONS || outcome === OUTCOME.PASS_CHAIRMAN_GATED_PENDING;
  process.exit(passing ? 0 : 1);
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
