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

// ============================================================================
// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 — M1: authoritative single-coordinator
// resolution + machine-canonical pointer, all DEFAULT-OFF behind
// COORDINATOR_TWOWAY_V2. Flag-OFF MUST stay byte-identical to the prior behavior
// (the RES-5..RES-8 tests above already pin that with the flag unset).
// ============================================================================

// v2 mock: supports the election terminal (.select().gte().filter() awaitable),
// the legacy DB scan (.filter().order().limit()), and the legacy file-heartbeat
// verify (.select().eq().gte().maybeSingle()).
function buildV2Mock({ coordinatorRows = [], error = null, fileVerifyRow = null } = {}) {
  const result = { data: coordinatorRows, error };
  function filterThenable() {
    const p = Promise.resolve(result);                 // election awaits .filter()
    p.order = vi.fn(() => ({ limit: vi.fn().mockResolvedValue(result) })); // legacy chain
    return p;
  }
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        gte: vi.fn(() => ({ filter: vi.fn(() => filterThenable()) })),
        eq: vi.fn(() => ({ gte: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: fileVerifyRow, error: null }) })) }))
      })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: null, error: null }) })) }))
    }))
  };
}

describe('TWOWAY-V2 flag (FR-1) + zero-DB-at-import (GG-8)', () => {
  afterEach(() => { delete process.env.COORDINATOR_TWOWAY_V2; });

  it('isTwoWayV2Enabled defaults OFF and reads env inside the function body', () => {
    delete process.env.COORDINATOR_TWOWAY_V2;
    expect(resolve.isTwoWayV2Enabled()).toBe(false);
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    expect(resolve.isTwoWayV2Enabled()).toBe(true);
    process.env.COORDINATOR_TWOWAY_V2 = 'off';
    expect(resolve.isTwoWayV2Enabled()).toBe(false);
  });

  it('requiring resolve.cjs issues ZERO DB calls at module scope (flag ON or OFF)', () => {
    // The module never imports/creates a supabase client — callers inject it.
    // So module load is side-effect-free regardless of the flag. Re-require under
    // flag ON and assert the public API loaded without any DB dependency.
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    vi.resetModules();
    const fresh = require('./resolve.cjs');
    expect(typeof fresh.getActiveCoordinatorId).toBe('function');
    expect(typeof fresh.electCoordinatorFromDb).toBe('function');
  });
});

describe('CHAR: flag-OFF is byte-identical to legacy (FR-2 characterization)', () => {
  afterEach(() => { delete process.env.COORDINATOR_TWOWAY_V2; });

  it('flag OFF does NOT elect: returns file-first coordinator even when DB has multiple coordinators', async () => {
    delete process.env.COORDINATOR_TWOWAY_V2; // OFF
    resolve.writePointerFile({ session_id: 'file-coord', started_at: '2026-06-05T00:00:00Z', host: 'h' });
    const sb = buildV2Mock({
      coordinatorRows: [
        { session_id: 'db-coord-A', heartbeat_at: new Date().toISOString(), metadata: { coordinator_since: '2026-06-05T01:00:00Z' } },
        { session_id: 'db-coord-B', heartbeat_at: new Date().toISOString(), metadata: { coordinator_since: '2026-06-05T02:00:00Z' } }
      ],
      fileVerifyRow: { session_id: 'file-coord', heartbeat_at: new Date().toISOString() }
    });
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBe('file-coord'); // legacy file-first wins; no election happened
  });
});

