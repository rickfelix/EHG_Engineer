/**
 * Shared rollback-guaranteed probe harness (SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-7/TR-5/TR-7).
 *
 * Extracted from scripts/anon-write-contract-probe.mjs, the repo's existing battle-tested
 * reference implementation for exactly this shape of probe (per this SD's own PRD/TESTING
 * sub-agent evidence 8ca0d619-e4de-4284-922d-3c592d5f3863). This is an extraction, not
 * greenfield work: re-deriving these primitives independently risks reintroducing the defects
 * that file's own header documents having already found and fixed live (a COMMIT_FAMILY guard
 * anchored with `^` and no `m` flag that missed a mid-string `commit`, an autocommit false-pass
 * that made every statement its own transaction while reading as safe).
 */
'use strict';

/** Distinct exit codes: a caller that cannot tell these apart treats inconclusive as a pass. */
export const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1,
  FAIL: 2,
  PROBE_INCONCLUSIVE: 4,
});

/**
 * IT MUST INSPECT EVERY STATEMENT, NOT THE FIRST. Anchoring with `^` and no `m` flag reads only
 * the head of the string; node-postgres sends a param-less query over the SIMPLE protocol, which
 * executes semicolon-separated statements, so `select 1; commit` would commit while a prefix-only
 * guard reads clean. Verbatim from anon-write-contract-probe.mjs's own COMMIT_FAMILY, which fixed
 * exactly this live.
 */
const COMMIT_FAMILY = /(^|;)\s*(commit|end|prepare\s+transaction|release\s+savepoint)\b/i;
export function assertNotCommitFamily(sql) {
  const text = String(sql);
  if (COMMIT_FAMILY.test(text)) throw new Error(`COMMIT_FAMILY_STATEMENT_BLOCKED: ${text.slice(0, 80)}`);
  return sql;
}

/**
 * Proves BEGIN actually opened a transaction, not merely that the call didn't throw. Autocommit
 * is the un-greppable commit: in autocommit every statement is its own transaction, so now()
 * (transaction start) equals statement_timestamp(); inside a real multi-statement transaction the
 * second statement onward makes them diverge. Verbatim technique from
 * anon-write-contract-probe.mjs's probeTable().
 * @param {Function} q bound query function
 * @throws if not actually inside a transaction
 */
export async function assertInTransaction(q) {
  await q('select 1');
  const { rows: [tx] } = await q('select now() <> statement_timestamp() as in_tx');
  if (tx?.in_tx !== true) {
    throw new Error('NOT_IN_TRANSACTION: BEGIN did not open a transaction -- refusing to issue any write');
  }
}

/**
 * TR-7: one shared SQLSTATE assertion helper, reused across every probe requiring FR-7's SQLSTATE
 * check, instead of hand-rolling .rejects.toMatchObject({code:...}) or expect(err.code).toBe(...)
 * per probe (TESTING sub-agent found 2 divergent hand-rolled idioms already in the repo and zero
 * shared helper).
 * @param {Error & {code?: string}} err
 * @param {string} expectedCode e.g. '23514' for a CHECK constraint violation
 * @throws if err is falsy or err.code does not match expectedCode
 */
export function assertSqlState(err, expectedCode) {
  if (!err) throw new Error(`SQLSTATE_ASSERTION_FAILED: expected ${expectedCode} but no error was raised`);
  if (err.code !== expectedCode) {
    throw new Error(`SQLSTATE_ASSERTION_FAILED: expected ${expectedCode}, got ${err.code ?? '(no code)'} -- ${err.message}`);
  }
  return true;
}

/**
 * Run one statement under its own SAVEPOINT and always roll back to it -- LANDS or REFUSED, the
 * probe's own transaction stays clean either way, and the pair is independent of any other
 * statement run before or after it. Generalized form of anon-write-contract-probe.mjs's attempt().
 * @param {Function} q bound query function
 * @param {string} label savepoint name suffix (alphanumeric/underscore only -- interpolated into SQL)
 * @param {() => Promise<any>} fn the statement(s) to attempt
 * @returns {Promise<{landed: true, result: any} | {landed: false, error: Error}>}
 */
export async function withSavepoint(q, label, fn) {
  if (!/^[A-Za-z0-9_]+$/.test(label)) throw new Error(`UNSAFE_SAVEPOINT_LABEL: ${label}`);
  const sp = `sp_${label}`;
  await q(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    await q(`ROLLBACK TO SAVEPOINT ${sp}`);
    return { landed: true, result };
  } catch (error) {
    await q(`ROLLBACK TO SAVEPOINT ${sp}`);
    return { landed: false, error };
  }
}

/**
 * Wraps an entire probe body in BEGIN/ROLLBACK, guaranteeing rollback runs even if the body
 * throws. The invariant is COMMIT-NEVER-ISSUED, not ROLLBACK-in-finally: q() below wraps every
 * query in assertNotCommitFamily(), so no path through fn can ever issue a real COMMIT -- the
 * finally-ROLLBACK is hygiene, not the safety mechanism itself (verbatim framing from
 * anon-write-contract-probe.mjs's own header, which is the point: stating it correctly is what
 * makes a connection drop, a throw inside a catch, or an early return all already safe).
 * @param {{query: Function}} client
 * @param {(q: Function) => Promise<any>} fn
 */
export async function runRolledBack(client, fn) {
  const q = (sql, params) => client.query(assertNotCommitFamily(sql), params);
  await q('BEGIN');
  try {
    await assertInTransaction(q);
    return await fn(q);
  } finally {
    await q('ROLLBACK');
  }
}
