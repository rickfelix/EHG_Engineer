/**
 * FR-2 vigilance freshness gauge — pure unit tests (DB-free chainable stub).
 * TS-4: killing/disabling the intake renders NO_DATA, never a stale green.
 */
import { describe, it, expect, vi } from 'vitest';
import { computeVigilanceFreshness } from '../../../lib/vigilance/freshness-gauge.js';

const readStub = (rows, opts = {}) => {
  const chain = {
    eq() { return chain; },
    order() { return chain; },
    limit() { return opts.throwOnRead ? Promise.reject(new Error('read failed')) : Promise.resolve({ data: rows, error: null }); },
  };
  return { supabase: { from() { return { select() { return chain; } }; } } };
};

describe('vigilance freshness gauge (FR-2, S-4)', () => {
  it('TS-4: no observations at all -> NO_DATA, never a stale green', async () => {
    const { supabase } = readStub([]);
    const result = await computeVigilanceFreshness(supabase);
    expect(result.status).toBe('NO_DATA');
    expect(result.latest_observed_at).toBeNull();
  });

  it('TS-4: a read failure (intake/table absent) -> NO_DATA, not a fabricated stale/fresh value', async () => {
    const { supabase } = readStub(null, { throwOnRead: true });
    const result = await computeVigilanceFreshness(supabase);
    expect(result.status).toBe('NO_DATA');
  });

  it('recent observation -> FRESH', async () => {
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    const { supabase } = readStub([
      { observed_at: '2026-07-12T10:00:00Z', payload: { thesis: 'pricing_pressure' } },
    ]);
    const result = await computeVigilanceFreshness(supabase);
    expect(result.status).toBe('FRESH');
    expect(result.hours_since_latest).toBe(2);
    expect(result.thesis_count).toBe(1);
    vi.useRealTimers();
  });

  it('old observation beyond staleAfterHours -> STALE, not silently treated as FRESH', async () => {
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    const { supabase } = readStub([
      { observed_at: '2026-07-10T00:00:00Z', payload: {} },
    ]);
    const result = await computeVigilanceFreshness(supabase, { staleAfterHours: 48 });
    expect(result.status).toBe('STALE');
    vi.useRealTimers();
  });

  it('rows with no usable timestamp -> NO_DATA rather than a fabricated freshness value', async () => {
    const { supabase } = readStub([{ payload: {} }]);
    const result = await computeVigilanceFreshness(supabase);
    expect(result.status).toBe('NO_DATA');
  });
});
