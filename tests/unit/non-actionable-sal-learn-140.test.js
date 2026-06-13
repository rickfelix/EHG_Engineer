/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-140 — suppress 3 advisory-noise SAL patterns from /learn.
 * Binds to the real exported isNonActionableRecommendation so a regex revert is caught.
 */
import { describe, it, expect } from 'vitest';
import { isNonActionableRecommendation } from '../../scripts/modules/learning/context-builder.js';

describe('SAL-PERFORMANCE-REC (healthy-profile boilerplate, 9x)', () => {
  it('suppresses the PERFORMANCE advisory recommendations', () => {
    expect(isNonActionableRecommendation('Performance profile is healthy')).toBe(true);
    expect(isNonActionableRecommendation('Continue monitoring performance metrics')).toBe(true);
    expect(isNonActionableRecommendation('Consider performance budgets for future features')).toBe(true);
  });
});

describe('SAL-VALIDATION-REC (generic process recommendations, 12x)', () => {
  it('suppresses the VALIDATION advisory recommendations', () => {
    expect(isNonActionableRecommendation('Link backlog items to define clear requirements OR document reason for no backlog')).toBe(true);
    expect(isNonActionableRecommendation('Perform codebase search to identify existing infrastructure (prevents duplicate work)')).toBe(true);
    expect(isNonActionableRecommendation('Complete gap analysis: Compare backlog requirements vs existing code')).toBe(true);
  });
});

describe('SAL-VALIDATION-ISS (TESTING/QA BLOCKED verdict re-surfaced, 3x)', () => {
  it('suppresses the meta-issue of a QA/TESTING BLOCKED verdict', () => {
    expect(isNonActionableRecommendation('QA Engineering Director found BLOCKING issues')).toBe(true);
    // also matches the JSON-ish detail the pattern detector aggregated
    expect(isNonActionableRecommendation('{"issue":"QA Engineering Director found BLOCKING issues","verdict":"BLOCKED"}')).toBe(true);
  });
});

describe('does NOT over-suppress genuinely actionable text', () => {
  it('keeps a real defect/recommendation actionable', () => {
    expect(isNonActionableRecommendation('Fix the SQL injection in the login handler')).toBe(false);
    expect(isNonActionableRecommendation('Add a NOT NULL constraint to ventures.kill_log')).toBe(false);
    expect(isNonActionableRecommendation('Performance regression: p95 latency rose 40% after the migration')).toBe(false);
    expect(isNonActionableRecommendation('Backlog item BL-12 contradicts AC-3 — reconcile')).toBe(false);
  });

  it('fails safe on empty/garbage input', () => {
    expect(isNonActionableRecommendation(null)).toBe(false);
    expect(isNonActionableRecommendation(undefined)).toBe(false);
    expect(isNonActionableRecommendation('')).toBe(false);
    expect(isNonActionableRecommendation(42)).toBe(false);
  });
});
