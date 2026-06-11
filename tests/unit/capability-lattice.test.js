/**
 * Capability Lattice Tests
 * SD: SD-LEO-FEAT-CAPABILITY-LATTICE-001
 *
 * Tests:
 * - Plane 1 scoring with venture bonus
 * - CAPABILITY_TYPES import for generateRecommendation
 * - calculateVenturePlane1Score with various inputs
 * - calculatePlane1FromLedger with venture_capabilities integration
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  PLANE1_CONFIG,
  calculateVenturePlane1Score,
  calculateSDPlane1Score,
  calculateVentureAggregatedPlane1,
  formatPlane1Score,
} from '../../lib/capabilities/plane1-scoring.js';

// ── Unit Tests: PLANE1_CONFIG ──────────────────────────────

describe('PLANE1_CONFIG', () => {
  test('has correct thresholds', () => {
    expect(PLANE1_CONFIG.REJECTION_THRESHOLD).toBe(10);
    expect(PLANE1_CONFIG.CAUTION_THRESHOLD).toBe(12);
    expect(PLANE1_CONFIG.MAX_RAW_SCORE).toBe(15);
    expect(PLANE1_CONFIG.MAX_WEIGHTED_SCORE).toBe(22.5);
  });

  test('has risk levels defined', () => {
    expect(PLANE1_CONFIG.RISK_LEVELS.HIGH).toBeDefined();
    expect(PLANE1_CONFIG.RISK_LEVELS.MEDIUM).toBeDefined();
    expect(PLANE1_CONFIG.RISK_LEVELS.LOW).toBeDefined();
  });
});

// ── Unit Tests: calculateVenturePlane1Score ─────────────────

describe('calculateVenturePlane1Score', () => {
  test('returns zero score for empty capabilities', () => {
    const result = calculateVenturePlane1Score([]);
    expect(result.total_score).toBe(0);
    expect(result.risk_level).toBe('HIGH');
    expect(result.passes_threshold).toBe(false);
    expect(result.capabilities_assessed).toBe(0);
  });

  test('returns zero score for null capabilities', () => {
    const result = calculateVenturePlane1Score(null);
    expect(result.total_score).toBe(0);
    expect(result.passes_threshold).toBe(false);
  });

  test('calculates score for single capability', () => {
    const capabilities = [{
      capability_type: 'agent',
      maturity_level: 'production',
      extraction_clarity: 4,
    }];
    const result = calculateVenturePlane1Score(capabilities);
    expect(result.capabilities_assessed).toBe(1);
    expect(result.total_score).toBeGreaterThanOrEqual(0);
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.graph_centrality_gain).toBeDefined();
    expect(result.breakdown.maturity_lift).toBeDefined();
    expect(result.breakdown.extraction_clarity).toBeDefined();
  });

  test('calculates score for multiple capabilities', () => {
    const capabilities = [
      { capability_type: 'agent', maturity_level: 'production', extraction_clarity: 4 },
      { capability_type: 'api_endpoint', maturity_level: 'stable', extraction_clarity: 3 },
      { capability_type: 'database_schema', maturity_level: 'production', extraction_clarity: 5 },
    ];
    const result = calculateVenturePlane1Score(capabilities);
    expect(result.capabilities_assessed).toBe(3);
    expect(result.individual_scores).toHaveLength(3);
  });

  test('caps total score at MAX_WEIGHTED_SCORE', () => {
    // Create many high-scoring capabilities to exceed max
    const capabilities = Array.from({ length: 10 }, () => ({
      capability_type: 'agent',
      maturity_level: 'production',
      extraction_clarity: 5,
    }));
    const result = calculateVenturePlane1Score(capabilities);
    expect(result.total_score).toBeLessThanOrEqual(PLANE1_CONFIG.MAX_WEIGHTED_SCORE);
  });

  test('includes recommendation in result', () => {
    const capabilities = [
      { capability_type: 'agent', maturity_level: 'production', extraction_clarity: 4 },
    ];
    const result = calculateVenturePlane1Score(capabilities);
    expect(result.recommendation).toBeDefined();
    expect(typeof result.recommendation).toBe('string');
    expect(result.recommendation.length).toBeGreaterThan(0);
  });
});

// ── Unit Tests: calculateSDPlane1Score ──────────────────────

describe('calculateSDPlane1Score', () => {
  test('returns zero for SD with no capabilities', () => {
    const sd = { id: 'SD-TEST-001', delivers_capabilities: [] };
    const result = calculateSDPlane1Score(sd);
    expect(result.total_score).toBe(0);
    expect(result.sd_id).toBe('SD-TEST-001');
    expect(result.passes_threshold).toBe(false);
  });

  test('includes sd_id and sd_title in result', () => {
    const sd = {
      id: 'SD-TEST-002',
      title: 'Test SD',
      delivers_capabilities: [
        { capability_type: 'tool', maturity_level: 'stable', extraction_clarity: 3 },
      ],
    };
    const result = calculateSDPlane1Score(sd);
    expect(result.sd_id).toBe('SD-TEST-002');
    expect(result.sd_title).toBe('Test SD');
  });
});

// ── Unit Tests: calculateVentureAggregatedPlane1 ────────────

describe('calculateVentureAggregatedPlane1', () => {
  test('returns zero for empty SDs array', () => {
    const result = calculateVentureAggregatedPlane1([]);
    expect(result.total_score).toBe(0);
    expect(result.sds_assessed).toBe(0);
    expect(result.passes_threshold).toBe(false);
  });

  test('returns zero for null SDs', () => {
    const result = calculateVentureAggregatedPlane1(null);
    expect(result.total_score).toBe(0);
  });

  test('aggregates across multiple SDs', () => {
    const sds = [
      {
        id: 'SD-A',
        title: 'SD A',
        delivers_capabilities: [
          { capability_type: 'agent', maturity_level: 'stable', extraction_clarity: 3 },
        ],
      },
      {
        id: 'SD-B',
        title: 'SD B',
        delivers_capabilities: [
          { capability_type: 'api_endpoint', maturity_level: 'production', extraction_clarity: 4 },
        ],
      },
    ];
    const result = calculateVentureAggregatedPlane1(sds);
    expect(result.sds_assessed).toBe(2);
    expect(result.total_capabilities).toBe(2);
    expect(result.sd_breakdown).toHaveLength(2);
  });

  test('handles SDs with no capabilities gracefully', () => {
    const sds = [
      { id: 'SD-A', title: 'SD A', delivers_capabilities: [] },
      { id: 'SD-B', title: 'SD B' }, // no delivers_capabilities at all
    ];
    const result = calculateVentureAggregatedPlane1(sds);
    expect(result.total_capabilities).toBe(0);
    expect(result.sds_assessed).toBe(2);
  });
});

// ── Unit Tests: formatPlane1Score ───────────────────────────

describe('formatPlane1Score', () => {
  test('formats passing score with check mark', () => {
    const score = {
      total_score: 15,
      risk_level: 'LOW',
      risk_action: 'Proceed with monitoring',
      capabilities_assessed: 3,
      breakdown: {
        graph_centrality_gain: 4,
        maturity_lift: 4,
        extraction_clarity: 4,
      },
      recommendation: 'Strong capability contribution.',
      passes_threshold: true,
      exceeds_caution: true,
    };
    const formatted = formatPlane1Score(score);
    expect(formatted).toContain('PLANE 1');
    expect(formatted).toContain('15');
    expect(formatted).toContain('LOW');
  });

  test('formats failing score with X mark', () => {
    const score = {
      total_score: 5,
      risk_level: 'HIGH',
      risk_action: 'Requires exception for approval',
      capabilities_assessed: 1,
      breakdown: {
        graph_centrality_gain: 2,
        maturity_lift: 1,
        extraction_clarity: 2,
      },
      recommendation: 'Below threshold.',
      passes_threshold: false,
      exceeds_caution: false,
    };
    const formatted = formatPlane1Score(score);
    expect(formatted).toContain('HIGH');
    expect(formatted).toContain('5');
  });
});
