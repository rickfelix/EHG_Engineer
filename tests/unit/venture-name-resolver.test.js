import { describe, test, expect, vi } from 'vitest';
import { resolveActiveVentureByName } from '../../lib/venture-name-resolver.js';

/**
 * Mock Supabase distinguishing the resolver's two sequential queries by
 * whether `.in('status', [...])` was called on the chain -- the resolver's
 * first query filters to live statuses, the fallback query does not.
 */
function createMockSupabase({ liveMatch = null, anyMatch = null, throwOnLive = false, throwOnAny = false } = {}) {
  const calls = { select: [], in: [], order: [] };
  const from = vi.fn(() => {
    let hasStatusFilter = false;
    const builder = {
      select(...args) { calls.select.push(args); return builder; },
      ilike() { return builder; },
      in(...args) { hasStatusFilter = true; calls.in.push(args); return builder; },
      order(...args) { calls.order.push(args); return builder; },
      limit() {
        if (hasStatusFilter) {
          if (throwOnLive) return Promise.resolve({ data: null, error: { message: 'live query failed' } });
          return Promise.resolve({ data: liveMatch ? [liveMatch] : [], error: null });
        }
        if (throwOnAny) return Promise.resolve({ data: null, error: { message: 'fallback query failed' } });
        return Promise.resolve({ data: anyMatch ? [anyMatch] : [], error: null });
      },
    };
    return builder;
  });
  return { from, _calls: calls };
}

describe('resolveActiveVentureByName', () => {
  test('returns null for an empty/falsy name without querying', async () => {
    const supabase = createMockSupabase();
    const result = await resolveActiveVentureByName(supabase, '');
    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('prefers the live (active/paused) match over a cancelled duplicate', async () => {
    const active = { id: 'ecbba50e', name: 'MarketLens', status: 'active' };
    const cancelled = { id: '4e710bb2', name: 'MarketLens', status: 'cancelled' };
    // liveMatch simulates the live-scoped query finding the active row directly;
    // anyMatch (cancelled) would only be reached if the live query missed.
    const supabase = createMockSupabase({ liveMatch: active, anyMatch: cancelled });
    const result = await resolveActiveVentureByName(supabase, 'MarketLens');
    expect(result).toEqual(active);
  });

  test('queries the correct columns and status list, ordered by created_at desc (regression: catches a wrong column/status/sort-order edit that call-count-only assertions would miss)', async () => {
    const active = { id: 'ecbba50e', name: 'MarketLens', status: 'active' };
    const supabase = createMockSupabase({ liveMatch: active });
    await resolveActiveVentureByName(supabase, 'MarketLens');
    expect(supabase._calls.select[0]).toEqual(['id, name, status']);
    expect(supabase._calls.in[0]).toEqual(['status', ['active', 'paused']]);
    expect(supabase._calls.order[0]).toEqual(['created_at', { ascending: false }]);
  });

  test('falls back to a cancelled venture when no live match exists (re-run-under-old-name preserved)', async () => {
    const cancelled = { id: '4e710bb2', name: 'OldProject', status: 'cancelled' };
    const supabase = createMockSupabase({ liveMatch: null, anyMatch: cancelled });
    const result = await resolveActiveVentureByName(supabase, 'OldProject');
    expect(result).toEqual(cancelled);
  });

  test('returns null when no venture matches at all', async () => {
    const supabase = createMockSupabase({ liveMatch: null, anyMatch: null });
    const result = await resolveActiveVentureByName(supabase, 'NonexistentVenture');
    expect(result).toBeNull();
  });

  test('propagates a live-query error', async () => {
    const supabase = createMockSupabase({ throwOnLive: true });
    await expect(resolveActiveVentureByName(supabase, 'X')).rejects.toThrow('live-status query error');
  });

  test('propagates a fallback-query error', async () => {
    const supabase = createMockSupabase({ liveMatch: null, throwOnAny: true });
    await expect(resolveActiveVentureByName(supabase, 'X')).rejects.toThrow('fallback query error');
  });

  test('partial:true wraps the name in wildcards for substring matching', async () => {
    const active = { id: 'v-1', name: 'MarketLens Analytics', status: 'active' };
    const supabase = createMockSupabase({ liveMatch: active });
    const ilikeSpy = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [active], error: null }) }),
      }),
    });
    supabase.from = vi.fn(() => ({ select: () => ({ ilike: ilikeSpy }) }));
    await resolveActiveVentureByName(supabase, 'MarketLens', { partial: true });
    expect(ilikeSpy).toHaveBeenCalledWith('name', '%MarketLens%');
  });

  test('partial:false (default) uses the exact name with no wildcards', async () => {
    const active = { id: 'v-1', name: 'MarketLens', status: 'active' };
    const supabase = createMockSupabase({ liveMatch: active });
    const ilikeSpy = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [active], error: null }) }),
      }),
    });
    supabase.from = vi.fn(() => ({ select: () => ({ ilike: ilikeSpy }) }));
    await resolveActiveVentureByName(supabase, 'MarketLens');
    expect(ilikeSpy).toHaveBeenCalledWith('name', 'MarketLens');
  });
});
