/**
 * Cross-Venture Capability Graph Tests
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-003
 */

import { describe, it, expect, vi } from 'vitest';
import { buildCrossVentureGraph, getCapabilityVentures } from '../../../lib/governance/cross-venture-capability-graph.js';

function createMockSupabase(data = [], error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data, error }),
    }),
  };
}

function createCapabilityMockSupabase(data = [], error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

describe('buildCrossVentureGraph', () => {
  it('returns empty result when no supabase client', async () => {
    const result = await buildCrossVentureGraph(null);
    expect(result.success).toBe(false);
    expect(result.sharedCapabilities).toEqual([]);
  });

  it('returns empty result when no capabilities exist', async () => {
    const result = await buildCrossVentureGraph(createMockSupabase([]));
    expect(result.success).toBe(true);
    expect(result.sharedCapabilities).toEqual([]);
    expect(result.reuseScore).toBe(0);
  });

  it('identifies shared capabilities across ventures', async () => {
    const capabilities = [
      { id: '1', capability_key: 'auth', capability_type: 'service', venture_id: 'v1', maturity_level: 3, status: 'active' },
      { id: '2', capability_key: 'auth', capability_type: 'service', venture_id: 'v2', maturity_level: 2, status: 'active' },
      { id: '3', capability_key: 'payments', capability_type: 'service', venture_id: 'v1', maturity_level: 1, status: 'active' },
    ];

    const result = await buildCrossVentureGraph(createMockSupabase(capabilities));

    expect(result.success).toBe(true);
    expect(result.sharedCapabilities).toHaveLength(1);
    expect(result.sharedCapabilities[0].capability_key).toBe('auth');
    expect(result.sharedCapabilities[0].venture_count).toBe(2);
    expect(result.totalCapabilities).toBe(2);
    expect(result.ventureCount).toBe(2);
    expect(result.reuseScore).toBe(50); // 1 shared out of 2 total
  });

  it('sorts shared capabilities by venture_count descending', async () => {
    const capabilities = [
      { id: '1', capability_key: 'auth', capability_type: 'service', venture_id: 'v1', maturity_level: 3, status: 'active' },
      { id: '2', capability_key: 'auth', capability_type: 'service', venture_id: 'v2', maturity_level: 2, status: 'active' },
      { id: '3', capability_key: 'logging', capability_type: 'tool', venture_id: 'v1', maturity_level: 1, status: 'active' },
      { id: '4', capability_key: 'logging', capability_type: 'tool', venture_id: 'v2', maturity_level: 1, status: 'active' },
      { id: '5', capability_key: 'logging', capability_type: 'tool', venture_id: 'v3', maturity_level: 1, status: 'active' },
    ];

    const result = await buildCrossVentureGraph(createMockSupabase(capabilities));

    expect(result.sharedCapabilities[0].capability_key).toBe('logging');
    expect(result.sharedCapabilities[0].venture_count).toBe(3);
    expect(result.sharedCapabilities[1].capability_key).toBe('auth');
    expect(result.sharedCapabilities[1].venture_count).toBe(2);
  });

  it('handles database error gracefully', async () => {
    const result = await buildCrossVentureGraph(createMockSupabase(null, { message: 'DB error' }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('DB error');
  });
});

describe('getCapabilityVentures', () => {
  it('returns not shared when no supabase client', async () => {
    const result = await getCapabilityVentures('auth', null);
    expect(result.shared).toBe(false);
  });

  it('returns shared status for multi-venture capability', async () => {
    const data = [
      { venture_id: 'v1', maturity_level: 3, status: 'active' },
      { venture_id: 'v2', maturity_level: 2, status: 'active' },
    ];
    const result = await getCapabilityVentures('auth', createCapabilityMockSupabase(data));
    expect(result.shared).toBe(true);
    expect(result.ventureCount).toBe(2);
  });

  it('returns not shared for single-venture capability', async () => {
    const data = [
      { venture_id: 'v1', maturity_level: 3, status: 'active' },
    ];
    const result = await getCapabilityVentures('payments', createCapabilityMockSupabase(data));
    expect(result.shared).toBe(false);
    expect(result.ventureCount).toBe(1);
  });
});
