/**
 * solomon-identity.test.js — SD-LEO-INFRA-SOLOMON-CONSULT-001A (Solomon foundation)
 *
 * Network-free unit tests for lib/coordinator/solomon-identity.cjs.
 * Covers:
 *   - pickCanonicalSolomon: deterministic election (solomon_since DESC NULLS LAST, session_id ASC tiebreak)
 *   - decideSingleSolomonGuard: refuse / retire_stale_then_register / register / self-exclusion
 *   - isFresh / toMs: freshness window, naive-UTC parse, unusable input
 *   - getActiveSolomonId: FAIL-OPEN — returns null on null supabase or thrown query
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  pickCanonicalSolomon,
  decideSingleSolomonGuard,
  isFresh,
  toMs,
  getActiveSolomonId,
  retargetStaleSolomonInbound,
  SOLOMON_FRESH_MS,
} = require('../../lib/coordinator/solomon-identity.cjs');

// ── helpers ──────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000; // fixed injected clock (ms)
const FRESH_HB = new Date(NOW - 60_000).toISOString(); // 1 min ago — within SOLOMON_FRESH_MS
const STALE_HB = new Date(NOW - SOLOMON_FRESH_MS - 1).toISOString(); // just past the window

// ── pickCanonicalSolomon ──────────────────────────────────────────────────────

describe('pickCanonicalSolomon', () => {
  it('returns null on empty array', () => {
    expect(pickCanonicalSolomon([])).toBeNull();
  });

  it('returns null on non-array input', () => {
    expect(pickCanonicalSolomon(null)).toBeNull();
    expect(pickCanonicalSolomon(undefined)).toBeNull();
    expect(pickCanonicalSolomon('string')).toBeNull();
  });

  it('returns null when no row has a valid session_id string', () => {
    expect(pickCanonicalSolomon([{ session_id: 123 }, { session_id: null }])).toBeNull();
  });

  it('returns the only candidate when there is exactly one valid row', () => {
    const rows = [{ session_id: 'solo', metadata: { solomon_since: '2026-06-01T10:00:00Z' } }];
    const winner = pickCanonicalSolomon(rows);
    expect(winner).not.toBeNull();
    expect(winner.session_id).toBe('solo');
  });

  it('elects the row with the LATER solomon_since (DESC ordering)', () => {
    const rows = [
      { session_id: 'older', metadata: { solomon_since: '2026-06-01T08:00:00Z' } },
      { session_id: 'newer', metadata: { solomon_since: '2026-06-01T10:00:00Z' } },
    ];
    expect(pickCanonicalSolomon(rows).session_id).toBe('newer');
  });

  it('uses session_id ASC as a stable tiebreak when solomon_since is identical', () => {
    const rows = [
      { session_id: 'zzz-session', metadata: { solomon_since: '2026-06-01T10:00:00Z' } },
      { session_id: 'aaa-session', metadata: { solomon_since: '2026-06-01T10:00:00Z' } },
    ];
    expect(pickCanonicalSolomon(rows).session_id).toBe('aaa-session');
  });

  it('places rows without solomon_since (NULLS LAST) after rows that have one', () => {
    const rows = [
      { session_id: 'no-since', metadata: {} },
      { session_id: 'has-since', metadata: { solomon_since: '2026-06-01T10:00:00Z' } },
    ];
    expect(pickCanonicalSolomon(rows).session_id).toBe('has-since');
  });

  it('is stable: same output on repeated calls with the same input', () => {
    const rows = [
      { session_id: 'b-session', metadata: { solomon_since: '2026-06-01T09:00:00Z' } },
      { session_id: 'a-session', metadata: { solomon_since: '2026-06-01T10:00:00Z' } },
      { session_id: 'c-session', metadata: {} },
    ];
    const first = pickCanonicalSolomon(rows);
    const second = pickCanonicalSolomon(rows);
    expect(first.session_id).toBe(second.session_id);
    expect(first.session_id).toBe('a-session'); // latest solomon_since
  });
});

// ── decideSingleSolomonGuard ──────────────────────────────────────────────────

describe('decideSingleSolomonGuard', () => {
  it('returns action=register when there are no other solomons', () => {
    const result = decideSingleSolomonGuard({ priorSolomons: [], selfSessionId: 'me', nowMs: NOW });
    expect(result.action).toBe('register');
    expect(result.retire).toEqual([]);
    expect(result.freshPriors).toEqual([]);
  });

  it('returns action=refuse when a FRESH prior solomon exists (not self)', () => {
    const priorSolomons = [
      { session_id: 'other', heartbeat_at: FRESH_HB },
    ];
    const result = decideSingleSolomonGuard({ priorSolomons, selfSessionId: 'me', nowMs: NOW });
    expect(result.action).toBe('refuse');
    expect(result.freshPriors).toContain('other');
    expect(result.retire).toEqual([]);
  });

  it('returns action=retire_stale_then_register when only STALE priors exist', () => {
    const priorSolomons = [
      { session_id: 'stale-one', heartbeat_at: STALE_HB },
      { session_id: 'stale-two', heartbeat_at: STALE_HB },
    ];
    const result = decideSingleSolomonGuard({ priorSolomons, selfSessionId: 'me', nowMs: NOW });
    expect(result.action).toBe('retire_stale_then_register');
    expect(result.retire).toContain('stale-one');
    expect(result.retire).toContain('stale-two');
    expect(result.freshPriors).toEqual([]);
  });

  it('excludes the self session_id from prior consideration', () => {
    // Self appears in the list — it must be treated as if absent
    const priorSolomons = [
      { session_id: 'me', heartbeat_at: FRESH_HB },
    ];
    const result = decideSingleSolomonGuard({ priorSolomons, selfSessionId: 'me', nowMs: NOW });
    // Only self in list → no others → register (not refuse)
    expect(result.action).toBe('register');
  });

  it('refuses when a fresh OTHER exists even though self is also in the list', () => {
    const priorSolomons = [
      { session_id: 'me', heartbeat_at: FRESH_HB },
      { session_id: 'other-fresh', heartbeat_at: FRESH_HB },
    ];
    const result = decideSingleSolomonGuard({ priorSolomons, selfSessionId: 'me', nowMs: NOW });
    expect(result.action).toBe('refuse');
    expect(result.freshPriors).toContain('other-fresh');
    expect(result.freshPriors).not.toContain('me');
  });

  it('prefers refuse over retire when one prior is fresh and another is stale', () => {
    const priorSolomons = [
      { session_id: 'fresh-other', heartbeat_at: FRESH_HB },
      { session_id: 'stale-other', heartbeat_at: STALE_HB },
    ];
    const result = decideSingleSolomonGuard({ priorSolomons, selfSessionId: 'me', nowMs: NOW });
    expect(result.action).toBe('refuse');
  });
});

// ── isFresh / toMs ────────────────────────────────────────────────────────────

describe('isFresh', () => {
  it('returns true when the heartbeat is within SOLOMON_FRESH_MS', () => {
    expect(isFresh(FRESH_HB, NOW, SOLOMON_FRESH_MS)).toBe(true);
  });

  it('returns false when the heartbeat is outside SOLOMON_FRESH_MS', () => {
    expect(isFresh(STALE_HB, NOW, SOLOMON_FRESH_MS)).toBe(false);
  });

  it('returns false when heartbeat_at is null', () => {
    expect(isFresh(null, NOW, SOLOMON_FRESH_MS)).toBe(false);
  });

  it('returns false when heartbeat_at is undefined', () => {
    expect(isFresh(undefined, NOW, SOLOMON_FRESH_MS)).toBe(false);
  });

  it('returns false when heartbeat_at is an unparseable string', () => {
    expect(isFresh('not-a-date', NOW, SOLOMON_FRESH_MS)).toBe(false);
  });
});

describe('toMs', () => {
  it('returns 0 for null/undefined', () => {
    expect(toMs(null)).toBe(0);
    expect(toMs(undefined)).toBe(0);
  });

  it('returns 0 for an unusable string', () => {
    expect(toMs('garbage')).toBe(0);
  });

  it('parses a UTC ISO string (with Z suffix) correctly', () => {
    const iso = '2026-06-01T10:00:00.000Z';
    expect(toMs(iso)).toBe(new Date(iso).getTime());
  });

  it('parses a naive (no-TZ) timestamp as UTC — PostgREST convention', () => {
    const naive = '2026-06-01T10:00:00'; // no Z
    const withZ = '2026-06-01T10:00:00Z';
    expect(toMs(naive)).toBe(new Date(withZ).getTime());
  });

  it('returns the ms value of a Date object directly', () => {
    const d = new Date('2026-06-01T10:00:00Z');
    expect(toMs(d)).toBe(d.getTime());
  });
});

// ── getActiveSolomonId (FAIL-OPEN) ────────────────────────────────────────────

describe('getActiveSolomonId', () => {
  it('returns null when supabase is null (fail-open)', async () => {
    const result = await getActiveSolomonId(null);
    expect(result).toBeNull();
  });

  it('returns null when the supabase query throws (fail-open)', async () => {
    const throwingSupabase = {
      from: () => { throw new Error('DB is unreachable'); },
    };
    const result = await getActiveSolomonId(throwingSupabase);
    expect(result).toBeNull();
  });

  it('returns null when the query returns an error object', async () => {
    const errorSupabase = {
      from: () => ({
        select: () => ({
          gte: () => ({
            filter: () => Promise.resolve({ data: null, error: { message: 'query failed' } }),
          }),
        }),
      }),
    };
    const result = await getActiveSolomonId(errorSupabase);
    expect(result).toBeNull();
  });

  it('returns null when the query returns an empty result set', async () => {
    const emptySupabase = {
      from: () => ({
        select: () => ({
          gte: () => ({
            filter: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    };
    const result = await getActiveSolomonId(emptySupabase);
    expect(result).toBeNull();
  });

  it('returns the canonical session_id from a fresh result set', async () => {
    const freshHb = new Date(Date.now() - 60_000).toISOString();
    const rows = [
      { session_id: 'sol-a', heartbeat_at: freshHb, metadata: { solomon_since: '2026-06-01T09:00:00Z' } },
      { session_id: 'sol-b', heartbeat_at: freshHb, metadata: { solomon_since: '2026-06-01T10:00:00Z' } },
    ];
    // FR-6 (count-truncation discipline): fetchFreshSolomons paginates via fetchAllPaginated,
    // whose chain ends in .order(...).range(from, to).
    const stubSupabase = {
      from: () => {
        const b = {
          select: () => b,
          gte: () => b,
          filter: () => b,
          order: () => b,
          range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        };
        return b;
      },
    };
    const result = await getActiveSolomonId(stubSupabase);
    expect(result).toBe('sol-b'); // later solomon_since wins
  });
});

// ── retargetStaleSolomonInbound (SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-3) ──
// One of the 4 already-correct re-target paths RISK identified -- update-only, never touches
// sender_session/created_at. No prior test coverage existed for this function; adding both the
// behavioral coverage and the FR-3 regression pin together.

function makeRetargetSb({ updateRows = [], updateError = null } = {}) {
  const calls = { updates: [] };
  return {
    _calls: calls,
    from(table) {
      const builder = {
        update(patch) { calls.updates.push({ table, patch }); return builder; },
        eq() { return builder; },
        is() { return builder; },
        select() { return Promise.resolve({ data: updateRows, error: updateError }); },
      };
      return builder;
    },
  };
}

describe('retargetStaleSolomonInbound', () => {
  it('recovers unread coordinator rows from the stale originator and reports the count', async () => {
    const sb = makeRetargetSb({ updateRows: [{ id: 'm1' }, { id: 'm2' }] });
    const r = await retargetStaleSolomonInbound(sb, { staleOriginator: 'stale', liveSolomon: 'live' });
    expect(r.retargeted).toBe(2);
    expect(r.error).toBe(null);
  });

  it('is a no-op when originator === live Solomon (nothing to recover)', async () => {
    const sb = makeRetargetSb({ updateRows: [{ id: 'm1' }] });
    const r = await retargetStaleSolomonInbound(sb, { staleOriginator: 'x', liveSolomon: 'x' });
    expect(r.retargeted).toBe(0);
  });

  it('surfaces a recovery error (never silent)', async () => {
    const sb = makeRetargetSb({ updateError: { message: 'db down' } });
    const r = await retargetStaleSolomonInbound(sb, { staleOriginator: 'stale', liveSolomon: 'live' });
    expect(r.retargeted).toBe(0);
    expect(r.error).toBe('db down');
  });

  it('(FR-3 pin) the update patch is ONLY {target_session} — never sender_session/created_at', async () => {
    const sb = makeRetargetSb({ updateRows: [{ id: 'm1' }] });
    await retargetStaleSolomonInbound(sb, { staleOriginator: 'stale', liveSolomon: 'live' });
    const patch = sb._calls.updates[0].patch;
    expect(patch).toEqual({ target_session: 'live' });
  });
});
