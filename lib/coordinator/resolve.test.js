// Tests for SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-1
// lib/coordinator/resolve.cjs — getActiveCoordinatorId, setActiveCoordinator, clearActiveCoordinator

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Note: resolve.cjs writes to .claude/active-coordinator.json relative to its own __dirname.
// Tests redirect to a temp directory by overriding ACTIVE_COORDINATOR_FILE via fs spies.

let resolve;
let tmpDir;
let tmpFile;

beforeEach(() => {
  vi.resetModules();
  // Create a unique tmp dir per test to avoid cross-pollution.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));
  tmpFile = path.join(tmpDir, 'active-coordinator.json');

  vi.doMock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
      ...actual,
      default: actual,
      __esModule: true
    };
  });

  resolve = require('./resolve.cjs');
  // Override the constant by stubbing the module-internal path. Instead we drive
  // tests via the public API and pre-write the real file location to control state.
});

afterEach(() => {
  // Best-effort cleanup of temp state and the real pointer file.
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  try {
    if (fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)) {
      fs.unlinkSync(resolve.ACTIVE_COORDINATOR_FILE);
    }
  } catch {}
  vi.restoreAllMocks();
});

function buildSupabaseMock(handlers) {
  // Thenable update chain: supports both `update().eq()` (await direct) and
  // `update().eq().gte()` (added for QF-20260504-964 FIX 2 broadcast drain).
  const updateChain = () => {
    const chain = {
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      then: (resolve, reject) => Promise.resolve({ data: null, error: null }).then(resolve, reject)
    };
    return chain;
  };
  return {
    from: vi.fn((table) => {
      const h = handlers[table] || {};
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(h.eqGteMaybeSingle || { data: null, error: null })
            }),
            maybeSingle: vi.fn().mockResolvedValue(h.eqMaybeSingle || { data: null, error: null })
          }),
          gte: vi.fn().mockReturnValue({
            filter: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(h.gteFilterOrderLimit || { data: [], error: null })
              })
            })
          })
        }),
        update: vi.fn().mockReturnValue(updateChain())
      };
    })
  };
}

describe('RES-1: readPointerFile/writePointerFile round-trip', () => {
  it('writes JSON and reads it back', () => {
    resolve.writePointerFile({ session_id: 'abc-123', started_at: '2026-05-04T00:00:00Z', host: 'test-host' });
    const out = resolve.readPointerFile();
    expect(out.session_id).toBe('abc-123');
    expect(out.host).toBe('test-host');
  });
});

describe('RES-2: readPointerFile returns null when file absent', () => {
  it('handles missing file gracefully', () => {
    if (fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)) {
      fs.unlinkSync(resolve.ACTIVE_COORDINATOR_FILE);
    }
    expect(resolve.readPointerFile()).toBeNull();
  });
});

describe('RES-3: readPointerFile returns null on malformed JSON', () => {
  it('handles invalid JSON', () => {
    fs.mkdirSync(path.dirname(resolve.ACTIVE_COORDINATOR_FILE), { recursive: true });
    fs.writeFileSync(resolve.ACTIVE_COORDINATOR_FILE, '{not valid json');
    expect(resolve.readPointerFile()).toBeNull();
  });
});

describe('RES-4: readPointerFile returns null when session_id missing', () => {
  it('rejects malformed payload', () => {
    fs.mkdirSync(path.dirname(resolve.ACTIVE_COORDINATOR_FILE), { recursive: true });
    fs.writeFileSync(resolve.ACTIVE_COORDINATOR_FILE, JSON.stringify({ host: 'h' }));
    expect(resolve.readPointerFile()).toBeNull();
  });
});

describe('RES-5: getActiveCoordinatorId — file-first hit with fresh DB heartbeat', () => {
  it('returns file pointer session_id when DB confirms heartbeat fresh', async () => {
    resolve.writePointerFile({ session_id: 'coord-fresh', started_at: '2026-05-04T00:00:00Z', host: 'h' });
    const sb = buildSupabaseMock({
      claude_sessions: {
        eqGteMaybeSingle: { data: { session_id: 'coord-fresh', heartbeat_at: new Date().toISOString() }, error: null }
      }
    });
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBe('coord-fresh');
  });
});

describe('RES-6: getActiveCoordinatorId — file present but DB heartbeat stale → falls through', () => {
  it('falls through to DB scan when pointer file session is stale', async () => {
    resolve.writePointerFile({ session_id: 'coord-stale', started_at: '2026-05-04T00:00:00Z', host: 'h' });
    const sb = buildSupabaseMock({
      claude_sessions: {
        eqGteMaybeSingle: { data: null, error: null }, // stale
        gteFilterOrderLimit: { data: [{ session_id: 'coord-other-fresh', heartbeat_at: new Date().toISOString() }], error: null }
      }
    });
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBe('coord-other-fresh');
  });
});

