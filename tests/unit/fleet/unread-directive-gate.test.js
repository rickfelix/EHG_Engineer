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

  it('scopes to the real supabase client shape: payload.sd + payload.kind match (NOT target_sd/message_type), acknowledged_at IS NULL, created_at > claim time', async () => {
    // A fake client mirroring the chainable supabase query builder, so the wiring itself
    // (not just an injected queryFn) is exercised. MEASURED against live data: target_sd
    // is always null and message_type does not discriminate 'coordinator_directive'
    // (its message_type is 'INFO') — the real filters are payload->>sd and payload->>kind.
    const seen = { eqCalls: [], inCalls: [], isCalls: [], gtCalls: [] };
    function makeQuery(rows) {
      const q = {
        eq(col, val) { seen.eqCalls.push([col, val]); return q; },
        in(col, vals) { seen.inCalls.push([col, vals]); return q; },
        is(col, val) { seen.isCalls.push([col, val]); return q; },
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
    expect(seen.eqCalls).toContainEqual(['payload->>sd', 'SD-XXX-001']);
    expect(seen.inCalls).toContainEqual(['payload->>kind', ['coordinator_directive', 'work_assignment']]);
    expect(seen.isCalls).toContainEqual(['acknowledged_at', null]);
    expect(seen.gtCalls).toContainEqual(['created_at', '2026-08-28T00:00:00Z']);
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
