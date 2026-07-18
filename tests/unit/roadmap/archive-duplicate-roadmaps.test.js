/**
 * Unit tests for the roadmap duplicate-cleanup referrer check.
 * SD-LEO-INFRA-ROADMAP-DUPLICATE-CLEANUP-001.
 */

import { describe, it, expect, vi } from 'vitest';
import { checkReferrers } from '../../../scripts/one-off/archive-duplicate-roadmaps.mjs';

const TARGET_IDS = ['a89b078b-836c-437f-9c40-09fb6b23a41a', '8ffa7fdf-5d67-42a7-b135-2f7200fe9da0'];
const WAVE_IDS = ['wave-1', 'wave-2'];

function makeSupabase({ snapshots = [], loops = [], sds = [] } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'roadmap_baseline_snapshots') {
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: snapshots, error: null }) };
      }
      if (table === 'loop_registry') {
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: loops, error: null }) };
      }
      if (table === 'strategic_directives_v2') {
        return { select: vi.fn().mockResolvedValue({ data: sds, error: null }) };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe('checkReferrers (FR-3 fail-closed precondition)', () => {
  it('TS-1/TS-3 precondition: no referrers -> safe:true, empty reasons', async () => {
    const supabase = makeSupabase({});
    const result = await checkReferrers(supabase, WAVE_IDS);
    expect(result).toEqual({ safe: true, reasons: [] });
  });

  it('TS-5: a roadmap_baseline_snapshots referrer aborts (safe:false) with zero implied writes', async () => {
    const supabase = makeSupabase({ snapshots: [{ id: 'snap-1' }] });
    const result = await checkReferrers(supabase, WAVE_IDS);
    expect(result.safe).toBe(false);
    expect(result.reasons[0]).toContain('roadmap_baseline_snapshots');
  });

  it('TS-5: a loop_registry referrer aborts (safe:false)', async () => {
    const supabase = makeSupabase({ loops: [{ id: 'loop-1' }] });
    const result = await checkReferrers(supabase, WAVE_IDS);
    expect(result.safe).toBe(false);
    expect(result.reasons[0]).toContain('loop_registry');
  });

  it('TS-5: a strategic_directives_v2.metadata referrer (target id embedded anywhere in the JSON) aborts', async () => {
    const supabase = makeSupabase({
      sds: [{ sd_key: 'SD-SOME-OTHER-001', metadata: { children: [{ related_roadmap: TARGET_IDS[0] }] } }],
    });
    const result = await checkReferrers(supabase, WAVE_IDS);
    expect(result.safe).toBe(false);
    expect(result.reasons.some((r) => r.includes(TARGET_IDS[0]) && r.includes('SD-SOME-OTHER-001'))).toBe(true);
  });

  it('an unrelated SD whose metadata does not mention either target id does not trigger an abort', async () => {
    const supabase = makeSupabase({ sds: [{ sd_key: 'SD-UNRELATED-001', metadata: { note: 'nothing to see here' } }] });
    const result = await checkReferrers(supabase, WAVE_IDS);
    expect(result.safe).toBe(true);
  });

  it('an empty waveIds array skips the loop_registry query entirely (no [].in() call on an empty set)', async () => {
    const supabase = makeSupabase({});
    const result = await checkReferrers(supabase, []);
    expect(result.safe).toBe(true);
    // loop_registry's .from() is never invoked when waveIds is empty
    const calledTables = supabase.from.mock.calls.map((c) => c[0]);
    expect(calledTables).not.toContain('loop_registry');
  });
});
