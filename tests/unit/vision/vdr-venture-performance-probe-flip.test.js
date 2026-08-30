// SD-LEO-FEAT-REALIZE-VENTURE-PERFORMANCE-001 (FR-3/FR-4) — "Venture-performance read" probe flip.
// Census found PerformanceGauge.tsx was already built and wired to a live useVenturePerformance()
// query against ventures.health_score; the prior code_grep probe pattern also collided with an
// unrelated same-named function in ehg's survivability-logic.ts and was permanently capped at
// partial(0.5) regardless of realization. This pins the flip to db_count reading the SAME live
// substrate the render depends on (a non-null health_score).
import { describe, it, expect } from 'vitest';
import { dbCountProbe } from '../../../lib/vision/vdr-probes.js';
import { VDR_REGISTRY } from '../../../lib/vision/vdr-registry.js';

function stubSupabase(count) {
  return {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        not() { return chain; },
        then(res, rej) { return Promise.resolve({ count, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('"Venture-performance read" probe flip', () => {
  const entry = VDR_REGISTRY.find((e) => e.capability === 'Venture-performance read');

  it('is now db_count reading realized ventures.health_score presence, not ehg code presence', () => {
    expect(entry).toBeTruthy();
    expect(entry.probe.type).toBe('db_count');
    expect(entry.probe.table).toBe('ventures');
    expect(entry.probe.filter.health_score).toEqual({ not: null });
    expect(entry.probe.min).toBe(1);
  });

  it('honest-low: zero ventures with a health_score reads unbuilt, not fabricated built', async () => {
    const supabase = stubSupabase(0);
    const res = await dbCountProbe(entry.probe, { supabase });
    expect(res.status).toBe('unbuilt');
  });

  it('built once at least one venture has a real health_score (min:1 satisfied)', async () => {
    const supabase = stubSupabase(1);
    const res = await dbCountProbe(entry.probe, { supabase });
    expect(res.status).toBe('built');
  });
});
