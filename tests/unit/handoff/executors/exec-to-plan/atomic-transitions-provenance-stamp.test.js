/**
 * Tests for the provenance-stamp diff wrapper added to
 * executeAtomicExecToPlanTransition() by SD-LEO-INFRA-STORY-CASCADE-ADDITIVE-ONLY-001.
 *
 * Covers: resolveSdUuidId, captureInProgressStories, stampRpcPromotedStories, and
 * their integration into executeAtomicExecToPlanTransition's success/idempotent-hit/
 * error/exception paths. Live measurement (round-3 VALIDATION review) confirmed the
 * atomic RPC is the DOMINANT EXEC-TO-PLAN path in production, and a round-5
 * self-review (during EXEC) found the RPC resolves p_sd_id to
 * strategic_directives_v2.uuid_id specifically -- a column genuinely distinct from
 * the primary key id -- so resolveSdUuidId must never be confused with the
 * codebase's separate resolveSdInput() helper (which returns id).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeAtomicExecToPlanTransition,
  resolveSdUuidId,
  captureInProgressStories,
} from '../../../../../scripts/modules/handoff/executors/exec-to-plan/atomic-transitions.js';

function makeAtomicMock({ sdRow, beforeStories, afterStories, rpcResponse, rpcError = null, rpcThrows = null }) {
  const updateCalls = [];
  const updateFn = vi.fn((updates) => {
    updateCalls.push(updates);
    return { eq: vi.fn().mockResolvedValue({ error: null }) };
  });

  const beforeEqInnerFn = vi.fn().mockResolvedValue({ data: beforeStories, error: null });
  const beforeEqOuterFn = vi.fn().mockReturnValue({ eq: beforeEqInnerFn });
  const afterInFn = vi.fn().mockResolvedValue({ data: afterStories, error: null });
  const sdOrFn = vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: sdRow, error: null }),
    }),
  });

  const db = {
    rpc: vi.fn().mockImplementation(() => {
      if (rpcThrows) return Promise.reject(rpcThrows);
      if (rpcError) return Promise.resolve({ data: null, error: rpcError });
      return Promise.resolve({ data: rpcResponse, error: null });
    }),
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return { select: vi.fn().mockReturnValue({ or: sdOrFn }) };
      }
      if (table === 'user_stories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: beforeEqOuterFn,
            in: afterInFn,
          }),
          update: updateFn,
        };
      }
      return {};
    }),
  };

  return { db, updateFn, updateCalls, beforeEqOuterFn, beforeEqInnerFn, afterInFn, sdOrFn };
}

describe('resolveSdUuidId', () => {
  it('resolves sdId (id or sd_key form) to the uuid_id column, not the primary key id', async () => {
    const { db, sdOrFn } = makeAtomicMock({ sdRow: { uuid_id: 'uuid-abc-123' } });
    const result = await resolveSdUuidId(db, 'SD-FOO-001');
    expect(result).toBe('uuid-abc-123');
    expect(sdOrFn).toHaveBeenCalledWith('id.eq.SD-FOO-001,sd_key.eq.SD-FOO-001');
  });

  it('fails soft (returns null) on a query error, never throwing', async () => {
    const db = { from: vi.fn().mockImplementation(() => { throw new Error('boom'); }) };
    await expect(resolveSdUuidId(db, 'SD-FOO-001')).resolves.toBeNull();
  });

  it('ship-review hardening: rejects a malformed sdId before ever building the .or() filter string', async () => {
    const db = { from: vi.fn() };
    const result = await resolveSdUuidId(db, 'not,a,valid;id(with)special.chars');
    expect(result).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('ship-review hardening: a Postgrest-level error (resolved, not thrown) is treated as not-found, not propagated', async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection reset' } }),
            }),
          }),
        }),
      }),
    };
    await expect(resolveSdUuidId(db, 'SD-FOO-001')).resolves.toBeNull();
  });
});

describe('captureInProgressStories', () => {
  it('returns [] immediately without querying when sdUuidId is null', async () => {
    const db = { from: vi.fn() };
    const result = await captureInProgressStories(db, null);
    expect(result).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('executeAtomicExecToPlanTransition provenance stamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TS-6: stamps exactly the stories the RPC promotes (in_progress -> completed), using the resolved uuid_id', async () => {
    const beforeStories = [
      { id: 's1', completed_by: null },
      { id: 's2', completed_by: null },
    ];
    const afterStories = [
      { id: 's1', status: 'completed', completed_by: null },
      { id: 's2', status: 'completed', completed_by: null },
    ];
    const { db, updateCalls, beforeEqOuterFn, beforeEqInnerFn, afterInFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      beforeStories,
      afterStories,
      rpcResponse: { success: true, audit_id: 'a1', stories_updated: 2 },
    });

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', 'prd-1');

    expect(result.success).toBe(true);
    // before-query filtered by the resolved uuid_id and status='in_progress'
    expect(beforeEqOuterFn).toHaveBeenCalledWith('sd_id', 'uuid-sd-1');
    expect(beforeEqInnerFn).toHaveBeenCalledWith('status', 'in_progress');
    // after-query targets exactly the captured in_progress ids
    expect(afterInFn).toHaveBeenCalledWith('id', ['s1', 's2']);
    expect(updateCalls).toHaveLength(2);
    for (const call of updateCalls) {
      expect(call.completed_by).toBe('system:fn_atomic_exec_to_plan_transition');
      expect(call.completed_at).toBeTruthy();
    }
  });

  it('TS-6b: a story the RPC does not promote (still ready/draft, never in_progress) is never stamped -- it never appears in the before-list at all', async () => {
    // ready/draft stories are excluded by captureInProgressStories' own
    // .eq('status','in_progress') filter -- the mock's beforeStories fixture
    // simply never includes them, proving they cannot reach the after-diff.
    const { db, updateFn, afterInFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      beforeStories: [],
      afterStories: [],
      rpcResponse: { success: true, audit_id: 'a1', stories_updated: 0 },
    });

    await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(updateFn).not.toHaveBeenCalled();
    expect(afterInFn).not.toHaveBeenCalled();
  });

  it('TS-7: pure no-op fast path when there are zero in_progress stories', async () => {
    const { db, updateFn, afterInFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      beforeStories: [],
      afterStories: [],
      rpcResponse: { success: true, audit_id: 'a1', stories_updated: 0 },
    });

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(result.success).toBe(true);
    expect(afterInFn).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('TS-8: skips the after-diff when the RPC call returns success:false', async () => {
    const { db, updateFn, afterInFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      beforeStories: [{ id: 's1', completed_by: null }],
      afterStories: [],
      rpcResponse: { success: false, error: 'SD not found', code: 'NOT_FOUND' },
    });

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(result.success).toBe(false);
    expect(afterInFn).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('TS-10: correctly resolves an sd_key-form sdId to the canonical uuid_id before querying user_stories', async () => {
    const { db, beforeEqOuterFn } = makeAtomicMock({
      sdRow: { uuid_id: '4cd5c7ff-uuid-form' },
      beforeStories: [{ id: 's1', completed_by: null }],
      afterStories: [{ id: 's1', status: 'completed', completed_by: null }],
      rpcResponse: { success: true, audit_id: 'a1', stories_updated: 1 },
    });

    await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    // A naive .eq('sd_id', 'SD-FOO-001') against UUID-keyed rows would never
    // match -- the wrapper must use the resolved uuid_id instead.
    expect(beforeEqOuterFn).toHaveBeenCalledWith('sd_id', '4cd5c7ff-uuid-form');
    expect(beforeEqOuterFn).not.toHaveBeenCalledWith('sd_id', 'SD-FOO-001');
  });

  it('TS-11: an idempotent-hit retry correctly no-ops without special-casing', async () => {
    const { db, updateFn, afterInFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      // The stories were already promoted by the ORIGINAL call, so a retry's
      // before-query naturally finds zero in_progress rows.
      beforeStories: [],
      afterStories: [],
      rpcResponse: { success: true, idempotent_hit: true, audit_id: 'a1' },
    });

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(result.success).toBe(true);
    expect(result.idempotent_hit).toBe(true);
    expect(afterInFn).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('TS-12: skips the after-diff when the RPC call itself returns an error (not just success:false)', async () => {
    const { db, updateFn, afterInFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      beforeStories: [{ id: 's1', completed_by: null }],
      afterStories: [],
      rpcResponse: null,
      rpcError: { message: 'connection reset', code: '08006' },
    });

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(result.success).toBe(false);
    expect(result.error).toBe('connection reset');
    expect(afterInFn).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('TS-13: skips the after-diff when the RPC call throws (caught by the surrounding try/catch)', async () => {
    const { db, updateFn, afterInFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      beforeStories: [{ id: 's1', completed_by: null }],
      afterStories: [],
      rpcResponse: null,
      rpcThrows: new Error('network unreachable'),
    });

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(result.success).toBe(false);
    expect(result.code).toBe('EXCEPTION');
    expect(afterInFn).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('AC-4: an existing non-null completed_by on a promoted in_progress story is never overwritten', async () => {
    const { db, updateFn } = makeAtomicMock({
      sdRow: { uuid_id: 'uuid-sd-1' },
      beforeStories: [{ id: 's1', completed_by: 'EXEC (manual)' }],
      afterStories: [{ id: 's1', status: 'completed', completed_by: 'EXEC (manual)' }],
      rpcResponse: { success: true, audit_id: 'a1', stories_updated: 1 },
    });

    await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(updateFn).not.toHaveBeenCalled();
  });

  it('regression-lock: the before-capture genuinely runs before the RPC call, not after', async () => {
    // Ship-review finding: prior tests here used STATIC fixtures for
    // beforeStories/afterStories, which would pass unchanged even if a future
    // refactor accidentally moved resolveSdUuidId/captureInProgressStories to
    // run AFTER the RPC call -- silently defeating the entire diff design
    // (before would equal after, nothing would ever get stamped in
    // production). This test uses a shared mutable fake table that the mocked
    // rpc() call itself mutates, so the before-query only finds the
    // in_progress row if it genuinely runs first.
    const table = { s1: { id: 's1', status: 'in_progress', completed_by: null } };
    const callOrder = [];
    const updateCalls = [];

    const db = {
      rpc: vi.fn().mockImplementation(() => {
        callOrder.push('rpc');
        table.s1.status = 'completed'; // simulates the real RPC's effect
        return Promise.resolve({
          data: { success: true, audit_id: 'a1', stories_updated: 1 },
          error: null,
        });
      }),
      from: vi.fn((table_) => {
        if (table_ === 'strategic_directives_v2') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { uuid_id: 'uuid-sd-1' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table_ === 'user_stories') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation(() => {
                  callOrder.push('before-query');
                  return Promise.resolve({
                    data: Object.values(table).filter((s) => s.status === 'in_progress'),
                    error: null,
                  });
                }),
              }),
              in: vi.fn().mockImplementation(() => {
                callOrder.push('after-query');
                return Promise.resolve({ data: Object.values(table), error: null });
              }),
            }),
            update: vi.fn((updates) => {
              updateCalls.push(updates);
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        return {};
      }),
    };

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(result.success).toBe(true);
    expect(callOrder).toEqual(['before-query', 'rpc', 'after-query']);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].completed_by).toBe('system:fn_atomic_exec_to_plan_transition');
  });

  it('a stamp-diff failure never reverses a successful RPC transition (fails soft)', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: { success: true, audit_id: 'a1', stories_updated: 1 },
        error: null,
      }),
      from: vi.fn((table) => {
        if (table === 'strategic_directives_v2') {
          return { select: vi.fn().mockImplementation(() => { throw new Error('sd lookup failed'); }) };
        }
        if (table === 'user_stories') {
          return { select: vi.fn().mockImplementation(() => { throw new Error('should not be reached'); }) };
        }
        return {};
      }),
    };

    const result = await executeAtomicExecToPlanTransition(db, 'SD-FOO-001', null);

    expect(result.success).toBe(true);
    expect(result.audit_id).toBe('a1');
  });
});
