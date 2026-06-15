// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1/FR-3/FR-6) — Adam-singleton tests.
// Hermetic: no live DB (injected supabase stub), no real time (nowMs injected). Validates the
// deterministic election (mirror of the coordinator), the fail-open resolvers, the single-Adam
// guard's deliberate refuse-new-on-fresh-prior divergence, and the pure MULTIPLE_ADAMS detector.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const adam = require('../../../lib/coordinator/adam-identity.cjs');
const { detectMultipleAdams, runDetectors } = require('../../../lib/coordinator/detectors.cjs');

const NOW = Date.parse('2026-06-15T16:00:00.000Z');
const fresh = (minAgo) => new Date(NOW - minAgo * 60_000).toISOString();

describe('pickCanonicalAdam (deterministic election, mirror of coordinator)', () => {
  it('picks adam_since DESC, NULLS LAST, then session_id ASC', () => {
    const rows = [
      { session_id: 'z', metadata: { adam_since: '2026-06-15T10:00:00Z' } },
      { session_id: 'a', metadata: { adam_since: '2026-06-15T12:00:00Z' } }, // newest
      { session_id: 'b', metadata: {} },                                      // null since -> last
    ];
    expect(adam.pickCanonicalAdam(rows).session_id).toBe('a');
  });
  it('session_id ASC tiebreak when adam_since ties', () => {
    const rows = [
      { session_id: 'm', metadata: { adam_since: '2026-06-15T12:00:00Z' } },
      { session_id: 'd', metadata: { adam_since: '2026-06-15T12:00:00Z' } },
    ];
    expect(adam.pickCanonicalAdam(rows).session_id).toBe('d');
  });
  it('returns null for empty/garbage', () => {
    expect(adam.pickCanonicalAdam([])).toBeNull();
    expect(adam.pickCanonicalAdam(null)).toBeNull();
    expect(adam.pickCanonicalAdam([{ no_session: true }])).toBeNull();
  });
});

// supabase stub: the election query is .from().select().gte().filter() resolving to {data}.
function stub(rows, { error = null } = {}) {
  return {
    from() {
      const chain = {
        select() { return chain; },
        gte() { return chain; },
        filter() { return Promise.resolve({ data: error ? null : rows, error }); },
      };
      return chain;
    },
  };
}

describe('electAdamFromDb / getActiveAdamId / countFreshAdams (fail-open)', () => {
  it('elects the canonical Adam from fresh rows', async () => {
    const sb = stub([
      { session_id: 'old', heartbeat_at: fresh(1), metadata: { role: 'adam', adam_since: '2026-06-15T09:00:00Z' } },
      { session_id: 'new', heartbeat_at: fresh(1), metadata: { role: 'adam', adam_since: '2026-06-15T11:00:00Z' } },
    ]);
    expect(await adam.electAdamFromDb(sb, { nowMs: NOW })).toBe('new');
    expect(await adam.getActiveAdamId(sb, { nowMs: NOW })).toBe('new');
    expect(await adam.countFreshAdams(sb, { nowMs: NOW })).toBe(2);
  });
  it('FAILS OPEN: null/empty on error, no throw', async () => {
    const sbErr = stub(null, { error: { message: 'boom' } });
    expect(await adam.electAdamFromDb(sbErr, { nowMs: NOW })).toBeNull();
    expect(await adam.countFreshAdams(sbErr, { nowMs: NOW })).toBe(0);
    expect(await adam.electAdamFromDb(null)).toBeNull(); // no client
  });
});

describe('decideSingleAdamGuard (refuse-new-on-fresh-prior divergence)', () => {
  const self = 'self-sess';
  it('REFUSES when a FRESH prior Adam exists (never clears a restarting Adam)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'prior', heartbeat_at: fresh(2) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
    expect(d.retire).toEqual([]);
    expect(d.freshPriors).toEqual(['prior']);
  });
  it('RETIRES only a STALE prior, then registers self', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'stale', heartbeat_at: fresh(999) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('retire_stale_then_register');
    expect(d.retire).toEqual(['stale']);
  });
  it('REGISTERS when no other Adam (self excluded)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: self, heartbeat_at: fresh(1) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('register');
    expect(d.retire).toEqual([]);
  });
  it('mixed fresh + stale priors => REFUSE (a fresh prior dominates; never clear it)', () => {
    const d = adam.decideSingleAdamGuard({
      priorAdams: [{ session_id: 'freshp', heartbeat_at: fresh(1) }, { session_id: 'stalep', heartbeat_at: fresh(999) }],
      selfSessionId: self, nowMs: NOW,
    });
    expect(d.action).toBe('refuse');
  });
});

describe('detectMultipleAdams (pure, mirror of detectSplitBrain)', () => {
  it('matches when adamCount > 1', () => {
    const r = detectMultipleAdams({ adamCount: 2, adams: [{ session_id: 'a' }, { session_id: 'b' }] });
    expect(r.matched).toBe(true);
    expect(r.reason).toBe('multiple_live_adams');
    expect(r.evidence.adam_count).toBe(2);
  });
  it('no match for 0/1', () => {
    expect(detectMultipleAdams({ adamCount: 1 }).matched).toBe(false);
    expect(detectMultipleAdams({}).matched).toBe(false);
  });
  it('runDetectors surfaces MULTIPLE_ADAMS as a critical event', () => {
    const events = runDetectors({ adamCount: 3 }, { now: NOW });
    const ev = events.find((e) => e.event_type === 'MULTIPLE_ADAMS');
    expect(ev).toBeTruthy();
    expect(ev.severity).toBe('critical');
  });
});
