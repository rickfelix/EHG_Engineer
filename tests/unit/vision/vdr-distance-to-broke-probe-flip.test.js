// SD-LEO-FEAT-REALIZE-DISTANCE-BROKE-001 (FR-2) — "See distance-to-broke" probe flip.
// Census found distanceToBroke() was already computed and rendered live in ehg's
// SurvivabilityCockpit; the prior code_grep probe was permanently capped at partial(0.5)
// regardless of realization. This pins the flip to db_count reading the SAME live
// operator_cash_burn_monthly substrate the render depends on.
import { describe, it, expect } from 'vitest';
import { dbCountProbe } from '../../../lib/vision/vdr-probes.js';
import { VDR_REGISTRY } from '../../../lib/vision/vdr-registry.js';

function stubSupabase(count) {
  return {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        then(res, rej) { return Promise.resolve({ count, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('"See distance-to-broke" probe flip', () => {
  const entry = VDR_REGISTRY.find((e) => e.capability === 'See distance-to-broke');

  it('is now db_count reading realized operator_cash_burn_monthly freshness, not ehg code presence', () => {
    expect(entry).toBeTruthy();
    expect(entry.probe.type).toBe('db_count');
    expect(entry.probe.table).toBe('operator_cash_burn_monthly');
    expect(entry.probe.filter.cash_last_synced_at).toEqual({ gteDaysAgo: 45 });
  });

  it('honest-low: no recent substrate row reads unbuilt, not fabricated built', async () => {
    const supabase = stubSupabase(0);
    const res = await dbCountProbe(entry.probe, { supabase });
    expect(res.status).toBe('unbuilt');
  });

  it('built once a recent row exists (min:1 satisfied)', async () => {
    const supabase = stubSupabase(1);
    const res = await dbCountProbe(entry.probe, { supabase });
    expect(res.status).toBe('built');
  });
});
