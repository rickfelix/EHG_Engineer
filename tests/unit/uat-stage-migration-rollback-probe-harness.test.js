import { describe, it, expect, vi } from 'vitest';
import {
  assertNotCommitFamily,
  assertInTransaction,
  assertSqlState,
  withSavepoint,
  runRolledBack,
} from '../../lib/eva/uat-stage-migration/rollback-probe-harness.mjs';

describe('assertNotCommitFamily', () => {
  it('passes through an ordinary statement', () => {
    expect(assertNotCommitFamily('SELECT 1')).toBe('SELECT 1');
  });

  it('throws on a mid-string commit (not just a leading one)', () => {
    expect(() => assertNotCommitFamily('select 1; commit')).toThrow(/COMMIT_FAMILY_STATEMENT_BLOCKED/);
  });

  it('throws on END, PREPARE TRANSACTION, RELEASE SAVEPOINT', () => {
    expect(() => assertNotCommitFamily('end')).toThrow(/COMMIT_FAMILY_STATEMENT_BLOCKED/);
    expect(() => assertNotCommitFamily('prepare transaction \'x\'')).toThrow(/COMMIT_FAMILY_STATEMENT_BLOCKED/);
    expect(() => assertNotCommitFamily('release savepoint sp1')).toThrow(/COMMIT_FAMILY_STATEMENT_BLOCKED/);
  });

  it('does not false-positive on ON COMMIT DROP or READ COMMITTED (legitimate non-commit uses of the word)', () => {
    expect(() => assertNotCommitFamily('CREATE TEMP TABLE t (x int) ON COMMIT DROP')).not.toThrow();
    expect(() => assertNotCommitFamily('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')).not.toThrow();
  });
});

describe('assertInTransaction', () => {
  it('passes when now() differs from statement_timestamp()', async () => {
    const q = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ in_tx: true }] });
    await expect(assertInTransaction(q)).resolves.toBeUndefined();
  });

  it('throws when autocommit is in force (now() === statement_timestamp())', async () => {
    const q = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ in_tx: false }] });
    await expect(assertInTransaction(q)).rejects.toThrow(/NOT_IN_TRANSACTION/);
  });
});

describe('assertSqlState', () => {
  it('passes when the error code matches', () => {
    expect(assertSqlState({ code: '23514', message: 'violates check constraint' }, '23514')).toBe(true);
  });

  it('throws when no error was raised', () => {
    expect(() => assertSqlState(null, '23514')).toThrow(/SQLSTATE_ASSERTION_FAILED/);
  });

  it('throws when the code does not match', () => {
    expect(() => assertSqlState({ code: '42501' }, '23514')).toThrow(/expected 23514, got 42501/);
  });
});

describe('withSavepoint', () => {
  it('rolls back to the savepoint on success and reports landed:true', async () => {
    const calls = [];
    const q = vi.fn(async (sql) => { calls.push(sql); return { rows: [] }; });
    const result = await withSavepoint(q, 'test_form', async () => 'ok');
    expect(result).toEqual({ landed: true, result: 'ok' });
    expect(calls).toEqual(['SAVEPOINT sp_test_form', 'ROLLBACK TO SAVEPOINT sp_test_form']);
  });

  it('rolls back to the savepoint on failure and reports landed:false with the error', async () => {
    const q = vi.fn(async () => ({ rows: [] }));
    const boom = Object.assign(new Error('boom'), { code: '23514' });
    const result = await withSavepoint(q, 'test_form', async () => { throw boom; });
    expect(result.landed).toBe(false);
    expect(result.error).toBe(boom);
    expect(q).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT sp_test_form');
  });

  it('rejects an unsafe label (SQL injection guard)', async () => {
    const q = vi.fn();
    await expect(withSavepoint(q, "test'; drop table x --", async () => {})).rejects.toThrow(/UNSAFE_SAVEPOINT_LABEL/);
    expect(q).not.toHaveBeenCalled();
  });
});

describe('runRolledBack', () => {
  it('runs BEGIN, the body, then ROLLBACK on success', async () => {
    const calls = [];
    const client = { query: vi.fn(async (sql) => {
      calls.push(sql);
      if (sql === 'select now() <> statement_timestamp() as in_tx') return { rows: [{ in_tx: true }] };
      return { rows: [] };
    }) };
    const result = await runRolledBack(client, async () => 'body-result');
    expect(result).toBe('body-result');
    expect(calls[0]).toBe('BEGIN');
    expect(calls[calls.length - 1]).toBe('ROLLBACK');
  });

  it('still rolls back when the body throws', async () => {
    const calls = [];
    const client = { query: vi.fn(async (sql) => {
      calls.push(sql);
      if (sql === 'select now() <> statement_timestamp() as in_tx') return { rows: [{ in_tx: true }] };
      return { rows: [] };
    }) };
    await expect(runRolledBack(client, async () => { throw new Error('body failed'); })).rejects.toThrow('body failed');
    expect(calls[calls.length - 1]).toBe('ROLLBACK');
  });
});
