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

const { emitOverdueSignal, emitPersistentUnverifiedSignal } = await import('../../../scripts/periodic-liveness-watcher.mjs');

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
    // SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 (FR-5): sender_session and a non-empty
    // body so the lane-lint gauge stops counting this row as empty_sender_row/bodyless_row.
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      sender_session: 'periodic-liveness-watcher',
      body: expect.stringContaining('OVERDUE'),
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

// SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 (FR-5): emitPersistentUnverifiedSignal had NO
// existing test coverage anywhere in the suite (only the OVERDUE path was tested) — this is new
// coverage, not an extension, per PLAN-phase testing-agent review (3e0331d8-68ac-4027-a43f-8c795de07d1c).
describe('emitPersistentUnverifiedSignal (owner-first routing, UNVERIFIED path)', () => {
  it('routes to the resolved owner target, reports success, and stamps sender_session + a non-empty body', async () => {
    insertMock.mockResolvedValue({ error: null });
    const row = {
      process_key: 'p4',
      display_name: 'P4',
      owner: 'adam-fleet',
      last_state_changed_at: '2026-01-01T00:00:00Z',
    };

    const result = await emitPersistentUnverifiedSignal(row);

    expect(result.emitted).toBe(true);
    expect(result.error).toBeNull();
    expect(result.ownerTarget).toEqual({ kind: 'session', target: 'sess-owner-1', resolvedPeer: 'adam', live: true });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      target_session: 'sess-owner-1',
      subject: '[PERIODIC-LIVENESS] P4 has been UNVERIFIED for over 7 days',
      body: expect.stringContaining('UNVERIFIED'),
      sender_session: 'periodic-liveness-watcher',
      payload: expect.objectContaining({
        kind: 'periodic_liveness_flag',
        process_key: 'p4',
        resolved_target_kind: 'session',
        state: 'UNVERIFIED',
      }),
    }));
  });

  it('reports failure (not thrown) on an insert error', async () => {
    insertMock.mockResolvedValue({ error: { message: 'insert failed: check constraint' } });
    const row = { process_key: 'p5', display_name: 'P5', owner: 'coordinator-fleet', last_state_changed_at: '2026-01-01T00:00:00Z' };

    const result = await emitPersistentUnverifiedSignal(row);

    expect(result.emitted).toBe(false);
    expect(result.error).toEqual({ message: 'insert failed: check constraint' });
  });
});
