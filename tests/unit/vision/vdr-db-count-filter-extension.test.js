// SD-LEO-INFRA-REALIZE-GATE-CALIBRATION-001 (FR-1, FR-5) — dbCountProbe's filter shapes
// extended to match countRatioProbe's applyFilter (scalar, array, {not:null}, {ne:v},
// {gteDaysAgo:N}); the "Calibrate the gates" probe flip that needed the {not:null} shape.
import { describe, it, expect } from 'vitest';
import { dbCountProbe, applyFilter } from '../../../lib/vision/vdr-probes.js';
import { VDR_REGISTRY } from '../../../lib/vision/vdr-registry.js';

// Records which filter methods were called, resolving count from a fixed value regardless
// of the filter applied (isolates "did the shape get accepted" from "what count comes back").
function stubSupabase(count) {
  const calls = [];
  return {
    calls,
    from() {
      const chain = {
        select() { return chain; },
        eq(...a) { calls.push(['eq', ...a]); return chain; },
        in(...a) { calls.push(['in', ...a]); return chain; },
        not(...a) { calls.push(['not', ...a]); return chain; },
        neq(...a) { calls.push(['neq', ...a]); return chain; },
        gte(...a) { calls.push(['gte', ...a]); return chain; },
        then(res, rej) { return Promise.resolve({ count, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('applyFilter (shared) — every documented shape', () => {
  it('scalar -> .eq()', () => {
    const supabase = stubSupabase(1);
    const q = applyFilter(supabase.from('t').select(), { col: 'v' });
    expect(supabase.calls).toContainEqual(['eq', 'col', 'v']);
  });

  it('array -> .in()', () => {
    const supabase = stubSupabase(1);
    applyFilter(supabase.from('t').select(), { col: ['a', 'b'] });
    expect(supabase.calls).toContainEqual(['in', 'col', ['a', 'b']]);
  });

  it('{not:null} -> .not(col, "is", null)', () => {
    const supabase = stubSupabase(1);
    applyFilter(supabase.from('t').select(), { col: { not: null } });
    expect(supabase.calls).toContainEqual(['not', 'col', 'is', null]);
  });

  it('{ne:v} -> .neq()', () => {
    const supabase = stubSupabase(1);
    applyFilter(supabase.from('t').select(), { col: { ne: 'x' } });
    expect(supabase.calls).toContainEqual(['neq', 'col', 'x']);
  });

  it('{gteDaysAgo:N} -> .gte() with a computed cutoff', () => {
    const supabase = stubSupabase(1);
    const nowMs = Date.UTC(2026, 0, 10);
    applyFilter(supabase.from('t').select(), { col: { gteDaysAgo: 5 } }, nowMs);
    const call = supabase.calls.find((c) => c[0] === 'gte');
    expect(call[1]).toBe('col');
    expect(call[2]).toBe(new Date(nowMs - 5 * 86_400_000).toISOString());
  });
});

describe('dbCountProbe uses the shared applyFilter (not just flat .eq())', () => {
  it('accepts {not:null} without throwing and reports built when count>=min', async () => {
    const supabase = stubSupabase(3);
    const res = await dbCountProbe(
      { table: 'opportunity_blueprints', filter: { 'metadata->>calibration_read_at': { not: null } }, min: 1 },
      { supabase },
    );
    expect(res.status).toBe('built');
    expect(supabase.calls).toContainEqual(['not', 'metadata->>calibration_read_at', 'is', null]);
  });

  it('a plain scalar filter still behaves byte-identically (regression: pre-extraction shape)', async () => {
    const supabase = stubSupabase(0);
    const res = await dbCountProbe({ table: 't', filter: { status: 'active' }, min: 1 }, { supabase });
    expect(res.status).toBe('unbuilt');
    expect(supabase.calls).toContainEqual(['eq', 'status', 'active']);
  });
});

describe('"Calibrate the gates" probe flip', () => {
  const entry = VDR_REGISTRY.find((e) => e.capability === 'Calibrate the gates');

  it('is now db_count reading realized calibration_read_at, not code_grep on code presence', () => {
    expect(entry).toBeTruthy();
    expect(entry.probe.type).toBe('db_count');
    expect(entry.probe.table).toBe('opportunity_blueprints');
    expect(entry.probe.filter['metadata->>calibration_read_at']).toEqual({ not: null });
  });

  it('honest-low: empty/unread cohort reads unbuilt via dbCountProbe, not fabricated built', async () => {
    const supabase = stubSupabase(0);
    const res = await dbCountProbe(entry.probe, { supabase });
    expect(res.status).toBe('unbuilt');
  });

  it('built once >=1 row has been read (min:1 satisfied)', async () => {
    const supabase = stubSupabase(1);
    const res = await dbCountProbe(entry.probe, { supabase });
    expect(res.status).toBe('built');
  });
});
