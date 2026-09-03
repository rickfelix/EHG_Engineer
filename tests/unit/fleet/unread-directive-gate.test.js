/**
 * SD-LEO-INFRA-HANDOFF-UNREAD-DIRECTIVE-GATE-001 — a ship must not race an unread
 * coordinator amendment to the active SD/QF. See lib/fleet/unread-directive-gate.mjs
 * for the measured motivation (QF-20260828-188, QF-20260828-255).
 *
 * Named .test.js deliberately (not .test.mjs) — the vitest `unit` project globs every
 * ".test.js" file but only two narrow .mjs anchors, so a ".test.mjs" here would never
 * run in CI (QF-20260728-823).
 */
import { describe, it, expect } from 'vitest';
import {
  findUnreadDirectives,
  decideUnreadDirectiveGate,
  formatUnreadDirectiveMessage,
} from '../../../lib/fleet/unread-directive-gate.mjs';

describe('findUnreadDirectives', () => {
  it('returns matching unacknowledged rows for the given session+SD', async () => {
    const calls = [];
    const queryFn = async (sid, key, claimedAt) => {
      calls.push([sid, key, claimedAt]);
      return [{ id: 'row-1', subject: 'Amendment', created_at: '2026-08-29T00:00:00Z' }];
    };
    const rows = await findUnreadDirectives('session-abc', 'SD-XXX-001', '2026-08-28T00:00:00Z', queryFn);
    expect(rows).toHaveLength(1);
    expect(calls).toEqual([['session-abc', 'SD-XXX-001', '2026-08-28T00:00:00Z']]);
  });

  it('returns an empty array when nothing matches', async () => {
    const rows = await findUnreadDirectives('session-abc', 'SD-XXX-001', null, async () => []);
    expect(rows).toEqual([]);
  });

  it('returns null (never throws) when the query fails — fail-open', async () => {
    const boom = async () => { throw new Error('db down'); };
    const rows = await findUnreadDirectives('session-abc', 'SD-XXX-001', null, boom);
    expect(rows).toBeNull();
  });

  it('returns null without a sessionId or targetKey', async () => {
    expect(await findUnreadDirectives(null, 'SD-XXX-001', null, async () => [{ id: '1' }])).toBeNull();
    expect(await findUnreadDirectives('session-abc', null, null, async () => [{ id: '1' }])).toBeNull();
  });

  it('scopes to the real supabase client shape: payload.target_sd OR payload.sd OR payload.sd_key + payload.kind match (NOT message_type), acknowledged_at IS NULL, created_at > claim time', async () => {
    // A fake client mirroring the chainable supabase query builder, so the wiring itself
    // (not just an injected queryFn) is exercised.
    //
    // QF-20260902-847: RE-MEASURED against live data — a fresh sample of real
    // coordinator_directive/work_assignment rows shows payload->>sd is the RAREST of three
    // shapes in use; payload->>target_sd is the dominant one (both kinds), payload->>sd_key
    // a distinct minority. An .eq('payload->>sd', ...)-only filter silently matched zero
    // rows for the majority of real directives, including three that targeted a live SD
    // (one an explicit HOLD) while seven handoff attempts ran against it unblocked. Fixed
    // to .or() across all three field names. message_type still cannot discriminate
    // 'coordinator_directive' (its message_type is 'INFO') — payload->>kind remains correct.
    const seen = { eqCalls: [], orCalls: [], inCalls: [], isCalls: [], limitCalls: [], gtCalls: [] };
    function makeQuery(rows) {
      const q = {
        eq(col, val) { seen.eqCalls.push([col, val]); return q; },
        or(expr) { seen.orCalls.push(expr); return q; },
        in(col, vals) { seen.inCalls.push([col, vals]); return q; },
        is(col, val) { seen.isCalls.push([col, val]); return q; },
        limit(n) { seen.limitCalls.push(n); return q; },
        gt(col, val) { seen.gtCalls.push([col, val]); return Promise.resolve({ data: rows, error: null }); },
      };
      return q;
    }
    const client = {
      from(table) {
        expect(table).toBe('session_coordination');
        return { select: () => makeQuery([{ id: 'row-1', subject: 'Amendment', created_at: '2026-08-29T00:00:00Z' }]) };
      },
    };
    const rows = await findUnreadDirectives('session-abc', 'SD-XXX-001', '2026-08-28T00:00:00Z', null, { client });
    expect(rows).toHaveLength(1);
    expect(seen.eqCalls).toContainEqual(['target_session', 'session-abc']);
    expect(seen.orCalls).toContainEqual('payload->>target_sd.eq.SD-XXX-001,payload->>sd.eq.SD-XXX-001,payload->>sd_key.eq.SD-XXX-001');
    expect(seen.inCalls).toContainEqual(['payload->>kind', ['coordinator_directive', 'work_assignment']]);
    expect(seen.isCalls).toContainEqual(['acknowledged_at', null]);
    expect(seen.limitCalls).toContain(50);
    expect(seen.gtCalls).toContainEqual(['created_at', '2026-08-28T00:00:00Z']);
  });

  it('refuses (returns null) a targetKey outside [A-Za-z0-9-]+ instead of interpolating it into the .or() filter — never a filter-injection vector', async () => {
    const client = { from() { throw new Error('must never reach the query — the regex guard runs first'); } };
    const rows = await findUnreadDirectives('session-abc', 'SD-XXX-001,payload->>sd.eq.OTHER', null, null, { client });
    expect(rows).toBeNull();
  });

  it('specimen (QF-20260902-847, SD-LEO-INFRA-ONE-BELT-CENSUS-001): a payload.target_sd-shaped HOLD directive is now found, where the old payload.sd-only filter would have matched zero rows', async () => {
    const holdRow = {
      id: '9fe9e387-538f-414d-8527-98c02670f6e7',
      subject: '[COORDINATOR_DIRECTIVE] HOLD ONE-BELT-CENSUS-001 LEAD-TO-PLAN',
      created_at: '2026-09-03T00:01:50.229705+00:00',
    };
    function makeQuery(rows) {
      const q = {
        eq() { return q; },
        or() { return q; },
        in() { return q; },
        is() { return q; },
        limit() { return q; },
        gt() { return Promise.resolve({ data: rows, error: null }); },
      };
      return q;
    }
    const client = { from: () => ({ select: () => makeQuery([holdRow]) }) };
    const rows = await findUnreadDirectives('golf-4-session', 'SD-LEO-INFRA-ONE-BELT-CENSUS-001', '2026-09-02T23:00:00Z', null, { client });
    expect(decideUnreadDirectiveGate(rows)).toBe('blocked');
  });
});

