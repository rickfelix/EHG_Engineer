/**
 * Unit tests for lib/skunkworks/signal-readers/calibration.js
 * Tests the calibration signal reader for high-variance and low-predictive-power detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readCalibrationSignals } from '../../../lib/skunkworks/signal-readers/calibration.js';

function mockSupabase(data, error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('readCalibrationSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when query errors (fail-open)', async () => {
    const supabase = mockSupabase(null, { message: 'connection refused' });
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('connection refused')
    );
  });

  it('returns empty array when no telemetry data', async () => {
    const supabase = mockSupabase([]);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('returns empty array when telemetry is null', async () => {
    const supabase = mockSupabase(null);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('skips dimensions with fewer than 10 samples', async () => {
    // Only 5 rows — should produce no signals
    const data = Array.from({ length: 5 }, (_, i) => ({
      venture_id: `v${i}`,
      dimension_scores: { market_fit: 50 + i * 5 },
      gate_passed: true,
      gate_score: 70,
    }));
    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('detects high variance dimension (stdDev > 25)', async () => {
    // Create 20 scores with high variance: alternating 10 and 90
    const data = Array.from({ length: 20 }, (_, i) => ({
      venture_id: `v${i}`,
      dimension_scores: { market_fit: i % 2 === 0 ? 10 : 90 },
      gate_passed: i % 2 === 0,
      gate_score: 60,
    }));
    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });

    const highVar = result.find(s => s.title.includes('High variance'));
    expect(highVar).toBeDefined();
    expect(highVar.type).toBe('calibration');
    expect(highVar.evidence.dimension).toBe('market_fit');
    expect(highVar.evidence.std_dev).toBeGreaterThan(25);
    expect(highVar.priority).toBeGreaterThanOrEqual(50);
    expect(highVar.priority).toBeLessThanOrEqual(90);
  });

  it('does not flag dimension with low variance', async () => {
    // 20 rows all scoring ~50 (tight cluster)
    const data = Array.from({ length: 20 }, (_, i) => ({
      venture_id: `v${i}`,
      dimension_scores: { stability: 48 + (i % 5) }, // range 48-52
      gate_passed: true,
      gate_score: 80,
    }));
    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });

    const highVar = result.find(s => s.title.includes('High variance'));
    expect(highVar).toBeUndefined();
  });

  it('detects low predictive power (separation < 10)', async () => {
    // Passed and failed ventures have nearly identical scores => low predictive power
    const data = [];
    for (let i = 0; i < 12; i++) {
      data.push({
        venture_id: `pass${i}`,
        dimension_scores: { novelty: 55 },
        gate_passed: true,
        gate_score: 75,
      });
    }
    for (let i = 0; i < 12; i++) {
      data.push({
        venture_id: `fail${i}`,
        dimension_scores: { novelty: 52 },
        gate_passed: false,
        gate_score: 40,
      });
    }

    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });

    const lowPred = result.find(s => s.title.includes('Low predictive power'));
    expect(lowPred).toBeDefined();
    expect(lowPred.type).toBe('calibration');
    expect(lowPred.evidence.dimension).toBe('novelty');
    expect(Math.abs(lowPred.evidence.separation)).toBeLessThan(10);
    expect(lowPred.priority).toBe(70);
  });

  it('does not flag dimension with good separation', async () => {
    const data = [];
    for (let i = 0; i < 10; i++) {
      data.push({
        venture_id: `pass${i}`,
        dimension_scores: { clarity: 80 },
        gate_passed: true,
        gate_score: 80,
      });
    }
    for (let i = 0; i < 10; i++) {
      data.push({
        venture_id: `fail${i}`,
        dimension_scores: { clarity: 30 },
        gate_passed: false,
        gate_score: 30,
      });
    }

    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });

    const lowPred = result.find(s => s.title.includes('Low predictive power'));
    expect(lowPred).toBeUndefined();
  });

  it('handles multiple dimensions independently', async () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      venture_id: `v${i}`,
      dimension_scores: {
        dim_a: i % 2 === 0 ? 5 : 95,   // high variance
        dim_b: 50 + (i % 3),            // low variance
      },
      gate_passed: i < 10,
      gate_score: 60,
    }));

    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });

    const dimASignals = result.filter(s => s.evidence.dimension === 'dim_a');
    const dimBSignals = result.filter(s => s.evidence.dimension === 'dim_b' && s.title.includes('High variance'));
    expect(dimASignals.length).toBeGreaterThan(0);
    expect(dimBSignals.length).toBe(0);
  });

  it('caps priority at 90 for high variance', async () => {
    // Extremely high stdDev should still cap at 90
    const data = Array.from({ length: 20 }, (_, i) => ({
      venture_id: `v${i}`,
      dimension_scores: { extreme: i % 2 === 0 ? 0 : 100 },
      gate_passed: true,
      gate_score: 50,
    }));
    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });

    const highVar = result.find(s => s.title.includes('High variance'));
    expect(highVar).toBeDefined();
    expect(highVar.priority).toBeLessThanOrEqual(90);
  });

  it('returns empty array on thrown exception (fail-open)', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('unexpected crash'); }),
    };
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('returns correct signal structure', async () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      venture_id: `v${i}`,
      dimension_scores: { test_dim: i % 2 === 0 ? 10 : 90 },
      gate_passed: true,
      gate_score: 70,
    }));
    const supabase = mockSupabase(data);
    const result = await readCalibrationSignals({ supabase, logger: silentLogger });

    for (const signal of result) {
      expect(signal).toHaveProperty('type');
      expect(signal).toHaveProperty('title');
      expect(signal).toHaveProperty('evidence');
      expect(signal).toHaveProperty('priority');
      expect(typeof signal.type).toBe('string');
      expect(typeof signal.title).toBe('string');
      expect(typeof signal.evidence).toBe('object');
      expect(typeof signal.priority).toBe('number');
    }
  });
});
