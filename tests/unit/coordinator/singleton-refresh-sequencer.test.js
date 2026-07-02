/**
 * SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-C
 * TS-1, TS-2, TS-3: register-then-retire sequencing decision logic.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  checkNewSessionHealth,
  decideRefreshSequencing,
  sequenceSingletonRefresh,
  RETIRED_REASON,
} from '../../../lib/coordinator/singleton-refresh-sequencer.cjs';

const NOW = 1_800_000_000_000; // fixed reference instant

describe('checkNewSessionHealth', () => {
  it('healthy: fresh heartbeat + active loop_state', () => {
    const result = checkNewSessionHealth(
      { heartbeat_at: new Date(NOW - 10_000).toISOString(), loop_state: 'active' },
      { nowMs: NOW, freshMs: 5 * 60 * 1000 },
    );
    expect(result.healthy).toBe(true);
  });

  it('healthy: fresh heartbeat + unknown loop_state (freshly-booted default)', () => {
    const result = checkNewSessionHealth(
      { heartbeat_at: new Date(NOW - 10_000).toISOString(), loop_state: 'unknown' },
      { nowMs: NOW, freshMs: 5 * 60 * 1000 },
    );
    expect(result.healthy).toBe(true);
  });

  it('unhealthy: stale heartbeat', () => {
    const result = checkNewSessionHealth(
      { heartbeat_at: new Date(NOW - 60 * 60 * 1000).toISOString(), loop_state: 'active' },
      { nowMs: NOW, freshMs: 5 * 60 * 1000 },
    );
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/stale/);
  });

  it('unhealthy: missing heartbeat', () => {
    const result = checkNewSessionHealth({ heartbeat_at: null, loop_state: 'active' }, { nowMs: NOW });
    expect(result.healthy).toBe(false);
  });

  it('unhealthy: exited loop_state even with a fresh heartbeat', () => {
    const result = checkNewSessionHealth(
      { heartbeat_at: new Date(NOW - 1_000).toISOString(), loop_state: 'exited' },
      { nowMs: NOW },
    );
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/exited/);
  });

  it('unhealthy: session row not found', () => {
    const result = checkNewSessionHealth(null, { nowMs: NOW });
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });
});

describe('decideRefreshSequencing', () => {
  it('retire_old when the new session is healthy', () => {
    expect(decideRefreshSequencing({ newSessionHealthy: true }).action).toBe('retire_old');
  });

  it('hold_old when the new session is NOT healthy', () => {
    expect(decideRefreshSequencing({ newSessionHealthy: false }).action).toBe('hold_old');
  });
});

/** In-memory fake of the tiny supabase surface sequenceSingletonRefresh touches. */
function makeFakeSupabase({ newSession, updateOldSpy }) {
  return {
    from(table) {
      expect(table).toBe('claude_sessions');
      return {
        select() {
          return {
            eq: (_col, val) => ({
              maybeSingle: async () => ({ data: newSession, error: null }),
            }),
          };
        },
        update(patch) {
          return {
            eq: async (_col, val) => {
              updateOldSpy(patch, val);
              return { error: null };
            },
          };
        },
      };
    },
  };
}

describe('sequenceSingletonRefresh — ordering guarantee (TS-1, TS-2, TS-3)', () => {
  it('TS-2: unhealthy new session -> old session update is NEVER called (no premature retire)', async () => {
    const updateOldSpy = vi.fn();
    const supabase = makeFakeSupabase({
      newSession: { session_id: 'new-1', heartbeat_at: null, loop_state: 'unknown' },
      updateOldSpy,
    });

    const result = await sequenceSingletonRefresh(supabase, {
      newSessionId: 'new-1',
      oldSessionId: 'old-1',
    });

    expect(result.action).toBe('hold_old');
    expect(result.retired).toBe(false);
    expect(updateOldSpy).not.toHaveBeenCalled();
  });

  it('TS-1: healthy new session -> old session retire IS called with released_at/released_reason set (register-then-retire order)', async () => {
    const updateOldSpy = vi.fn();
    const supabase = makeFakeSupabase({
      newSession: { session_id: 'new-1', heartbeat_at: new Date().toISOString(), loop_state: 'active' },
      updateOldSpy,
    });

    const result = await sequenceSingletonRefresh(supabase, {
      newSessionId: 'new-1',
      oldSessionId: 'old-1',
      oldWorktreePath: null, // no worktree cleanup in this case — session-only retirement
    });

    expect(result.action).toBe('retire_old');
    expect(updateOldSpy).toHaveBeenCalledTimes(1);
    const [patch, eqVal] = updateOldSpy.mock.calls[0];
    expect(eqVal).toBe('old-1');
    expect(patch.released_reason).toBe(RETIRED_REASON);
    expect(patch.status).toBe('released');
    expect(typeof patch.released_at).toBe('string');
  });

  it('TS-3: never observes both retire_old for an unhealthy session and hold_old for a healthy one (decision matrix is exhaustive/exclusive)', async () => {
    const cases = [
      { healthy: true, expected: 'retire_old' },
      { healthy: false, expected: 'hold_old' },
    ];
    for (const c of cases) {
      expect(decideRefreshSequencing({ newSessionHealthy: c.healthy }).action).toBe(c.expected);
    }
  });
});
