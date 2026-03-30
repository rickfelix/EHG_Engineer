import { describe, it, expect, vi } from 'vitest';
import { checkRetroactiveCompliance } from '../../../lib/compliance/retroactive-check.js';

function mockSupabase(responses = {}) {
  const fromChain = (table) => {
    const resp = responses[table] || { count: 0, error: null };
    return {
      select: () => ({
        eq: (col, val) => {
          // If the response has .data, this is a .single() chain (ventures lookup)
          if (resp.data !== undefined) {
            return {
              single: () => Promise.resolve({ data: resp.data, error: resp.error || null }),
            };
          }
          // Otherwise it's a count query (artifact check)
          return Promise.resolve({ count: resp.count ?? 0, error: resp.error || null });
        },
      }),
    };
  };
  return { from: vi.fn(fromChain) };
}

describe('checkRetroactiveCompliance', () => {
  it('returns compliant=false with 3 gaps when venture has no artifacts', async () => {
    const supabase = mockSupabase({
      ventures: { data: { origin_type: 'manual', current_lifecycle_stage: 20 } },
      venture_briefs: { count: 0 },
      eva_vision_documents: { count: 0 },
      venture_fundamentals: { count: 0 },
    });

    const result = await checkRetroactiveCompliance('test-venture-id', supabase);

    expect(result.compliant).toBe(false);
    expect(result.gaps).toHaveLength(3);
    expect(result.gaps[0]).toContain('Venture Brief');
    expect(result.gaps[1]).toContain('Vision Document');
    expect(result.gaps[2]).toContain('Venture Fundamentals');
    expect(result.checked).toBe(3);
    expect(result.found).toBe(0);
  });

  it('returns compliant=true when venture has all 3 artifacts', async () => {
    const supabase = mockSupabase({
      ventures: { data: { origin_type: 'manual', current_lifecycle_stage: 20 } },
      venture_briefs: { count: 1 },
      eva_vision_documents: { count: 2 },
      venture_fundamentals: { count: 1 },
    });

    const result = await checkRetroactiveCompliance('test-venture-id', supabase);

    expect(result.compliant).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.found).toBe(3);
  });

  it('returns compliant=false with 2 gaps for partial artifacts', async () => {
    const supabase = mockSupabase({
      ventures: { data: { origin_type: 'manual', current_lifecycle_stage: 20 } },
      venture_briefs: { count: 1 },
      eva_vision_documents: { count: 0 },
      venture_fundamentals: { count: 0 },
    });

    const result = await checkRetroactiveCompliance('test-venture-id', supabase);

    expect(result.compliant).toBe(false);
    expect(result.gaps).toHaveLength(2);
    expect(result.found).toBe(1);
  });

  it('skips check for Stage 0 ventures when skipStage0Ventures=true', async () => {
    const supabase = mockSupabase({
      ventures: { data: { origin_type: 'stage0', current_lifecycle_stage: 20 } },
    });

    const result = await checkRetroactiveCompliance('test-venture-id', supabase);

    expect(result.compliant).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.checked).toBe(0);
  });

  it('checks Stage 0 ventures when skipStage0Ventures=false', async () => {
    const supabase = mockSupabase({
      ventures: { data: { origin_type: 'stage0', current_lifecycle_stage: 20 } },
      venture_briefs: { count: 0 },
      eva_vision_documents: { count: 0 },
      venture_fundamentals: { count: 0 },
    });

    const result = await checkRetroactiveCompliance('test-venture-id', supabase, { skipStage0Ventures: false });

    expect(result.compliant).toBe(false);
    expect(result.gaps).toHaveLength(3);
  });
});