describe('decideUnreadDirectiveGate', () => {
  it('is BLOCKED when unacknowledged rows exist for the active SD, created after claim', () => {
    expect(decideUnreadDirectiveGate([{ id: '1' }])).toBe('blocked');
  });

  it('is CLEAR when the row is acknowledged (queryFn simulating acknowledged_at set never returns it)', () => {
    expect(decideUnreadDirectiveGate([])).toBe('clear');
  });

  it('is CLEAR for an unrelated SD (queryFn simulating target_sd mismatch never returns it)', () => {
    expect(decideUnreadDirectiveGate([])).toBe('clear');
  });

  it('is CLEAR for a row created before claim time (queryFn simulating created_at <= claim never returns it)', () => {
    expect(decideUnreadDirectiveGate([])).toBe('clear');
  });

  it('is INDETERMINATE (not BLOCKED) when the query result is unavailable — fail-open', () => {
    expect(decideUnreadDirectiveGate(null)).toBe('indeterminate');
    expect(decideUnreadDirectiveGate(undefined)).toBe('indeterminate');
  });
});

describe('formatUnreadDirectiveMessage', () => {
  it('names each blocking row id and subject', () => {
    const msg = formatUnreadDirectiveMessage([
      { id: 'row-1', subject: 'Amend the leg', created_at: '2026-08-29T00:00:00Z' },
    ]);
    expect(msg).toContain('row-1');
    expect(msg).toContain('Amend the leg');
    expect(msg).toContain('--bypass-validation');
  });
});

describe('specimen fixtures (QF-20260828-188, QF-20260828-255)', () => {
  it('QF-188-shaped fixture: mid-build amendment still unacknowledged at handoff time is BLOCKED', async () => {
    const fixtureRow = {
      id: 'qf188-amend-2',
      subject: 'ASSIGN QF-20260828-188 (amendment leg 2)',
      created_at: '2026-08-28T10:05:00Z',
    };
    const queryFn = async () => [fixtureRow];
    const rows = await findUnreadDirectives('worker-session', 'QF-20260828-188', '2026-08-28T10:00:00Z', queryFn);
    expect(decideUnreadDirectiveGate(rows)).toBe('blocked');
  });

  it('QF-255-shaped fixture: stranded-holds amendment ping would have been caught before completion', async () => {
    const fixtureRow = {
      id: 'qf255-amend',
      subject: 'ASSIGN QF-20260828-255 (stranded-holds leg)',
      created_at: '2026-08-28T12:01:00Z',
    };
    const queryFn = async () => [fixtureRow];
    const rows = await findUnreadDirectives('worker-session', 'QF-20260828-255', '2026-08-28T12:00:00Z', queryFn);
    expect(decideUnreadDirectiveGate(rows)).toBe('blocked');
  });
});
