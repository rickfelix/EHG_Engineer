/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-3, TS-3) — coordinator-ack-adam.cjs
 * --disposition support: idempotent decision recording into solomon_advice_outcome_ledger.
 * Injected-stub coverage (no real DB).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/coordinator-ack-adam.cjs');

describe('FR-3: recordLedgerDecision — idempotent decision update', () => {
  it('TS-3: upserts decision/decision_by/decision_at keyed on correlation_id (ON CONFLICT DO UPDATE)', async () => {
    const calls = [];
    const sb = {
      from: () => ({
        upsert: (row, opts) => {
          calls.push({ row, opts });
          return Promise.resolve({ error: null });
        },
      }),
    };
    const r1 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x' });
    const r2 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x' });
    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(true);
    expect(calls).toHaveLength(2); // two upsert calls, both keyed on the SAME correlation_id (idempotent — never a second row)
    expect(calls[0].row.correlation_id).toBe('corr-1');
    expect(calls[0].row.decision).toBe('accepted');
    expect(calls[0].row.decision_by).toBe('session-x');
    expect(calls[0].opts.onConflict).toBe('correlation_id');
    expect(calls[1].row.correlation_id).toBe(calls[0].row.correlation_id);
  });

  it('rejects an invalid disposition without touching the DB', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'maybe' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/invalid disposition/);
    expect(m.VALID_DISPOSITIONS).toEqual(['accepted', 'rejected', 'partial']);
  });

  it('is fail-open on a DB error (never throws)', async () => {
    const sb = { from: () => ({ upsert: () => Promise.resolve({ error: { message: 'db down' } }) }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'rejected' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toBe('db down');
  });

  it('skips without a correlation_id', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { disposition: 'accepted' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/correlation_id/);
  });
});
