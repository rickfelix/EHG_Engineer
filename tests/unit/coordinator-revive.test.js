/**
 * Tests for scripts/coordinator-revive.cjs
 * SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001 (US-002)
 *
 * Covers: NATO roster, findIdleCallsigns, reviveOne (insert / idempotency / unknown errors).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { NATO, findIdleCallsigns, reviveOne, isExpiredPendingRow, reapExpiredPendingRequests } = require('../../scripts/coordinator-revive.cjs');

describe('NATO roster', () => {
  it('contains the canonical 8 callsigns in order', () => {
    expect(NATO).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']);
  });
});

// insertSequence (optional): array of {data,error} consumed one per insert() call (for the
//   reap-then-retry path: first a 23505, then a success). Falls back to {insertResult,insertError}.
// reapResult (optional): rows the update().select() returns (default [] = nothing reaped, so an
//   idempotency hit stays alreadyPending — preserving the existing tests' expectation).
function mockSupabase({ activeSessions = [], insertResult = null, insertError = null, insertSequence = null, reapResult = [], reapError = null }) {
  let insertCalls = 0;
  return {
    from: (table) => {
      if (table === 'v_active_sessions') {
        return {
          select: () => Promise.resolve({ data: activeSessions, error: null })
        };
      }
      if (table === 'worker_spawn_requests') {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                if (insertSequence) {
                  const step = insertSequence[Math.min(insertCalls, insertSequence.length - 1)];
                  insertCalls++;
                  return Promise.resolve({ data: step.data ?? null, error: step.error ?? null });
                }
                return Promise.resolve({ data: insertResult, error: insertError });
              }
            })
          }),
          // reap chain: update().eq('status').lte('expires_at').eq('requested_callsign').select('id')
          update: () => {
            const chain = {
              eq: () => chain,
              lte: () => chain,
              select: () => Promise.resolve({ data: reapResult, error: reapError })
            };
            return chain;
          }
        };
      }
      if (table === 'session_coordination') {
        // Best-effort broadcast — return promise-shaped no-op
        return {
          insert: () => ({
            then: (cb) => Promise.resolve({ error: null }).then(cb)
          })
        };
      }
      return null;
    }
  };
}

describe('findIdleCallsigns()', () => {
  it('returns the full NATO roster when no sessions exist', async () => {
    const supabase = mockSupabase({ activeSessions: [] });
    const idle = await findIdleCallsigns(supabase);
    expect(idle).toEqual(NATO);
  });

  it('excludes callsigns of active sessions', async () => {
    const supabase = mockSupabase({
      activeSessions: [
        { session_id: 'a', metadata: { fleet_identity: { callsign: 'Alpha' } }, computed_status: 'active' },
        { session_id: 'b', metadata: { fleet_identity: { callsign: 'Bravo' } }, computed_status: 'active' }
      ]
    });
    const idle = await findIdleCallsigns(supabase);
    expect(idle).not.toContain('Alpha');
    expect(idle).not.toContain('Bravo');
    expect(idle).toContain('Charlie');
    expect(idle.length).toBe(NATO.length - 2);
  });

  it('treats stale/idle sessions (computed_status !== "active") as freeing the callsign', async () => {
    const supabase = mockSupabase({
      activeSessions: [
        { session_id: 'a', metadata: { fleet_identity: { callsign: 'Alpha' } }, computed_status: 'stale' },
        { session_id: 'c', metadata: { fleet_identity: { callsign: 'Charlie' } }, computed_status: 'idle' }
      ]
    });
    const idle = await findIdleCallsigns(supabase);
    expect(idle).toContain('Alpha');
    expect(idle).toContain('Charlie');
    expect(idle.length).toBe(NATO.length);
  });

  it('ignores sessions without a fleet_identity.callsign', async () => {
    const supabase = mockSupabase({
      activeSessions: [
        { session_id: 'a', metadata: {}, computed_status: 'active' },
        { session_id: 'b', metadata: { fleet_identity: {} }, computed_status: 'active' }
      ]
    });
    const idle = await findIdleCallsigns(supabase);
    expect(idle).toEqual(NATO);
  });
});

describe('reviveOne()', () => {
  it('returns inserted=true on successful insert', async () => {
    const row = { id: 'abc-123', requested_at: '2026-04-26T18:00:00Z', expires_at: '2026-04-26T19:00:00Z' };
    const supabase = mockSupabase({ insertResult: row, insertError: null });
    const r = await reviveOne(supabase, 'Bravo', 'session-123');
    expect(r.inserted).toBe(true);
    expect(r.alreadyPending).toBe(false);
    expect(r.error).toBe(null);
    expect(r.row).toEqual(row);
  });

  it('catches Postgres unique violation (code 23505) and reports alreadyPending', async () => {
    const supabase = mockSupabase({
      insertResult: null,
      insertError: { code: '23505', message: 'duplicate key value violates unique constraint' }
    });
    const r = await reviveOne(supabase, 'Bravo', 'session-123');
    expect(r.inserted).toBe(false);
    expect(r.alreadyPending).toBe(true);
    expect(r.error).toBe(null);
  });

  it('catches unique violation by message keyword (no code) and reports alreadyPending', async () => {
    const supabase = mockSupabase({
      insertResult: null,
      insertError: { message: 'duplicate row' }
    });
    const r = await reviveOne(supabase, 'Bravo', 'session-123');
    expect(r.alreadyPending).toBe(true);
  });

  it('does NOT catch non-unique errors — surfaces them as error', async () => {
    const supabase = mockSupabase({
      insertResult: null,
      insertError: { code: '42501', message: 'permission denied' }
    });
    const r = await reviveOne(supabase, 'Bravo', 'session-123');
    expect(r.inserted).toBe(false);
    expect(r.alreadyPending).toBe(false);
    expect(r.error).toEqual({ code: '42501', message: 'permission denied' });
  });

  it('handles null requestedBySessionId (CLAUDE_SESSION_ID not set)', async () => {
    const row = { id: 'abc', requested_at: 't', expires_at: 't+1h' };
    const supabase = mockSupabase({ insertResult: row, insertError: null });
    const r = await reviveOne(supabase, 'Charlie', null);
    expect(r.inserted).toBe(true);
  });
});

// SD-REFILL-00H0UNO7: fleet revival was broken because an expired-but-still-'pending'
// worker_spawn_requests row holds the partial unique index and permanently blocks fresh revivals.
describe('isExpiredPendingRow() — FR-3 pure predicate', () => {
  const now = Date.parse('2026-06-23T12:00:00Z');
  it('true for a pending row whose expires_at is in the past', () => {
    expect(isExpiredPendingRow({ status: 'pending', expires_at: '2026-06-23T11:00:00Z' }, now)).toBe(true);
  });
  it('false for a pending row whose expires_at is in the future (live request)', () => {
    expect(isExpiredPendingRow({ status: 'pending', expires_at: '2026-06-23T13:00:00Z' }, now)).toBe(false);
  });
  it('false for a non-pending row regardless of expiry (fulfilled/expired/cancelled)', () => {
    expect(isExpiredPendingRow({ status: 'fulfilled', expires_at: '2026-06-23T11:00:00Z' }, now)).toBe(false);
    expect(isExpiredPendingRow({ status: 'expired', expires_at: '2026-06-23T11:00:00Z' }, now)).toBe(false);
    expect(isExpiredPendingRow({ status: 'cancelled', expires_at: '2026-06-23T11:00:00Z' }, now)).toBe(false);
  });
  it('FAIL-SAFE: false for a pending row with missing/unparseable expires_at (never reap an unreadable TTL)', () => {
    expect(isExpiredPendingRow({ status: 'pending', expires_at: undefined }, now)).toBe(false);
    expect(isExpiredPendingRow({ status: 'pending', expires_at: 'not-a-date' }, now)).toBe(false);
    expect(isExpiredPendingRow({ status: 'pending' }, now)).toBe(false);
  });
  it('false for null/garbage input', () => {
    expect(isExpiredPendingRow(null, now)).toBe(false);
    expect(isExpiredPendingRow(undefined, now)).toBe(false);
  });
});

describe('reapExpiredPendingRequests() — FR-1', () => {
  it('returns the count of reaped rows', async () => {
    const supabase = mockSupabase({ reapResult: [{ id: 'r1' }, { id: 'r2' }] });
    const n = await reapExpiredPendingRequests(supabase, { callsign: 'Bravo' });
    expect(n).toBe(2);
  });
  it('returns 0 when nothing is past-TTL', async () => {
    const supabase = mockSupabase({ reapResult: [] });
    const n = await reapExpiredPendingRequests(supabase, {});
    expect(n).toBe(0);
  });
  it('fail-soft: returns 0 (not throw) on a DB error', async () => {
    const supabase = mockSupabase({ reapResult: null, reapError: { message: 'boom' } });
    const n = await reapExpiredPendingRequests(supabase, {});
    expect(n).toBe(0);
  });
});

describe('reviveOne() — FR-2 reap-then-retry vs idempotency preservation', () => {
  it('reaps an EXPIRED zombie on a 23505 hit, then the retried insert SUCCEEDS (revival unblocked)', async () => {
    const row = { id: 'fresh-1', requested_at: 't', expires_at: 't+1h' };
    const supabase = mockSupabase({
      insertSequence: [
        { data: null, error: { code: '23505', message: 'duplicate key' } }, // 1st: blocked by zombie
        { data: row, error: null }                                            // 2nd: after reap, succeeds
      ],
      reapResult: [{ id: 'zombie-1' }] // one expired row reaped → index freed
    });
    const r = await reviveOne(supabase, 'Bravo', 'session-123');
    expect(r.inserted).toBe(true);
    expect(r.row).toEqual(row);
  });

  it('PRESERVES idempotency: a LIVE pending row (nothing reaped) still reports alreadyPending, no duplicate', async () => {
    const supabase = mockSupabase({
      insertSequence: [
        { data: null, error: { code: '23505', message: 'duplicate key' } } // blocked by a LIVE row
      ],
      reapResult: [] // nothing expired → reap is a no-op
    });
    const r = await reviveOne(supabase, 'Bravo', 'session-123');
    expect(r.inserted).toBe(false);
    expect(r.alreadyPending).toBe(true);
  });
});
