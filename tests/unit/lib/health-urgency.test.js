import { describe, it, expect, beforeAll } from 'vitest';
import { calculateHealthUrgency, calculatePriorityScore, WEIGHTS } from '../../../scripts/lib/priority-scorer.js';

describe('Health Urgency Scoring (priority-scorer)', () => {
  it('should return 0 when no health data provided', () => {
    expect(calculateHealthUrgency()).toBe(0);
    expect(calculateHealthUrgency({})).toBe(0);
    expect(calculateHealthUrgency({ finding_count: 0 })).toBe(0);
  });

  it('should score critical findings higher than warnings', () => {
    const criticalData = {
      finding_count: 5,
      severity_distribution: { critical: 5, high: 0, medium: 0, info: 0 },
      oldest_finding_days: 0,
      dimension_score: 50
    };
    const warningData = {
      finding_count: 5,
      severity_distribution: { critical: 0, high: 5, medium: 0, info: 0 },
      oldest_finding_days: 0,
      dimension_score: 50
    };

    const criticalScore = calculateHealthUrgency(criticalData);
    const warningScore = calculateHealthUrgency(warningData);

    expect(criticalScore).toBeGreaterThan(warningScore);
    expect(criticalScore).toBeGreaterThan(0);
    expect(warningScore).toBeGreaterThan(0);
  });

  it('should increase urgency with finding age (staleness)', () => {
    const freshData = {
      finding_count: 3,
      severity_distribution: { critical: 1, high: 1, medium: 1, info: 0 },
      oldest_finding_days: 1,
      dimension_score: 60
    };
    const staleData = {
      ...freshData,
      oldest_finding_days: 10
    };

    const freshScore = calculateHealthUrgency(freshData);
    const staleScore = calculateHealthUrgency(staleData);

    expect(staleScore).toBeGreaterThan(freshScore);
  });

  it('should cap at max_points', () => {
    const extremeData = {
      finding_count: 100,
      severity_distribution: { critical: 50, high: 30, medium: 15, info: 5 },
      oldest_finding_days: 30,
      dimension_score: 10
    };

    const score = calculateHealthUrgency(extremeData);
    expect(score).toBeLessThanOrEqual(WEIGHTS.healthUrgency.defaultWeight);
  });

  it('should respect custom max_points config', () => {
    const data = {
      finding_count: 10,
      severity_distribution: { critical: 5, high: 3, medium: 2, info: 0 },
      oldest_finding_days: 5,
      dimension_score: 30
    };

    const score10 = calculateHealthUrgency(data, { max_points: 10 });
    const score30 = calculateHealthUrgency(data, { max_points: 30 });

    expect(score10).toBeLessThanOrEqual(10);
    expect(score30).toBeLessThanOrEqual(30);
  });

  it('should return 0 when finding_count is 0 even with low dimension score', () => {
    const healthyData = {
      finding_count: 0,
      severity_distribution: { critical: 0, high: 0, medium: 0, info: 0 },
      oldest_finding_days: 0,
      dimension_score: 100
    };

    expect(calculateHealthUrgency(healthyData)).toBe(0);
  });
});

describe('Health Urgency in Priority Scorer Integration', () => {
  it('should include healthUrgency in breakdown', () => {
    const sd = { priority: 'medium', sd_type: 'infrastructure' };
    const result = calculatePriorityScore(sd, [], {}, { healthUrgency: 15 });

    expect(result.healthUrgency).toBe(15);
    expect(result.details.healthUrgency).toContain('15.0 pts');
    expect(result.total).toBeGreaterThan(0);
  });

  it('should cap healthUrgency at max points', () => {
    const sd = { priority: 'medium', sd_type: 'feature' };
    const result = calculatePriorityScore(sd, [], {}, { healthUrgency: 100 });

    expect(result.healthUrgency).toBe(WEIGHTS.maxPoints.healthUrgency);
  });

  it('should show none when no health urgency provided', () => {
    const sd = { priority: 'high', sd_type: 'feature' };
    const result = calculatePriorityScore(sd, [], {}, {});

    expect(result.healthUrgency).toBe(0);
    expect(result.details.healthUrgency).toBe('none');
  });

  it('should add health urgency to total score', () => {
    const sd = { priority: 'medium', sd_type: 'infrastructure' };
    const withoutHealth = calculatePriorityScore(sd, [], {}, {});
    const withHealth = calculatePriorityScore(sd, [], {}, { healthUrgency: 15 });

    expect(withHealth.total).toBe(withoutHealth.total + 15);
  });
});

describe('isHealthDerivedSD', () => {
  let isHealthDerivedSD;

  beforeAll(async () => {
    const mod = await import('../../../scripts/lib/health-urgency.js');
    isHealthDerivedSD = mod.isHealthDerivedSD;
  });

  it('should detect health origin in metadata', () => {
    expect(isHealthDerivedSD({ metadata: { origin: 'codebase_health' } })).toBe(true);
    expect(isHealthDerivedSD({ metadata: { source: 'health_scan' } })).toBe(true);
  });

  it('should detect health capabilities', () => {
    const sd = {
      delivers_capabilities: [
        { capability_type: 'quality_gate', capability_key: 'health-scanner', name: 'Health Scanner' }
      ]
    };
    expect(isHealthDerivedSD(sd)).toBe(true);
  });

  it('should detect health title keywords', () => {
    expect(isHealthDerivedSD({ title: 'Health degradation: complexity at 40/100' })).toBe(true);
    expect(isHealthDerivedSD({ title: 'Implement new feature' })).toBe(false);
  });

  it('should return false for non-health SDs', () => {
    expect(isHealthDerivedSD({ title: 'Add login button', metadata: {} })).toBe(false);
    expect(isHealthDerivedSD({})).toBe(false);
  });
});