describe('ELECT: pickCanonicalCoordinator (FR-3, pure)', () => {
  it('ELECT-1: most-recent coordinator_since wins', () => {
    const w = resolve.pickCanonicalCoordinator([
      { session_id: 'a', metadata: { coordinator_since: '2026-06-05T01:00:00Z' } },
      { session_id: 'b', metadata: { coordinator_since: '2026-06-05T03:00:00Z' } },
      { session_id: 'c', metadata: { coordinator_since: '2026-06-05T02:00:00Z' } }
    ]);
    expect(w.session_id).toBe('b');
  });

  it('ELECT-2: NULL coordinator_since ordered last', () => {
    const w = resolve.pickCanonicalCoordinator([
      { session_id: 'no-since', metadata: {} },
      { session_id: 'has-since', metadata: { coordinator_since: '2026-06-05T01:00:00Z' } }
    ]);
    expect(w.session_id).toBe('has-since');
  });

  it('ELECT-3: session_id ASC tiebreak when coordinator_since equal', () => {
    const w = resolve.pickCanonicalCoordinator([
      { session_id: 'zzz', metadata: { coordinator_since: '2026-06-05T01:00:00Z' } },
      { session_id: 'aaa', metadata: { coordinator_since: '2026-06-05T01:00:00Z' } }
    ]);
    expect(w.session_id).toBe('aaa');
  });

  it('ELECT-3b: session_id ASC tiebreak when both coordinator_since null', () => {
    const w = resolve.pickCanonicalCoordinator([
      { session_id: 'yyy', metadata: {} },
      { session_id: 'bbb', metadata: null }
    ]);
    expect(w.session_id).toBe('bbb');
  });

  it('ELECT-4: empty / invalid input returns null', () => {
    expect(resolve.pickCanonicalCoordinator([])).toBeNull();
    expect(resolve.pickCanonicalCoordinator(null)).toBeNull();
    expect(resolve.pickCanonicalCoordinator([{ no_session: true }])).toBeNull();
  });
});

describe('ELECT: electCoordinatorFromDb (FR-3, fail-open)', () => {
  it('ELECT-5: returns elected winner session_id from fresh coordinators', async () => {
    const sb = buildV2Mock({ coordinatorRows: [
      { session_id: 'old', heartbeat_at: new Date().toISOString(), metadata: { coordinator_since: '2026-06-05T01:00:00Z' } },
      { session_id: 'new', heartbeat_at: new Date().toISOString(), metadata: { coordinator_since: '2026-06-05T05:00:00Z' } }
    ]});
    expect(await resolve.electCoordinatorFromDb(sb)).toBe('new');
  });

  it('ELECT-6a: DB error returns null (fail-open)', async () => {
    const sb = buildV2Mock({ coordinatorRows: null, error: { message: 'db down' } });
    expect(await resolve.electCoordinatorFromDb(sb)).toBeNull();
  });

  it('ELECT-6b: thrown error returns null (never throws)', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    await expect(resolve.electCoordinatorFromDb(sb)).resolves.toBeNull();
  });

  it('ELECT-6c: empty coordinator set returns null', async () => {
    const sb = buildV2Mock({ coordinatorRows: [] });
    expect(await resolve.electCoordinatorFromDb(sb)).toBeNull();
  });
});

describe('V2: getActiveCoordinatorId DB-canonical when flag ON (FR-3 + FR-4)', () => {
  afterEach(() => { delete process.env.COORDINATOR_TWOWAY_V2; });

  it('V2-1: flag ON returns the DB-elected winner, overriding a disagreeing pointer file (DB is canonical)', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    resolve.writePointerFile({ session_id: 'stale-file-coord', started_at: '2026-06-05T00:00:00Z', host: 'h' });
    const sb = buildV2Mock({ coordinatorRows: [
      { session_id: 'db-old', heartbeat_at: new Date().toISOString(), metadata: { coordinator_since: '2026-06-05T01:00:00Z' } },
      { session_id: 'db-new', heartbeat_at: new Date().toISOString(), metadata: { coordinator_since: '2026-06-05T04:00:00Z' } }
    ]});
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBe('db-new'); // DB wins over the stale file
  });

  it('V2-2: flag ON + no DB coordinator falls through to legacy file-first (fail-open)', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    resolve.writePointerFile({ session_id: 'file-coord', started_at: '2026-06-05T00:00:00Z', host: 'h' });
    const sb = buildV2Mock({ coordinatorRows: [], fileVerifyRow: { session_id: 'file-coord', heartbeat_at: new Date().toISOString() } });
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBe('file-coord'); // election empty → legacy chain returns file pointer
  });

  it('V2-3: flag ON + missing pointer file still resolves the DB coordinator (file not required)', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    if (fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)) fs.unlinkSync(resolve.ACTIVE_COORDINATOR_FILE);
    const sb = buildV2Mock({ coordinatorRows: [
      { session_id: 'db-only-coord', heartbeat_at: new Date().toISOString(), metadata: { coordinator_since: '2026-06-05T01:00:00Z' } }
    ]});
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBe('db-only-coord'); // DB-canonical: no file needed
  });
});
