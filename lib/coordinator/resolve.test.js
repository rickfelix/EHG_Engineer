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

beforeEach(() => {
  vi.resetModules();
  // Create a unique tmp dir per test to avoid cross-pollution.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));

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
        update: vi.fn().mockReturnValue(updateChain()),
        // SD-FDBK-INFRA-COORDINATOR-IDENTITY-SILENTLY-001: setActiveCoordinator now writes
        // claude_sessions via upsert() (awaited directly, no .eq()), so the mock must expose it.
        upsert: vi.fn().mockResolvedValue({ data: null, error: null })
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

  // QF-20260727-391 (writer half). readPointerFile already refused a malformed pointer on the way
  // OUT; without this the next caller was still free to CREATE one. The incident shape is a caller
  // passing the id itself instead of the object, which lands as a bare JSON string — truthy to any
  // un-validating reader, and it shadowed the DB fallback so live sessions were told SOLO.
  // Throwing rather than coercing: a wrong pointer write should fail loudly at coordinator startup,
  // not leave a file that quietly misinforms the whole fleet.
  it('REFUSES to write a payload that would produce a truthy-but-shapeless pointer', () => {
    for (const bad of [
      'a59441f4-da45-4505-bb29-2b0d00cc70e1', // the exact incident shape: the id, not the object
      null,
      undefined,
      42,
      ['a59441f4'],
      {},
      { started_at: 'now', host: 'h' },       // object, but no session_id
      { session_id: 123 },                    // present, wrong type
      { session_id: '' },                     // present, empty
    ]) {
      expect(() => resolve.writePointerFile(bad), `${JSON.stringify(bad)} must be refused`).toThrow(/session_id/);
    }
  });

  it('a refused write does not touch the existing pointer — it must not half-write and then throw', () => {
    // A partial write would be worse than the original bug: a file that exists but is invalid.
    // Asserted by CONTENT rather than by deleting the file first — ACTIVE_COORDINATOR_FILE is a
    // real shared path that scripts/hooks/__tests__/session-role-orient.test.js also drives, and an
    // unlink here made that suite fail when the two ran together (verified: both pass together on
    // origin/main, and failed together with the unlink). Non-destructive is also the stronger
    // assertion — it proves the write is rejected BEFORE any filesystem mutation.
    resolve.writePointerFile({ session_id: 'sentinel-before-throw', started_at: 'x', host: 'h' });
    const before = fs.readFileSync(resolve.ACTIVE_COORDINATOR_FILE, 'utf8');
    expect(() => resolve.writePointerFile('bare-string-id')).toThrow(/session_id/);
    expect(fs.readFileSync(resolve.ACTIVE_COORDINATOR_FILE, 'utf8')).toBe(before);
  });

  it('still accepts every shape the production call sites actually pass', () => {
    // Guards against over-tightening: all three writePointerFile callers in resolve.cjs pass an
    // object with session_id plus assorted extra keys, and those must remain valid.
    expect(() => resolve.writePointerFile({ session_id: 'coord-1', started_at: '2026-05-04T00:00:00Z', host: 'h', pid: 123 })).not.toThrow();
    expect(resolve.readPointerFile().session_id).toBe('coord-1');
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

// Helper: build a supabase mock that captures the claude_sessions upsert payload + options,
// returning a configurable existing metadata row from the read-then-merge SELECT.
function buildUpsertCaptureMock(existingMetadata) {
  const captured = { payload: null, opts: null };
  const sb = {
    from: vi.fn((table) => {
      if (table === 'session_coordination') {
        // No-op drain chain for QF-20260504-964 FIX 2.
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
            maybeSingle: vi.fn().mockResolvedValue({
              data: existingMetadata === undefined ? null : { metadata: existingMetadata },
              error: null
            })
          })
        }),
        upsert: vi.fn((payload, opts) => {
          captured.payload = payload;
          captured.opts = opts;
          return Promise.resolve({ data: null, error: null });
        })
      };
    })
  };
  return { sb, captured };
}

