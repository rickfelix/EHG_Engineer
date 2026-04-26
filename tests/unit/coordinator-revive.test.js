/**
 * Tests for scripts/coordinator-revive.cjs
 * SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001 (US-002)
 *
 * Covers: NATO roster, findIdleCallsigns, reviveOne (insert / idempotency / unknown errors).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { NATO, findIdleCallsigns, reviveOne } = require('../../scripts/coordinator-revive.cjs');

describe('NATO roster', () => {
  it('contains the canonical 8 callsigns in order', () => {
    expect(NATO).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']);
  });
});

function mockSupabase({ activeSessions = [], insertResult = null, insertError = null }) {
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
              single: () => Promise.resolve({ data: insertResult, error: insertError })
            })
          })
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
