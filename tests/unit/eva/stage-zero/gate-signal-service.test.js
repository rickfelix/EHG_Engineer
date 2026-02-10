/**
 * Unit Tests: Gate Signal Tracking Service
 * SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-D
 *
 * Test Coverage:
 * - recordGateSignal (with profile, without profile, missing fields, no supabase)
 * - getSignalsByProfile (results, errors)
 * - getSignalsSummary (aggregation, boundary filter)
 * - isTrackedBoundary / TRACKED_BOUNDARIES
 */

import { describe, test, expect, vi } from 'vitest';
import {
  recordGateSignal,
  getSignalsByProfile,
  getSignalsSummary,
  isTrackedBoundary,
  TRACKED_BOUNDARIES,
} from '../../../../lib/eva/stage-zero/gate-signal-service.js';

// --- Mock helpers ---

function createMockSupabase(response = { data: null, error: null }) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(response),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// --- Tests ---

describe('TRACKED_BOUNDARIES', () => {
  test('contains 5 tracked boundaries', () => {
    expect(TRACKED_BOUNDARIES).toHaveLength(5);
  });

  test('includes expected boundaries', () => {
    expect(TRACKED_BOUNDARIES).toContain('stage_3');
    expect(TRACKED_BOUNDARIES).toContain('5->6');
    expect(TRACKED_BOUNDARIES).toContain('12->13');
    expect(TRACKED_BOUNDARIES).toContain('20->21');
    expect(TRACKED_BOUNDARIES).toContain('graduation');
  });
});

describe('isTrackedBoundary', () => {
  test('returns true for tracked boundaries', () => {
    expect(isTrackedBoundary('stage_3')).toBe(true);
    expect(isTrackedBoundary('5->6')).toBe(true);
    expect(isTrackedBoundary('graduation')).toBe(true);
  });

  test('returns false for non-tracked boundaries', () => {
    expect(isTrackedBoundary('1->2')).toBe(false);
    expect(isTrackedBoundary('stage_1')).toBe(false);
    expect(isTrackedBoundary('unknown')).toBe(false);
  });
});

describe('recordGateSignal', () => {
  test('records signal with profile context', async () => {
    const insertedRow = {
      id: 'signal-uuid-1',
      profile_id: 'profile-uuid',
      venture_id: 'venture-uuid',
      gate_boundary: '5->6',
      signal_type: 'pass',
    };
    const supabase = createMockSupabase({ data: insertedRow, error: null });

    const result = await recordGateSignal(
      { supabase, logger: silentLogger },
      {
        ventureId: 'venture-uuid',
        gateBoundary: '5->6',
        signalType: 'pass',
        outcome: { score: 0.85 },
        profile: { id: 'profile-uuid', version: 2 },
      }
    );

    expect(result).toEqual(insertedRow);
    expect(supabase.from).toHaveBeenCalledWith('evaluation_profile_outcomes');
    expect(supabase._chain.insert).toHaveBeenCalledWith({
      profile_id: 'profile-uuid',
      profile_version: 2,
      venture_id: 'venture-uuid',
      gate_boundary: '5->6',
      signal_type: 'pass',
      outcome: { score: 0.85 },
    });
  });

  test('records signal with null profile (legacy mode)', async () => {
    const insertedRow = {
      id: 'signal-uuid-2',
      profile_id: null,
      venture_id: 'venture-uuid',
      gate_boundary: 'stage_3',
      signal_type: 'fail',
    };
    const supabase = createMockSupabase({ data: insertedRow, error: null });

    const result = await recordGateSignal(
      { supabase, logger: silentLogger },
      {
        ventureId: 'venture-uuid',
        gateBoundary: 'stage_3',
        signalType: 'fail',
      }
    );

    expect(result).toEqual(insertedRow);
    expect(supabase._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: null,
        profile_version: null,
      })
    );
  });

  test('returns null when no supabase client', async () => {
    const result = await recordGateSignal(
      { supabase: null, logger: silentLogger },
      {
        ventureId: 'venture-uuid',
        gateBoundary: '5->6',
        signalType: 'pass',
      }
    );

    expect(result).toBeNull();
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  test('throws when required fields are missing', async () => {
    const supabase = createMockSupabase();

    await expect(
      recordGateSignal({ supabase, logger: silentLogger }, { ventureId: 'v', gateBoundary: '5->6' })
    ).rejects.toThrow('ventureId, gateBoundary, and signalType are required');

    await expect(
      recordGateSignal({ supabase, logger: silentLogger }, { ventureId: 'v', signalType: 'pass' })
    ).rejects.toThrow('ventureId, gateBoundary, and signalType are required');

    await expect(
      recordGateSignal({ supabase, logger: silentLogger }, { gateBoundary: '5->6', signalType: 'pass' })
    ).rejects.toThrow('ventureId, gateBoundary, and signalType are required');
  });

  test('returns null on database error', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'insert failed' },
    });

    const result = await recordGateSignal(
      { supabase, logger: silentLogger },
      {
        ventureId: 'venture-uuid',
        gateBoundary: '5->6',
        signalType: 'pass',
      }
    );

    expect(result).toBeNull();
    expect(silentLogger.warn).toHaveBeenCalled();
  });
});