describe('RES-7: getActiveCoordinatorId — DB-fallback miss returns null', () => {
  it('returns null when neither file nor DB has fresh coordinator', async () => {
    if (fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)) fs.unlinkSync(resolve.ACTIVE_COORDINATOR_FILE);
    const sb = buildSupabaseMock({
      claude_sessions: { gteFilterOrderLimit: { data: [], error: null } }
    });
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBeNull();
  });
});

describe('RES-8: getActiveCoordinatorId — file-only when supabase unavailable', () => {
  it('returns file pointer without DB confirmation when supabase param is null', async () => {
    resolve.writePointerFile({ session_id: 'no-db', started_at: '2026-05-04T00:00:00Z', host: 'h' });
    const id = await resolve.getActiveCoordinatorId(null);
    expect(id).toBe('no-db');
  });
});

describe('RES-9: setActiveCoordinator writes pointer file', () => {
  it('persists pointer to disk', async () => {
    const sb = buildSupabaseMock({
      claude_sessions: { eqMaybeSingle: { data: { metadata: {} }, error: null } }
    });
    await resolve.setActiveCoordinator(sb, 'session-xyz');
    const out = resolve.readPointerFile();
    expect(out.session_id).toBe('session-xyz');
    expect(out.host).toBe(os.hostname());
    expect(typeof out.started_at).toBe('string');
  });
});

describe('RES-10: setActiveCoordinator merges metadata.is_coordinator', () => {
  it('preserves existing metadata while adding is_coordinator flag', async () => {
    let updateCalledWith = null;
    const sb = {
      from: vi.fn((table) => {
        if (table === 'session_coordination') {
          // No-op drain chain for QF-20260504-964 FIX 2 — only verify metadata merge here.
          const chain = {
            eq: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            then: (resolve, reject) => Promise.resolve({ data: null, error: null }).then(resolve, reject)
          };
          return { update: vi.fn(() => chain) };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: { existing_key: 'preserved' } }, error: null })
            })
          }),
          update: vi.fn((payload) => {
            updateCalledWith = payload;
            return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
          })
        };
      })
    };
    await resolve.setActiveCoordinator(sb, 'session-merge');
    expect(updateCalledWith.metadata.existing_key).toBe('preserved');
    expect(updateCalledWith.metadata.is_coordinator).toBe(true);
    expect(updateCalledWith.metadata.coordinator_since).toBeTruthy();
  });
});

describe('RES-11: setActiveCoordinator throws on missing sessionId', () => {
  it('rejects empty sessionId', async () => {
    await expect(resolve.setActiveCoordinator({}, '')).rejects.toThrow();
    await expect(resolve.setActiveCoordinator({}, null)).rejects.toThrow();
  });
});

describe('DRAIN-1: setActiveCoordinator drains broadcast-coordinator buffer (QF-20260504-964 FIX 2)', () => {
  it('issues an UPDATE on session_coordination filtering target_session=broadcast-coordinator and gte(created_at)', async () => {
    let drainUpdatePayload = null;
    let drainEqArgs = null;
    let drainGteArgs = null;

    const sb = {
      from: vi.fn((table) => {
        if (table === 'session_coordination') {
          return {
            update: vi.fn((payload) => {
              drainUpdatePayload = payload;
              return {
                eq: vi.fn((col, val) => {
                  drainEqArgs = { col, val };
                  return {
                    gte: vi.fn((col2, val2) => {
                      drainGteArgs = { col: col2, val: val2 };
                      return Promise.resolve({ data: null, error: null });
                    })
                  };
                })
              };
            })
          };
        }
        // claude_sessions chain — same shape as the existing resolve tests
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
      })
    };

    await resolve.setActiveCoordinator(sb, 'new-coord-session-id');

    expect(drainUpdatePayload).toEqual({ target_session: 'new-coord-session-id' });
    expect(drainEqArgs).toEqual({ col: 'target_session', val: 'broadcast-coordinator' });
    expect(drainGteArgs.col).toBe('created_at');
    // cutoff must be a recent ISO timestamp (within last 24h+small drift)
    const cutoffMs = new Date(drainGteArgs.val).getTime();
    expect(Date.now() - cutoffMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5_000);
    expect(Date.now() - cutoffMs).toBeLessThan(24 * 60 * 60 * 1000 + 5_000);
  });
});

describe('RES-12: clearActiveCoordinator removes file and DB metadata flag', () => {
  it('cleans up pointer file and clears is_coordinator', async () => {
    resolve.writePointerFile({ session_id: 'to-clear', started_at: '2026-05-04T00:00:00Z', host: 'h' });
    expect(fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)).toBe(true);

    let updateCalledWith = null;
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: { is_coordinator: true, coordinator_since: 'x', other: 'kept' } }, error: null })
          })
        }),
        update: vi.fn((payload) => {
          updateCalledWith = payload;
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
        })
      }))
    };

    await resolve.clearActiveCoordinator(sb, 'to-clear');
    expect(fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)).toBe(false);
    expect(updateCalledWith.metadata.is_coordinator).toBeUndefined();
    expect(updateCalledWith.metadata.coordinator_since).toBeUndefined();
    expect(updateCalledWith.metadata.other).toBe('kept');
  });
});
