/**
 * DR restore-rehearsal — pure core helpers (no DB imports).
 *
 * SD-LEO-INFRA-RESILIENCE-REVIEW-SPECIAL-001 (FR-4).
 *
 * Everything in this module is side-effect free and unit-testable offline:
 *  - scratch schema naming / validation
 *  - statement classification (the read-only safety contract)
 *  - the audited executor factory (works against any { query } client)
 *  - field-level fidelity comparison for JSONB round-trips
 *  - report assembly
 *
 * The live driver (restore-rehearsal.mjs) imports from here; tests import from
 * here with a mock client and never touch a database.
 */

export const SCRATCH_PREFIX = 'dr_rehearsal_';
export const MAX_SAMPLE = 500;

/** dr_rehearsal_<yyyymmdd_hhmm> (UTC). */
export function scratchSchemaName(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${SCRATCH_PREFIX}${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/** Strict shape check — every identifier we splice into SQL must pass this. */
export function isValidScratchSchema(name) {
  return /^dr_rehearsal_\d{8}_\d{4}$/.test(String(name || ''));
}

/** Clamp a requested sample size into [1, MAX_SAMPLE]. Non-numeric → fallback. */
export function clampSampleSize(n, fallback = MAX_SAMPLE) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), MAX_SAMPLE);
}

/**
 * Classify a SQL statement against the rehearsal safety contract.
 *
 * WHITELIST classifier — only statement shapes the rehearsal legitimately
 * issues are recognized; everything else is 'forbidden' and the executor
 * refuses to run it. This is what makes "READ-ONLY against sources" an
 * asserted property instead of a promise:
 *
 *   read          — SELECT/WITH..SELECT with no INTO and no DML keyword
 *   scratch-write — CREATE SCHEMA <scratch> | CREATE TABLE <scratch>.x |
 *                   INSERT INTO <scratch>.x | DROP SCHEMA <scratch> [CASCADE]
 *   forbidden     — anything else (any UPDATE/DELETE/TRUNCATE/ALTER, any
 *                   write whose target is not the scratch schema, SELECT INTO, …)
 *
 * @param {string} sql
 * @param {string} scratchSchema validated scratch schema name
 * @returns {'read'|'scratch-write'|'forbidden'}
 */
export function classifyStatement(sql, scratchSchema) {
  if (!isValidScratchSchema(scratchSchema)) return 'forbidden';
  const s = String(sql || '')
    .replace(/--[^\n]*/g, ' ')       // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .trim();
  if (!s) return 'forbidden';
  const upper = s.toUpperCase();
  const schemaU = scratchSchema.toUpperCase();

  // Pure reads. WITH is allowed only when it resolves to a SELECT and carries
  // no DML anywhere (CTE data-modifying statements are writes).
  if (/^(SELECT|WITH)\b/.test(upper)) {
    if (/\bINTO\b/.test(upper)) return 'forbidden';                  // SELECT INTO creates a table
    if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COPY)\b/.test(upper)) return 'forbidden';
    return 'read';
  }

  // Writes — must target the scratch schema explicitly.
  if (new RegExp(`^CREATE\\s+SCHEMA\\s+(IF\\s+NOT\\s+EXISTS\\s+)?"?${schemaU}"?\\s*$`).test(upper)) {
    return 'scratch-write';
  }
  if (new RegExp(`^CREATE\\s+TABLE\\s+"?${schemaU}"?\\s*\\.`).test(upper)) {
    return 'scratch-write';
  }
  if (new RegExp(`^INSERT\\s+INTO\\s+"?${schemaU}"?\\s*\\.`).test(upper)) {
    return 'scratch-write';
  }
  if (new RegExp(`^DROP\\s+SCHEMA\\s+(IF\\s+EXISTS\\s+)?"?${schemaU}"?\\s*(CASCADE)?\\s*$`).test(upper)) {
    return 'scratch-write';
  }

  return 'forbidden';
}

/**
 * Wrap a pg-style client into an audited executor.
 *
 * Every statement is classified BEFORE execution; 'forbidden' statements are
 * recorded and rejected without ever reaching the database. The audit log is
 * the evidence trail the final report asserts over.
 *
 * @param {{query: Function}} client  anything with query(sql, params)
 * @param {string} scratchSchema
 * @param {Array} auditLog            mutated in place
 * @returns {(sql: string, params?: any[], label?: string) => Promise<any>}
 */
export function makeAuditedExecutor(client, scratchSchema, auditLog) {
  if (!isValidScratchSchema(scratchSchema)) {
    throw new Error(`Invalid scratch schema name: ${scratchSchema}`);
  }
  return async function execute(sql, params = [], label = '') {
    const kind = classifyStatement(sql, scratchSchema);
    const entry = { label, kind, sql: String(sql).trim().split('\n')[0].slice(0, 160) };
    if (kind === 'forbidden') {
      entry.executed = false;
      auditLog.push(entry);
      throw new Error(`SAFETY: refusing to execute non-whitelisted statement (label=${label || 'n/a'}): ${entry.sql}`);
    }
    entry.executed = true;
    auditLog.push(entry);
    return client.query(sql, params);
  };
}

