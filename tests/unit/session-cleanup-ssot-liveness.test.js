/**
 * SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001 — cleanupStaleSessions must read liveness from
 * claude_sessions (the SSOT), not from the local file's own heartbeat_at and a transient child
 * PID. Reproduces the 2026-09-04 20:12Z incident (Golf, Golf-3 released while genuinely alive)
 * as a regression fixture (FR-1/FR-5a), plus FR-2 (registered claude.exe pid, not the file pid),
 * FR-4 (machine-scoped unlink) and FR-7 (sweep-side released->active self-heal, FR-5e).
 *
 * cleanupStaleSessions had NO dedicated test coverage before this SD (verified during LEAD
 * due-diligence) -- this file is new surface, not an extension.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import crypto from 'crypto';

// Deterministic machine id so fixtures can assert same-machine vs different-machine behavior
// (FR-4). Mirrors lib/session-manager.mjs's own getMachineId() formula exactly -- duplicated
// here because the function is not exported; a mismatch would silently break these fixtures
// rather than the production code, so a literal fixed value is used instead of the real host's.
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, hostname: () => 'test-host', platform: () => 'test-platform', arch: () => 'test-arch' },
    hostname: () => 'test-host',
    platform: () => 'test-platform',
    arch: () => 'test-arch',
  };
});
const SAME_MACHINE_ID = crypto.createHash('sha256').update('test-host-test-platform-test-arch').digest('hex').substring(0, 16);
const OTHER_MACHINE_ID = 'a'.repeat(16);

const files = {}; // filename -> JSON string, mutated per test
let rpcCalls = [];
let updateCalls = [];
let claudeSessionsSelectResult = { data: [], error: null };
let reviveUpdateResult = { data: [], error: null };

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: (p) => String(p).endsWith('.claude-sessions') ? true : actual.default.existsSync(p),
      mkdirSync: () => {},
      readdirSync: () => Object.keys(files),
      readFileSync: (p, enc) => {
        const name = String(p).split(/[\\/]/).pop();
        if (files[name] !== undefined) return files[name];
        return actual.default.readFileSync(p, enc);
      },
      unlinkSync: (p) => {
        const name = String(p).split(/[\\/]/).pop();
        delete files[name];
      },
    },
  };
});

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: (table) => {
      if (table === 'claude_sessions') {
        return {
          select: () => ({
            in: (col, ids) => Promise.resolve(claudeSessionsSelectResult),
          }),
          update: (payload) => {
            updateCalls.push({ table, payload });
            return {
              in: () => ({
                gt: () => ({
                  select: () => Promise.resolve(reviveUpdateResult),
                }),
              }),
            };
          },
        };
      }
      if (table === 'v_active_sessions') {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      }
      return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
    },
    rpc: (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'cleanup_stale_sessions') return Promise.resolve({ data: { sessions_marked_stale: 0, sessions_released: 0 }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { cleanupStaleSessions } = await import('../../lib/session-manager.mjs');

function setFile(sessionId, { heartbeat_at, pid, machine_id = SAME_MACHINE_ID }) {
  files[`${sessionId}.json`] = JSON.stringify({ session_id: sessionId, heartbeat_at, pid, machine_id });
}

beforeEach(() => {
  for (const k of Object.keys(files)) delete files[k];
  rpcCalls = [];
  updateCalls = [];
  claudeSessionsSelectResult = { data: [], error: null };
  reviveUpdateResult = { data: [], error: null };
  vi.restoreAllMocks();
});

describe('cleanupStaleSessions — SSOT liveness (FR-1/FR-2/FR-4/FR-7)', () => {
  it('FR-1/TS-1: a stale local file + dead child pid is NOT released when claude_sessions.heartbeat_at is fresh', async () => {
    const staleFileTime = new Date(Date.now() - 3600 * 1000).toISOString(); // 1h old file heartbeat
    const freshDbTime = new Date().toISOString();
    setFile('sess-1', { heartbeat_at: staleFileTime, pid: 999999 }); // dead child pid
    claudeSessionsSelectResult = {
      data: [{ session_id: 'sess-1', heartbeat_at: freshDbTime, metadata: {} }],
      error: null,
    };
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); }); // child pid dead

    const result = await cleanupStaleSessions();

    expect(result.localCleaned).toBe(0);
    expect(files['sess-1.json']).toBeDefined(); // file survives
    expect(rpcCalls.find(c => c.name === 'report_pid_validation_failure')).toBeUndefined();
    expect(result.ssotFallbackCount).toBe(0);
  });

  it('FR-1/TS-2 regression: a genuinely dead seat (stale file, dead pid, DB heartbeat also stale) is still released', async () => {
    const staleTime = new Date(Date.now() - 3600 * 1000).toISOString();
    setFile('sess-2', { heartbeat_at: staleTime, pid: 999999 });
    claudeSessionsSelectResult = {
      data: [{ session_id: 'sess-2', heartbeat_at: staleTime, metadata: {} }],
      error: null,
    };
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const result = await cleanupStaleSessions();

    expect(result.localCleaned).toBe(1);
    expect(files['sess-2.json']).toBeUndefined();
    expect(rpcCalls.find(c => c.name === 'report_pid_validation_failure')).toBeDefined();
  });

  it('FR-1: falls back to the file heartbeat and logs it when no claude_sessions row matches', async () => {
    const staleTime = new Date(Date.now() - 3600 * 1000).toISOString();
    setFile('sess-3', { heartbeat_at: staleTime, pid: 999999 });
    claudeSessionsSelectResult = { data: [], error: null }; // no matching DB row
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanupStaleSessions();

    expect(result.ssotFallbackCount).toBe(1);
    expect(result.localCleaned).toBe(1); // file-only fallback still finds it genuinely stale
    expect(logSpy.mock.calls.some(c => String(c[0]).includes('SSOT fallback'))).toBe(true);
  });

  it('FR-2: an alive registered cc_parent_pid vetoes staleness even if the file pid would read dead', async () => {
    const staleFileTime = new Date(Date.now() - 3600 * 1000).toISOString();
    setFile('sess-4', { heartbeat_at: staleFileTime, pid: 999999 }); // file's own pid is "dead"
    claudeSessionsSelectResult = {
      data: [{ session_id: 'sess-4', heartbeat_at: staleFileTime, metadata: { cc_parent_pid: 12345 } }],
      error: null,
    };
    vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === 12345) return true; // registered claude.exe pid is alive
      throw new Error('ESRCH');
    });

    const result = await cleanupStaleSessions();

    expect(result.localCleaned).toBe(0);
    expect(files['sess-4.json']).toBeDefined();
  });

  it('FR-2: an unknown (missing) cc_parent_pid never single-handedly triggers release -- heartbeat still decides', async () => {
    const freshDbTime = new Date().toISOString();
    setFile('sess-5', { heartbeat_at: new Date(Date.now() - 3600 * 1000).toISOString(), pid: 111 });
    claudeSessionsSelectResult = {
      data: [{ session_id: 'sess-5', heartbeat_at: freshDbTime, metadata: {} }], // no cc_parent_pid, but fresh heartbeat
      error: null,
    };
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const result = await cleanupStaleSessions();

    // unknown pid + fresh heartbeat => NOT stale (heartbeat leg vetoes)
    expect(result.localCleaned).toBe(0);
    expect(files['sess-5.json']).toBeDefined();
  });

  it('FR-4: the local-file unlink is scoped to the same machine as the DB-clearing RPC call', async () => {
    const staleTime = new Date(Date.now() - 3600 * 1000).toISOString();
    setFile('sess-6', { heartbeat_at: staleTime, pid: 999999, machine_id: OTHER_MACHINE_ID });
    claudeSessionsSelectResult = {
      data: [{ session_id: 'sess-6', heartbeat_at: staleTime, metadata: {} }],
      error: null,
    };
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const result = await cleanupStaleSessions();

    // Different machine: neither the RPC call nor the local unlink should fire.
    expect(rpcCalls.find(c => c.name === 'report_pid_validation_failure')).toBeUndefined();
    expect(result.localCleaned).toBe(0);
    expect(files['sess-6.json']).toBeDefined();
  });

  it('FR-7/TS-5: a released row with a fresh heartbeat is flipped back to active by the sweep itself', async () => {
    reviveUpdateResult = { data: [{ session_id: 'sess-7' }], error: null };

    const result = await cleanupStaleSessions();

    const revive = updateCalls.find(c => c.table === 'claude_sessions' && c.payload.status === 'active');
    expect(revive).toBeDefined();
    expect(revive.payload).toMatchObject({ status: 'active', stale_reason: null, stale_at: null, released_reason: null });
    expect(result.revivedReleasedCount).toBe(1);
  });
});
