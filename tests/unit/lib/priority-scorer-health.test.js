import { describe, it, expect } from 'vitest';
import {
  calculateHealthUrgency,
  calculatePriorityScore,
  WEIGHTS
} from '../../../scripts/lib/priority-scorer.js';

describe('calculateHealthUrgency', () => {
  it('returns 0 for null/empty health data', () => {
    expect(calculateHealthUrgency(null)).toBe(0);
    expect(calculateHealthUrgency({})).toBe(0);
    expect(calculateHealthUrgency({ finding_count: 0 })).toBe(0);
  });

  it('scores higher for critical findings', () => {
    const critical = calculateHealthUrgency({
      finding_count: 5,
      severity_distribution: { critical: 5 }
    });
    const medium = calculateHealthUrgency({
      finding_count: 5,
      severity_distribution: { medium: 5 }
    });
    expect(critical).toBeGreaterThan(medium);
  });

  it('adds staleness bonus for old findings', () => {
    const fresh = calculateHealthUrgency({
      finding_count: 3,
      severity_distribution: { high: 3 },
      oldest_finding_days: 0
    });
    const stale = calculateHealthUrgency({
      finding_count: 3,
      severity_distribution: { high: 3 },
      oldest_finding_days: 10
    });
    expect(stale).toBeGreaterThan(fresh);
  });

  it('caps staleness bonus at maximum', () => {
    const stale10 = calculateHealthUrgency({
      finding_count: 1,
      severity_distribution: { info: 1 },
      oldest_finding_days: 10
    });
    const stale100 = calculateHealthUrgency({
      finding_count: 1,
      severity_distribution: { info: 1 },
      oldest_finding_days: 100
    });
    // Both should be equal since staleness is capped
    expect(stale100).toBe(stale10);
  });

  it('adds penalty for low dimension score', () => {
    const healthy = calculateHealthUrgency({
      finding_count: 3,
      severity_distribution: { medium: 3 },
      dimension_score: 90
    });
    const unhealthy = calculateHealthUrgency({
      finding_count: 3,
      severity_distribution: { medium: 3 },
      dimension_score: 20
    });
    expect(unhealthy).toBeGreaterThan(healthy);
  });

  it('caps at max_points', () => {
    const score = calculateHealthUrgency({
      finding_count: 100,
      severity_distribution: { critical: 100 },
      oldest_finding_days: 30,
      dimension_score: 0
    });
    expect(score).toBeLessThanOrEqual(WEIGHTS.maxPoints.healthUrgency);
  });

  it('respects custom max_points from config', () => {
    const score = calculateHealthUrgency(
      { finding_count: 10, severity_distribution: { critical: 10 }, oldest_finding_days: 5 },
      { max_points: 10 }
    );
    expect(score).toBeLessThanOrEqual(10);
  });

  it('returns number between 0 and max_points', () => {
    const score = calculateHealthUrgency({
      finding_count: 5,
      severity_distribution: { critical: 2, high: 1, medium: 1, info: 1 },
      oldest_finding_days: 3,
      dimension_score: 45
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(WEIGHTS.maxPoints.healthUrgency);
  });
});

describe('calculatePriorityScore with healthUrgency', () => {
  it('includes healthUrgency in breakdown', () => {
    const result = calculatePriorityScore(
      { priority: 'medium', sd_type: 'infrastructure' },
      [],
      {},
      { healthUrgency: 15 }
    );
    expect(result.healthUrgency).toBe(15);
    expect(result.details.healthUrgency).toContain('pts');
  });

  it('healthUrgency is 0 when not provided', () => {
    const result = calculatePriorityScore(
      { priority: 'medium', sd_type: 'feature' },
      [],
      {}
    );
    expect(result.healthUrgency).toBe(0);
    expect(result.details.healthUrgency).toBe('none');
  });

  it('caps healthUrgency at max points', () => {
    const result = calculatePriorityScore(
      { priority: 'medium' },
      [],
      {},
      { healthUrgency: 999 }
    );
    expect(result.healthUrgency).toBe(WEIGHTS.maxPoints.healthUrgency);
  });

  it('health urgency increases total score', () => {
    const without = calculatePriorityScore(
      { priority: 'medium', sd_type: 'infrastructure' },
      [],
      {},
      {}
    );
    const withHealth = calculatePriorityScore(
      { priority: 'medium', sd_type: 'infrastructure' },
      [],
      {},
      { healthUrgency: 15 }
    );
    expect(withHealth.total).toBeGreaterThan(without.total);
  });

  it('health urgency is included in dimension total for strategy blending', () => {
    const withoutStrategy = calculatePriorityScore(
      { priority: 'medium', sd_type: 'infrastructure' },
      [],
      {},
      { healthUrgency: 10 }
    );
    const withStrategy = calculatePriorityScore(
      { priority: 'medium', sd_type: 'infrastructure' },
      [],
      {},
      { healthUrgency: 10, strategyWeight: 100 }
    );
    // Both should include healthUrgency, but strategy blending changes total
    expect(withoutStrategy.healthUrgency).toBe(10);
    expect(withStrategy.healthUrgency).toBe(10);
  });
});

describe('WEIGHTS.healthUrgency', () => {
  it('has severity weights defined', () => {
    expect(WEIGHTS.healthUrgency.severityWeights.critical).toBeGreaterThan(0);
    expect(WEIGHTS.healthUrgency.severityWeights.critical).toBeGreaterThan(
      WEIGHTS.healthUrgency.severityWeights.high
    );
    expect(WEIGHTS.healthUrgency.severityWeights.high).toBeGreaterThan(
      WEIGHTS.healthUrgency.severityWeights.medium
    );
  });

  it('maxPoints is in WEIGHTS.maxPoints', () => {
    expect(WEIGHTS.maxPoints.healthUrgency).toBe(20);
  });
});
