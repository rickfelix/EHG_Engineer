/**
 * tests/unit/heartbeat-manager-is-alive-self-heal.test.js
 *
 * QF-20260812-187: claude_sessions.is_alive was written exactly ONCE at
 * startHeartbeat() (true) and once at stopHeartbeat() (false) — never
 * reasserted by the 30s recurring heartbeat tick (session-manager.mjs's
 * updateHeartbeat only touches heartbeat_at/branch/telemetry fields, never
 * is_alive). Measured live: a coordinator session with a fresh, ticking
 * last_tool_at sat at is_alive=false for its whole lifetime — the one write
 * at start must have failed or raced, and nothing downstream ever corrected
 * it. Fix: reassert is_alive=true on every SUCCESSFUL tick in sendHeartbeat()
 * (lib/heartbeat-manager.mjs), so a genuinely-alive session self-heals a
 * stuck-false flag within one interval instead of carrying it forever.
 *
 * Test strategy: sendHeartbeat()/setIsAlive() are private (not exported),
 * and hbSupabase is module-level singleton state set from lazyServiceClient()
 * at import time — so the only way to unit-test this is the mocking pattern
 * already established in heartbeat-manager-ownership-mode.test.js (mock
 * lib/supabase-client.js, lib/session-manager.mjs, and the self-heal module,
 * then drive the REAL module through its exported surface). forceHeartbeat()
 * is the exported entry point that calls sendHeartbeat() directly, giving a
 * deterministic single-tick trigger instead of racing the real 30s interval.
 * startHeartbeat() ALSO writes is_alive=true once, synchronously, before this
 * fix's code ever runs — so every test clears the spy AFTER start and before
 * asserting, isolating the tick's own write from the pre-existing start-time
 * write it must not be confused with.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let updateSpy;
let lastUpdatePayload;

vi.mock('../../lib/supabase-client.js', () => {
  const stubClient = {
    from: () => ({
      update: (payload) => {
        lastUpdatePayload = payload;
        updateSpy(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  };
  return {
    createSupabaseServiceClient: () => stubClient,
    lazyServiceClient: () => stubClient,
  };
});

vi.mock('../../lib/session-manager.mjs', () => ({
  updateHeartbeat: vi.fn(() => Promise.resolve({ success: true })),
  endSession: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('../../scripts/modules/claim-health/self-heal.js', () => ({
  selfHeal: vi.fn(() => Promise.resolve({ released: [], errors: [] })),
}));

const { startHeartbeat, stopHeartbeat, forceHeartbeat, isHeartbeatActive } =
  await import('../../lib/heartbeat-manager.mjs');

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('heartbeat-manager is_alive self-heal (QF-20260812-187)', () => {
  beforeEach(() => {
    updateSpy = vi.fn();
    lastUpdatePayload = null;
  });

  afterEach(() => {
    if (isHeartbeatActive().active) stopHeartbeat();
  });

  it('reasserts is_alive=true on an ordinary successful tick, not just at start', async () => {
    startHeartbeat('sess-tick-heal');
    await flush(); // settle start()'s own explicit setIsAlive + fire-and-forget sendHeartbeat()
    updateSpy.mockClear();

    await forceHeartbeat();
    await flush();

    expect(updateSpy).toHaveBeenCalled();
    expect(lastUpdatePayload).toMatchObject({ is_alive: true });
  });

  it('reasserts is_alive on EVERY successful tick, not only the first', async () => {
    startHeartbeat('sess-tick-heal-2');
    await flush();
    updateSpy.mockClear();

    await forceHeartbeat();
    await flush();
    const firstTickCalls = updateSpy.mock.calls.length;
    expect(firstTickCalls).toBeGreaterThan(0);

    await forceHeartbeat();
    await flush();
    expect(updateSpy.mock.calls.length).toBeGreaterThan(firstTickCalls);
  });

  it('does NOT reassert is_alive when the tick fails (no proof of liveness)', async () => {
    startHeartbeat('sess-tick-fail');
    await flush(); // settle start's own successful tick before arming the failure below
    updateSpy.mockClear();

    const { updateHeartbeat } = await import('../../lib/session-manager.mjs');
    updateHeartbeat.mockResolvedValueOnce({ success: false });

    await forceHeartbeat();
    await flush();

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
