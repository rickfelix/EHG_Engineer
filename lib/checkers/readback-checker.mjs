/**
 * SD-LEO-INFRA-CHECKER-READBACK-WRITE-001 — shared post-write readback Checker.
 *
 * After a state-changing write, independently re-reads the persisted row (a fresh
 * createSupabaseServiceClient() call, constructed inside this module — never accepted
 * as a parameter, never the caller's own write-response object, never UPDATE...RETURNING)
 * and asserts exactly-one-row-matched, deep field equality, and required-key preservation.
 * FAILS LOUD (throws a typed ReadbackCheckError subclass) on any violation. This module
 * performs no writes of its own — see tests/unit/checkers/readback-checker.test.js's
 * static source-pin guard.
 */
import { createSupabaseServiceClient } from '../supabase-client.js';

export class ReadbackCheckError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ReadbackCheckError';
    Object.assign(this, details);
  }
}

export class ReadbackRowcountError extends ReadbackCheckError {
  constructor(message, details) {
    super(message, details);
    this.name = 'ReadbackRowcountError';
  }
}

export class ReadbackFieldMismatchError extends ReadbackCheckError {
  constructor(message, details) {
    super(message, details);
    this.name = 'ReadbackFieldMismatchError';
  }
}

export class ReadbackKeyDropError extends ReadbackCheckError {
  constructor(message, details) {
    super(message, details);
    this.name = 'ReadbackKeyDropError';
  }
}

export class ReadbackQueryError extends ReadbackCheckError {
  constructor(message, details) {
    super(message, details);
    this.name = 'ReadbackQueryError';
  }
}

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function looksLikeTimestamp(value) {
  return typeof value === 'string' && ISO_TIMESTAMP_RE.test(value);
}

/**
 * JSON.stringify for error-message construction. Error paths must not themselves throw on the
 * exact class of value that triggered them (e.g. a BigInt field) — that would replace a specific
 * ReadbackFieldMismatchError with an opaque TypeError and mask the real failure.
 */
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Deep structural equality. Mirrors the per-field comparison already established in
 * golden-references/idempotent-composite-upsert/upsert-seam.mjs deepEq() (JSON.stringify
 * comparison) for consistency with this repo's precedent, plus a narrow ISO-timestamp
 * normalization so semantically-equal timestamps in different string forms are not
 * misreported as mismatches. Known, accepted limitation shared with the precedent: object
 * key ORDER affects the JSON.stringify comparison — out of scope for this SD (callers pass
 * expectedFields already DB-shaped).
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (looksLikeTimestamp(a) && looksLikeTimestamp(b)) {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false; // e.g. a BigInt payload — fail loud rather than false-PASS
  }
}

/**
 * verifyReadback({ table, match, expectedFields, requiredKeys })
 *
 * Independently re-reads the row identified by `match` from `table` and asserts:
 *   (a) EXACTLY ONE row matched `match` (zero OR more-than-one both throw — an
 *       over-broad match hitting N existing rows must not silently PASS on a row
 *       the caller never wrote)
 *   (b) row[key] deep-equals expectedFields[key] for every key in expectedFields
 *   (c) for every [column, keys] pair in requiredKeys, each key in `keys` is PRESENT
 *       on row[column] AND not null/undefined — a clobber that NULLs a key is treated
 *       identically to a clobber that drops it entirely
 *
 * A genuine query/transport error is wrapped in ReadbackQueryError, never misreported
 * as a rowcount failure.
 *
 * There is deliberately NO client-injection parameter: verifyReadback constructs its
 * own createSupabaseServiceClient() exactly once per call, so there is nothing for a
 * caller to accidentally reuse, cache, or pass a stale value through.
 *
 * @param {object} opts
 * @param {string} opts.table
 * @param {object} opts.match - column:value pairs identifying the row (passed to .match())
 * @param {object} [opts.expectedFields] - column:value pairs to verify equal
 * @param {object} [opts.requiredKeys] - { column: [key1, key2, ...] } for jsonb/object columns
 * @returns {Promise<{verdict: 'PASS', row: object}>}
 */
export async function verifyReadback({ table, match, expectedFields = {}, requiredKeys = {} } = {}) {
  if (!table || typeof table !== 'string') {
    throw new ReadbackCheckError('verifyReadback: table is required', { table });
  }
  if (!match || typeof match !== 'object' || Object.keys(match).length === 0) {
    throw new ReadbackCheckError('verifyReadback: match is required and must have at least one column', { table, match });
  }

  // RCA a726dd91: an unbounded request against a slow-to-fail host retries 4x through
  // postgrest-js's executeWithRetry and can stall 40s+. A post-write verifier that itself
  // hangs defeats its own purpose, so this opts into the bounded-fetch path added to
  // createSupabaseServiceClient() for exactly this call site (existing callers are unaffected —
  // the option defaults to off).
  const supabase = createSupabaseServiceClient({ fetchTimeoutMs: 10000 });

  let rows, error;
  try {
    const result = await supabase.from(table).select('*').match(match);
    rows = result.data;
    error = result.error;
  } catch (err) {
    throw new ReadbackQueryError(`verifyReadback: query threw for table "${table}": ${err.message}`, { table, match, cause: err });
  }
  if (error) {
    throw new ReadbackQueryError(`verifyReadback: query failed for table "${table}": ${error.message}`, { table, match, cause: error });
  }

  const count = Array.isArray(rows) ? rows.length : 0;
  if (count !== 1) {
    throw new ReadbackRowcountError(
      `verifyReadback: expected exactly 1 row matching ${safeStringify(match)} on "${table}", got ${count}`,
      { table, match, count }
    );
  }
  const row = rows[0];

  for (const key of Object.keys(expectedFields)) {
    if (!deepEqual(row[key], expectedFields[key])) {
      throw new ReadbackFieldMismatchError(
        `verifyReadback: field "${key}" on "${table}" read back as ${safeStringify(row[key])}, expected ${safeStringify(expectedFields[key])}`,
        { table, match, field: key, expected: expectedFields[key], actual: row[key] }
      );
    }
  }

  for (const column of Object.keys(requiredKeys)) {
    const value = row[column];
    const keys = requiredKeys[column] || [];
    const container = (value && typeof value === 'object') ? value : {};
    const dropped = keys.filter((k) => container[k] === null || container[k] === undefined);
    if (dropped.length > 0) {
      throw new ReadbackKeyDropError(
        `verifyReadback: required key(s) [${dropped.join(', ')}] missing or null on "${table}".${column}`,
        { table, match, column, droppedKeys: dropped }
      );
    }
  }

  return { verdict: 'PASS', row };
}
