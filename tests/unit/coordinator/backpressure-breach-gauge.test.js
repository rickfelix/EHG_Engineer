// SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D (FR-1 / TS-1)
import { describe, it, expect } from 'vitest';
import { planBackpressureBreachGauge } from '../../../lib/coordinator/backpressure-breach-gauge.cjs';

function fakeSupabase(rows) {
  return {
    from() {
      const query = {
        select: () => query,
        is: () => query,
        gt: () => query,
        not: () => query,
        limit: async () => ({ data: rows, error: null }),
      };
      return query;
    },
  };
}

function fakeSupabaseError(message) {
  return {
    from() {
      const query = {
        select: () => query,
        is: () => query,
        gt: () => query,
        not: () => query,
        limit: async () => ({ data: null, error: { message } }),
      };
      return query;
    },
  };
}

describe('planBackpressureBreachGauge', () => {
  it('detects a seeded synthetic breach: 4 non-exempt unanswered rows for one target', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      target_session: 'seat-alpha',
      payload: { kind: 'routine_check_in', body: `msg ${i}` },
    }));
    const supabase = fakeSupabase(rows);
    const result = await planBackpressureBreachGauge(supabase);
    expect(result.noData).toBe(false);
    expect(result.breaching).toEqual([{ target_session: 'seat-alpha', count: 4 }]);
  });

  it('does not flag a target at or below the limit (3 rows)', async () => {
    const rows = Array.from({ length: 3 }, () => ({ target_session: 'seat-beta', payload: { kind: 'routine' } }));
    const supabase = fakeSupabase(rows);
    const result = await planBackpressureBreachGauge(supabase);
    expect(result.noData).toBe(false);
    expect(result.breaching).toEqual([]);
  });

  it('excludes rows whose payload.kind is backpressure-exempt from the count', async () => {
    const rows = Array.from({ length: 5 }, () => ({ target_session: 'seat-gamma', payload: { kind: 'collision_warning' } }));
    const supabase = fakeSupabase(rows);
    const result = await planBackpressureBreachGauge(supabase);
    expect(result.breaching).toEqual([]);
  });

  it('excludes rows whose payload.message_kind is a correction kind', async () => {
    const rows = Array.from({ length: 5 }, () => ({ target_session: 'seat-delta', payload: { kind: 'adam_advisory', message_kind: 'retraction' } }));
    const supabase = fakeSupabase(rows);
    const result = await planBackpressureBreachGauge(supabase);
    expect(result.breaching).toEqual([]);
  });

  it('excludes rows carrying a signal_type (friction reports must never self-throttle)', async () => {
    const rows = Array.from({ length: 5 }, () => ({ target_session: 'seat-epsilon', payload: { signal_type: 'stuck' } }));
    const supabase = fakeSupabase(rows);
    const result = await planBackpressureBreachGauge(supabase);
    expect(result.breaching).toEqual([]);
  });

  it('excludes backpressure_parked marker rows (the guard already refused and preserved these -- they are proof the guard worked, not that it was bypassed)', async () => {
    const rows = Array.from({ length: 46 }, (_, i) => ({
      target_session: 'coordinator',
      payload: i === 0 ? { kind: 'roll_call' } : { kind: 'roll_call', backpressure_parked: true, backpressure_parked_at: '2026-09-07T00:00:00Z' },
    }));
    const supabase = fakeSupabase(rows);
    const result = await planBackpressureBreachGauge(supabase);
    // Only the 1 genuine (non-parked) row counts -- well under the limit of 3.
    expect(result.breaching).toEqual([]);
  });

  it('excludes reply rows (a reply is an answer, not a fresh unanswered ask)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ target_session: 'seat-zeta', payload: { kind: 'coordinator_reply', reply_to: `row-${i}` } }));
    const supabase = fakeSupabase(rows);
    const result = await planBackpressureBreachGauge(supabase);
    expect(result.breaching).toEqual([]);
  });

  it('returns noData:true on a query failure, never a false-clean report', async () => {
    const supabase = fakeSupabaseError('connection refused');
    const result = await planBackpressureBreachGauge(supabase);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('connection refused');
  });
});
