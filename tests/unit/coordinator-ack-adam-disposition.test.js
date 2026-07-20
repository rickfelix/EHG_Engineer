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
    // FR-3 (W2): an accepted decision now MUST name its tracking artifact (outcome_ref).
    const r1 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x', outcomeRef: 'SD-X-001' });
    const r2 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x', outcomeRef: 'SD-X-001' });
    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(true);
    expect(sb._upserts).toHaveLength(2); // two upsert calls, both keyed on the SAME correlation_id (idempotent — never a second row)
    expect(sb._upserts[0].row.correlation_id).toBe('corr-1');
    expect(sb._upserts[0].row.decision).toBe('accepted');
    expect(sb._upserts[0].row.decision_by).toBe('session-x');
    expect(sb._upserts[0].row.outcome_ref).toBe('SD-X-001'); // FR-3: linkage stamped on the row
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
    const result = await m.recordLedgerDecision(sb, { correlationId: 'corr-primary', disposition: 'accepted', decidedBy: 'session-x', outcomeRef: 'SD-PRIMARY-001' });
    expect(result.recorded).toBe(true);
    expect(result.tailsInherited).toBe(2);
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].patch.decision).toBe('accepted');
    expect(sb._updates[0].patch.outcome_ref).toBe('SD-PRIMARY-001'); // FR-3: tails inherit the primary's linkage too
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
    const result = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', outcomeRef: 'SD-Z-001' });
    expect(result.recorded).toBe(true); // primary write still succeeds
    expect(result.tailsInherited).toBe(0);
  });

  it('TESTING-OBS-1 fix: a deferred primary propagates its defer_trigger onto inherited tails (never a bare deferred with no trigger)', async () => {
    const sb = makeStubSupabase({ updatedTailIds: ['tail-1'] });
    const result = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'deferred', deferTrigger: 'next chairman weekly review' });
    expect(result.tailsInherited).toBe(1);
    expect(sb._updates[0].patch.decision).toBe('deferred');
    expect(sb._updates[0].patch.defer_trigger).toBe('next chairman weekly review');
  });
});

describe('FR-3 (W2, SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001): mandatory outcome linkage at accept time', () => {
  it('REJECTS an accept with neither outcome_ref nor a no-artifact marker, before any DB write', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', decidedBy: 'session-x' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/outcome-ref|no-artifact|mandatory outcome linkage/);
  });

  it('REJECTS a partial with neither outcome_ref nor a no-artifact marker (partial is an adopt-class decision)', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'partial' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/mandatory outcome linkage/);
  });

  it('accepts with an explicit --no-artifact marker (stored durably as the NO_ARTIFACT sentinel in outcome_ref)', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', noArtifact: 'verbal chairman ack, no ticket' });
    expect(result.recorded).toBe(true);
    expect(sb._upserts[0].row.outcome_ref).toBe('NO_ARTIFACT: verbal chairman ack, no ticket');
    expect(m.isNoArtifactRef(sb._upserts[0].row.outcome_ref)).toBe(true);
  });

  it('accepts with a bare --no-artifact flag (true) → the plain NO_ARTIFACT sentinel', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', noArtifact: true });
    expect(result.recorded).toBe(true);
    expect(sb._upserts[0].row.outcome_ref).toBe('NO_ARTIFACT');
  });

  it('stamps a real contemporaneous decision_at (never a backfilled/historical timestamp)', async () => {
    const sb = makeStubSupabase();
    const before = Date.now();
    await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', outcomeRef: 'PR-6284' });
    const stamped = new Date(sb._upserts[0].row.decision_at).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it('does NOT require linkage for a rejected decision (nothing adopted → nothing to track)', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'rejected' });
    expect(result.recorded).toBe(true);
    expect(sb._upserts[0].row.outcome_ref).toBeUndefined();
  });

  it('resolveOutcomeRef is pure and deterministic (accept requires linkage; reject does not)', () => {
    expect(m.resolveOutcomeRef('accepted', {}).error).toMatch(/mandatory outcome linkage/);
    expect(m.resolveOutcomeRef('accepted', { outcomeRef: '  SD-A-1  ' }).ref).toBe('SD-A-1'); // trimmed
    expect(m.resolveOutcomeRef('partial', { noArtifact: true }).ref).toBe('NO_ARTIFACT');
    expect(m.resolveOutcomeRef('rejected', {}).ref).toBeNull();
    expect(m.LINKAGE_REQUIRED_DISPOSITIONS).toEqual(['accepted', 'partial']);
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
