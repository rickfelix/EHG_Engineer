/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-3, TS-3) — coordinator-ack-adam.cjs
 * --disposition support: idempotent decision recording into solomon_advice_outcome_ledger.
 * Tail-inheritance (FR-4) and deferral-discipline (FR-6) added by
 * SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001. Injected-stub coverage (no real DB).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/coordinator-ack-adam.cjs');

/** Mock supabase supporting upsert (primary row) + update (tail-inheritance). */
function makeStubSupabase({ upsertError = null, updateError = null, updatedTailIds = [] } = {}) {
  const upserts = [];
  const updates = [];
  return {
    _upserts: upserts,
    _updates: updates,
    from: () => ({
      upsert: (row, opts) => { upserts.push({ row, opts }); return Promise.resolve({ error: upsertError }); },
      update: (patch) => ({
        eq: (col1, val1) => ({
          eq: (col2, val2) => ({
            select: () => {
              updates.push({ patch, col1, val1, col2, val2 });
              return Promise.resolve({ data: updateError ? null : updatedTailIds.map((id) => ({ id })), error: updateError });
            },
          }),
        }),
      }),
    }),
  };
}

describe('FR-3: recordLedgerDecision — idempotent decision update', () => {
  it('TS-3: upserts decision/decision_by/decision_at keyed on correlation_id (ON CONFLICT DO UPDATE)', async () => {
    const sb = makeStubSupabase();
    const r1 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x' });
    const r2 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x' });
    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(true);
    expect(sb._upserts).toHaveLength(2); // two upsert calls, both keyed on the SAME correlation_id (idempotent — never a second row)
    expect(sb._upserts[0].row.correlation_id).toBe('corr-1');
    expect(sb._upserts[0].row.decision).toBe('accepted');
    expect(sb._upserts[0].row.decision_by).toBe('session-x');
    expect(sb._upserts[0].opts.onConflict).toBe('correlation_id');
    expect(sb._upserts[1].row.correlation_id).toBe(sb._upserts[0].row.correlation_id);
  });

  it('rejects an invalid disposition without touching the DB', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'maybe' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/invalid disposition/);
    expect(m.VALID_DISPOSITIONS).toEqual(['accepted', 'rejected', 'partial', 'deferred']);
  });

  it('is fail-open on a DB error (never throws)', async () => {
    const sb = makeStubSupabase({ upsertError: { message: 'db down' } });
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

describe('FR-4: recordLedgerDecision — tail-inheritance', () => {
  it('TS-3 (guardrail): stamping a primary auto-inherits the same decision onto matching pending tails', async () => {
    const sb = makeStubSupabase({ updatedTailIds: ['tail-1', 'tail-2'] });
    const result = await m.recordLedgerDecision(sb, { correlationId: 'corr-primary', disposition: 'accepted', decidedBy: 'session-x' });
    expect(result.recorded).toBe(true);
    expect(result.tailsInherited).toBe(2);
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].patch.decision).toBe('accepted');
    expect(sb._updates[0].col1).toBe('parent_correlation_id');
    expect(sb._updates[0].val1).toBe('corr-primary');
    expect(sb._updates[0].col2).toBe('decision');
    expect(sb._updates[0].val2).toBe('pending'); // only pending tails inherit — never downgrades an already-decided tail
  });

  it('never touches an unrelated tail (no matching parent_correlation_id) — inheritTailDecisions is scoped, not global', async () => {
    const sb = makeStubSupabase({ updatedTailIds: [] });
    const result = await m.recordLedgerDecision(sb, { correlationId: 'corr-lonely', disposition: 'rejected' });
    expect(result.tailsInherited).toBe(0);
  });

  it('degrades to inherited:0 (never throws) when the migration has not been applied yet (column-missing error)', async () => {
    const sb = makeStubSupabase({ updateError: { message: 'column "parent_correlation_id" does not exist' } });
    const result = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted' });
    expect(result.recorded).toBe(true); // primary write still succeeds
    expect(result.tailsInherited).toBe(0);
  });
});

describe('FR-6: recordLedgerDecision — deferral-discipline enforcement', () => {
  it('TS-4 (guardrail): rejects disposition=deferred with no defer_trigger, before any DB write', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); }, update: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'deferred' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/defer-trigger/);
  });

  it('accepts disposition=deferred when a defer_trigger is supplied, writing it onto the row', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'deferred', deferTrigger: 'next chairman weekly review' });
    expect(result.recorded).toBe(true);
    expect(sb._upserts[0].row.defer_trigger).toBe('next chairman weekly review');
  });
});
