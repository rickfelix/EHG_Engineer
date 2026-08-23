/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-3, TS-3) — coordinator-ack-adam.cjs
 * --disposition support: idempotent decision recording into solomon_advice_outcome_ledger.
 * Tail-inheritance (FR-4) and deferral-discipline (FR-6) added by
 * SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001. Injected-stub coverage (no real DB).
 *
 * QF-20260823-366: recordLedgerDecision's primary write switched from upsert(onConflict:
 * correlation_id) to a plain UPDATE guarded on decision='pending' — an upsert always attempts an
 * INSERT branch first, and this payload never carries proposal_summary (NOT NULL, no default), so
 * Postgres's constraint check fired before ON CONFLICT arbitration could ever run, 23502'ing on
 * every call. The primary write and the tail-inheritance write now share the exact same
 * .update(x).eq(col1,val1).eq(col2,val2).select() shape — discriminated below by col1
 * ('correlation_id' vs 'parent_correlation_id'), not by call order, since a single test can invoke
 * recordLedgerDecision more than once.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/coordinator-ack-adam.cjs');

/** Mock supabase supporting the primary decision UPDATE + the tail-inheritance UPDATE. */
function makeStubSupabase({ primaryError = null, primaryData = { id: 'row-1' }, updateError = null, updatedTailIds = [] } = {}) {
  const primaryUpdates = [];
  const tailUpdates = [];
  return {
    _primaryUpdates: primaryUpdates,
    _updates: tailUpdates,
    from: () => ({
      update: (patch) => ({
        eq: (col1, val1) => ({
          eq: (col2, val2) => ({
            select: () => {
              // Primary path (col1='correlation_id', UNIQUE): chains .maybeSingle(), a single row.
              // Tail path (col1='parent_correlation_id'): resolves select() directly, several rows.
              if (col1 === 'correlation_id') {
                return {
                  maybeSingle: () => {
                    primaryUpdates.push({ row: patch, col1, val1, col2, val2 });
                    return Promise.resolve({ data: primaryError ? null : primaryData, error: primaryError });
                  },
                };
              }
              tailUpdates.push({ patch, col1, val1, col2, val2 });
              return Promise.resolve({ data: updateError ? null : updatedTailIds.map((id) => ({ id })), error: updateError });
            },
          }),
        }),
      }),
    }),
  };
}

describe('FR-3: recordLedgerDecision — decision update guarded on decision=pending', () => {
  it('TS-3: updates decision/decision_by/decision_at keyed on correlation_id, guarded on decision=pending, never carries correlation_id/proposal_summary in the patch', async () => {
    const sb = makeStubSupabase();
    // FR-3 (W2): an accepted decision now MUST name its tracking artifact (outcome_ref).
    const result = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x', outcomeRef: 'SD-X-001' });
    expect(result.recorded).toBe(true);
    expect(sb._primaryUpdates).toHaveLength(1);
    const [update] = sb._primaryUpdates;
    expect(update.col1).toBe('correlation_id');
    expect(update.val1).toBe('corr-1');
    expect(update.col2).toBe('decision');
    expect(update.val2).toBe('pending'); // never overwrites an already-decided row
    expect(update.row).not.toHaveProperty('correlation_id');
    expect(update.row).not.toHaveProperty('proposal_summary'); // QF-20260823-366: the NOT NULL that broke the old upsert
    expect(update.row.decision).toBe('accepted');
    expect(update.row.decision_by).toBe('session-x');
    expect(update.row.outcome_ref).toBe('SD-X-001'); // FR-3: linkage stamped on the row
  });

  it('QF-20260823-366: a second call against an already-decided row reports no-pending-row rather than silently re-writing', async () => {
    // Models real Postgres: after the first UPDATE, the row's decision is no longer 'pending', so
    // the guard on the second call matches nothing — honest, not the old upsert's blind idempotency.
    let decided = false;
    const sb = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: (col2, val2) => ({
              select: () => ({
                maybeSingle: () => {
                  if (col2 === 'decision' && val2 === 'pending' && !decided) {
                    decided = true;
                    return Promise.resolve({ data: { id: 'row-1' }, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              }),
            }),
          }),
        }),
      }),
    };
    const r1 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x', outcomeRef: 'SD-X-001' });
    const r2 = await m.recordLedgerDecision(sb, { correlationId: 'corr-1', disposition: 'accepted', decidedBy: 'session-x', outcomeRef: 'SD-X-001' });
    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(false);
    expect(r2.reason).toMatch(/no pending ledger row/);
  });

  it('rejects an invalid disposition without touching the DB', async () => {
    const sb = { from: () => ({ update: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'maybe' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/invalid disposition/);
    expect(m.VALID_DISPOSITIONS).toEqual(['accepted', 'rejected', 'partial', 'deferred']);
  });

  it('is fail-open on a DB error (never throws)', async () => {
    const sb = makeStubSupabase({ primaryError: { message: 'db down' } });
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'rejected' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toBe('db down');
  });

  it('skips without a correlation_id', async () => {
    const sb = { from: () => ({ update: () => { throw new Error('should not be called'); } }) };
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
    const sb = { from: () => ({ update: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', decidedBy: 'session-x' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/outcome-ref|no-artifact|mandatory outcome linkage/);
  });

  it('REJECTS a partial with neither outcome_ref nor a no-artifact marker (partial is an adopt-class decision)', async () => {
    const sb = { from: () => ({ update: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'partial' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/mandatory outcome linkage/);
  });

  it('accepts with an explicit --no-artifact marker (stored durably as the NO_ARTIFACT sentinel in outcome_ref)', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', noArtifact: 'verbal chairman ack, no ticket' });
    expect(result.recorded).toBe(true);
    expect(sb._primaryUpdates[0].row.outcome_ref).toBe('NO_ARTIFACT: verbal chairman ack, no ticket');
    expect(m.isNoArtifactRef(sb._primaryUpdates[0].row.outcome_ref)).toBe(true);
  });

  it('accepts with a bare --no-artifact flag (true) → the plain NO_ARTIFACT sentinel', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', noArtifact: true });
    expect(result.recorded).toBe(true);
    expect(sb._primaryUpdates[0].row.outcome_ref).toBe('NO_ARTIFACT');
  });

  it('stamps a real contemporaneous decision_at (never a backfilled/historical timestamp)', async () => {
    const sb = makeStubSupabase();
    const before = Date.now();
    await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'accepted', outcomeRef: 'PR-6284' });
    const stamped = new Date(sb._primaryUpdates[0].row.decision_at).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it('does NOT require linkage for a rejected decision (nothing adopted → nothing to track)', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'rejected' });
    expect(result.recorded).toBe(true);
    expect(sb._primaryUpdates[0].row.outcome_ref).toBeUndefined();
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
    const sb = { from: () => ({ update: () => { throw new Error('should not be called'); } }) };
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'deferred' });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/defer-trigger/);
  });

  it('accepts disposition=deferred when a defer_trigger is supplied, writing it onto the row', async () => {
    const sb = makeStubSupabase();
    const result = await m.recordLedgerDecision(sb, { correlationId: 'c1', disposition: 'deferred', deferTrigger: 'next chairman weekly review' });
    expect(result.recorded).toBe(true);
    expect(sb._primaryUpdates[0].row.defer_trigger).toBe('next chairman weekly review');
  });
});