// RES-10 / UPSERT-1 / UPSERT-2 characterize the FLAG-OFF legacy JS-upsert register path of
// setActiveCoordinator (byte-identical, unchanged by SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A).
// They explicitly force the flag OFF so they are deterministic regardless of ambient env
// (COORDINATOR_TWOWAY_V2 may be exported in the shell; the flag-ON path uses atomic RPCs instead).
describe('RES-10: setActiveCoordinator merges metadata.is_coordinator via upsert', () => {
  afterEach(() => { delete process.env.COORDINATOR_TWOWAY_V2; });
  it('preserves existing metadata while adding is_coordinator flag (FR-3)', async () => {
    delete process.env.COORDINATOR_TWOWAY_V2; // flag-OFF legacy upsert path
    const { sb, captured } = buildUpsertCaptureMock({ existing_key: 'preserved' });
    await resolve.setActiveCoordinator(sb, 'session-merge');
    expect(captured.payload.metadata.existing_key).toBe('preserved');
    expect(captured.payload.metadata.is_coordinator).toBe(true);
    expect(captured.payload.metadata.coordinator_since).toBeTruthy();
  });
});

describe('UPSERT-1: setActiveCoordinator inserts when no claude_sessions row exists (FR-1)', () => {
  afterEach(() => { delete process.env.COORDINATOR_TWOWAY_V2; });
  it('uses upsert (not a no-op update) keyed on session_id so identity registers', async () => {
    delete process.env.COORDINATOR_TWOWAY_V2; // flag-OFF legacy upsert path
    const { sb, captured } = buildUpsertCaptureMock(undefined); // no existing row
    await resolve.setActiveCoordinator(sb, 'fresh-coord');
    expect(captured.payload.session_id).toBe('fresh-coord');
    expect(captured.payload.metadata.is_coordinator).toBe(true);
    expect(captured.opts).toEqual({ onConflict: 'session_id' });
  });
});

describe('UPSERT-2: setActiveCoordinator stamps fresh heartbeat_at + status (FR-2)', () => {
  afterEach(() => { delete process.env.COORDINATOR_TWOWAY_V2; });
  it('writes heartbeat_at ~now and status=active so getActiveCoordinatorId resolves it', async () => {
    delete process.env.COORDINATOR_TWOWAY_V2; // flag-OFF legacy upsert path
    const { sb, captured } = buildUpsertCaptureMock({});
    await resolve.setActiveCoordinator(sb, 'hb-coord');
    expect(captured.payload.status).toBe('active');
    expect(typeof captured.payload.heartbeat_at).toBe('string');
    const hbMs = new Date(captured.payload.heartbeat_at).getTime();
    expect(Date.now() - hbMs).toBeGreaterThanOrEqual(0);
    expect(Date.now() - hbMs).toBeLessThan(10_000); // within 10s of now
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
        // claude_sessions chain — same shape as the existing resolve tests.
        // SD-FDBK-INFRA-COORDINATOR-IDENTITY-SILENTLY-001: write path is now upsert().
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null })
            })
          }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: null })
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

describe('RES-12: clearActiveCoordinator removes file and clears DB metadata flag (atomic RPC)', () => {
  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / Finding 2: clearActiveCoordinator's
  // metadata clear now routes through clearCoordinatorFlagFromSession → the ATOMIC
  // clear_coordinator_flag(p_session_id) RPC (single in-DB UPDATE with jsonb `-`), replacing the
  // old JS read-modify-write on the whole metadata object (lost-update race). Sibling-key
  // preservation (`other` kept, is_coordinator/coordinator_since dropped) is now PROVEN by the
  // migration's in-DB DO $verify$ ASSERT block, not a JS-side mock. Here we assert the contract:
  // the pointer file is deleted AND the correct atomic RPC is invoked with the session_id.
  it('deletes the pointer file and calls the atomic clear_coordinator_flag RPC', async () => {
    resolve.writePointerFile({ session_id: 'to-clear', started_at: '2026-05-04T00:00:00Z', host: 'h' });
    expect(fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)).toBe(true);

    const rpcFn = vi.fn(() => Promise.resolve({ data: null, error: null }));
    // If the clear still did a JS read-modify-write it would call .from(); assert it does NOT.
    const fromFn = vi.fn(() => { throw new Error('clear must use atomic rpc(), not from()'); });
    const sb = { rpc: rpcFn, from: fromFn };

    await resolve.clearActiveCoordinator(sb, 'to-clear');
    expect(fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)).toBe(false); // pointer file deleted
    expect(rpcFn).toHaveBeenCalledWith('clear_coordinator_flag', { p_session_id: 'to-clear' });
    expect(fromFn).not.toHaveBeenCalled();
  });
});

