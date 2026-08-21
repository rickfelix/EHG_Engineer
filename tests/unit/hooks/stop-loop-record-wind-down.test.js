// SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-1): behavioral coverage for recordWindDown's (c) block —
// it must insert into worker_wind_down_events with the right shape (TS-1) and must fail open,
// including on a dedup_key collision (TS-2), never throwing into the caller.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { recordWindDown } = require('../../../scripts/hooks/stop-loop-wakeup-reminder.cjs');

function makeSupabase({ sessionsRow = { metadata: {} }, insertError = null } = {}) {
  const calls = { sessionsUpdate: [], eventsInsert: [] };
  return {
    calls,
    from(table) {
      if (table === 'claude_sessions') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: sessionsRow, error: null }),
          update(payload) {
            calls.sessionsUpdate.push(payload);
            return { eq: async () => ({ data: null, error: null }) };
          },
        };
      }
      if (table === 'worker_wind_down_events') {
        return {
          insert(payload) {
            calls.eventsInsert.push(payload);
            return {
              select() {
                return {
                  single: async () => (insertError ? { data: null, error: insertError } : { data: { id: 'row-1' }, error: null }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('recordWindDown (SD-LEO-INFRA-WIND-DOWN-SURVEY-001 FR-1)', () => {
  it('inserts into worker_wind_down_events with session_id, reason, had_claim, and metadata', async () => {
    const supabase = makeSupabase();
    await recordWindDown(supabase, 'sess-123', { reason: 'turn_end_wakeup_scheduled', hadClaim: true });
    expect(supabase.calls.eventsInsert).toHaveLength(1);
    const payload = supabase.calls.eventsInsert[0];
    expect(payload.session_id).toBe('sess-123');
    expect(payload.reason).toBe('turn_end_wakeup_scheduled');
    expect(payload.had_claim).toBe(true);
    expect(payload.metadata).toMatchObject({ session_id: 'sess-123', reason: 'turn_end_wakeup_scheduled', had_claim: true });
    expect(typeof payload.created_at).toBe('string');
    // dedup_key mirrors the OLD emitFeedback contract exactly: session::reason::minute.
    expect(payload.dedup_key).toBe(`sess-123::turn_end_wakeup_scheduled::${payload.created_at.slice(0, 16)}`);
  });

  it('defaults had_claim to false when not provided', async () => {
    const supabase = makeSupabase();
    await recordWindDown(supabase, 'sess-1', { reason: 'no_claim_idle' });
    expect(supabase.calls.eventsInsert[0].had_claim).toBe(false);
  });

  it('does not throw and logs nothing alarming on a dedup_key collision (23505)', async () => {
    const supabase = makeSupabase({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(recordWindDown(supabase, 'sess-1', { reason: 'signaled', hadClaim: false })).resolves.toBeUndefined();
      // A 23505 is an EXPECTED idempotent no-op — must not be written to stderr as a failure.
      const stderrCalls = stderrSpy.mock.calls.map((c) => c[0]);
      expect(stderrCalls.some((s) => s.includes('wind_down event insert'))).toBe(false);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('fails open (never throws) and logs to stderr on a genuine insert error', async () => {
    const supabase = makeSupabase({ insertError: { code: '42501', message: 'permission denied' } });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(recordWindDown(supabase, 'sess-1', { reason: 'signaled', hadClaim: false })).resolves.toBeUndefined();
      const stderrCalls = stderrSpy.mock.calls.map((c) => c[0]);
      expect(stderrCalls.some((s) => s.includes('wind_down event insert') && s.includes('permission denied'))).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('fails open when the table does not exist yet (the documented interim chairman-gate gap)', async () => {
    const supabase = {
      from(table) {
        if (table === 'claude_sessions') {
          return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: {}, error: null }) };
        }
        if (table === 'worker_wind_down_events') {
          return { insert() { throw new Error('relation "worker_wind_down_events" does not exist'); } };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(recordWindDown(supabase, 'sess-1', { reason: 'signaled' })).resolves.toBeUndefined();
      const stderrCalls = stderrSpy.mock.calls.map((c) => c[0]);
      expect(stderrCalls.some((s) => s.includes('does not exist'))).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
