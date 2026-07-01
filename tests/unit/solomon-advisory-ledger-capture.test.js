/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-2, TR-2, TS-1, TS-2) — the fail-open
 * capture hook that upserts a solomon_advice_outcome_ledger row on every advisory send/request.
 * Injected-stub coverage (no real DB).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/solomon-advisory.cjs');

describe('FR-2/TR-2: captureLedgerRow — fail-open ledger capture', () => {
  it('TS-1: upserts a pending row keyed on correlation_id when the write succeeds', async () => {
    let upsertArgs = null;
    let onConflictArgs = null;
    const sb = {
      from: () => ({
        upsert: (row, opts) => {
          upsertArgs = row;
          onConflictArgs = opts;
          return Promise.resolve({ error: null });
        },
      }),
    };
    const result = await m.captureLedgerRow(sb, { advisoryId: 'adv-1', correlationId: 'corr-1', sdKey: 'SD-1', body: 'hello' });
    expect(result.captured).toBe(true);
    expect(upsertArgs.correlation_id).toBe('corr-1');
    expect(upsertArgs.advisory_id).toBe('adv-1');
    expect(upsertArgs.sd_key).toBe('SD-1');
    expect(upsertArgs.proposal_summary).toBe('hello');
    expect(onConflictArgs.onConflict).toBe('correlation_id');
    expect(onConflictArgs.ignoreDuplicates).toBe(true);
  });

  it('TS-2: is fail-open — a thrown/errored write never propagates', async () => {
    const throwing = { from: () => ({ upsert: () => { throw new Error('boom'); } }) };
    const errored = { from: () => ({ upsert: () => Promise.resolve({ error: { message: 'db down' } }) }) };
    const r1 = await m.captureLedgerRow(throwing, { correlationId: 'c1', body: 'x' });
    const r2 = await m.captureLedgerRow(errored, { correlationId: 'c2', body: 'x' });
    expect(r1.captured).toBe(false);
    expect(r1.reason).toMatch(/boom/);
    expect(r2.captured).toBe(false);
    expect(r2.reason).toMatch(/db down/);
  });

  it('skips (not captured) when no correlation_id is available, without touching the DB', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); } }) };
    const result = await m.captureLedgerRow(sb, { body: 'x' });
    expect(result.captured).toBe(false);
    expect(result.reason).toMatch(/correlation_id/);
  });
});
