/**
 * Tests for Calibration Report Generator
 * SD-CLOSE-EXPERIMENT-FEEDBACK-LOOP-ORCH-001-C
 *
 * Covers:
 * - computeBaselineAccuracy: FPR/FNR calculation, insufficient data handling
 * - computePerGateCorrelation: point-biserial correlation, dimension classification
 * - generateCalibrationReport: full report assembly
 * - generateRecommendations: DROP/INCREASE_WEIGHT/KEEP/threshold actions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('calibration-report', () => {
  let computeBaselineAccuracy, computePerGateCorrelation, generateCalibrationReport;
  let generateRecommendations, pointBiserialCorrelation, classifyCorrelation;
  let mockSupabase, deps;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/calibration-report.js');
    computeBaselineAccuracy = mod.computeBaselineAccuracy;
    computePerGateCorrelation = mod.computePerGateCorrelation;
    generateCalibrationReport = mod.generateCalibrationReport;
    generateRecommendations = mod.generateRecommendations;
    pointBiserialCorrelation = mod.pointBiserialCorrelation;
    classifyCorrelation = mod.classifyCorrelation;

    mockSupabase = {
      from: vi.fn(),
    };
    deps = { supabase: mockSupabase, logger: { log: vi.fn(), warn: vi.fn() } };
  });

  // Helper to build a fluent Supabase mock chain
  function mockQuery(data, error = null) {
    return {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data, error }),
    };
  }

  // ─── computeBaselineAccuracy ──────────────────────────────────

  describe('computeBaselineAccuracy', () => {
    it('computes correct FPR and FNR with known data', async () => {
      // 40 records: 20 high-scoring (>80), 20 low-scoring (<50)
      const records = [];
      // High-scoring: 15 pass, 5 fail => FPR = 5/20 = 0.25
      for (let i = 0; i < 15; i++) records.push({ venture_id: `v${i}`, synthesis_score: 85, kill_gate_stage: 3, gate_passed: true });
      for (let i = 0; i < 5; i++) records.push({ venture_id: `vf${i}`, synthesis_score: 90, kill_gate_stage: 5, gate_passed: false });
      // Low-scoring: 14 fail, 6 pass => FNR = 6/20 = 0.3
      for (let i = 0; i < 14; i++) records.push({ venture_id: `vl${i}`, synthesis_score: 30, kill_gate_stage: 3, gate_passed: false });
      for (let i = 0; i < 6; i++) records.push({ venture_id: `vlp${i}`, synthesis_score: 40, kill_gate_stage: 5, gate_passed: true });

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computeBaselineAccuracy(deps);
      expect(result.insufficient_data).toBe(false);
      expect(result.fpr).toBe(0.25);
      expect(result.fnr).toBe(0.3);
      expect(result.sample_size).toBe(40);
      expect(result.high_count).toBe(20);
      expect(result.low_count).toBe(20);
    });

    it('returns insufficient_data when sample size < 30', async () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        venture_id: `v${i}`, synthesis_score: 70, kill_gate_stage: 3, gate_passed: true,
      }));

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computeBaselineAccuracy(deps);
      expect(result.insufficient_data).toBe(true);
      expect(result.reason).toBe('sample_too_small');
      expect(result.sample_size).toBe(10);
    });

    it('returns insufficient_data on query error', async () => {
      mockSupabase.from.mockReturnValue(mockQuery(null, { message: 'timeout' }));

      const result = await computeBaselineAccuracy(deps);
      expect(result.insufficient_data).toBe(true);
      expect(result.reason).toBe('query_error');
    });

    it('computes FPR=0 when all high-scoring ventures pass', async () => {
      const records = [];
      for (let i = 0; i < 30; i++) records.push({ venture_id: `v${i}`, synthesis_score: 85, kill_gate_stage: 3, gate_passed: true });

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computeBaselineAccuracy(deps);
      expect(result.fpr).toBe(0);
      expect(result.high_count).toBe(30);
    });

    it('respects custom thresholds', async () => {
      const records = [];
      // With highThreshold=70: scores 75 count as high
      for (let i = 0; i < 20; i++) records.push({ venture_id: `v${i}`, synthesis_score: 75, kill_gate_stage: 3, gate_passed: false });
      // With lowThreshold=40: scores 35 count as low
      for (let i = 0; i < 15; i++) records.push({ venture_id: `vl${i}`, synthesis_score: 35, kill_gate_stage: 3, gate_passed: true });

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computeBaselineAccuracy(deps, { highThreshold: 70, lowThreshold: 40 });
      expect(result.fpr).toBe(1); // All 20 high-scoring failed
      expect(result.fnr).toBe(1); // All 15 low-scoring passed
    });
  });

  // ─── computePerGateCorrelation ──────────────────────────────────

  describe('computePerGateCorrelation', () => {
    it('identifies predictive dimensions (r > 0.3)', async () => {
      // Create data where high 'moat' scores correlate with passing gate 3
      const records = [];
      for (let i = 0; i < 20; i++) {
        records.push({
          venture_id: `vp${i}`, synthesis_score: 80 + i, kill_gate_stage: 3, gate_passed: true,
          dimension_scores: { moat: 85 + i, timing: 50 + (i % 5) },
        });
      }
      for (let i = 0; i < 20; i++) {
        records.push({
          venture_id: `vf${i}`, synthesis_score: 20 + i, kill_gate_stage: 3, gate_passed: false,
          dimension_scores: { moat: 25 + i, timing: 48 + (i % 5) },
        });
      }

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computePerGateCorrelation(deps, { gateStages: [3] });
      expect(result.insufficient_data).toBe(false);
      expect(result.dimensions).toContain('moat');
      expect(result.correlations[3].moat.classification).toBe('predictive');
      expect(Math.abs(result.correlations[3].moat.r)).toBeGreaterThan(0.3);
    });

    it('flags noise dimensions (r < 0.1)', async () => {
      // Create data where 'timing' scores are random relative to gate outcome
      const records = [];
      for (let i = 0; i < 20; i++) {
        records.push({
          venture_id: `vp${i}`, synthesis_score: 70, kill_gate_stage: 3, gate_passed: true,
          dimension_scores: { noise_dim: 50 + (i % 3) },
        });
      }
      for (let i = 0; i < 20; i++) {
        records.push({
          venture_id: `vf${i}`, synthesis_score: 30, kill_gate_stage: 3, gate_passed: false,
          dimension_scores: { noise_dim: 50 + (i % 3) },
        });
      }

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computePerGateCorrelation(deps, { gateStages: [3] });
      expect(result.correlations[3].noise_dim.classification).toBe('noise');
      expect(Math.abs(result.correlations[3].noise_dim.r)).toBeLessThan(0.1);
    });

    it('returns insufficient_data on query error', async () => {
      mockSupabase.from.mockReturnValue(mockQuery(null, { message: 'fail' }));

      const result = await computePerGateCorrelation(deps);
      expect(result.insufficient_data).toBe(true);
      expect(result.correlations).toEqual({});
    });

    it('marks stage with < 5 records as insufficient_data', async () => {
      const records = [
        { venture_id: 'v1', synthesis_score: 80, kill_gate_stage: 13, gate_passed: true, dimension_scores: { moat: 80 } },
        { venture_id: 'v2', synthesis_score: 30, kill_gate_stage: 13, gate_passed: false, dimension_scores: { moat: 30 } },
      ];

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computePerGateCorrelation(deps, { gateStages: [13] });
      expect(result.correlations[13].moat.classification).toBe('insufficient_data');
    });

    it('falls back to synthesis_score when no dimension_scores present', async () => {
      const records = [];
      for (let i = 0; i < 10; i++) {
        records.push({ venture_id: `vp${i}`, synthesis_score: 80, kill_gate_stage: 3, gate_passed: true, dimension_scores: null });
      }
      for (let i = 0; i < 10; i++) {
        records.push({ venture_id: `vf${i}`, synthesis_score: 20, kill_gate_stage: 3, gate_passed: false, dimension_scores: null });
      }

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const result = await computePerGateCorrelation(deps, { gateStages: [3] });
      expect(result.dimensions).toEqual(['synthesis_score']);
      expect(result.correlations[3].synthesis_score.classification).toBe('predictive');
    });
  });

  // ─── pointBiserialCorrelation (internal) ──────────────────────────

  describe('pointBiserialCorrelation', () => {
    it('returns 0 for empty data', () => {
      expect(pointBiserialCorrelation([])).toBe(0);
    });

    it('returns 0 when all same group', () => {
      const data = [{ score: 80, passed: true }, { score: 90, passed: true }];
      expect(pointBiserialCorrelation(data)).toBe(0);
    });

    it('returns positive r when higher scores correlate with passing', () => {
      const data = [
        { score: 90, passed: true }, { score: 85, passed: true },
        { score: 20, passed: false }, { score: 15, passed: false },
      ];
      const r = pointBiserialCorrelation(data);
      expect(r).toBeGreaterThan(0.5);
    });

    it('returns 0 when all scores are identical', () => {
      const data = [
        { score: 50, passed: true }, { score: 50, passed: false },
      ];
      expect(pointBiserialCorrelation(data)).toBe(0);
    });
  });

  // ─── classifyCorrelation ──────────────────────────────────────────

  describe('classifyCorrelation', () => {
    it('classifies r > 0.3 as predictive', () => {
      expect(classifyCorrelation(0.5)).toBe('predictive');
      expect(classifyCorrelation(-0.4)).toBe('predictive');
    });

    it('classifies r < 0.1 as noise', () => {
      expect(classifyCorrelation(0.05)).toBe('noise');
      expect(classifyCorrelation(-0.02)).toBe('noise');
    });

    it('classifies 0.1 <= r <= 0.3 as moderate', () => {
      expect(classifyCorrelation(0.2)).toBe('moderate');
      expect(classifyCorrelation(-0.15)).toBe('moderate');
    });
  });

  // ─── generateRecommendations ──────────────────────────────────────

  describe('generateRecommendations', () => {
    it('recommends RAISE_THRESHOLD when FPR > 0.3', () => {
      const accuracy = { insufficient_data: false, fpr: 0.4, fnr: 0.1, high_threshold: 80, low_threshold: 50 };
      const correlations = { insufficient_data: true, correlations: {}, dimensions: [] };

      const recs = generateRecommendations(accuracy, correlations);
      const raiseRec = recs.find(r => r.type === 'RAISE_THRESHOLD');
      expect(raiseRec).toBeDefined();
      expect(raiseRec.priority).toBe('high');
    });

    it('recommends LOWER_THRESHOLD when FNR > 0.3', () => {
      const accuracy = { insufficient_data: false, fpr: 0.1, fnr: 0.5, high_threshold: 80, low_threshold: 50 };
      const correlations = { insufficient_data: true, correlations: {}, dimensions: [] };

      const recs = generateRecommendations(accuracy, correlations);
      const lowerRec = recs.find(r => r.type === 'LOWER_THRESHOLD');
      expect(lowerRec).toBeDefined();
      expect(lowerRec.priority).toBe('high');
    });

    it('recommends DROP for dimension with r < 0.1 at all gates', () => {
      const accuracy = { insufficient_data: true };
      const correlations = {
        insufficient_data: false,
        dimensions: ['noise_dim'],
        correlations: {
          3: { noise_dim: { r: 0.05, classification: 'noise', n: 30 } },
          5: { noise_dim: { r: -0.03, classification: 'noise', n: 25 } },
          13: { noise_dim: { r: 0.08, classification: 'noise', n: 20 } },
        },
      };

      const recs = generateRecommendations(accuracy, correlations);
      const dropRec = recs.find(r => r.type === 'DROP');
      expect(dropRec).toBeDefined();
      expect(dropRec.target).toBe('noise_dim');
      expect(dropRec.priority).toBe('medium');
    });

    it('recommends INCREASE_WEIGHT for dimension with r > 0.5 at any gate', () => {
      const accuracy = { insufficient_data: true };
      const correlations = {
        insufficient_data: false,
        dimensions: ['moat'],
        correlations: {
          3: { moat: { r: 0.6, classification: 'predictive', n: 40 } },
          5: { moat: { r: 0.2, classification: 'moderate', n: 30 } },
        },
      };

      const recs = generateRecommendations(accuracy, correlations);
      const incRec = recs.find(r => r.type === 'INCREASE_WEIGHT');
      expect(incRec).toBeDefined();
      expect(incRec.target).toBe('moat');
      expect(incRec.priority).toBe('high');
    });

    it('recommends KEEP for moderate dimensions', () => {
      const accuracy = { insufficient_data: true };
      const correlations = {
        insufficient_data: false,
        dimensions: ['timing'],
        correlations: {
          3: { timing: { r: 0.25, classification: 'moderate', n: 30 } },
          5: { timing: { r: 0.15, classification: 'moderate', n: 25 } },
        },
      };

      const recs = generateRecommendations(accuracy, correlations);
      const keepRec = recs.find(r => r.type === 'KEEP');
      expect(keepRec).toBeDefined();
      expect(keepRec.target).toBe('timing');
      expect(keepRec.priority).toBe('low');
    });

    it('produces no threshold recs when accuracy data is insufficient', () => {
      const accuracy = { insufficient_data: true, fpr: 0, fnr: 0 };
      const correlations = { insufficient_data: true, correlations: {}, dimensions: [] };

      const recs = generateRecommendations(accuracy, correlations);
      expect(recs.filter(r => r.type === 'RAISE_THRESHOLD' || r.type === 'LOWER_THRESHOLD')).toHaveLength(0);
    });
  });

  // ─── generateCalibrationReport ────────────────────────────────────

  describe('generateCalibrationReport', () => {
    it('combines accuracy, correlations, and recommendations', async () => {
      // Build 40 records for accuracy (needs >= 30)
      const records = [];
      for (let i = 0; i < 20; i++) {
        records.push({
          venture_id: `vp${i}`, synthesis_score: 85, kill_gate_stage: 3, gate_passed: true,
          dimension_scores: { moat: 80 },
        });
      }
      for (let i = 0; i < 20; i++) {
        records.push({
          venture_id: `vf${i}`, synthesis_score: 30, kill_gate_stage: 3, gate_passed: false,
          dimension_scores: { moat: 25 },
        });
      }

      // Both calls to supabase.from should return the same data
      mockSupabase.from.mockReturnValue(mockQuery(records));

      const report = await generateCalibrationReport(deps);
      expect(report.generated_at).toBeTruthy();
      expect(report.summary).toBeDefined();
      expect(report.summary.fpr).toBeDefined();
      expect(report.summary.fnr).toBeDefined();
      expect(report.summary.sample_size).toBe(40);
      expect(report.accuracy).toBeDefined();
      expect(report.correlations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('includes insufficient_data flag when sample is small', async () => {
      const records = [
        { venture_id: 'v1', synthesis_score: 80, kill_gate_stage: 3, gate_passed: true, dimension_scores: null },
      ];

      mockSupabase.from.mockReturnValue(mockQuery(records));

      const report = await generateCalibrationReport(deps);
      expect(report.summary.insufficient_data).toBe(true);
    });
  });
});
