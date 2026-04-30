import { describe, it, expect } from 'vitest';
import {
  analyzeStage21,
  QUALITY_DECISIONS,
  TEST_SUITE_TYPES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  MIN_PASS_RATE,
  MIN_COVERAGE_PCT,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js';

describe('stage-21-quality-assurance.js — contract', () => {
  it('exports analyzeStage21 as an async function', () => {
    expect(typeof analyzeStage21).toBe('function');
    expect(analyzeStage21.constructor.name).toBe('AsyncFunction');
  });

  it('exports QUALITY_DECISIONS array', () => {
    expect(Array.isArray(QUALITY_DECISIONS)).toBe(true);
    expect(QUALITY_DECISIONS.length).toBeGreaterThan(0);
  });

  it('exports TEST_SUITE_TYPES array', () => {
    expect(Array.isArray(TEST_SUITE_TYPES)).toBe(true);
    expect(TEST_SUITE_TYPES).toContain('unit');
  });

  it('exports DEFECT_SEVERITIES array', () => {
    expect(Array.isArray(DEFECT_SEVERITIES)).toBe(true);
    expect(DEFECT_SEVERITIES).toContain('critical');
  });

  it('exports DEFECT_STATUSES array', () => {
    expect(Array.isArray(DEFECT_STATUSES)).toBe(true);
    expect(DEFECT_STATUSES).toContain('open');
  });

  it('exports numeric threshold constants', () => {
    expect(typeof MIN_PASS_RATE).toBe('number');
    expect(typeof MIN_COVERAGE_PCT).toBe('number');
  });
});
