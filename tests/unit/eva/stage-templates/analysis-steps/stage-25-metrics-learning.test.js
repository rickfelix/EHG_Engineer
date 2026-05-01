import { describe, it, expect } from 'vitest';
import {
  analyzeStage24,
  AARRR_CATEGORIES,
  TREND_DIRECTIONS,
  OUTCOME_ASSESSMENTS,
  IMPACT_LEVELS,
  EXPERIMENT_STATUSES,
  EXPERIMENT_OUTCOMES,
  COHORT_PERIODS,
  ENGAGEMENT_LEVELS,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-25-metrics-learning.js';

describe('stage-25-metrics-learning.js — contract', () => {
  it('exports analyzeStage24 as an async function', () => {
    expect(typeof analyzeStage24).toBe('function');
    expect(analyzeStage24.constructor.name).toBe('AsyncFunction');
  });

  it('throws when stage23Data is missing', async () => {
    await expect(analyzeStage24({ logger: { log: () => {}, warn: () => {} } }))
      .rejects.toThrow('Stage 24 metrics & learning requires Stage 23');
  });

  it('throws REFUSED when called with data (stub implementation)', async () => {
    await expect(analyzeStage24({ stage23Data: { launchType: 'beta' }, logger: { log: () => {} } }))
      .rejects.toThrow('[Stage25] REFUSED');
  });

  it('exports AARRR_CATEGORIES array', () => {
    expect(Array.isArray(AARRR_CATEGORIES)).toBe(true);
    expect(AARRR_CATEGORIES).toContain('acquisition');
    expect(AARRR_CATEGORIES).toContain('retention');
  });

  it('exports TREND_DIRECTIONS array', () => {
    expect(Array.isArray(TREND_DIRECTIONS)).toBe(true);
    expect(TREND_DIRECTIONS).toContain('up');
    expect(TREND_DIRECTIONS).toContain('down');
  });

  it('exports OUTCOME_ASSESSMENTS array', () => {
    expect(Array.isArray(OUTCOME_ASSESSMENTS)).toBe(true);
    expect(OUTCOME_ASSESSMENTS).toContain('success');
    expect(OUTCOME_ASSESSMENTS).toContain('failure');
  });

  it('exports IMPACT_LEVELS array', () => {
    expect(Array.isArray(IMPACT_LEVELS)).toBe(true);
    expect(IMPACT_LEVELS).toContain('high');
    expect(IMPACT_LEVELS).toContain('low');
  });

  it('exports EXPERIMENT_STATUSES array', () => {
    expect(Array.isArray(EXPERIMENT_STATUSES)).toBe(true);
    expect(EXPERIMENT_STATUSES).toContain('running');
    expect(EXPERIMENT_STATUSES).toContain('concluded');
  });

  it('exports EXPERIMENT_OUTCOMES array', () => {
    expect(Array.isArray(EXPERIMENT_OUTCOMES)).toBe(true);
    expect(EXPERIMENT_OUTCOMES).toContain('positive');
    expect(EXPERIMENT_OUTCOMES).toContain('negative');
  });

  it('exports COHORT_PERIODS array', () => {
    expect(Array.isArray(COHORT_PERIODS)).toBe(true);
    expect(COHORT_PERIODS).toContain('day_1');
    expect(COHORT_PERIODS).toContain('day_30');
  });

  it('exports ENGAGEMENT_LEVELS array', () => {
    expect(Array.isArray(ENGAGEMENT_LEVELS)).toBe(true);
    expect(ENGAGEMENT_LEVELS).toContain('highly_engaged');
    expect(ENGAGEMENT_LEVELS).toContain('churned');
  });
});
