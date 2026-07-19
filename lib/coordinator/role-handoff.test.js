/**
 * role-handoff.test.js — SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A
 *
 * Tests for the coordinator singleton handoff protocol:
 *   TS-1: flag-ON setActiveCoordinator ordering (upsert-new before clear-old, pointer last)
 *   TS-2: flag-ON SPLIT_BRAIN auto-resolve (winner kept, loser cleared, snapshot-consistent)
 *   TS-3: post-checkout-role-restore hook (coordinator restored, non-coordinator skipped, DB error no-throw)
 *   TS-4: flag-OFF — no retire, no auto-resolve
 *
 * Uses injectable-supabase mocks (NO live DB). Pattern mirrors resolve.test.js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ============================================================================
// Module handles — reset per test to isolate env mutations
// ============================================================================

let resolve;
let coordEvents;
let postCheckout;

// Absolute path to the coordinator pointer file — used in the global writeFileSync
// interceptor below to prevent this test file's fork from polluting the shared fs.
const COORD_FILE_ABS = path.resolve(__dirname, '../../.claude/active-coordinator.json');

beforeEach(() => {
  vi.resetModules();
  resolve = require('./resolve.cjs');
  // coordination-events.cjs is a CommonJS module; vitest handles CJS require correctly.
  coordEvents = require('./coordination-events.cjs');
  postCheckout = require(path.resolve(__dirname, '../../scripts/hooks/post-checkout-role-restore.cjs'));

  // Intercept ALL reads/writes to the coordinator pointer file within this process (fork).
  // When vitest runs with pool:forks, resolve.test.js runs in a concurrent fork on
  // the same filesystem. Writing and then not cleaning up the coordinator file races
  // with resolve.test.js's RES-5/RES-9 that write+read the same path.
  // By intercepting at the process level (per-fork, not global), this fork never
  // writes to the shared coordinator file, eliminating the race entirely.
  // vi.restoreAllMocks() in afterEach restores all spies automatically.
  const fsModule = require('fs');
  const _origWriteFileSync = fsModule.writeFileSync;
  const _origMkdirSync = fsModule.mkdirSync;
  const _origExistsSync = fsModule.existsSync;
  const _origUnlinkSync = fsModule.unlinkSync;
  vi.spyOn(fsModule, 'writeFileSync').mockImplementation(function(filePath, data, ...rest) {
    if (filePath === COORD_FILE_ABS) return; // swallow coordinator file writes
    return _origWriteFileSync.call(fsModule, filePath, data, ...rest);
  });
  vi.spyOn(fsModule, 'mkdirSync').mockImplementation(function(dir, ...rest) {
    if (typeof dir === 'string' && dir === path.dirname(COORD_FILE_ABS)) return;
    return _origMkdirSync.call(fsModule, dir, ...rest);
  });
  vi.spyOn(fsModule, 'existsSync').mockImplementation(function(filePath) {
    if (filePath === COORD_FILE_ABS) return false; // coordinator file never exists in this fork
    return _origExistsSync.call(fsModule, filePath);
  });
  vi.spyOn(fsModule, 'unlinkSync').mockImplementation(function(filePath) {
    if (filePath === COORD_FILE_ABS) return; // no-op for coordinator file
    return _origUnlinkSync.call(fsModule, filePath);
  });
});

afterEach(() => {
  delete process.env.COORDINATOR_TWOWAY_V2;
  delete process.env.COORD_DETECTORS_V2;
  vi.restoreAllMocks();
});

// ============================================================================
// TS-1: flag-ON setActiveCoordinator — upsert-new BEFORE clear-old, pointer LAST
// ============================================================================

describe('TS-1: flag-ON register-before-retire ordering', () => {
  it('registers new session first (set RPC), clears old incumbent second (clear RPC), writes pointer last', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    vi.resetModules();
    resolve = require('./resolve.cjs');

    // Track call order via the injectable sb mock side effects.
    // Post-Finding-2: the new-holder register + incumbent retire go through atomic RPCs
    // (set_coordinator_flag / clear_coordinator_flag), NOT .from().upsert()/.update().
    const callOrder = [];

    const OLD_SESSION = 'old-coord-session';
    const NEW_SESSION = 'new-coord-session';

    const rpcFn = vi.fn((name, args) => {
      if (name === 'set_coordinator_flag') callOrder.push('set:' + args.p_session_id);
      if (name === 'clear_coordinator_flag') callOrder.push('clear-old:' + args.p_session_id);
      return Promise.resolve({ data: null, error: null });
    });

    const sb = {
      rpc: rpcFn,
      from: vi.fn((table) => {
        if (table === 'session_coordination') {
          const chain = {
            eq: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            then: (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej),
          };
          return { update: vi.fn(() => chain) };
        }
        // claude_sessions: only the incumbents snapshot is read now — FR-6 (count-truncation
        // discipline) paginates it, so the chain is .select().gte().filter().order().range().
        // Finding 1: THIS session must be the canonical winner for the retire to fire — so the
        // snapshot's only other holder (OLD_SESSION) has an OLDER coordinator_since.
        const snapRows = [
          { session_id: NEW_SESSION, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T10:00:00Z' } },
          { session_id: OLD_SESSION, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-01-01T00:00:00Z' } },
        ];
        const page = { order: vi.fn(() => page), range: vi.fn((f, t) => Promise.resolve({ data: snapRows.slice(f, t + 1), error: null })) };
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({ filter: vi.fn(() => page) })),
          })),
        };
      }),
    };

    // The global beforeEach spy on fs.writeFileSync intercepts coordinator file writes.
    // We re-mock it here to ALSO track callOrder + capture the pointer payload.
    let pointerWritePayload = null;
    const fsReal = require('fs');
    fsReal.writeFileSync.mockImplementation((filePath, data) => {
      if (filePath === COORD_FILE_ABS) {
        callOrder.push('pointer-write');
        try { pointerWritePayload = JSON.parse(data); } catch { pointerWritePayload = null; }
        return; // swallow (no disk write)
      }
      // No other file writes expected in setActiveCoordinator.
    });

    await resolve.setActiveCoordinator(sb, NEW_SESSION);

    // Assert the NEW session was registered via set_coordinator_flag RPC
    expect(rpcFn).toHaveBeenCalledWith('set_coordinator_flag', { p_session_id: NEW_SESSION });

    // Assert the OLD session was retired via clear_coordinator_flag RPC
    expect(rpcFn).toHaveBeenCalledWith('clear_coordinator_flag', { p_session_id: OLD_SESSION });
    // The NEW (winner) session must NEVER be cleared
    expect(rpcFn).not.toHaveBeenCalledWith('clear_coordinator_flag', { p_session_id: NEW_SESSION });

    // Assert ordering: set-new → clear-old → pointer-write
    const setIdx = callOrder.indexOf('set:' + NEW_SESSION);
    const clearIdx = callOrder.indexOf('clear-old:' + OLD_SESSION);
    const pointerIdx = callOrder.indexOf('pointer-write');
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeGreaterThan(setIdx);
    expect(pointerIdx).toBeGreaterThan(clearIdx);

    // Assert pointer was written with the new session_id
    expect(pointerWritePayload).not.toBeNull();
    expect(pointerWritePayload.session_id).toBe(NEW_SESSION);
  });

  it('does NOT clear any incumbent when this session is the ONLY fresh holder (self-registration)', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    vi.resetModules();
    resolve = require('./resolve.cjs');

    const SESSION = 're-register-session';
    const rpcFn = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const sb = {
      rpc: rpcFn,
      from: vi.fn((table) => {
        if (table === 'session_coordination') {
          const chain = { eq: vi.fn(() => chain), gte: vi.fn(() => chain), then: (r) => Promise.resolve({ data: null, error: null }).then(r) };
          return { update: vi.fn(() => chain) };
        }
        // snapshot returns SAME session only (≤1 holder → no retire); FR-6 paginated chain.
        const snapRows = [{ session_id: SESSION, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true } }];
        const page = { order: vi.fn(() => page), range: vi.fn((f, t) => Promise.resolve({ data: snapRows.slice(f, t + 1), error: null })) };
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({ filter: vi.fn(() => page) })),
          })),
        };
      }),
    };

    await resolve.setActiveCoordinator(sb, SESSION);

    // set_coordinator_flag was called for this session; clear_coordinator_flag NEVER called.
    expect(rpcFn).toHaveBeenCalledWith('set_coordinator_flag', { p_session_id: SESSION });
    const clearCalls = rpcFn.mock.calls.filter((c) => c[0] === 'clear_coordinator_flag');
    expect(clearCalls.length).toBe(0);
  });

  // Finding 1 (MEDIUM mutual annihilation): two coordinators registering CONCURRENTLY must
  // converge to exactly ONE holder, never ZERO. The non-canonical registrant defers its retire.
  it('Finding 1: two concurrent-style registrations converge to ONE holder, never zero (non-winner defers retire)', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    vi.resetModules();
    resolve = require('./resolve.cjs');

    // Two fresh holders. WINNER has the later coordinator_since → pickCanonicalCoordinator picks it.
    const WINNER = 'concurrent-winner';
    const LOSER = 'concurrent-loser';
    const SNAPSHOT = [
      { session_id: WINNER, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T10:00:00Z' } },
      { session_id: LOSER, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T09:00:00Z' } },
    ];

    function makeSb(clearedCollector) {
      return {
        rpc: vi.fn((name, args) => {
          if (name === 'clear_coordinator_flag') clearedCollector.push(args.p_session_id);
          return Promise.resolve({ data: null, error: null });
        }),
        from: vi.fn((table) => {
          if (table === 'session_coordination') {
            const chain = { eq: vi.fn(() => chain), gte: vi.fn(() => chain), then: (r) => Promise.resolve({ data: null, error: null }).then(r) };
            return { update: vi.fn(() => chain) };
          }
          // FR-6 paginated snapshot chain (.filter().order().range()).
          const page = { order: vi.fn(() => page), range: vi.fn((f, t) => Promise.resolve({ data: SNAPSHOT.slice(f, t + 1), error: null })) };
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({ filter: vi.fn(() => page) })),
            })),
          };
        }),
      };
    }

    // The LOSER's own setActiveCoordinator call: it is NOT the canonical winner, so it must
    // retire NOBODY (deferring) — this is what prevents the 0-holder mutual annihilation.
    const loserCleared = [];
    await resolve.setActiveCoordinator(makeSb(loserCleared), LOSER);
    expect(loserCleared).toEqual([]); // LOSER retires no one → WINNER survives

    // The WINNER's own setActiveCoordinator call: it IS canonical, so it retires the LOSER only.
    const winnerCleared = [];
    await resolve.setActiveCoordinator(makeSb(winnerCleared), WINNER);
    expect(winnerCleared).toEqual([LOSER]); // WINNER retires LOSER, never itself

    // Net: across both concurrent calls, the only session ever cleared is LOSER. WINNER is
    // never cleared by anyone → exactly ONE holder remains, never zero.
    expect(loserCleared.concat(winnerCleared)).not.toContain(WINNER);
  });
});

// ============================================================================
// TS-2: flag-ON SPLIT_BRAIN auto-resolve — winner kept, loser cleared
// ============================================================================

describe('TS-2: SPLIT_BRAIN auto-resolve — winner kept, loser cleared', () => {
  it('elects the canonical winner (coordinator_since DESC) and clears the loser only', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    process.env.COORD_DETECTORS_V2 = 'on';
    vi.resetModules();
    resolve = require('./resolve.cjs');
    coordEvents = require('./coordination-events.cjs');

    const WINNER = 'session-newer'; // coordinator_since later → wins
    const LOSER = 'session-older';

    const clearedSessions = [];

    // Build a bundle that triggers SPLIT_BRAIN
    const splitBrainBundle = {
      coordinatorCount: 2,
      coordinators: [
        { session_id: WINNER, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T10:00:00Z' } },
        { session_id: LOSER, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T09:00:00Z' } },
      ],
      idleWorkers: 0, unclaimedItems: 0,
      signals: [], claims: [], sessions: [], sdClaims: [],
      ghostCompletions: [], evaSchedulerHeartbeat: null, mergesByRole: {},
    };

    const sb = {
      // Post-Finding-2: clearCoordinatorFlagFromSession retires via the clear_coordinator_flag RPC.
      rpc: vi.fn((name, args) => {
        if (name === 'clear_coordinator_flag') clearedSessions.push(args.p_session_id);
        return Promise.resolve({ data: null, error: null });
      }),
      from: vi.fn((table) => {
        if (table === 'coordination_events') {
          // logCoordinationEvent
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 'evt-1' }, error: null })),
              })),
            })),
          };
        }
        // claude_sessions: snapshot for auto-resolve — FR-6 paginated chain
        // (.select().gte().filter().order().range()).
        const snapRows = [
          { session_id: WINNER, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T10:00:00Z' } },
          { session_id: LOSER, heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T09:00:00Z' } },
        ];
        const page = { order: vi.fn(() => page), range: vi.fn((f, t) => Promise.resolve({ data: snapRows.slice(f, t + 1), error: null })) };
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({ filter: vi.fn(() => page) })),
          })),
        };
      }),
    };

    await coordEvents.runAndLogDetectors(sb, splitBrainBundle, { env: { COORD_DETECTORS_V2: 'on', COORDINATOR_TWOWAY_V2: 'on' } });

    // WINNER should NOT have been cleared
    expect(clearedSessions).not.toContain(WINNER);
    // LOSER should have been cleared
    expect(clearedSessions).toContain(LOSER);
  });

  it('is a no-op when the snapshot already has only 1 holder', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    process.env.COORD_DETECTORS_V2 = 'on';
    vi.resetModules();
    resolve = require('./resolve.cjs');
    coordEvents = require('./coordination-events.cjs');

    const splitBrainBundle = {
      coordinatorCount: 2, // triggers SPLIT_BRAIN detection
      coordinators: [
        { session_id: 'only-one', heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T10:00:00Z' } },
        { session_id: 'another', heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T09:00:00Z' } },
      ],
      idleWorkers: 0, unclaimedItems: 0,
      signals: [], claims: [], sessions: [], sdClaims: [],
      ghostCompletions: [], evaSchedulerHeartbeat: null, mergesByRole: {},
    };

    // Capture any clear_coordinator_flag RPC — must be zero (snapshot has ≤1 holder).
    const rpcFn = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const sb = {
      rpc: rpcFn,
      from: vi.fn((table) => {
        if (table === 'coordination_events') {
          return {
            insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'e1' }, error: null })) })) })),
          };
        }
        // Snapshot returns only 1 holder → no-op; FR-6 paginated chain.
        const snapRows = [{ session_id: 'only-one', heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true } }];
        const page = { order: vi.fn(() => page), range: vi.fn((f, t) => Promise.resolve({ data: snapRows.slice(f, t + 1), error: null })) };
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({ filter: vi.fn(() => page) })),
          })),
        };
      }),
    };

    await coordEvents.runAndLogDetectors(sb, splitBrainBundle, { env: { COORD_DETECTORS_V2: 'on', COORDINATOR_TWOWAY_V2: 'on' } });

    // ≤1 holder in snapshot → clear_coordinator_flag RPC never called
    const clearCalls = rpcFn.mock.calls.filter((c) => c[0] === 'clear_coordinator_flag');
    expect(clearCalls.length).toBe(0);
  });
});

// ============================================================================
// TS-2b (Finding 2): atomic-RPC contract — resolve.cjs uses the jsonb RPCs, not JS read-modify-write
// ============================================================================

describe('TS-2b: Finding 2 — atomic coordinator-flag RPCs are used with correct args', () => {
  it('clearCoordinatorFlagFromSession calls the clear_coordinator_flag RPC with p_session_id (no JS read-modify-write)', async () => {
    vi.resetModules();
    resolve = require('./resolve.cjs');

    const rpcFn = vi.fn(() => Promise.resolve({ data: null, error: null }));
    // If clearCoordinatorFlagFromSession still did a JS read-modify-write it would call .from();
    // assert it does NOT touch .from() for claude_sessions and DOES call the atomic RPC.
    const fromFn = vi.fn(() => { throw new Error('clearCoordinatorFlagFromSession must use rpc(), not from()'); });
    const sb = { rpc: rpcFn, from: fromFn };

    await resolve.clearCoordinatorFlagFromSession(sb, 'retire-me');

    expect(rpcFn).toHaveBeenCalledWith('clear_coordinator_flag', { p_session_id: 'retire-me' });
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('clearCoordinatorFlagFromSession is FAIL-OPEN on RPC error (does not throw)', async () => {
    vi.resetModules();
    resolve = require('./resolve.cjs');
    // RPC returns an error object → must NOT throw (Finding 3 observes via console.warn).
    const sbErr = { rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'db down' } })) };
    await expect(resolve.clearCoordinatorFlagFromSession(sbErr, 's1')).resolves.toBeUndefined();
    // RPC throws → still must NOT throw.
    const sbThrow = { rpc: vi.fn(() => { throw new Error('boom'); }) };
    await expect(resolve.clearCoordinatorFlagFromSession(sbThrow, 's2')).resolves.toBeUndefined();
  });

  it('flag-ON setActiveCoordinator registers via set_coordinator_flag RPC with p_session_id', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    vi.resetModules();
    resolve = require('./resolve.cjs');

    const rpcFn = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const sb = {
      rpc: rpcFn,
      from: vi.fn((table) => {
        if (table === 'session_coordination') {
          const chain = { eq: vi.fn(() => chain), gte: vi.fn(() => chain), then: (r) => Promise.resolve({ data: null, error: null }).then(r) };
          return { update: vi.fn(() => chain) };
        }
        // FR-6 paginated snapshot chain (.filter().order().range()); single holder = self.
        const snapRows = [{ session_id: 'only-me', heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true } }];
        const page = { order: vi.fn(() => page), range: vi.fn((f, t) => Promise.resolve({ data: snapRows.slice(f, t + 1), error: null })) };
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({ filter: vi.fn(() => page) })),
          })),
        };
      }),
    };

    await resolve.setActiveCoordinator(sb, 'only-me');
    expect(rpcFn).toHaveBeenCalledWith('set_coordinator_flag', { p_session_id: 'only-me' });
  });
});

// ============================================================================
// TS-3: post-checkout-role-restore hook
// ============================================================================

describe('TS-3: post-checkout-role-restore hook', () => {
  it('calls writePointerFile with the session_id when DB confirms is_coordinator=true', async () => {
    const SESSION = 'coord-session-123';
    const SINCE = '2026-06-14T08:00:00Z';

    const writePointerMock = vi.fn();

    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: { metadata: { is_coordinator: true, coordinator_since: SINCE } }, error: null })
            ),
          })),
        })),
      })),
    };

    const osMock = { hostname: () => 'test-host' };

    const result = await postCheckout.restoreCoordinatorPointer(sb, SESSION, writePointerMock, osMock);

    expect(result.restored).toBe(true);
    expect(writePointerMock).toHaveBeenCalledTimes(1);
    expect(writePointerMock.mock.calls[0][0].session_id).toBe(SESSION);
    expect(writePointerMock.mock.calls[0][0].host).toBe('test-host');
    expect(writePointerMock.mock.calls[0][0].started_at).toBe(SINCE);
  });

  it('does NOT call writePointerFile when session is not a coordinator', async () => {
    const writePointerMock = vi.fn();

    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: { metadata: { is_coordinator: false } }, error: null })
            ),
          })),
        })),
      })),
    };

    const result = await postCheckout.restoreCoordinatorPointer(sb, 'worker-session', writePointerMock, os);

    expect(result.restored).toBe(false);
    expect(writePointerMock).not.toHaveBeenCalled();
  });

  it('returns restored=false and does NOT call writePointerFile when DB row is absent', async () => {
    const writePointerMock = vi.fn();

    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    };

    const result = await postCheckout.restoreCoordinatorPointer(sb, 'no-row-session', writePointerMock, os);

    expect(result.restored).toBe(false);
    expect(writePointerMock).not.toHaveBeenCalled();
  });

  it('does NOT throw when the DB throws an error (fail-open)', async () => {
    const writePointerMock = vi.fn();

    const sb = {
      from: vi.fn(() => { throw new Error('DB is down'); }),
    };

    const result = await postCheckout.restoreCoordinatorPointer(sb, 'session-x', writePointerMock, os);

    expect(result.restored).toBe(false);
    expect(result.reason).toBe('error');
    expect(writePointerMock).not.toHaveBeenCalled();
  });

  it('returns no_session_id when sessionId is null', async () => {
    const sb = { from: vi.fn() };
    const result = await postCheckout.restoreCoordinatorPointer(sb, null, vi.fn(), os);
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('no_session_id');
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('returns no_supabase when supabase is null', async () => {
    const result = await postCheckout.restoreCoordinatorPointer(null, 'some-session', vi.fn(), os);
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('no_supabase');
  });
});

// ============================================================================
// TS-4: flag-OFF — no retire, no auto-resolve
// ============================================================================

describe('TS-4: flag-OFF — legacy behavior preserved, no retire, no auto-resolve', () => {
  it('flag-OFF: setActiveCoordinator uses the legacy JS upsert and NEVER the atomic RPCs / retire', async () => {
    delete process.env.COORDINATOR_TWOWAY_V2; // ensure OFF
    vi.resetModules();
    resolve = require('./resolve.cjs');

    const upsertFn = vi.fn(() => Promise.resolve({ data: null, error: null }));
    // flag-OFF must NOT touch the atomic RPCs (those are flag-ON only). Any rpc() call fails the test.
    const rpcFn = vi.fn(() => Promise.resolve({ data: null, error: null }));

    const sb = {
      rpc: rpcFn,
      from: vi.fn((table) => {
        if (table === 'session_coordination') {
          const chain = { eq: vi.fn(() => chain), gte: vi.fn(() => chain), then: (r) => Promise.resolve({ data: null, error: null }).then(r) };
          return { update: vi.fn(() => chain) };
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
          upsert: upsertFn,
        };
      }),
    };

    await resolve.setActiveCoordinator(sb, 'new-coord-flag-off');

    // flag-OFF legacy path: the JS upsert is used to register; NO RPC of any kind fires.
    expect(upsertFn).toHaveBeenCalledTimes(1);
    expect(rpcFn).not.toHaveBeenCalled();
  });

  it('flag-OFF: runAndLogDetectors does NOT auto-resolve SPLIT_BRAIN (no snapshot, no clear RPC)', async () => {
    delete process.env.COORDINATOR_TWOWAY_V2; // OFF
    process.env.COORD_DETECTORS_V2 = 'on';
    vi.resetModules();
    resolve = require('./resolve.cjs');
    coordEvents = require('./coordination-events.cjs');

    const splitBrainBundle = {
      coordinatorCount: 2,
      coordinators: [
        { session_id: 'A', heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T10:00:00Z' } },
        { session_id: 'B', heartbeat_at: new Date().toISOString(), metadata: { is_coordinator: true, coordinator_since: '2026-06-14T09:00:00Z' } },
      ],
      idleWorkers: 0, unclaimedItems: 0,
      signals: [], claims: [], sessions: [], sdClaims: [],
      ghostCompletions: [], evaSchedulerHeartbeat: null, mergesByRole: {},
    };

    // Any clear_coordinator_flag RPC or claude_sessions snapshot read fails the contract.
    const rpcFn = vi.fn(() => Promise.resolve({ data: null, error: null }));
    let snapshotRead = false;
    const sb = {
      rpc: rpcFn,
      from: vi.fn((table) => {
        if (table === 'coordination_events') {
          return { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'e1' }, error: null })) })) })) };
        }
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({ filter: vi.fn(() => { snapshotRead = true; return Promise.resolve({ data: [], error: null }); }) })),
          })),
        };
      }),
    };

    await coordEvents.runAndLogDetectors(sb, splitBrainBundle, { env: { COORD_DETECTORS_V2: 'on' /* COORDINATOR_TWOWAY_V2 absent */ } });

    // flag-OFF → auto-resolve block skipped entirely: no snapshot, no clear RPC.
    expect(snapshotRead).toBe(false);
    const clearCalls = rpcFn.mock.calls.filter((c) => c[0] === 'clear_coordinator_flag');
    expect(clearCalls.length).toBe(0);
  });
});
