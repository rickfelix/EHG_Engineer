/**
 * QF-20260902-298 — coordinator-ack-adam.cjs --ledger-row/--correlation-id support: disposition
 * a solomon_advice_outcome_ledger row directly, with no coordinator-targeted adam_advisory row
 * in play. Injected-stub coverage (no real DB), mirroring coordinator-ack-adam-disposition.test.js's
 * mock shape for recordLedgerDecision's primary UPDATE + tail-inheritance UPDATE.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/coordinator-ack-adam.cjs');

/**
 * Mock supabase supporting BOTH the ledger-row correlation_id lookup (select().eq().maybeSingle())
 * and recordLedgerDecision's primary/tail UPDATE chains (same shape as the sibling disposition
 * test's makeStubSupabase). lookupData=null simulates an unknown --ledger-row id.
 */
function makeLedgerOnlySupabase({ lookupData = { correlation_id: 'corr-1' }, primaryData = { id: 'row-1' } } = {}) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: lookupData, error: null }) }) }),
      update: (patch) => ({
        eq: (col1) => ({
          eq: (col2, val2) => ({
            select: () => (col1 === 'correlation_id'
              ? { maybeSingle: () => Promise.resolve({ data: primaryData, error: null }) }
              : Promise.resolve({ data: [], error: null })),
          }),
        }),
      }),
    }),
  };
}

describe('QF-20260902-298: runLedgerOnlyDisposition — no advisory required', () => {
  it('a --ledger-row id resolves via the ledger table (the Solomon-to-Adam case the ticket names)', async () => {
    const runReconcile = vi.fn();
    const sb = makeLedgerOnlySupabase({ lookupData: { correlation_id: 'corr-solomon-1' } });
    const outcome = await m.runLedgerOnlyDisposition(sb, {
      ledgerRowId: 'ledger-row-1', disposition: 'accepted', coordinatorSession: 'session-x',
      outcomeRef: 'SD-X-001', runReconcile,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.correlationId).toBe('corr-solomon-1');
    expect(runReconcile).toHaveBeenCalledTimes(1);
  });

  it('an explicit --correlation-id resolves directly, without a ledger-row lookup (the coordinator-advisory case still works)', async () => {
    const runReconcile = vi.fn();
    const sb = makeLedgerOnlySupabase();
    const outcome = await m.runLedgerOnlyDisposition(sb, {
      explicitCorrelationId: 'corr-coordinator-1', disposition: 'accepted', coordinatorSession: 'session-x',
      outcomeRef: 'SD-X-001', runReconcile,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.correlationId).toBe('corr-coordinator-1');
  });

  it('an unknown --ledger-row id fails loud, never calls reconcile', async () => {
    const runReconcile = vi.fn();
    const sb = makeLedgerOnlySupabase({ lookupData: null });
    const outcome = await m.runLedgerOnlyDisposition(sb, {
      ledgerRowId: 'does-not-exist', disposition: 'accepted', coordinatorSession: 'session-x', runReconcile,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/ledger row not found: does-not-exist/);
    expect(runReconcile).not.toHaveBeenCalled();
  });

  it('missing --disposition fails loud before any lookup', async () => {
    const runReconcile = vi.fn();
    const sb = makeLedgerOnlySupabase();
    const outcome = await m.runLedgerOnlyDisposition(sb, { ledgerRowId: 'ledger-row-1', coordinatorSession: 'session-x', runReconcile });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/requires --disposition/);
    expect(runReconcile).not.toHaveBeenCalled();
  });

  it('mandatory outcome linkage (FR-3) still applies: accepted with no outcome-ref/no-artifact is rejected', async () => {
    const runReconcile = vi.fn();
    const sb = makeLedgerOnlySupabase();
    const outcome = await m.runLedgerOnlyDisposition(sb, {
      explicitCorrelationId: 'corr-1', disposition: 'accepted', coordinatorSession: 'session-x', runReconcile,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/requires --outcome-ref/);
    expect(runReconcile).not.toHaveBeenCalled();
  });
});

describe('QF-20260902-298: resolveLedgerCorrelationId', () => {
  it('prefers an explicit correlation-id over a ledger-row lookup', async () => {
    const sb = makeLedgerOnlySupabase({ lookupData: { correlation_id: 'should-not-be-used' } });
    const result = await m.resolveLedgerCorrelationId(sb, { explicitCorrelationId: 'corr-explicit' });
    expect(result.correlationId).toBe('corr-explicit');
  });

  it('reads correlation_id off the ledger row when only --ledger-row is given', async () => {
    const sb = makeLedgerOnlySupabase({ lookupData: { correlation_id: 'corr-from-row' } });
    const result = await m.resolveLedgerCorrelationId(sb, { ledgerRowId: 'row-9' });
    expect(result.correlationId).toBe('corr-from-row');
  });
});
