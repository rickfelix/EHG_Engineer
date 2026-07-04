/**
 * QF-20260703-665: identity-instability collision class (chairman observed 3x-Charlie).
 * (a) rehydrateCallsign resurrected a callsign with zero fleet-wide uniqueness check.
 * (b) A re-band (pickCallsignForTier picking a new callsign because the old one no longer
 *     matches the worker's tier band) freed the OLD label instantly, with no grace window,
 *     so another session's next roll_call could claim it right away.
 *
 * Deliberately a fresh, minimal file rather than extending
 * tests/unit/worker-checkin-fleet-identity.test.js, which is quarantined for an unrelated,
 * pre-existing reason (stale tier-encoding assumption, SD-LEO-INFRA-BASELINE-QUARANTINE-
 * SWEEP-001) and would not reliably run in CI.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assignFleetIdentityAtCheckin, rehydrateCallsign } = require('../../scripts/worker-checkin.cjs');

// Same chainable-stub shape as the sibling (quarantined) fleet-identity test file.
function stub(cfg = {}) {
  const rec = { update: null, insert: null };
  function builder(table) {
    const st = { op: 'select', payload: null };
    const chain = {
      select() { return chain; }, eq() { return chain; }, gte() { return chain; }, neq() { return chain; },
      update(p) { st.op = 'update'; st.payload = p; return chain; },
      insert(p) { st.op = 'insert'; st.payload = p; return chain; },
      maybeSingle() { return Promise.resolve({ data: cfg.selfRow ?? null, error: null }); },
      then(res, rej) {
        let out;
        if (table === 'claude_sessions' && st.op === 'select') out = { data: cfg.live ?? [], error: null };
        else if (table === 'claude_sessions' && st.op === 'update') { rec.update = st.payload; out = { data: null, error: null }; }
        else if (table === 'session_coordination' && st.op === 'insert') { rec.insert = st.payload; out = { data: { id: 'm' }, error: null }; }
        else out = { data: null, error: null };
        return Promise.resolve(out).then(res, rej);
      },
    };
    return chain;
  }
  return { rec, from: (t) => builder(t) };
}

describe('assignFleetIdentityAtCheckin — QF-20260703-665 (b) re-band vacate + grace reservation', () => {
  it('stamps fleet_identity_vacated with the OLD callsign when a re-band picks a new one', async () => {
    // Bravo lives in the top NATO band; tier_rank=1 maps to the bottom band ([Hotel]) — a clear
    // wrong-band mismatch that forces a re-band instead of the idempotent-keep path.
    const sb = stub({ selfRow: { metadata: { tier_rank: 1, fleet_identity: { callsign: 'Bravo', color: 'green' } } }, live: [] });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(out.callsign).not.toBe('Bravo');
    expect(sb.rec.update.metadata.fleet_identity_vacated).toEqual(
      expect.objectContaining({ callsign: 'Bravo', vacated_at: expect.any(String) }),
    );
  });

  it('does NOT stamp fleet_identity_vacated on a first-time assignment (nothing was held before)', async () => {
    const sb = stub({ selfRow: { metadata: {} }, live: [] });
    await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    expect(sb.rec.update.metadata.fleet_identity_vacated).toBeUndefined();
  });

  it('reserves a label another live session vacated within the grace window — cannot be claimed yet', async () => {
    const recentlyVacated = [{
      session_id: 'other-1',
      metadata: {
        fleet_identity: { callsign: 'Alpha', color: 'blue' },
        fleet_identity_vacated: { callsign: 'Charlie', vacated_at: new Date().toISOString() },
      },
    }];
    const sb = stub({ selfRow: { metadata: {} }, live: recentlyVacated });
    const out = await assignFleetIdentityAtCheckin(sb, 'sess-1', 'SD-MINE-001');
    // Alpha is live-held; Charlie was JUST vacated (still in grace) — first free is Bravo.
    expect(out.callsign).toBe('Bravo');
  });
});

// Minimal chainable stub for rehydrateCallsign: SET_IDENTITY history lookup, the new fleet-wide
// uniqueness check, and the best-effort metadata persist.
function rehydrateStub(cfg = {}) {
  const rec = { update: null };
  return {
    rec,
    from(table) {
      const chain = {
        select() { return chain; }, eq() { return chain; }, neq() { return chain; }, gte() { return chain; },
        order() { return chain; }, limit() { return chain; }, filter() { return chain; },
        update(p) { rec.update = p; return { eq: async () => ({ data: null, error: null }) }; },
        maybeSingle() {
          if (table === 'session_coordination') return Promise.resolve({ data: cfg.history ?? null, error: null });
          if (cfg.holderThrow) return Promise.reject(new Error('holder read failed'));
          return Promise.resolve({ data: cfg.holder ?? null, error: null });
        },
      };
      return chain;
    },
  };
}

describe('rehydrateCallsign — QF-20260703-665 (a) fleet-wide uniqueness before resurrection', () => {
  it('refuses to resurrect a callsign a DIFFERENT live session currently holds', async () => {
    const sb = rehydrateStub({
      history: { payload: { callsign: 'Charlie', color: 'blue' }, created_at: '2026-07-03T00:00:00Z' },
      holder: { session_id: 'other-live-session' },
    });
    const out = await rehydrateCallsign(sb, 'sess-1', {});
    expect(out).toBeNull();
    expect(sb.rec.update).toBeNull(); // never persisted a colliding identity
  });

  it('rehydrates normally when no other live session holds the name', async () => {
    const sb = rehydrateStub({
      history: { payload: { callsign: 'Charlie', color: 'blue' }, created_at: '2026-07-03T00:00:00Z' },
      holder: null,
    });
    const out = await rehydrateCallsign(sb, 'sess-1', {});
    expect(out).toBe('Charlie');
    expect(sb.rec.update.metadata.fleet_identity.callsign).toBe('Charlie');
  });

  it('fails open (still rehydrates) when the uniqueness check itself errors', async () => {
    const sb = rehydrateStub({
      history: { payload: { callsign: 'Charlie', color: 'blue' }, created_at: '2026-07-03T00:00:00Z' },
      holderThrow: true,
    });
    const out = await rehydrateCallsign(sb, 'sess-1', {});
    expect(out).toBe('Charlie');
  });

  it('returns null (no history) unchanged from pre-fix behavior when no SET_IDENTITY row exists', async () => {
    const sb = rehydrateStub({ history: null });
    const out = await rehydrateCallsign(sb, 'sess-1', {});
    expect(out).toBeNull();
  });
});
