import { describe, it, expect } from 'vitest';
import { mapScore, computeDelta, RISK_CATEGORIES } from '../../../lib/eva/risk-category-mapper.js';

describe('mapScore', () => {
  it('maps 75+ to CRITICAL', () => {
    expect(mapScore(75)).toBe('CRITICAL');
    expect(mapScore(100)).toBe('CRITICAL');
    expect(mapScore(99)).toBe('CRITICAL');
  });

  it('maps 50-74 to HIGH', () => {
    expect(mapScore(50)).toBe('HIGH');
    expect(mapScore(74)).toBe('HIGH');
  });

  it('maps 25-49 to MEDIUM', () => {
    expect(mapScore(25)).toBe('MEDIUM');
    expect(mapScore(49)).toBe('MEDIUM');
  });

  it('maps 0-24 to LOW', () => {
    expect(mapScore(0)).toBe('LOW');
    expect(mapScore(24)).toBe('LOW');
  });

  it('handles edge cases', () => {
    expect(mapScore(-5)).toBe('LOW');
    expect(mapScore(150)).toBe('CRITICAL');
    expect(mapScore(NaN)).toBe('LOW');
    expect(mapScore(null)).toBe('LOW');
    expect(mapScore(undefined)).toBe('LOW');
  });
});

describe('computeDelta', () => {
  it('detects increasing risk', () => {
    expect(computeDelta('LOW', 'HIGH')).toBe('increasing');
    expect(computeDelta('MEDIUM', 'CRITICAL')).toBe('increasing');
  });

  it('detects decreasing risk', () => {
    expect(computeDelta('CRITICAL', 'LOW')).toBe('decreasing');
    expect(computeDelta('HIGH', 'MEDIUM')).toBe('decreasing');
  });

  it('detects stable risk', () => {
    expect(computeDelta('HIGH', 'HIGH')).toBe('stable');
    expect(computeDelta(null, 'HIGH')).toBe('stable');
  });
});

describe('RISK_CATEGORIES', () => {
  it('has 6 categories', () => {
    expect(RISK_CATEGORIES).toHaveLength(6);
    expect(RISK_CATEGORIES).toContain('product_risk');
    expect(RISK_CATEGORIES).toContain('legal_risk');
  });
});