describe('getSignalsByProfile', () => {
  test('returns signals for a profile', async () => {
    const signals = [
      { id: '1', profile_id: 'p1', venture_id: 'v1', gate_boundary: '5->6', signal_type: 'pass' },
      { id: '2', profile_id: 'p1', venture_id: 'v2', gate_boundary: 'stage_3', signal_type: 'fail' },
    ];
    const supabase = createMockSupabase({ data: signals, error: null });
    // Override the chain for order to return the mock data
    supabase._chain.order = vi.fn().mockResolvedValue({ data: signals, error: null });

    const result = await getSignalsByProfile({ supabase }, 'p1');

    expect(result).toEqual(signals);
    expect(result).toHaveLength(2);
    expect(supabase.from).toHaveBeenCalledWith('evaluation_profile_outcomes');
  });

  test('returns empty array when no data', async () => {
    const supabase = createMockSupabase({ data: null, error: null });
    supabase._chain.order = vi.fn().mockResolvedValue({ data: null, error: null });

    const result = await getSignalsByProfile({ supabase }, 'unknown-profile');
    expect(result).toEqual([]);
  });

  test('throws on database error', async () => {
    const supabase = createMockSupabase();
    supabase._chain.order = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'query failed' },
    });

    await expect(
      getSignalsByProfile({ supabase }, 'p1')
    ).rejects.toThrow('Failed to fetch signals: query failed');
  });
});

describe('getSignalsSummary', () => {
  function createSummarySupabase(signalTypes) {
    const data = signalTypes.map(t => ({ signal_type: t }));
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    // Last call in chain resolves with data (when no boundary filter)
    // With boundary filter, eq is called twice, so we need the second eq to resolve
    let eqCallCount = 0;
    chain.eq = vi.fn((...args) => {
      eqCallCount++;
      if (eqCallCount >= 2) {
        // After boundary filter, resolve
        return Promise.resolve({ data, error: null });
      }
      return chain;
    });
    // For no-boundary case, first eq returns a thenable
    const sb = {
      from: vi.fn().mockReturnValue(chain),
      _chain: chain,
      _data: data,
    };
    return sb;
  }

  test('aggregates pass/fail/review/skip counts', async () => {
    const signals = ['pass', 'pass', 'pass', 'fail', 'fail', 'review', 'skip'];
    const data = signals.map(t => ({ signal_type: t }));

    // Simple mock: eq resolves on first call (profile_id filter, no boundary)
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    const result = await getSignalsSummary({ supabase }, 'profile-1');

    expect(result.total).toBe(7);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.reviewed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.pass_rate).toBeCloseTo(0.43, 2);
  });

  test('returns zeros when no signals exist', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    const result = await getSignalsSummary({ supabase }, 'empty-profile');

    expect(result.total).toBe(0);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.pass_rate).toBe(0);
  });

  test('calculates perfect pass rate', async () => {
    const data = [{ signal_type: 'pass' }, { signal_type: 'pass' }, { signal_type: 'pass' }];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    const result = await getSignalsSummary({ supabase }, 'prof-1');

    expect(result.pass_rate).toBe(1);
    expect(result.total).toBe(3);
    expect(result.passed).toBe(3);
  });

  test('filters by boundary when provided', async () => {
    const data = [{ signal_type: 'pass' }, { signal_type: 'fail' }];
    // When boundary is provided, eq is called twice (profile_id then gate_boundary)
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    // Second eq call should resolve
    let callCount = 0;
    chain.eq = vi.fn((...args) => {
      callCount++;
      if (callCount === 1) return chain; // First eq (profile_id) returns chain
      return Promise.resolve({ data, error: null }); // Second eq (boundary) resolves
    });
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    const result = await getSignalsSummary({ supabase }, 'prof-1', '5->6');

    expect(result.total).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.pass_rate).toBe(0.5);
    expect(chain.eq).toHaveBeenCalledTimes(2);
  });

  test('throws on database error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'db fail' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await expect(
      getSignalsSummary({ supabase }, 'prof-1')
    ).rejects.toThrow('Failed to fetch signal summary: db fail');
  });
});
