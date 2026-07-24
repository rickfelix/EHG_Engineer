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
}));

const { respawnFleet, relaunchSessionUnderProfile, addSession, snapshotManifest } = await import('../../../server/routes/fleet-actions.js');
const { spawn, relaunchUnderProfile } = await import('../../../lib/fleet/spawn-control.js');

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

  it('returns 400 when role or callsign is missing', async () => {
    const req = mockReq({ role: 'worker' });
    const res = mockRes();
    await addSession(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
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