const NUMERIC_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
// ISO-ish timestamp: 2026-06-10T20:05:16.52339+00:00 / 2026-06-10 20:05:16+00
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Semantic field equality for a JSONB → typed-column → JSONB round trip.
 * Tolerates representation-only differences (timestamp rendering, numeric
 * string vs number, jsonb key order) while still failing on value changes.
 */
export function fieldsMatch(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true; // null vs undefined (absent key → NULL column)
  if (a == null || b == null) return false;

  const aNum = typeof a === 'number' || (typeof a === 'string' && NUMERIC_RE.test(a));
  const bNum = typeof b === 'number' || (typeof b === 'string' && NUMERIC_RE.test(b));
  if (aNum && bNum) return Number(a) === Number(b);

  if (typeof a === 'string' && typeof b === 'string' && TS_RE.test(a) && TS_RE.test(b)) {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    return canonicalJson(a) === canonicalJson(b);
  }

  return false;
}

/**
 * Field-level fidelity comparison for drill A.
 *
 * @param {object} args
 * @param {Array<object>} args.originals  archived row_data objects
 * @param {Array<object>} args.restored   to_jsonb(t) rows read back from scratch
 * @param {Array<string>} args.columns    live table column names (the restorable surface)
 * @param {string} [args.idField='id']
 * @returns {{rowsCompared:number, fieldChecks:number, mismatches:Array, missingRestored:Array, droppedKeys:Array}}
 */
export function compareRestoredRows({ originals, restored, columns, idField = 'id' }) {
  const colSet = new Set(columns);
  const restoredById = new Map();
  for (const r of restored) restoredById.set(String(r[idField]), r);

  const mismatches = [];
  const missingRestored = [];
  const droppedKeys = new Set();
  let fieldChecks = 0;
  let rowsCompared = 0;

  for (const orig of originals) {
    const id = String(orig[idField]);
    const rest = restoredById.get(id);
    if (!rest) {
      missingRestored.push(id);
      continue;
    }
    rowsCompared++;
    for (const key of Object.keys(orig)) {
      if (!colSet.has(key)) {
        // Schema drift: archived payload carries a key the live shape no longer
        // has. Not a fidelity failure (nothing to restore it INTO) — reported.
        droppedKeys.add(key);
        continue;
      }
      fieldChecks++;
      if (!fieldsMatch(orig[key], rest[key])) {
        mismatches.push({ id, field: key, original: orig[key], restored: rest[key] });
      }
    }
  }

  return {
    rowsCompared,
    fieldChecks,
    mismatches,
    missingRestored,
    droppedKeys: [...droppedKeys].sort(),
  };
}

/**
 * Compare two per-row md5 lists (drill B row-identity assertion).
 * Order-insensitive: both sides are sorted before comparison.
 */
export function md5ListsMatch(sourceHashes, scratchHashes) {
  const a = [...sourceHashes].sort();
  const b = [...scratchHashes].sort();
  const setB = new Set(b);
  const setA = new Set(a);
  const onlySource = a.filter((h) => !setB.has(h));
  const onlyScratch = b.filter((h) => !setA.has(h));
  return {
    match: onlySource.length === 0 && onlyScratch.length === 0 && a.length === b.length,
    sourceCount: a.length,
    scratchCount: b.length,
    onlySource: onlySource.slice(0, 10),
    onlyScratch: onlyScratch.slice(0, 10),
  };
}

/**
 * Assemble the final structured report. overall=PASS only when both drills
 * pass, zero forbidden statements were attempted, and cleanup dropped the
 * scratch schema.
 */
export function buildReport({ scratchSchema, startedAt, finishedAt, drillA, drillB, auditLog, schemaDropped, error }) {
  const forbidden = auditLog.filter((e) => e.kind === 'forbidden');
  const statementAudit = {
    total: auditLog.length,
    reads: auditLog.filter((e) => e.kind === 'read').length,
    scratchWrites: auditLog.filter((e) => e.kind === 'scratch-write').length,
    forbidden: forbidden.length,
    statements: auditLog.map(({ label, kind, executed }) => ({ label, kind, executed })),
  };
  const drillAPass = !!drillA && drillA.status === 'PASS';
  const drillBPass = !!drillB && drillB.status === 'PASS';
  const overall =
    drillAPass && drillBPass && forbidden.length === 0 && schemaDropped === true && !error
      ? 'PASS'
      : 'FAIL';
  return {
    sd: 'SD-LEO-INFRA-RESILIENCE-REVIEW-SPECIAL-001',
    rehearsal: 'dr-restore-rehearsal',
    scratchSchema,
    startedAt,
    finishedAt,
    drills: { A: drillA || { status: 'NOT_RUN' }, B: drillB || { status: 'NOT_RUN' } },
    statementAudit,
    cleanup: { schemaDropped: schemaDropped === true },
    error: error || null,
    overall,
  };
}
