/**
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 2:
 *   Tests for atomic-transitions.js and state-transitions.js fallback.
 *
 * Unit tests use a mocked supabase client.  Full DB integration against
 * the deployed fn_atomic_lead_to_plan_transition is exercised by the
 * handoff-chain smoke run, not here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeAtomicLeadToPlanTransition,
  isAtomicLeadToPlanTransitionAvailable,
  generateRequestId
} from '../../scripts/modules/handoff/executors/lead-to-plan/atomic-transitions.js';

function makeMockSupabase({ rpcResponse, rpcError = null } = {}) {
  return {
    _lastCall: null,
    rpc(fn, params) {
      this._lastCall = { fn, params };
      return Promise.resolve(rpcError
        ? { data: null, error: rpcError }
        : { data: rpcResponse, error: null });
    }
  };
}

describe('generateRequestId', () => {
  it('produces stable id within a minute-bucket', () => {
    const a = generateRequestId('SD-X', 'sess-1');
    const b = generateRequestId('SD-X', 'sess-1');
    expect(a).toBe(b);
  });

  it('differs across sessions', () => {
    const a = generateRequestId('SD-X', 'sess-1');
    const b = generateRequestId('SD-X', 'sess-2');
    expect(a).not.toBe(b);
  });

  it('defaults session to "unknown" when unset', () => {
    expect(generateRequestId('SD-X')).toContain('-unknown-');
  });
});

describe('executeAtomicLeadToPlanTransition', () => {
  it('returns success on a normal RPC response', async () => {
    const supa = makeMockSupabase({
      rpcResponse: {
        success: true,
        idempotent_hit: false,
        audit_id: 'aud-1',
        pre_state: { sd_phase: 'LEAD', sd_status: 'draft' },
        post_state: { sd_phase: 'PLAN_PRD', sd_status: 'in_progress' }
      }
    });
    const r = await executeAtomicLeadToPlanTransition(supa, 'SD-T-001', {
      sessionId: 'sess-a', requestId: 'req-a'
    });
    expect(r.success).toBe(true);
    expect(r.audit_id).toBe('aud-1');
    expect(r.idempotent_hit).toBe(false);
    expect(supa._lastCall.fn).toBe('fn_atomic_lead_to_plan_transition');
    expect(supa._lastCall.params).toEqual({
      p_sd_id: 'SD-T-001',
      p_session_id: 'sess-a',
      p_request_id: 'req-a'
    });
  });

  it('flags idempotent_hit when RPC reports one', async () => {
    const supa = makeMockSupabase({
      rpcResponse: { success: true, idempotent_hit: true, audit_id: 'aud-2' }
    });
    const r = await executeAtomicLeadToPlanTransition(supa, 'SD-T-002');
    expect(r.success).toBe(true);
    expect(r.idempotent_hit).toBe(true);
  });

  it('returns failure on RPC business error (success:false in data)', async () => {
    const supa = makeMockSupabase({
      rpcResponse: { success: false, error: 'SD not found: X', code: 'SD_NOT_FOUND' }
    });
    const r = await executeAtomicLeadToPlanTransition(supa, 'X');
    expect(r.success).toBe(false);
    expect(r.error).toContain('SD not found');
  });

  it('returns failure on RPC-level error', async () => {
    const supa = makeMockSupabase({
      rpcError: { message: 'connection reset', code: 'ECONNRESET' }
    });
    const r = await executeAtomicLeadToPlanTransition(supa, 'SD-X');
    expect(r.success).toBe(false);
    expect(r.error).toBe('connection reset');
    expect(r.code).toBe('ECONNRESET');
  });

  it('catches thrown exceptions from the client', async () => {
    const supa = { rpc: () => { throw new Error('boom'); } };
    const r = await executeAtomicLeadToPlanTransition(supa, 'SD-X');
    expect(r.success).toBe(false);
    expect(r.code).toBe('EXCEPTION');
  });

  it('fills session and request id defaults when not provided', async () => {
    const supa = makeMockSupabase({ rpcResponse: { success: true } });
    await executeAtomicLeadToPlanTransition(supa, 'SD-T-003');
    expect(supa._lastCall.params.p_sd_id).toBe('SD-T-003');
    expect(typeof supa._lastCall.params.p_session_id).toBe('string');
    expect(typeof supa._lastCall.params.p_request_id).toBe('string');
  });
});

describe('isAtomicLeadToPlanTransitionAvailable', () => {
  it('returns false when RPC reports function does not exist (42883)', async () => {
    const supa = makeMockSupabase({
      rpcError: { message: 'function fn_... does not exist', code: '42883' }
    });
    expect(await isAtomicLeadToPlanTransitionAvailable(supa)).toBe(false);
  });

  it('returns false when error message mentions schema cache', async () => {
    const supa = makeMockSupabase({
      rpcError: { message: 'Could not find the function in schema cache', code: 'X' }
    });
    expect(await isAtomicLeadToPlanTransitionAvailable(supa)).toBe(false);
  });

  it('returns true when function exists but SD is fake (business error)', async () => {
    const supa = makeMockSupabase({
      rpcResponse: { success: false, error: 'SD not found: TEST-AVAILABILITY-CHECK-NOT-A-REAL-SD' }
    });
    expect(await isAtomicLeadToPlanTransitionAvailable(supa)).toBe(true);
  });

  it('returns true on clean RPC success', async () => {
    const supa = makeMockSupabase({ rpcResponse: { success: true } });
    expect(await isAtomicLeadToPlanTransitionAvailable(supa)).toBe(true);
  });

  it('returns false when client throws', async () => {
    const supa = { rpc: () => { throw new Error('x'); } };
    expect(await isAtomicLeadToPlanTransitionAvailable(supa)).toBe(false);
  });
});

describe('state-transitions.js transitionSdToPlan integration (dynamic-import path)', () => {
  let captured;

  beforeEach(() => {
    captured = {};

    // Reset module cache so transitionSdToPlan re-imports atomic-transitions
    vi.resetModules();

    // Stub atomic-transitions to report RPC available + successful.
    vi.doMock('../../scripts/modules/handoff/executors/lead-to-plan/atomic-transitions.js', () => ({
      executeAtomicLeadToPlanTransition: async (_supa, sdId) => {
        captured.atomicCalled = true;
        captured.atomicSdId = sdId;
        return { success: true, audit_id: 'aud-X' };
      },
      isAtomicLeadToPlanTransitionAvailable: async () => {
        captured.availabilityChecked = true;
        return true;
      }
    }));
  });

  it('uses the atomic path when RPC is available', async () => {
    const { transitionSdToPlan } = await import(
      '../../scripts/modules/handoff/executors/lead-to-plan/state-transitions.js'
    );
    const fakeSupa = { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) };
    await transitionSdToPlan('SD-T', { current_phase: 'LEAD' }, fakeSupa);
    expect(captured.availabilityChecked).toBe(true);
    expect(captured.atomicCalled).toBe(true);
    expect(captured.atomicSdId).toBe('SD-T');
  });
});

describe('state-transitions.js falls back to legacy when RPC unavailable', () => {
  it('runs the legacy .update() path when atomic reports unavailable', async () => {
    vi.resetModules();
    let legacyUpdateCalled = false;

    vi.doMock('../../scripts/modules/handoff/executors/lead-to-plan/atomic-transitions.js', () => ({
      executeAtomicLeadToPlanTransition: async () => ({ success: false, error: 'unused' }),
      isAtomicLeadToPlanTransitionAvailable: async () => false
    }));

    const { transitionSdToPlan } = await import(
      '../../scripts/modules/handoff/executors/lead-to-plan/state-transitions.js'
    );

    const fakeSupa = {
      from: () => ({
        update: () => ({
          eq: async () => {
            legacyUpdateCalled = true;
            return { error: null };
          }
        })
      })
    };

    await transitionSdToPlan('SD-T-Legacy', { current_phase: 'LEAD' }, fakeSupa);
    expect(legacyUpdateCalled).toBe(true);
  });
});
