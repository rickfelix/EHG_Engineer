/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A (FR-3) — unit tests for
 * emergencyUnblockGate() (lib/eva/artifact-persistence-service.js), built on the
 * SAME chairman_decisions audit substrate as recordGateOverride()/checkGateDebt().
 *
 * Per SEC-COORD-1: this is a LIVENESS-ONLY, NON-RESOLVING action. It must never write an
 * approving `decision` value and must never itself call any stage-advance RPC — these tests
 * assert the update payload directly rather than trusting the return value alone.
 */
import { describe, it, expect, vi } from 'vitest';

import { emergencyUnblockGate } from '../../../lib/eva/artifact-persistence-service.js';

const DECISION_ID = 'decision-hc-1';
const VENTURE_ID = 'venture-1';

/**
 * Table-aware supabase fake. `updateCalls` records every payload passed to
 * chairman_decisions.update(...) so tests can assert the audit marker AND that
 * `decision` is never set to an approving value.
 */
function makeSupabase({
  decisionRow,
  stageRow = { is_irreversible: false },
  decisionReadError = null,
  stageReadError = null,
} = {}) {
  const updateCalls = [];
  const from = vi.fn((table) => {
    if (table === 'chairman_decisions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              decisionReadError ? { data: null, error: decisionReadError } : { data: decisionRow, error: null },
          }),
        }),
        update: (payload) => ({
          eq: async () => {
            updateCalls.push(payload);
            return { error: null };
          },
        }),
      };
    }
    if (table === 'venture_stages') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              stageReadError ? { data: null, error: stageReadError } : { data: stageRow, error: null },
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from, updateCalls };
}

describe('emergencyUnblockGate', () => {
  it('throws when decisionId is missing', async () => {
    const supabase = makeSupabase({});
    await expect(emergencyUnblockGate(supabase, null)).rejects.toThrow('requires decisionId');
  });

  it('returns decision_not_found when no row matches', async () => {
    const supabase = makeSupabase({ decisionRow: null });
    const result = await emergencyUnblockGate(supabase, DECISION_ID);
    expect(result).toEqual({ ok: false, error: 'decision_not_found', decisionId: DECISION_ID });
  });

  it('routine (non-irreversible) gate: re-opens without approving, requiresManualConfirmation=false', async () => {
    const supabase = makeSupabase({
      decisionRow: { id: DECISION_ID, venture_id: VENTURE_ID, lifecycle_stage: 19, status: 'pending', blocking: true, decision: 'pending' },
      stageRow: { is_irreversible: false },
    });

    const result = await emergencyUnblockGate(supabase, DECISION_ID, { reason: 'SMS bridge down 2 days' });

    expect(result.ok).toBe(true);
    expect(result.isIrreversible).toBe(false);
    expect(result.requiresManualConfirmation).toBe(false);

    expect(supabase.updateCalls).toHaveLength(1);
    const payload = supabase.updateCalls[0];
    expect(payload.status).toBe('pending');
    expect(payload.blocking).toBe(true);
    expect(payload.decision).toBe('pending'); // NEVER an approving value
    expect(payload.approval_type).toBe('emergency_liveness_unblock');
    expect(payload.override_reason).toContain('EMERGENCY_UNBLOCK: liveness re-open, not an approval');
    expect(payload.override_reason).toContain('SMS bridge down 2 days');
  });

  it('irreversible (Stage-24-class) gate: also never approves, but flags requiresManualConfirmation=true', async () => {
    const supabase = makeSupabase({
      decisionRow: { id: DECISION_ID, venture_id: VENTURE_ID, lifecycle_stage: 24, status: 'pending', blocking: true, decision: 'pending' },
      stageRow: { is_irreversible: true },
    });

    const result = await emergencyUnblockGate(supabase, DECISION_ID);

    expect(result.ok).toBe(true);
    expect(result.isIrreversible).toBe(true);
    expect(result.requiresManualConfirmation).toBe(true);

    // Same non-approving guarantee holds identically for an irreversible gate.
    expect(supabase.updateCalls).toHaveLength(1);
    const payload = supabase.updateCalls[0];
    expect(payload.decision).toBe('pending');
    expect(payload.blocking).toBe(true);
    expect(payload.status).toBe('pending');
  });

  it('is idempotent on an already-pending row: calling twice produces the same non-approving result both times', async () => {
    const supabase = makeSupabase({
      decisionRow: { id: DECISION_ID, venture_id: VENTURE_ID, lifecycle_stage: 19, status: 'pending', blocking: true, decision: 'pending' },
    });

    const first = await emergencyUnblockGate(supabase, DECISION_ID);
    const second = await emergencyUnblockGate(supabase, DECISION_ID);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(supabase.updateCalls).toHaveLength(2);
    for (const payload of supabase.updateCalls) {
      expect(payload.decision).toBe('pending');
      expect(payload.blocking).toBe(true);
    }
  });

  it('refuses on a non-blocking row (blocking=false) and performs no update', async () => {
    const supabase = makeSupabase({
      decisionRow: { id: DECISION_ID, venture_id: VENTURE_ID, lifecycle_stage: 7, status: 'pending', blocking: false, decision: 'pending' },
    });

    const result = await emergencyUnblockGate(supabase, DECISION_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_blocking_or_already_decided');
    expect(supabase.updateCalls).toHaveLength(0);
  });

  it('refuses on an already-decided row (status=approved) and performs no update', async () => {
    const supabase = makeSupabase({
      decisionRow: { id: DECISION_ID, venture_id: VENTURE_ID, lifecycle_stage: 19, status: 'approved', blocking: true, decision: 'approved' },
    });

    const result = await emergencyUnblockGate(supabase, DECISION_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_blocking_or_already_decided');
    expect(supabase.updateCalls).toHaveLength(0);
  });

  it('fail-open on an is_irreversible lookup error: still unblocks, defaults isIrreversible=false', async () => {
    const supabase = makeSupabase({
      decisionRow: { id: DECISION_ID, venture_id: VENTURE_ID, lifecycle_stage: 24, status: 'pending', blocking: true, decision: 'pending' },
      stageReadError: new Error('db down'),
    });

    const result = await emergencyUnblockGate(supabase, DECISION_ID);

    expect(result.ok).toBe(true);
    expect(result.isIrreversible).toBe(false);
    expect(result.requiresManualConfirmation).toBe(false);
  });
});
