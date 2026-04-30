import { describe, it, expect } from 'vitest';
import {
  analyzeStage20,
  TASK_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  PASS_RATE_THRESHOLD,
  COVERAGE_THRESHOLD,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-20-build-execution.js';

describe('stage-20-build-execution.js — contract', () => {
  it('exports analyzeStage20 as an async function', () => {
    expect(typeof analyzeStage20).toBe('function');
    expect(analyzeStage20.constructor.name).toBe('AsyncFunction');
  });

  it('throws when stage19Data is missing', async () => {
    await expect(analyzeStage20({ logger: { log: () => {}, warn: () => {} } }))
      .rejects.toThrow('Stage 20 build execution requires Stage 19');
  });

  it('exports TASK_STATUSES containing expected values', () => {
    expect(Array.isArray(TASK_STATUSES)).toBe(true);
    expect(TASK_STATUSES).toContain('done');
    expect(TASK_STATUSES).toContain('pending');
    expect(TASK_STATUSES).toContain('blocked');
  });

  it('exports ISSUE_SEVERITIES containing expected values', () => {
    expect(Array.isArray(ISSUE_SEVERITIES)).toBe(true);
    expect(ISSUE_SEVERITIES).toContain('critical');
    expect(ISSUE_SEVERITIES).toContain('high');
  });

  it('exports ISSUE_STATUSES containing expected values', () => {
    expect(Array.isArray(ISSUE_STATUSES)).toBe(true);
    expect(ISSUE_STATUSES).toContain('open');
    expect(ISSUE_STATUSES).toContain('resolved');
  });

  it('exports numeric threshold constants', () => {
    expect(typeof PASS_RATE_THRESHOLD).toBe('number');
    expect(typeof COVERAGE_THRESHOLD).toBe('number');
  });
});
