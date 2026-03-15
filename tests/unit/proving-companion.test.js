import { describe, it, expect } from 'vitest';
import { getStageConfig, getStageRange, getGateStages, STAGE_CONFIG } from '../../lib/proving-companion/stage-config.js';
import { analyzeGaps } from '../../lib/proving-companion/gap-analyst.js';

describe('stage-config', () => {
  it('returns config for stage 0', () => {
    const config = getStageConfig(0);
    expect(config).toBeTruthy();
    expect(config.name).toBe('Ideation');
    expect(config.filePatterns).toBeInstanceOf(Array);
    expect(config.filePatterns.length).toBeGreaterThan(0);
  });

  it('returns config for stage 25', () => {
    const config = getStageConfig(25);
    expect(config).toBeTruthy();
    expect(config.name).toBe('Stage 25');
  });

  it('returns null for invalid stage', () => {
    expect(getStageConfig(26)).toBeNull();
    expect(getStageConfig(-1)).toBeNull();
  });

  it('covers all 26 stages (0-25)', () => {
    expect(Object.keys(STAGE_CONFIG).length).toBe(26);
  });

  it('getStageRange returns correct range', () => {
    const range = getStageRange(0, 3);
    expect(Object.keys(range).length).toBe(4);
    expect(range[0]).toBeTruthy();
    expect(range[3]).toBeTruthy();
  });

  it('gate stages are correct', () => {
    expect(getGateStages()).toEqual([3, 5, 10, 22, 25]);
  });

  it('each stage has max 10 file patterns', () => {
    for (const [num, config] of Object.entries(STAGE_CONFIG)) {
      expect(config.filePatterns.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('gap-analyst', () => {
  it('identifies gaps when plan has items reality does not', () => {
    const plan = {
      0: {
        stage_name: 'Ideation',
        expected_files: ['src/pages/ventures/*', 'src/components/ventures/create*'],
        planned_capabilities: ['venture-creation'],
        success_criteria: ['Stage implementation exists']
      }
    };

    const reality = {
      0: {
        stage_name: 'Ideation',
        found_files: [],
        missing_patterns: ['src/pages/ventures/*', 'src/components/ventures/create*'],
        found_capabilities: [],
        implementation_status: 'missing',
        coverage_pct: 0
      }
    };

    const result = analyzeGaps(plan, reality);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.recommendation).toBe('fix_first');
  });

  it('recommends proceed when no gaps', () => {
    const plan = {
      0: {
        stage_name: 'Ideation',
        expected_files: ['src/pages/ventures/*'],
        planned_capabilities: [],
        success_criteria: []
      }
    };

    const reality = {
      0: {
        stage_name: 'Ideation',
        found_files: ['src/pages/ventures/index.tsx'],
        missing_patterns: [],
        found_capabilities: ['venture index'],
        implementation_status: 'complete',
        coverage_pct: 100
      }
    };

    const result = analyzeGaps(plan, reality);
    expect(result.recommendation).toBe('proceed');
  });

  it('scores severity correctly', () => {
    const plan = {
      0: {
        stage_name: 'Ideation',
        expected_files: ['missing-file'],
        planned_capabilities: [],
        success_criteria: ['Test criterion']
      }
    };

    const reality = {
      0: {
        stage_name: 'Ideation',
        found_files: [],
        missing_patterns: ['missing-file'],
        found_capabilities: [],
        implementation_status: 'missing',
        coverage_pct: 0
      }
    };

    const result = analyzeGaps(plan, reality);
    const severities = result.gaps.map(g => g.severity);
    expect(severities).toContain('blocker');
  });

  it('returns summary with severity counts', () => {
    const plan = { 0: { stage_name: 'X', expected_files: [], planned_capabilities: [], success_criteria: [] } };
    const reality = { 0: { stage_name: 'X', found_files: [], missing_patterns: [], found_capabilities: [], implementation_status: 'complete', coverage_pct: 100 } };

    const result = analyzeGaps(plan, reality);
    expect(result.summary).toBeTruthy();
    expect(result.summary.by_severity).toBeTruthy();
    expect(typeof result.summary.total).toBe('number');
  });
});
