/**
 * QF-20260830-189 — a role-retired seat (e.g. metadata.role='adam_retired') whose retirement
 * stamped released_at + status='released' must not appear in the stuck-seat population: the
 * fetchPopulation query filters on status IN ('active','idle'), so a retired seat left at its
 * prior status ('active'/'idle') rendered as stuck forever (specimen: session f27a883d).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { fetchPopulation } = require('../../../lib/fleet/stuck-seat-population.cjs');

/** A minimal but GENUINELY status-filtering mock -- proves the real `.in('status', [...])`
 *  server-side filter this module relies on actually excludes a released row, not merely that
 *  the fixture happened to omit one. */
function makeSupabase(rows) {
  return {
    from(table) {
      if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
      let statusFilter = null;
      const chain = {
        select: () => chain,
        in: (col, values) => { if (col === 'status') statusFilter = values; return chain; },
        order: () => chain,
        limit: () => {
          const filtered = statusFilter ? rows.filter((r) => statusFilter.includes(r.status)) : rows;
          return Promise.resolve({ data: filtered, error: null });
        },
      };
      return chain;
    },
  };
}

describe('fetchPopulation excludes role-retired seats once released (QF-20260830-189 fixture)', () => {
  it('a retired role seat stamped released_at/status=released never reaches the population, unlike a live seat', async () => {
    const supabase = makeSupabase([
      { session_id: 'retired-adam-seat', status: 'released', released_at: '2026-08-30T18:00:00Z', loop_state: 'active', last_tool_at: '2026-08-30T14:18:31Z', heartbeat_at: '2026-08-30T14:20:26Z', metadata: { role: 'adam_retired' } },
      { session_id: 'live-worker', status: 'active', released_at: null, loop_state: 'active', last_tool_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), metadata: {} },
    ]);
    const { seats } = await fetchPopulation(supabase);
    const ids = seats.map((s) => s.session_id);
    expect(ids).not.toContain('retired-adam-seat');
    expect(ids).toContain('live-worker');
  });

  it('a role-retired seat left at status=active (the unfixed defect state) DOES still reach the population -- proves the fix is the status stamp, not the role tag', async () => {
    const supabase = makeSupabase([
      { session_id: 'unfixed-retired-seat', status: 'active', released_at: null, loop_state: 'active', last_tool_at: '2026-08-01T00:00:00Z', heartbeat_at: '2026-08-30T14:20:26Z', metadata: { role: 'adam_retired' } },
    ]);
    const { seats } = await fetchPopulation(supabase);
    expect(seats.map((s) => s.session_id)).toContain('unfixed-retired-seat');
  });
});
