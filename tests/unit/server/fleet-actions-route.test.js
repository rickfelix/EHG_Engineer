/**
 * SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-C — fleet action-button route unit tests.
 * Mocks lib/fleet/spawn-control.js + desired-slots-store.js + session-registry-adapter.js
 * directly (already unit-tested elsewhere) so these tests isolate the route's own composition
 * logic. Calls exported handlers directly with mock req/res, matching Child A's established
 * fleet-panel-route.test.js pattern -- no supertest, no live DB.
 */
import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ live: false }));

vi.mock('../../../lib/fleet/spawn-control.js', () => ({
  spawn: vi.fn(async ({ role, callsign, accountProfile }) => ({ live: state.live, invocation: { role, callsign, accountProfile } })),
  relaunchUnderProfile: vi.fn(async (target, accountProfile) => ({ ok: true, role: 'worker', target, accountProfile })),
  isLiveEnabled: vi.fn(() => state.live),
}));

vi.mock('../../../lib/fleet/desired-slots-store.js', () => ({
  loadDesiredSlots: vi.fn(async () => ([
    { name: 'Golf-3', role: 'worker', account_profile: 'RickFelix' },
    { name: 'Golf-4', role: 'worker', account_profile: 'RickFelix' },
  ])),
}));

vi.mock('../../../lib/fleet/session-registry-adapter.js', () => ({
  computeLiveSlotDrift: vi.fn(async () => ({
    drift: true,
    missing: [{ name: 'Golf-4' }],
    present: [{ name: 'Golf-3', mismatches: [] }],
    unexpected: [],
  })),
  // QF-20260726-607: the live-callsign set the mint must allocate AGAINST -- the same source
  // spawn() dedups on, so a minted name can never return skipped:already_live.
  loadLiveSessionIdentity: vi.fn(async () => ({
    sessions: [],
    callsignBySession: { 's-1': 'Alpha', 's-2': 'Bravo' },
  })),
}));

const { respawnFleet, relaunchSessionUnderProfile, addSession, snapshotManifest, mintCallsign } = await import('../../../server/routes/fleet-actions.js');
const { spawn, relaunchUnderProfile } = await import('../../../lib/fleet/spawn-control.js');
const { NATO } = (await import('../../../scripts/assign-fleet-identities.cjs')).default;

function mockRes() {
  const res = {};
  res.json = vi.fn(() => res);
  res.status = vi.fn(() => res);
  return res;
}

function mockReq(body = {}) {
  return { app: { locals: { supabase: {} } }, body };
}

describe('POST /api/fleet-actions/respawn-fleet', () => {
  it('spawns only the missing/stale slots, not the already-present ones', async () => {
    const req = mockReq();
    const res = mockRes();
    await respawnFleet(req, res);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({ callsign: 'Golf-4', role: 'worker', accountProfile: 'RickFelix' }),
      expect.anything(),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.respawned).toHaveLength(1);
    expect(payload.unchanged).toBe(1);
  });
});

