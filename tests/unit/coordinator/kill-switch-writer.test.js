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
  MAX_EXPIRES_MS,
} = require_('../../../lib/coordinator/kill-switch-writer.cjs');

const NOW = Date.parse('2026-08-03T09:00:00.000Z');
const COORD_ID = 'sess-987';
const liveCoordinator = (over = {}) => ({
  session_id: COORD_ID,
  callsign: 'Coordinator',
  status: 'active',
  heartbeat_at: new Date(NOW - 60_000).toISOString(),
  metadata: { role: 'coordinator' },
  ...over,
});

function harness({ session = liveCoordinator(), activeId = COORD_ID, insert = vi.fn(async (_sb, row) => ({ data: row })) } = {}) {
  return {
    insert,
    deps: {
      supabase: {},
      insertCoordinationRow: insert,
      lookupSession: async () => session,
      resolveActiveCoordinator: async () => activeId,
      now: () => NOW,
    },
  };
}

describe('FR-2: evaluateActor — corroboration decisions', () => {
  it('accepts a live coordinator', () => {
    expect(evaluateActor(liveCoordinator(), NOW, COORD_ID)).toMatchObject({ ok: true, role: 'coordinator' });
  });

  it('refuses an actor that does not exist — the arbitrary-string case Delta observed being accepted', () => {
    expect(evaluateActor(null, NOW, COORD_ID)).toMatchObject({ ok: false, code: 'ACTOR_NOT_FOUND' });
  });

  it('refuses a seat that is NOT the active coordinator — the population the enforcement constrains cannot disable it', () => {
    // REWRITTEN. This previously asserted ACTOR_ROLE_FORBIDDEN against metadata.role='worker'. That
    // model was fiction: metadata.role is set on 20 of 13,068 sessions and never to 'coordinator',
    // so the old guard would have refused everyone — including the real coordinator — while these
    // tests passed, because the fixture hand-built the very shape production does not have.
    const other = liveCoordinator({ session_id: 'sess-worker-1' });
    expect(evaluateActor(other, NOW, COORD_ID)).toMatchObject({ ok: false, code: 'ACTOR_NOT_COORDINATOR' });
  });

  it('refuses when NO active coordinator resolves — fails closed rather than guessing', () => {
    // Refusing to fire a kill switch is recoverable; firing it wrongly is not.
    expect(evaluateActor(liveCoordinator(), NOW, null)).toMatchObject({ ok: false, code: 'NO_ACTIVE_COORDINATOR' });
  });

  it('refuses a STALE session — "existed once" is not authorization', () => {
    const stale = liveCoordinator({ heartbeat_at: new Date(NOW - ACTIVE_HEARTBEAT_MS - 1000).toISOString() });
    expect(evaluateActor(stale, NOW, COORD_ID)).toMatchObject({ ok: false, code: 'ACTOR_NOT_LIVE' });
  });

  it('refuses a session with no parseable heartbeat rather than treating absence as fresh', () => {
    expect(evaluateActor(liveCoordinator({ heartbeat_at: null }), NOW, COORD_ID)).toMatchObject({ ok: false, code: 'ACTOR_NO_HEARTBEAT' });
    expect(evaluateActor(liveCoordinator({ heartbeat_at: 'not-a-date' }), NOW, COORD_ID)).toMatchObject({ ok: false, code: 'ACTOR_NO_HEARTBEAT' });
  });

  it('is INCLUSIVE at the liveness boundary, so a seat is not refused for being exactly at the edge', () => {
    const edge = liveCoordinator({ heartbeat_at: new Date(NOW - ACTIVE_HEARTBEAT_MS).toISOString() });
    expect(evaluateActor(edge, NOW, COORD_ID).ok).toBe(true);
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

  it('REFUSES a non-coordinator seat and writes NOTHING — the headline hole', async () => {
    const h = harness({ session: liveCoordinator({ session_id: 'sess-worker-1' }) });
    await expect(fireFleetEnforcementKill(h.deps, { actor: 'sess-worker-1', reason: 'oops' }))
      .rejects.toMatchObject({ code: 'ACTOR_NOT_COORDINATOR' });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('REFUSES when no active coordinator resolves, and writes NOTHING', async () => {
    const h = harness({ activeId: null });
    await expect(fireFleetEnforcementKill(h.deps, { actor: COORD_ID, reason: 'r' }))
      .rejects.toMatchObject({ code: 'NO_ACTIVE_COORDINATOR' });
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
    expect(row.payload.attribution.method).toBe('corroborated_against_active_coordinator');
    // The audit record must not misdescribe itself: 'role_authorized' was a leftover label from the
    // refuted metadata.role design, and a listed check that is never run is worse than no list.
    expect(row.payload.attribution.checks).toContain('is_active_coordinator');
    expect(row.payload.attribution.checks).not.toContain('role_authorized');
    // The disclosure must name the CHEAPEST forge, not the most impressive one. The pointer file is
    // locally writable and resolves first, so it is a far lower bar than impersonating a live seat.
    expect(row.payload.attribution.residual_gap).toMatch(/active-coordinator\.json/);
    expect(row.payload.attribution.residual_gap).toMatch(/share one service-role key/);
  });

  it('REFUSES an unbounded or absurd expiry — a switch with no expiry is one nobody turns off', async () => {
    const h = harness();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 999 * 3600 * 1000]) {
      await expect(fireFleetEnforcementKill(h.deps, { actor: COORD_ID, reason: 'r', expiresInMs: bad }))
        .rejects.toMatchObject({ code: 'KILL_SWITCH_BAD_EXPIRY' });
    }
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('REJECTS rather than silently clamping an over-long expiry', async () => {
    // Quietly shortening a duration the caller asked for makes expires_at disagree with the
    // operator's intent without telling anyone — a lie of convenience in an audit row.
    const h = harness();
    await expect(fireFleetEnforcementKill(h.deps, { actor: COORD_ID, reason: 'r', expiresInMs: MAX_EXPIRES_MS + 1 }))
      .rejects.toMatchObject({ code: 'KILL_SWITCH_BAD_EXPIRY' });
    await expect(fireFleetEnforcementKill(h.deps, { actor: COORD_ID, reason: 'r', expiresInMs: MAX_EXPIRES_MS }))
      .resolves.toBeDefined();
  });
});
