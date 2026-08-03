/**
 * SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-2 — the governed kill-switch writer.
 *
 * The refusals are the point. Delta established that the switch was writable by anyone holding the
 * service-role key — every fleet seat — and that sender_session accepted an arbitrary probe string,
 * so a kill row was not attributable to any authorised operator. A writer that merely RECORDS an
 * actor would satisfy the wording of "carries actor + reason" while changing nothing: the tests that
 * matter here are the ones asserting it REFUSES.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  fireFleetEnforcementKill,
  evaluateActor,
  FLEET_BROADCAST_SD,
  KILL_SWITCH_KIND,
  ACTIVE_HEARTBEAT_MS,
} = require_('../../../lib/coordinator/kill-switch-writer.cjs');

const NOW = Date.parse('2026-08-03T09:00:00.000Z');
const liveCoordinator = (over = {}) => ({
  session_id: 'sess-987',
  callsign: 'Coordinator',
  status: 'active',
  heartbeat_at: new Date(NOW - 60_000).toISOString(),
  metadata: { role: 'coordinator' },
  ...over,
});

function harness({ session = liveCoordinator(), insert = vi.fn(async (_sb, row) => ({ data: row })) } = {}) {
  return {
    insert,
    deps: {
      supabase: {},
      insertCoordinationRow: insert,
      lookupSession: async () => session,
      now: () => NOW,
    },
  };
}

describe('FR-2: evaluateActor — corroboration decisions', () => {
  it('accepts a live coordinator', () => {
    expect(evaluateActor(liveCoordinator(), NOW)).toMatchObject({ ok: true, role: 'coordinator' });
  });

  it('refuses an actor that does not exist — the arbitrary-string case Delta observed being accepted', () => {
    expect(evaluateActor(null, NOW)).toMatchObject({ ok: false, code: 'ACTOR_NOT_FOUND' });
  });

  it('refuses a WORKER seat — the population the enforcement constrains cannot disable it', () => {
    const r = evaluateActor(liveCoordinator({ metadata: { role: 'worker' } }), NOW);
    expect(r).toMatchObject({ ok: false, code: 'ACTOR_ROLE_FORBIDDEN' });
  });

  it('refuses a STALE session — "existed once" is not authorization', () => {
    const stale = liveCoordinator({ heartbeat_at: new Date(NOW - ACTIVE_HEARTBEAT_MS - 1000).toISOString() });
    expect(evaluateActor(stale, NOW)).toMatchObject({ ok: false, code: 'ACTOR_NOT_LIVE' });
  });

  it('refuses a session with no parseable heartbeat rather than treating absence as fresh', () => {
    expect(evaluateActor(liveCoordinator({ heartbeat_at: null }), NOW)).toMatchObject({ ok: false, code: 'ACTOR_NO_HEARTBEAT' });
    expect(evaluateActor(liveCoordinator({ heartbeat_at: 'not-a-date' }), NOW)).toMatchObject({ ok: false, code: 'ACTOR_NO_HEARTBEAT' });
  });

  it('is INCLUSIVE at the liveness boundary, so a seat is not refused for being exactly at the edge', () => {
    const edge = liveCoordinator({ heartbeat_at: new Date(NOW - ACTIVE_HEARTBEAT_MS).toISOString() });
    expect(evaluateActor(edge, NOW).ok).toBe(true);
  });
});

describe('FR-2: fireFleetEnforcementKill — refusals and the written row', () => {
  it('REFUSES with no actor, and writes NOTHING', async () => {
    const h = harness();
    await expect(fireFleetEnforcementKill(h.deps, { reason: 'x' })).rejects.toThrow(/actor is required/);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('REFUSES with no reason — an unexplained kill is indistinguishable from an accident', async () => {
    const h = harness();
    await expect(fireFleetEnforcementKill(h.deps, { actor: 'sess-987' })).rejects.toThrow(/reason is required/);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('REFUSES whitespace-only actor/reason — truthy but carrying no information', async () => {
    const h = harness();
    await expect(fireFleetEnforcementKill(h.deps, { actor: '   ', reason: 'x' })).rejects.toThrow(/actor is required/);
    await expect(fireFleetEnforcementKill(h.deps, { actor: 'sess-987', reason: '  ' })).rejects.toThrow(/reason is required/);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('REFUSES a worker seat and writes NOTHING — the headline hole', async () => {
    const h = harness({ session: liveCoordinator({ metadata: { role: 'worker' } }) });
    await expect(fireFleetEnforcementKill(h.deps, { actor: 'sess-w', reason: 'oops' }))
      .rejects.toMatchObject({ code: 'ACTOR_ROLE_FORBIDDEN' });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('REFUSES to run at all without the existing insert choke — no fourth write path', async () => {
    await expect(fireFleetEnforcementKill({ supabase: {} }, { actor: 'a', reason: 'b' }))
      .rejects.toMatchObject({ code: 'KILL_SWITCH_NO_CHOKE' });
  });

  it('writes the sentinel through insertCoordinationRow with the shape the READER matches', async () => {
    const h = harness();
    await fireFleetEnforcementKill(h.deps, { actor: 'sess-987', reason: 'runaway spawn loop' });
    expect(h.insert).toHaveBeenCalledTimes(1);
    const [, row] = h.insert.mock.calls[0];
    // Pinned against the consumer's filter, not invented: target_sd carries the broadcast because
    // CHECK valid_target makes a null-targeted row structurally uninsertable.
    expect(row.target_sd).toBe(FLEET_BROADCAST_SD);
    expect(row.payload.kind).toBe(KILL_SWITCH_KIND);
    expect(Date.parse(row.expires_at)).toBeGreaterThan(NOW);
    expect(row.payload.reason).toBe('runaway spawn loop');
  });

  it('records the STRENGTH of the attribution, and does not claim to be authenticated', async () => {
    const h = harness();
    await fireFleetEnforcementKill(h.deps, { actor: 'sess-987', reason: 'r' });
    const [, row] = h.insert.mock.calls[0];
    expect(row.payload.actor).toBe('sess-987');
    expect(row.payload.actor_role).toBe('coordinator');
    // The load-bearing assertion: an attribution whose strength is unstated gets read as stronger
    // than it is. All seats share one service-role key, so this is corroboration, not authentication.
    expect(row.payload.attribution.authenticated).toBe(false);
    expect(row.payload.attribution.method).toBe('corroborated_against_claude_sessions');
    expect(row.payload.attribution.residual_gap).toMatch(/share one service-role key/);
  });
});
