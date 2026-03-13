/**
 * Unit tests for lib/skunkworks/signal-readers/codebase-health.js
 * Tests declining trends and critical threshold breach detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readCodebaseHealthSignals } from '../../../lib/skunkworks/signal-readers/codebase-health.js';

function mockSupabase(snapshotData, snapshotError, configData = [], configError = null) {
  return {
    from: vi.fn((table) => {
      if (table === 'codebase_health_snapshots') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: snapshotData, error: snapshotError }),
            }),
          }),
        };
      }
      if (table === 'codebase_health_config') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: configData, error: configError }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    }),
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('readCodebaseHealthSignals', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty array when query errors (fail-open)', async () => {
    const supabase = mockSupabase(null, { message: 'table not found' });
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('table not found')
    );
  });

  it('returns empty array when no snapshots exist', async () => {
    const supabase = mockSupabase([], null);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('returns empty array when snapshots is null', async () => {
    const supabase = mockSupabase(null, null);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('skips dimensions with only one snapshot (need trend)', async () => {
    const snapshots = [
      { dimension: 'complexity', score: 45, trend_direction: 'declining', findings: [], finding_count: 3, metadata: {}, scanned_at: '2026-03-13' },
    ];
    const supabase = mockSupabase(snapshots, null);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('detects declining trend and generates signal', async () => {
    const snapshots = [
      { dimension: 'complexity', score: 55, trend_direction: 'declining', findings: [], finding_count: 8, metadata: {}, scanned_at: '2026-03-13' },
      { dimension: 'complexity', score: 70, trend_direction: 'stable', findings: [], finding_count: 5, metadata: {}, scanned_at: '2026-03-06' },
    ];
    const supabase = mockSupabase(snapshots, null);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });

    expect(result.length).toBeGreaterThanOrEqual(1);
    const declining = result.find(s => s.evidence.trend === 'declining');
    expect(declining).toBeDefined();
    expect(declining.type).toBe('codebase_health');
    expect(declining.evidence.dimension).toBe('complexity');
    expect(declining.evidence.current_score).toBe(55);
    expect(declining.evidence.previous_score).toBe(70);
    expect(declining.evidence.delta).toBe(-15);
  });

  it('assigns high priority when score is below critical threshold', async () => {
    const snapshots = [
      { dimension: 'dead_code', score: 30, trend_direction: 'declining', findings: ['a', 'b'], finding_count: 10, metadata: {}, scanned_at: '2026-03-13' },
      { dimension: 'dead_code', score: 60, trend_direction: 'stable', findings: [], finding_count: 5, metadata: {}, scanned_at: '2026-03-06' },
    ];
    const configs = [
      { dimension: 'dead_code', threshold_warning: 70, threshold_critical: 50, enabled: true },
    ];
    const supabase = mockSupabase(snapshots, null, configs);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });

    // Should get declining signal with priority 90 (below critical 50)
    const declining = result.find(s => s.evidence.trend === 'declining');
    expect(declining).toBeDefined();
    expect(declining.priority).toBe(90);

    // Should also get a critical threshold breach signal
    const critical = result.find(s => s.title.includes('Critical'));
    expect(critical).toBeDefined();
    expect(critical.priority).toBe(85);
    expect(critical.evidence.score).toBe(30);
  });

  it('assigns medium priority when score is below warning but above critical', async () => {
    const snapshots = [
      { dimension: 'complexity', score: 60, trend_direction: 'declining', findings: [], finding_count: 4, metadata: {}, scanned_at: '2026-03-13' },
      { dimension: 'complexity', score: 75, trend_direction: 'stable', findings: [], finding_count: 2, metadata: {}, scanned_at: '2026-03-06' },
    ];
    const configs = [
      { dimension: 'complexity', threshold_warning: 70, threshold_critical: 50, enabled: true },
    ];
    const supabase = mockSupabase(snapshots, null, configs);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });

    const declining = result.find(s => s.evidence.trend === 'declining');
    expect(declining).toBeDefined();
    expect(declining.priority).toBe(70);
  });

  it('uses default thresholds when config is missing', async () => {
    const snapshots = [
      { dimension: 'unknown_dim', score: 40, trend_direction: 'declining', findings: [], finding_count: 3, metadata: {}, scanned_at: '2026-03-13' },
      { dimension: 'unknown_dim', score: 55, trend_direction: 'stable', findings: [], finding_count: 1, metadata: {}, scanned_at: '2026-03-06' },
    ];
    // No config entries
    const supabase = mockSupabase(snapshots, null, []);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });

    // Default critical=50, score=40 is below critical => priority 90
    const declining = result.find(s => s.evidence.trend === 'declining');
    expect(declining).toBeDefined();
    expect(declining.priority).toBe(90);
  });

  it('does not flag non-declining dimensions', async () => {
    const snapshots = [
      { dimension: 'stability', score: 80, trend_direction: 'stable', findings: [], finding_count: 1, metadata: {}, scanned_at: '2026-03-13' },
      { dimension: 'stability', score: 75, trend_direction: 'improving', findings: [], finding_count: 2, metadata: {}, scanned_at: '2026-03-06' },
    ];
    const supabase = mockSupabase(snapshots, null);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });

    const declining = result.find(s => s.evidence?.trend === 'declining');
    expect(declining).toBeUndefined();
  });

  it('limits findings_sample to 3 items in critical signal', async () => {
    const snapshots = [
      { dimension: 'duplication', score: 25, trend_direction: 'declining', findings: ['a', 'b', 'c', 'd', 'e'], finding_count: 5, metadata: {}, scanned_at: '2026-03-13' },
      { dimension: 'duplication', score: 40, trend_direction: 'stable', findings: [], finding_count: 2, metadata: {}, scanned_at: '2026-03-06' },
    ];
    const supabase = mockSupabase(snapshots, null);
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });

    const critical = result.find(s => s.title.includes('Critical'));
    expect(critical).toBeDefined();
    expect(critical.evidence.findings_sample.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array on thrown exception (fail-open)', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('unexpected'); }),
    };
    const result = await readCodebaseHealthSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });
});
