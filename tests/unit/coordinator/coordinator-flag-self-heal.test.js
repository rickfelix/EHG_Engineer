/**
 * QF-20260813-683 — coordinator_liveness false-negatives (no_coordinator_row) after
 * long-session metadata drift.
 *
 * Root cause: setActiveCoordinator() stamps claude_sessions.metadata.is_coordinator=true
 * ONCE, at initial registration. Nothing re-stamps it afterward. Verified live: an active,
 * ~17h-running coordinator session had metadata.is_coordinator undefined (exact drift
 * mechanism untraced — candidates include a non-merging metadata write elsewhere, or
 * session-row recreation across a context-compaction restore), even though the file-based
 * active-coordinator.json pointer correctly still named it. adam-coordinator-health.mjs's
 * coordinator_liveness probe queries metadata->>is_coordinator='true' directly (by design,
 * to independently verify the DB-side flag rather than trust the pointer) — so the drift
 * produced a false "no_coordinator_row" alarm on a genuinely healthy coordinator.
 *
 * Fix, two pieces:
 *   1. refreshCoordinatorFlag() (lib/coordinator/resolve.cjs) — the atomic-RPC-with-fallback
 *      stamp, EXTRACTED from setActiveCoordinator's own Step 2 so it's independently callable
 *      without re-running drain/retire/succession/pointer-file logic.
 *   2. selfHealCoordinatorFlag() (scripts/coordinator-quiet-tick.mjs) — calls #1 every tick,
 *      GUARDED on session-identity match against the authoritative resolver so it can only
 *      ever refresh an ALREADY-active coordinator's own flag, never promote a worker.
 *
 * Test strategy: both functions take injectable deps (or a plain fake supabase client), so
 * this is fully unit-testable without a live DB — matching the established pattern in
 * tests/unit/coordinator-flag-rpc-fallback.test.js (which already covers the underlying
 * atomic-RPC-with-fallback behavior THROUGH setActiveCoordinator; this file adds direct
 * coverage of the extracted function plus the new self-heal guard, which that file predates).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { selfHealCoordinatorFlag } from '../../../scripts/coordinator-quiet-tick.mjs';

const req = createRequire(import.meta.url);
const { refreshCoordinatorFlag } = req('../../../lib/coordinator/resolve.cjs');

function makeSupabase({ rpcImpl, sessionRow = null }) {
  const calls = { rpc: [], upserts: [] };
  return {
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return rpcImpl(name, args); },
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: sessionRow, error: null }),
        upsert: (payload) => { calls.upserts.push(payload); return Promise.resolve({ data: null, error: null }); },
      };
      return builder;
    },
    _calls: calls,
  };
}

describe('refreshCoordinatorFlag (extracted from setActiveCoordinator Step 2)', () => {
  it('uses the atomic RPC when present — no fallback upsert', async () => {
    const sb = makeSupabase({ rpcImpl: () => ({ error: null }) });
    await refreshCoordinatorFlag(sb, 'sess-atomic');
    expect(sb._calls.rpc).toEqual([{ name: 'set_coordinator_flag', args: { p_session_id: 'sess-atomic' } }]);
    expect(sb._calls.upserts).toHaveLength(0);
  });

  it('falls back to the read-merge-write upsert when the RPC is absent (unapplied migration)', async () => {
    const sb = makeSupabase({
      rpcImpl: () => ({ error: { code: 'PGRST202', message: 'Could not find the function' } }),
      sessionRow: { metadata: { existing: 'keep' } },
    });
    await refreshCoordinatorFlag(sb, 'sess-fallback');
    expect(sb._calls.upserts).toHaveLength(1);
    expect(sb._calls.upserts[0].metadata).toMatchObject({ is_coordinator: true, existing: 'keep' });
  });

  it('is fail-open: a thrown RPC error never propagates', async () => {
    const sb = makeSupabase({ rpcImpl: () => { throw new Error('network blip'); } });
    await expect(refreshCoordinatorFlag(sb, 'sess-throw')).resolves.toBeUndefined();
  });
});

describe('selfHealCoordinatorFlag (QF-20260813-683 guard)', () => {
  it('refreshes when THIS session IS the resolved active coordinator', async () => {
    const refreshFn = vi.fn().mockResolvedValue(undefined);
    const result = await selfHealCoordinatorFlag({}, {
      sessionId: 'coord-abc',
      getActiveCoordinatorIdFn: async () => 'coord-abc',
      refreshFn,
    });
    expect(result).toBe(true);
    expect(refreshFn).toHaveBeenCalledWith({}, 'coord-abc');
  });

  it('REGRESSION CONTROL: does NOT refresh (or promote) a worker session', async () => {
    const refreshFn = vi.fn();
    const result = await selfHealCoordinatorFlag({}, {
      sessionId: 'worker-xyz',
      getActiveCoordinatorIdFn: async () => 'coord-abc', // a DIFFERENT session is coordinator
      refreshFn,
    });
    expect(result).toBe(false);
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it('no-ops when CLAUDE_SESSION_ID is unset', async () => {
    const refreshFn = vi.fn();
    const result = await selfHealCoordinatorFlag({}, {
      sessionId: undefined,
      getActiveCoordinatorIdFn: async () => 'coord-abc',
      refreshFn,
    });
    expect(result).toBe(false);
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it('fail-soft: an identity-resolution error never throws or blocks the tick', async () => {
    const refreshFn = vi.fn();
    const result = await selfHealCoordinatorFlag({}, {
      sessionId: 'coord-abc',
      getActiveCoordinatorIdFn: async () => { throw new Error('resolve.cjs hiccup'); },
      refreshFn,
    });
    expect(result).toBe(false);
    expect(refreshFn).not.toHaveBeenCalled();
  });
});
