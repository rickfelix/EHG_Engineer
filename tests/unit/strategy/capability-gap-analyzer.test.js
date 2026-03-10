import { describe, it, expect, vi } from 'vitest';
import { analyzeCapabilityGaps, analyzeObjectiveGaps } from '../../../lib/strategy/capability-gap-analyzer.js';

function mockSupabase(objectives, capabilities) {
  return {
    from: vi.fn((table) => {
      if (table === 'strategy_objectives') {
        const chain = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockResolvedValue({ data: objectives, error: null });
        return chain;
      }
      if (table === 'venture_capabilities') {
        const chain = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: capabilities, error: null });
        return chain;
      }
      const chain = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    }),
  };
}

describe('capability-gap-analyzer', () => {
  it('identifies gaps when partial capabilities delivered', async () => {
    const objectives = [
      { id: 'obj-1', title: 'Auth Platform', time_horizon: 'now', target_capabilities: ['auth', 'payments', 'notifications'], status: 'active' },
    ];
    const capabilities = [
      { name: 'auth', maturity_level: 'production' },
      { name: 'payments', maturity_level: 'stable' },
    ];

    const client = mockSupabase(objectives, capabilities);
    const result = await analyzeCapabilityGaps({ supabaseClient: client });

    expect(result.success).toBe(true);
    expect(result.totalGaps).toBe(1);
    expect(result.objectives[0].gap_capabilities).toEqual(['notifications']);
    expect(result.objectives[0].coverage_pct).toBe(67);
  });

  it('returns empty gaps when all capabilities delivered', async () => {
    const objectives = [
      { id: 'obj-1', title: 'Full Coverage', time_horizon: 'now', target_capabilities: ['auth', 'payments'], status: 'active' },
    ];
    const capabilities = [
      { name: 'auth', maturity_level: 'production' },
      { name: 'payments', maturity_level: 'stable' },
    ];

    const client = mockSupabase(objectives, capabilities);
    const result = await analyzeCapabilityGaps({ supabaseClient: client });

    expect(result.success).toBe(true);
    expect(result.totalGaps).toBe(0);
    expect(result.objectives[0].gap_capabilities).toEqual([]);
    expect(result.objectives[0].coverage_pct).toBe(100);
  });

  it('handles empty strategy objectives gracefully', async () => {
    const client = mockSupabase([], []);
    const result = await analyzeCapabilityGaps({ supabaseClient: client });

    expect(result.success).toBe(true);
    expect(result.objectives).toEqual([]);
    expect(result.totalGaps).toBe(0);
  });

  it('sorts by time_horizon urgency then gap count', async () => {
    const objectives = [
      { id: 'obj-later', title: 'Later', time_horizon: 'later', target_capabilities: ['a', 'b', 'c'], status: 'active' },
      { id: 'obj-now', title: 'Now', time_horizon: 'now', target_capabilities: ['x'], status: 'active' },
      { id: 'obj-next', title: 'Next', time_horizon: 'next', target_capabilities: ['d', 'e'], status: 'active' },
    ];

    const client = mockSupabase(objectives, []);
    const result = await analyzeCapabilityGaps({ supabaseClient: client });

    expect(result.objectives[0].time_horizon).toBe('now');
    expect(result.objectives[1].time_horizon).toBe('next');
    expect(result.objectives[2].time_horizon).toBe('later');
  });
});
