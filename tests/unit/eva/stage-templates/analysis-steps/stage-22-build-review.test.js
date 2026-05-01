import { describe, it, expect } from 'vitest';
import {
  analyzeStage22,
  INTEGRATION_STATUSES,
  SEVERITY_LEVELS,
  ENVIRONMENTS,
  REVIEW_DECISIONS,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-22-build-review.js';

describe('stage-22-build-review.js — contract', () => {
  it('exports analyzeStage22 as an async function', () => {
    expect(typeof analyzeStage22).toBe('function');
    expect(analyzeStage22.constructor.name).toBe('AsyncFunction');
  });

  it('exports INTEGRATION_STATUSES array', () => {
    expect(Array.isArray(INTEGRATION_STATUSES)).toBe(true);
    expect(INTEGRATION_STATUSES).toContain('pass');
    expect(INTEGRATION_STATUSES).toContain('fail');
  });

  it('exports SEVERITY_LEVELS array', () => {
    expect(Array.isArray(SEVERITY_LEVELS)).toBe(true);
    expect(SEVERITY_LEVELS).toContain('critical');
  });

  it('exports ENVIRONMENTS array', () => {
    expect(Array.isArray(ENVIRONMENTS)).toBe(true);
    expect(ENVIRONMENTS.length).toBeGreaterThan(0);
  });

  it('exports REVIEW_DECISIONS array', () => {
    expect(Array.isArray(REVIEW_DECISIONS)).toBe(true);
    expect(REVIEW_DECISIONS).toContain('approve');
  });
});