describe('POST /api/fleet-actions/relaunch-under-profile', () => {
  it('calls relaunchUnderProfile with target + accountProfile', async () => {
    const req = mockReq({ target: 'Golf-3', accountProfile: 'CodeStreet' });
    const res = mockRes();
    await relaunchSessionUnderProfile(req, res);

    expect(relaunchUnderProfile).toHaveBeenCalledWith('Golf-3', 'CodeStreet', expect.anything());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it('returns 400 when target or accountProfile is missing', async () => {
    const req = mockReq({ target: 'Golf-3' });
    const res = mockRes();
    await relaunchSessionUnderProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/fleet-actions/add-session', () => {
  it('calls spawn with role/callsign/accountProfile', async () => {
    const req = mockReq({ role: 'worker', callsign: 'Hotel-1', accountProfile: 'DeepSoul' });
    const res = mockRes();
    await addSession(req, res);

    expect(spawn).toHaveBeenCalledWith({ role: 'worker', callsign: 'Hotel-1', accountProfile: 'DeepSoul' }, expect.anything());
  });

  // QF-20260726-607 (chairman): the callsign is ASSIGNED, never typed. These tests pin the
  // behaviour change -- an unnamed spawn must SUCCEED with a minted name, not 400.
  it('mints a callsign and spawns when the operator supplies none', async () => {
    const req = mockReq({ role: 'worker' });
    const res = mockRes();
    await addSession(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const spawned = spawn.mock.calls.at(-1)[0];
    expect(typeof spawned.callsign).toBe('string');
    expect(spawned.callsign).not.toBe('');
    const payload = res.json.mock.calls.at(-1)[0];
    expect(payload.callsign).toBe(spawned.callsign);
    expect(payload.callsign_minted).toBe(true);
  });

  it('never mints a callsign that is already live (would come back skipped:already_live)', async () => {
    const minted = await mintCallsign({});
    // The mock reports Alpha and Bravo live. Assert membership in the shared pool rather than
    // hard-coding 'Charlie' -- the pool order is the cron's to own, not this test's.
    expect(NATO).toContain(minted);
    expect(['Alpha', 'Bravo']).not.toContain(minted);
  });

  // CONTROL: the guard still refuses a genuinely missing role, so the test above is not
  // passing merely because addSession stopped validating anything at all.
  it('still returns 400 when role is missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await addSession(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // Quick-fix QF-20260731-222: a refusal thrown inside spawn() (tree-currency, launch contract)
  // must answer {ok:false, reason} — not fall through to the EVA error handler, which flattens it
  // to a bare 422 the sessions page can only render as "Spawn failed: 422".
  it('answers a spawn() throw as {ok:false, reason} so the UI can render the refusal', async () => {
    spawn.mockRejectedValueOnce(new Error('[tree-currency] REFUSED: 36 commit(s) behind origin/main'));
    const req = mockReq({ role: 'worker', callsign: 'Hotel-1' });
    const res = mockRes();
    await addSession(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls.at(-1)[0];
    expect(payload.ok).toBe(false);
    expect(payload.reason).toContain('[tree-currency] REFUSED');
  });

  // SD-LEO-FEAT-FLEET-COLD-START-UX-001. The suite above asserts opts as expect.anything(), which
  // is exactly why the key-presence defect was invisible — these assert opts itself.
  describe('role -> startup prompt (FR-1/FR-2)', () => {
    it('TS-13: a worker spawn forwards NO startupPrompt KEY, so namespace selection still runs', async () => {
      // THE REGRESSION GUARD. spawn-control.js reads ('startupPrompt' in opts): a present-but-
      // undefined key suppresses defaultStartupPrompt, emits no pointer, and every worker started
      // from the page ghosts. hasOwn is the assertion; toBeUndefined() would pass on the bug.
      const res = mockRes();
      await addSession(mockReq({ role: 'worker', callsign: 'Hotel-1' }), res);

      const opts = spawn.mock.calls.at(-1)[1];
      expect(Object.hasOwn(opts, 'startupPrompt')).toBe(false);
    });

    it('TS-1: a coordinator spawn forwards the coordinator directive', async () => {
      const res = mockRes();
      await addSession(mockReq({ role: 'coordinator', callsign: 'Coordinator-1' }), res);

      expect(spawn.mock.calls.at(-1)[1]).toMatchObject({ startupPrompt: '/coordinator start' });
    });

    it('TS-3: an unrecognised role is refused with a reason naming the accepted roles', async () => {
      const res = mockRes();
      await addSession(mockReq({ role: 'coordinatior', callsign: 'Hotel-1' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls.at(-1)[0].reason).toMatch(/coordinator, worker, solomon, adam/);
    });

    it('TS-3b: canary is refused as a ROLE — it is an accountProfile', async () => {
      const res = mockRes();
      await addSession(mockReq({ role: 'canary', callsign: 'Canary-pilot' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('TS-14: a canary callsign cannot be spawned as coordinator', async () => {
      // Closes the coordinator-pointer hijack: both inputs are individually legal, and together
      // they would hand /coordinator start to a canary, which then calls setActiveCoordinator.
      const res = mockRes();
      const before = spawn.mock.calls.length;
      await addSession(mockReq({ role: 'coordinator', callsign: 'Canary-pilot' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls.at(-1)[0].reason).toMatch(/canary namespace/i);
      expect(spawn.mock.calls.length).toBe(before); // refused BEFORE spawning, not after
    });

    it('TS-14b: a canary callsign with role=worker is still allowed', async () => {
      // Control arm — without it the suite would pass on an implementation that blocks every
      // canary spawn, which would break canary provisioning.
      const res = mockRes();
      await addSession(mockReq({ role: 'worker', callsign: 'Canary-pilot' }), res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(Object.hasOwn(spawn.mock.calls.at(-1)[1], 'startupPrompt')).toBe(false);
    });
  });

  it('honours an explicitly supplied callsign (manifest/canary callers name their own slots)', async () => {
    const req = mockReq({ role: 'worker', callsign: 'Canary-pilot' });
    const res = mockRes();
    await addSession(req, res);

    expect(spawn.mock.calls.at(-1)[0].callsign).toBe('Canary-pilot');
    expect(res.json.mock.calls.at(-1)[0].callsign_minted).toBe(false);
  });

  // QF-20260726-607 x COLD-START-UX-001 FR-2 — the seam between the two SDs, where a careless
  // merge would have silently widened a security guard.
  describe('the mint does not widen assertRoleCallsignCompatible', () => {
    it('mints a callsign-less coordinator its ROLE NAME, not a worker-pool NATO name', async () => {
      // The singleton roles already run under callsign === role name; a NATO name would invent a
      // second convention for a seat that has one.
      const res = mockRes();
      await addSession(mockReq({ role: 'coordinator' }), res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(spawn.mock.calls.at(-1)[0].callsign).toBe('coordinator');
      expect(NATO).not.toContain(spawn.mock.calls.at(-1)[0].callsign);
    });

    it('never mints an UNIDENTIFIABLE callsign — the guard that gates privileged directives', async () => {
      // The refusal arm is a security control: an unnamespaced session must not receive
      // '/coordinator start'. Whatever the mint produces has to satisfy it, not bypass it.
      for (const role of ['coordinator', 'solomon', 'adam', 'worker']) {
        const res = mockRes();
        await addSession(mockReq({ role }), res);
        expect(res.status).not.toHaveBeenCalledWith(400);
        const minted = spawn.mock.calls.at(-1)[0].callsign;
        expect(typeof minted).toBe('string');
        expect(minted.trim()).not.toBe('');
      }
    });

    it('checks compatibility against the MINTED callsign, not the absent request one', async () => {
      // Control for the test above: the worker path still succeeds, so the refusal is role-scoped
      // rather than the mint being broken outright.
      const res = mockRes();
      await addSession(mockReq({ role: 'worker' }), res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(NATO).toContain(spawn.mock.calls.at(-1)[0].callsign);
    });
  });
});

describe('GET /api/fleet-actions/snapshot-manifest', () => {
  it('returns a read-only snapshot combining desired slots and drift', async () => {
    const req = mockReq();
    const res = mockRes();
    await snapshotManifest(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.desiredSlots).toHaveLength(2);
    expect(payload.drift.missing).toEqual([{ name: 'Golf-4' }]);
    expect(typeof payload.snapshot_at).toBe('string');
  });
});

/**
 * SD-LEO-FIX-UNOWNED-PARENT-SLICE-001 — pin that these routes are actually AUTH-GATED.
 *
 * Every test above calls the exported handlers DIRECTLY with mock req/res, which is the right
 * shape for testing composition logic but means all of them bypass requireAuth by design. So the
 * property the fleet panel's retirement decision leans on -- "leaving these three routes in place
 * is fine BECAUSE they are auth-gated" -- was asserted by exactly one line in server/index.js that
 * nothing pinned. Flipping it to optionalAuth would fail no test. That is precisely how the panel
 * itself came to be unauthenticated for its entire life.
 *
 * These are not read-only routes: respawn-fleet and relaunch-under-profile invoke spawn() and
 * relaunchUnderProfile(), i.e. process execution under an account profile. requireAuth is only
 * AUTHENTICATION -- no role check, no allowlist, no ownership check -- and EHG_Engineer and EHG
 * share one Supabase project, so any EHG-app JWT passes here. The present bound is that EHG has
 * no public signup surface, which is an incidental property, NOT a control.
 *
 * THIS IS A SOURCE-TEXT PROXY, deliberately labelled as one. server/index.js calls startServer()
 * at import time (no main-module guard), so it cannot be imported to inspect its router. The pin
 * therefore reads the mount line as text. It will need re-anchoring if that line is reformatted --
 * accepted, because the regression it catches (a silent swap to optionalAuth) is the one that
 * matters and is otherwise invisible.
 */
describe('SD-LEO-FIX-UNOWNED-PARENT-SLICE-001: /api/fleet-actions stays behind requireAuth', () => {
  it('is mounted with requireAuth, not optionalAuth', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'server', 'index.js'), 'utf8'
    );
    const mount = src.split('\n').find((l) => l.includes("app.use('/api/fleet-actions'"));
    expect(mount, 'the fleet-actions mount line was not found -- re-anchor this pin').toBeTruthy();
    expect(mount).toContain('requireAuth');
    expect(mount).not.toContain('optionalAuth');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-4 — refusals must RENDER their reason.
//
// spawn()'s guards THROW refusals whose messages carry the remedy (tree-currency names
// `git pull --ff-only`). Unhandled, those throws reached the EVA error handler, which maps
// unknown errors to a bare 422 with no reason field — so the operator saw a status code
// instead of the fix the guard had already written for them.
//
// QF-20260731-222 (PR #6669) fixed this for addSession ONLY. These pin the two siblings,
// which is the partial-application shape CLAUDE_EXEC.md's uniformity audit exists to catch.
// ─────────────────────────────────────────────────────────────────────────────
describe('FR-4: spawn refusals render their reason on every operator route', () => {
  const REFUSAL = 'tree is 12 behind origin/main — run: git pull --ff-only';

  it('respawnFleet: a refused slot reports its reason AND the sweep still completes', async () => {
    // Per-iteration catch, not a whole-route one: previously a single refusable slot threw out
    // of the loop and discarded every other slot's result, so one stale slot silently cost the
    // operator the entire batch.
    spawn.mockRejectedValueOnce(new Error(REFUSAL));
    const req = mockReq();
    const res = mockRes();
    await respawnFleet(req, res);

    expect(res.status).not.toHaveBeenCalled();          // route itself did not error out
    const payload = res.json.mock.calls[0][0];
    expect(payload.respawned).toHaveLength(1);           // the sweep completed
    expect(payload.respawned[0]).toMatchObject({ name: 'Golf-4', ok: false });
    expect(payload.respawned[0].reason).toContain('git pull --ff-only');
    expect(payload.unchanged).toBe(1);                   // untouched slots still reported
  });

  it('relaunchSessionUnderProfile: a thrown refusal becomes {ok:false, reason}, not a bare 422', async () => {
    relaunchUnderProfile.mockRejectedValueOnce(new Error(REFUSAL));
    const req = mockReq({ target: 'Golf-4', accountProfile: 'RickFelix' });
    const res = mockRes();
    await relaunchSessionUnderProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(false);
    expect(payload.reason).toContain('git pull --ff-only');
  });

  it('the happy path is unchanged on both routes', async () => {
    const r1 = mockRes();
    await respawnFleet(mockReq(), r1);
    expect(r1.status).not.toHaveBeenCalled();
    expect(r1.json.mock.calls[0][0].respawned[0].ok).not.toBe(false);

    const r2 = mockRes();
    await relaunchSessionUnderProfile(mockReq({ target: 'Golf-4', accountProfile: 'RickFelix' }), r2);
    expect(r2.status).not.toHaveBeenCalled();
    expect(r2.json.mock.calls[0][0]).toMatchObject({ ok: true });
  });
});
