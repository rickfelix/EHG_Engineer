/**
 * SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B FR-2 -- unit coverage for
 * scripts/periodic-liveness-watcher.mjs::emitOverdueSignal's latch-only-after-success contract.
 *
 * Scoped mock (does not touch tests/unit/periodic-liveness-watcher.test.js's shared mock) so the
 * pre-existing evaluateRow test suite is unaffected. Mocks owner-target-resolver directly (a pure
 * ESM import, unlike the createRequire()-loaded session-liveness.cjs the existing suite works
 * around) so resolution behavior itself is exercised via its own dedicated unit tests.
 */
import { describe, it, expect, vi } from 'vitest';

const insertMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ insert: insertMock }),
  }),
}));

vi.mock('../../../lib/periodic-liveness/owner-target-resolver.mjs', () => ({
  resolveOwnerTarget: vi.fn().mockResolvedValue({ kind: 'session', target: 'sess-owner-1', resolvedPeer: 'adam', live: true }),
}));

vi.mock('../../../lib/periodic-liveness/ladder-escalation.mjs', () => ({
  climbLadder: vi.fn(),
  resetConsecutiveMiss: vi.fn(),
  emitLadderDigest: vi.fn(),
}));

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn(),
  escalateChairmanDecision: vi.fn(),
}));

const { emitOverdueSignal } = await import('../../../scripts/periodic-liveness-watcher.mjs');

describe('emitOverdueSignal (owner-first routing, latch-only-after-success)', () => {
  it('routes to the resolved owner target and reports success on a clean insert', async () => {
    insertMock.mockResolvedValue({ error: null });
    const row = { process_key: 'p1', display_name: 'P1', owner: 'adam-fleet' };
    const evaluation = { last_fired_at: '2026-01-01T00:00:00Z', age_ms: 9999 };

    const result = await emitOverdueSignal(row, evaluation);

    expect(result.emitted).toBe(true);
    expect(result.error).toBeNull();
    expect(result.ownerTarget).toEqual({ kind: 'session', target: 'sess-owner-1', resolvedPeer: 'adam', live: true });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      target_session: 'sess-owner-1',
      payload: expect.objectContaining({ process_key: 'p1', resolved_target_kind: 'session', state: 'OVERDUE' }),
    }));
  });

  it('reports failure (not thrown) on an insert error, so the caller can skip the latch', async () => {
    insertMock.mockResolvedValue({ error: { message: 'insert failed: check constraint' } });
    const row = { process_key: 'p2', display_name: 'P2', owner: 'coordinator-fleet' };
    const evaluation = { last_fired_at: '2026-01-01T00:00:00Z', age_ms: 5000 };

    const result = await emitOverdueSignal(row, evaluation);

    expect(result.emitted).toBe(false);
    expect(result.error).toEqual({ message: 'insert failed: check constraint' });
  });

  // QF-20260823-965: a multi-section CLI's registry row names which invocation actually proves
  // liveness -- the owner's FIRST escalation surface must say "run all", not a bare OVERDUE that
  // reads as a dead process when a differently-invoked-but-alive run is the real state.
  it('names the required invocation in the subject when the row declares one', async () => {
    insertMock.mockResolvedValue({ error: null });
    const row = {
      process_key: 'standard_loop:dashboard',
      display_name: 'coordinator loop: Fleet dashboard',
      owner: 'coordinator-fleet',
      liveness_source_ref: { cron: '2,7,12 * * * *', discovered_from: 'standard_loop', required_invocation: 'all' },
    };
    const evaluation = { last_fired_at: '2026-01-01T00:00:00Z', age_ms: 9999 };

    await emitOverdueSignal(row, evaluation);

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining("requires invocation: 'all'"),
    }));
  });

  it('omits the invocation note when the row has no required_invocation', async () => {
    insertMock.mockResolvedValue({ error: null });
    const row = { process_key: 'p3', display_name: 'P3', owner: 'coordinator-fleet' };
    const evaluation = { last_fired_at: '2026-01-01T00:00:00Z', age_ms: 9999 };

    await emitOverdueSignal(row, evaluation);

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: '[PERIODIC-LIVENESS] P3 is OVERDUE',
    }));
  });
});
