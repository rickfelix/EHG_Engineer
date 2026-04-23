/**
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 3:
 *   Unit tests for dedupMetrics + validateStrategicDirective metrics path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  dedupMetrics,
  validateStrategicDirective,
  SD_REQUIREMENTS
} from '../../scripts/modules/handoff/verifiers/lead-to-plan/sd-validation.js';

function baseSd(overrides = {}) {
  return {
    title: 'T',
    description: 'd'.repeat(50),
    scope: 'scope text',
    strategic_objectives: 'a'.repeat(120),
    key_principles: ['p1'],
    risks: [],
    priority: 'medium',
    ...overrides
  };
}

describe('dedupMetrics', () => {
  it('returns non-array input unchanged', () => {
    expect(dedupMetrics(null)).toBe(null);
    expect(dedupMetrics(undefined)).toBe(undefined);
    expect(dedupMetrics('not an array')).toBe('not an array');
    expect(dedupMetrics({ a: 1 })).toEqual({ a: 1 });
  });

  it('returns input unchanged when FLEET_METRICS_DEDUP=false', () => {
    const prior = process.env.FLEET_METRICS_DEDUP;
    process.env.FLEET_METRICS_DEDUP = 'false';
    try {
      const dupes = [{ metric: 'X' }, { metric: 'X' }, { metric: 'X' }];
      const result = dedupMetrics(dupes);
      expect(result).toBe(dupes);
    } finally {
      if (prior === undefined) delete process.env.FLEET_METRICS_DEDUP;
      else process.env.FLEET_METRICS_DEDUP = prior;
    }
  });

  it('collapses identical object entries to 1 unique', () => {
    const dupes = [
      { metric: 'Coverage', target: '>=90%', measurement: 'vitest --coverage' },
      { metric: 'Coverage', target: '>=90%', measurement: 'vitest --coverage' },
      { metric: 'Coverage', target: '>=90%', measurement: 'vitest --coverage' }
    ];
    expect(dedupMetrics(dupes)).toHaveLength(1);
  });

  it('keeps distinct objects', () => {
    const distinct = [
      { metric: 'Coverage', target: '>=90%', measurement: 'vitest --coverage' },
      { metric: 'Latency', target: '<50ms p95', measurement: 'EXPLAIN ANALYZE' },
      { metric: 'Fracture rate', target: '0 per day', measurement: 'claude_sessions query' }
    ];
    expect(dedupMetrics(distinct)).toHaveLength(3);
  });

  it('ignores non-identity fields (owner) when computing uniqueness', () => {
    const sameIdentity = [
      { metric: 'X', target: 'T', measurement: 'M', owner: 'team A' },
      { metric: 'X', target: 'T', measurement: 'M', owner: 'team B' }
    ];
    expect(dedupMetrics(sameIdentity)).toHaveLength(1);
  });

  it('accepts success_criteria shape (criterion/measure/goal) as identity fields', () => {
    const criteriaDupes = [
      { criterion: 'Tests pass', measure: 'CI green', goal: 'PASS' },
      { criterion: 'Tests pass', measure: 'CI green', goal: 'PASS' }
    ];
    expect(dedupMetrics(criteriaDupes)).toHaveLength(1);
  });

  it('treats string entries as unique by full JSON form', () => {
    expect(dedupMetrics(['a', 'a', 'b', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves first-seen order of unique entries', () => {
    const input = [
      { metric: 'A' },
      { metric: 'B' },
      { metric: 'A' },
      { metric: 'C' }
    ];
    expect(dedupMetrics(input)).toEqual([
      { metric: 'A' },
      { metric: 'B' },
      { metric: 'C' }
    ]);
  });
});

describe('validateStrategicDirective metrics sufficiency', () => {
  afterEach(() => {
    // Ensure env flag does not leak between tests.
    delete process.env.FLEET_METRICS_DEDUP;
  });

  it('PASSES when 3 distinct metrics are provided', () => {
    const sd = baseSd({
      success_metrics: [
        { metric: 'A', target: '1', measurement: 'x' },
        { metric: 'B', target: '2', measurement: 'y' },
        { metric: 'C', target: '3', measurement: 'z' }
      ]
    });
    const result = validateStrategicDirective(sd);
    expect(result.valid).toBe(true);
    const anyInsufficient = result.errors.some(e => e.includes('Insufficient success_metrics'));
    expect(anyInsufficient).toBe(false);
  });

  it('FAILS with "1/3 unique" when 3 literal-duplicate metrics are provided', () => {
    const sd = baseSd({
      success_metrics: [
        { metric: 'X', target: 'T', measurement: 'M' },
        { metric: 'X', target: 'T', measurement: 'M' },
        { metric: 'X', target: 'T', measurement: 'M' }
      ]
    });
    const result = validateStrategicDirective(sd);
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.includes('Insufficient success_metrics'));
    expect(err).toBeDefined();
    expect(err).toContain(`1/${SD_REQUIREMENTS.minimumMetrics}`);
    expect(err).toContain('collapsed');
  });

  it('PASSES with dedup warning when 4 entries collapse to 3 unique', () => {
    const sd = baseSd({
      success_metrics: [
        { metric: 'A', target: '1', measurement: 'x' },
        { metric: 'A', target: '1', measurement: 'x' }, // duplicate of first
        { metric: 'B', target: '2', measurement: 'y' },
        { metric: 'C', target: '3', measurement: 'z' }
      ]
    });
    const result = validateStrategicDirective(sd);
    expect(result.valid).toBe(true);
    const warn = result.warnings.find(w => w.includes('Dedup collapsed'));
    expect(warn).toBeDefined();
    expect(warn).toContain('1 duplicate');
  });

  it('FAILS when only 2 unique metrics even if 3 total entries', () => {
    const sd = baseSd({
      success_metrics: [
        { metric: 'A', target: '1', measurement: 'x' },
        { metric: 'B', target: '2', measurement: 'y' },
        { metric: 'A', target: '1', measurement: 'x' } // dup of first
      ]
    });
    const result = validateStrategicDirective(sd);
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.includes('Insufficient success_metrics'));
    expect(err).toContain(`2/${SD_REQUIREMENTS.minimumMetrics}`);
  });

  it('when dedup disabled, 3 literal-duplicate metrics pass (legacy behavior)', () => {
    process.env.FLEET_METRICS_DEDUP = 'false';
    const sd = baseSd({
      success_metrics: [
        { metric: 'X', target: 'T', measurement: 'M' },
        { metric: 'X', target: 'T', measurement: 'M' },
        { metric: 'X', target: 'T', measurement: 'M' }
      ]
    });
    const result = validateStrategicDirective(sd);
    // With flag off, legacy behavior: 3 entries counts as 3.
    const err = result.errors.find(e => e.includes('Insufficient success_metrics'));
    expect(err).toBeUndefined();
  });
});