// ============================================================================
// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 — M1: authoritative single-coordinator
// resolution + machine-canonical pointer, all DEFAULT-OFF behind
// COORDINATOR_TWOWAY_V2. Flag-OFF MUST stay byte-identical to the prior behavior
// (the RES-5..RES-8 tests above already pin that with the flag unset).
// ============================================================================

// v2 mock: supports the election terminal (.select().gte().filter().order().range() — FR-6
// count-truncation discipline paginates it via fetchAllPaginated), the legacy DB scan
// (.filter().order().limit()), and the legacy file-heartbeat verify
// (.select().eq().gte().maybeSingle()).
function buildV2Mock({ coordinatorRows = [], error = null, fileVerifyRow = null } = {}) {
  const result = { data: coordinatorRows, error };
  function filterThenable() {
    const p = Promise.resolve(result);                 // legacy: awaits .filter()
    const pageRange = vi.fn((from, to) => Promise.resolve(
      error ? { data: null, error } : { data: (coordinatorRows || []).slice(from, to + 1), error: null }
    ));
    const orderChain = { limit: vi.fn().mockResolvedValue(result), range: pageRange };
    orderChain.order = vi.fn(() => orderChain); // extra tiebreaker orders chain onto the same page
    p.order = vi.fn(() => orderChain);
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

// ============================================================================
// QF-20260727-259 — the coordinator election must not elect a session no process
// has ever backed. Incident 2026-07-27T02:00:08Z: the nil-UUID row was stamped
// is_coordinator with a fresh coordinator_since and deposed the live coordinator,
// so every worker signal routed into a session that had never run a tool.
// ============================================================================
describe('GHOST: isGhostSessionRow + process-backed election guard (QF-20260727-259)', () => {
  const OLD = '2026-06-23T06:04:53Z';   // ghost row's real created_at, comfortably past grace
  const nowIso = () => new Date().toISOString();

  it('GHOST-1: the nil UUID is never electable even holding the newest coordinator_since', () => {
    const w = resolve.pickCanonicalCoordinator([
      { session_id: 'live', metadata: { coordinator_since: '2026-07-25T22:24:44Z' } },
      { session_id: resolve.NIL_SESSION_ID, metadata: { coordinator_since: '2026-07-27T02:00:08Z' } }
    ]);
    expect(w.session_id).toBe('live');
  });

  // MERGE COVERAGE (Alpha-5, QF-20260727-862 x QF-20260727-259): GHOST-1 above proves the EXACT
  // nil UUID is unelectable via isGhostSessionRow's `session_id === NIL_SESSION_ID` compare. That
  // compare is exact, so a padded or upper-cased nil would slip past it — which is why the merged
  // filter ALSO keeps 862's isUsableSessionId (trim + lowercase tolerant). Mutation-tested: with
  // this case absent, removing isUsableSessionId from the filter broke nothing, i.e. the second
  // guard was defensive-but-unproven. This is the case that makes it load-bearing.
  it('GHOST-1b: a whitespace-padded / upper-cased nil UUID is also never electable', () => {
    const w = resolve.pickCanonicalCoordinator([
      { session_id: 'live', metadata: { coordinator_since: '2026-07-25T22:24:44Z' } },
      { session_id: ` ${resolve.NIL_SESSION_ID.toUpperCase()} `, metadata: { coordinator_since: '2026-07-27T02:00:08Z' } }
    ]);
    expect(w.session_id).toBe('live');
  });

  it('GHOST-2: an aged row with no pid and no last_tool_at is never electable', () => {
    const w = resolve.pickCanonicalCoordinator([
      { session_id: 'live', last_tool_at: nowIso(), pid: 99, created_at: OLD,
        metadata: { coordinator_since: '2026-07-25T22:24:44Z' } },
      { session_id: 'never-alive', last_tool_at: null, pid: null, created_at: OLD,
        metadata: { coordinator_since: '2026-07-27T02:00:08Z' } }
    ]);
    expect(w.session_id).toBe('live');
  });

  it('GHOST-3: a row younger than the grace window stays electable (set_coordinator_flag create-if-absent)', () => {
    // A genuinely new coordinator registers before it has run its first tool. Excluding it
    // would break the create-if-absent path the RPC exists to serve.
    const fresh = new Date(Date.now() - 60_000).toISOString();
    expect(resolve.isGhostSessionRow(
      { session_id: 'brand-new', last_tool_at: null, pid: null, created_at: fresh }
    )).toBe(false);
  });

  it('GHOST-4: a pid-less row that HAS run a tool stays electable (pid is null for most live seats)', () => {
    // Measured 2026-07-27: 16 of 31 sessions heartbeating in the last 24h carry pid NULL.
    // pid alone would be a false-positive machine; only pid AND last_tool_at absent is a ghost.
    expect(resolve.isGhostSessionRow(
      { session_id: 'pidless-but-working', last_tool_at: nowIso(), pid: null, created_at: OLD }
    )).toBe(false);
  });

  it('GHOST-5: rows without the liveness columns fail OPEN (a guard that cannot see, cannot exclude)', () => {
    expect(resolve.isGhostSessionRow({ session_id: 'narrow-select', metadata: {} })).toBe(false);
    expect(resolve.isGhostSessionRow({ session_id: 'no-created-at', last_tool_at: null, pid: null })).toBe(false);
    expect(resolve.isGhostSessionRow(null)).toBe(false);
  });

  it('GHOST-7: setActiveCoordinator refuses to STAMP the nil session id', async () => {
    await expect(resolve.setActiveCoordinator(null, resolve.NIL_SESSION_ID)).rejects.toThrow(/nil session id/i);
  });

  it('GHOST-8: the legacy DB scan skips a ghost that sorts first and returns the live coordinator', async () => {
    delete process.env.COORDINATOR_TWOWAY_V2; // legacy path
    if (fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)) fs.unlinkSync(resolve.ACTIVE_COORDINATOR_FILE);
    const sb = buildSupabaseMock({
      claude_sessions: {
        // heartbeat_at DESC — the ghost's freshly-stamped heartbeat puts it FIRST, which is
        // exactly why the old .limit(1) handed the caller a ghost.
        gteFilterOrderLimit: { data: [
          { session_id: resolve.NIL_SESSION_ID, heartbeat_at: nowIso(), last_tool_at: null, pid: null, created_at: OLD, metadata: {} },
          { session_id: 'live-coord', heartbeat_at: nowIso(), last_tool_at: nowIso(), pid: 4242, created_at: OLD, metadata: {} }
        ], error: null }
      }
    });
    expect(await resolve.getActiveCoordinatorId(sb)).toBe('live-coord');
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

  it('GHOST-6: flag ON + a ghost holding the NEWEST coordinator_since elects the live coordinator (the 2026-07-27 incident)', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    if (fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)) fs.unlinkSync(resolve.ACTIVE_COORDINATOR_FILE);
    const sb = buildV2Mock({ coordinatorRows: [
      // The live coordinator: older coordinator_since, but a real process is behind it.
      { session_id: 'live-coord', heartbeat_at: new Date().toISOString(), last_tool_at: new Date().toISOString(),
        pid: 4242, created_at: '2026-07-27T10:00:47Z', metadata: { coordinator_since: '2026-07-25T22:24:44Z' } },
      // The ghost: set_coordinator_flag stamped a fresh heartbeat, status and coordinator_since
      // onto a 2026-06-23 row that no process has ever backed. It USED to win on since DESC.
      { session_id: resolve.NIL_SESSION_ID, heartbeat_at: new Date().toISOString(), last_tool_at: null,
        pid: null, created_at: '2026-06-23T06:04:53Z', metadata: { coordinator_since: '2026-07-27T02:00:08Z' } }
    ]});
    expect(await resolve.getActiveCoordinatorId(sb)).toBe('live-coord');
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

// ---------------------------------------------------------------------------
// QF-20260727-862 — nil-UUID guard (silent signal misroute)
//
// Replays the 2026-07-27 02:00–02:03 UTC incident: a claude_sessions ghost row keyed on the all-zero
// nil UUID was flagged is_coordinator=true with the freshest coordinator_since. It won the election,
// deposed the live coordinator, and three real worker signals (2 critical) were written to it. The
// writes succeeded, so nothing errored and nothing was stamped dead_letter — the loss was invisible.
// ---------------------------------------------------------------------------
describe('NIL-UUID GUARD (QF-20260727-862)', () => {
  const NIL = '00000000-0000-0000-0000-000000000000';

  it('NIL-1: isNilUuid/isUsableSessionId classify the nil UUID regardless of case or padding', () => {
    expect(resolve.NIL_UUID).toBe(NIL);
    expect(resolve.isNilUuid(NIL)).toBe(true);
    expect(resolve.isNilUuid('  ' + NIL.toUpperCase() + ' ')).toBe(true); // PostgREST/SQL round-trip
    expect(resolve.isNilUuid('a59441f4-da45-4505-bb29-2b0d00cc70e1')).toBe(false);
    expect(resolve.isUsableSessionId(NIL)).toBe(false);
    expect(resolve.isUsableSessionId('')).toBe(false);
    expect(resolve.isUsableSessionId('   ')).toBe(false);
    expect(resolve.isUsableSessionId(null)).toBe(false);
    expect(resolve.isUsableSessionId('a59441f4-da45-4505-bb29-2b0d00cc70e1')).toBe(true);
  });

  it('NIL-2: setActiveCoordinator REFUSES to flag the nil UUID (write-path — how the ghost row was minted)', async () => {
    const sb = buildSupabaseMock({ claude_sessions: {} });
    await expect(resolve.setActiveCoordinator(sb, NIL)).rejects.toThrow(/nil UUID/i);
    // The pre-existing non-empty-string check must be unchanged.
    await expect(resolve.setActiveCoordinator(sb, '')).rejects.toThrow(/sessionId required/);
  });

  it('NIL-3: election SKIPS the nil UUID even when it carries the freshest coordinator_since (the deposition)', () => {
    const winner = resolve.pickCanonicalCoordinator([
      { session_id: 'live-coord', metadata: { coordinator_since: '2026-07-27T01:00:00Z' } },
      { session_id: NIL, metadata: { coordinator_since: '2026-07-27T02:00:08Z' } } // freshest → would win
    ]);
    expect(winner).not.toBeNull();
    expect(winner.session_id).toBe('live-coord');
  });

  it('NIL-4: nil UUID cannot win the session_id ASC tiebreak (it sorts first, so it beat everything)', () => {
    const winner = resolve.pickCanonicalCoordinator([
      { session_id: 'zzz-real-coord', metadata: {} },
      { session_id: NIL, metadata: {} } // no since on either → ASC tiebreak, '00000000-…' sorts first
    ]);
    expect(winner.session_id).toBe('zzz-real-coord');
  });

  it('NIL-5: a nil-UUID candidate alone elects NOBODY rather than a ghost', () => {
    expect(resolve.pickCanonicalCoordinator([{ session_id: NIL, metadata: {} }])).toBeNull();
  });

  it('NIL-6: getActiveCoordinatorId returns null when the POINTER FILE holds the nil UUID with a fresh heartbeat', async () => {
    // Choke-point coverage: the pointer-file path bypasses pickCanonicalCoordinator entirely.
    resolve.writePointerFile({ session_id: NIL, started_at: '2026-07-27T02:00:00Z', host: 'h' });
    const sb = buildSupabaseMock({
      claude_sessions: {
        eqGteMaybeSingle: { data: { session_id: NIL, heartbeat_at: new Date().toISOString() }, error: null }
      }
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = await resolve.getActiveCoordinatorId(sb);
    expect(id).toBeNull(); // → caller falls back to the DRAINED 'broadcast-coordinator' sentinel
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('COORD_NIL_UUID')); // degrade LOUDLY
  });

  it('NIL-7: getActiveCoordinatorId returns null when the legacy DB SCAN returns the nil UUID', async () => {
    if (fs.existsSync(resolve.ACTIVE_COORDINATOR_FILE)) fs.unlinkSync(resolve.ACTIVE_COORDINATOR_FILE);
    const sb = buildSupabaseMock({
      claude_sessions: {
        gteFilterOrderLimit: { data: [{ session_id: NIL, heartbeat_at: new Date().toISOString() }], error: null }
      }
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resolve.getActiveCoordinatorId(sb)).toBeNull();
  });

  it('NIL-8: a real coordinator still resolves normally (guard is not over-broad)', async () => {
    resolve.writePointerFile({ session_id: 'real-coord', started_at: '2026-07-27T02:00:00Z', host: 'h' });
    const sb = buildSupabaseMock({
      claude_sessions: {
        eqGteMaybeSingle: { data: { session_id: 'real-coord', heartbeat_at: new Date().toISOString() }, error: null }
      }
    });
    expect(await resolve.getActiveCoordinatorId(sb)).toBe('real-coord');
  });
});
