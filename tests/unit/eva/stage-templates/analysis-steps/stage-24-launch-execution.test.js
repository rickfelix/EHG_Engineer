import { describe, it, expect } from 'vitest';
import {
  analyzeStage23,
  LAUNCH_TYPES,
  TASK_STATUSES,
  CRITERION_PRIORITIES,
  APP_STORE_STATUSES,
  DOMAIN_STATUSES,
  CHANNEL_STATUSES,
  APP_RANKING_TIERS,
  COMPETITIVE_POSITIONS,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-24-launch-execution.js';

describe('stage-24-launch-execution.js — contract', () => {
  it('exports analyzeStage23 as an async function', () => {
    expect(typeof analyzeStage23).toBe('function');
    expect(analyzeStage23.constructor.name).toBe('AsyncFunction');
  });

  it('throws when stage22Data is missing', async () => {
    await expect(analyzeStage23({ logger: { log: () => {}, warn: () => {} } }))
      .rejects.toThrow('Stage 23 launch execution requires Stage 22');
  });

  it('throws REFUSED when called with data (stub implementation)', async () => {
    await expect(analyzeStage23({ stage22Data: { releaseDecision: {} }, logger: { log: () => {} } }))
      .rejects.toThrow('[Stage23] REFUSED');
  });

  it('exports LAUNCH_TYPES array', () => {
    expect(Array.isArray(LAUNCH_TYPES)).toBe(true);
    expect(LAUNCH_TYPES).toContain('beta');
    expect(LAUNCH_TYPES).toContain('soft_launch');
  });

  it('exports TASK_STATUSES array', () => {
    expect(Array.isArray(TASK_STATUSES)).toBe(true);
    expect(TASK_STATUSES).toContain('pending');
    expect(TASK_STATUSES).toContain('done');
  });

  it('exports CRITERION_PRIORITIES array', () => {
    expect(Array.isArray(CRITERION_PRIORITIES)).toBe(true);
    expect(CRITERION_PRIORITIES).toContain('primary');
  });

  it('exports APP_STORE_STATUSES array', () => {
    expect(Array.isArray(APP_STORE_STATUSES)).toBe(true);
    expect(APP_STORE_STATUSES).toContain('live');
  });

  it('exports DOMAIN_STATUSES array', () => {
    expect(Array.isArray(DOMAIN_STATUSES)).toBe(true);
    expect(DOMAIN_STATUSES).toContain('active');
  });

  it('exports CHANNEL_STATUSES array', () => {
    expect(Array.isArray(CHANNEL_STATUSES)).toBe(true);
    expect(CHANNEL_STATUSES).toContain('live');
  });

  it('exports APP_RANKING_TIERS array', () => {
    expect(Array.isArray(APP_RANKING_TIERS)).toBe(true);
    expect(APP_RANKING_TIERS).toContain('top10');
    expect(APP_RANKING_TIERS).toContain('unknown');
  });

  it('exports COMPETITIVE_POSITIONS array', () => {
    expect(Array.isArray(COMPETITIVE_POSITIONS)).toBe(true);
    expect(COMPETITIVE_POSITIONS).toContain('leader');
    expect(COMPETITIVE_POSITIONS).toContain('unknown');
  });
});
