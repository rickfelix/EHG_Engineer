/**
 * Tests for Pattern Discovery Agent
 * SD-AUTOMATED-PROVING-RUN-ENGINE-ORCH-001-B
 */

import { describe, it, expect } from 'vitest';
import { loadStageMap, getGateStages } from '../../../scripts/proving-run/pattern-discovery/stage-mapper.js';

describe('Pattern Discovery - Stage Mapper', () => {
  it('loads all 17 stages', () => {
    const { stages, maxStage } = loadStageMap();
    expect(maxStage).toBe(17);
    expect(Object.keys(stages).length).toBe(17);
  });

  it('stage 1 has correct structure', () => {
    const { stages } = loadStageMap();
    const s1 = stages[1];
    expect(s1.name).toBe('Draft Idea');
    expect(s1.phase).toBe('THE_TRUTH');
    expect(s1.gateType).toBe(null);
    expect(s1.dimensions).toBeDefined();
    expect(s1.dimensions.code).toBeDefined();
    expect(s1.dimensions.db).toBeDefined();
    expect(s1.dimensions.service).toBeDefined();
    expect(s1.dimensions.tests).toBeDefined();
    expect(s1.dimensions.artifacts).toBeDefined();
  });

  it('identifies kill gate stages', () => {
    const { stages } = loadStageMap();
    const killGates = Object.values(stages)
      .filter(s => s.gateType === 'kill')
      .map(s => s.stageNumber);
    expect(killGates).toContain(3);
    expect(killGates).toContain(5);
    expect(killGates).toContain(13);
  });

  it('getGateStages returns categorized stages', () => {
    const gates = getGateStages();
    expect(gates.kill.length).toBeGreaterThan(0);
    expect(gates.regular.length).toBeGreaterThan(0);
    expect(gates.kill).toContain(3);
  });

  it('each stage has app and engineer paths', () => {
    const { stages } = loadStageMap();
    for (const stage of Object.values(stages)) {
      expect(stage.app).toBeDefined();
      expect(stage.engineer).toBeDefined();
      expect(stage.app.filePatterns).toBeInstanceOf(Array);
      expect(stage.engineer.serviceScripts).toBeInstanceOf(Array);
    }
  });
});

describe('Pattern Discovery - Pattern Classifier', () => {
  it('classifyPatterns returns expected structure', async () => {
    const { classifyPatterns } = await import('../../../scripts/proving-run/pattern-discovery/pattern-classifier.js');

    const mockAnalysis = {
      1: { code: { found: ['test.tsx'] }, db: { found: ['migration.sql'] }, service: { found: [] }, tests: { found: ['test.spec.ts'] } },
    };
    const mockFiles = [
      { relativePath: 'database/migrations/create_stage1.sql' },
      { relativePath: 'scripts/mapper-service.js' },
      { relativePath: 'tests/stage1.test.js' },
    ];

    const result = classifyPatterns(mockAnalysis, mockFiles);
    expect(result.templates).toBeInstanceOf(Array);
    expect(result.coverageMatrix).toBeDefined();
    expect(result.summary.totalCategories).toBe(5);
  });
});

describe('Pattern Discovery - Output Formatter', () => {
  it('formatOutput produces valid structure', async () => {
    const { formatOutput } = await import('../../../scripts/proving-run/pattern-discovery/output-formatter.js');

    const result = formatOutput({
      stageMap: { 1: { name: 'Draft Idea', phase: 'THE_TRUTH', gateType: null, workType: 'artifact_only', requiredArtifacts: ['idea_brief'] } },
      gitHistory: { 1: { engineer: { commitCount: 5, patterns: {} }, app: { commitCount: 3, patterns: {} } } },
      codebaseAnalysis: { 1: { code: { found: [], count: 0 }, db: { found: [], count: 0 }, service: { found: [], count: 0 }, tests: { found: [], count: 0 }, coverage: { code: false, db: false, service: false, tests: false, artifacts: true }, coveredDimensions: 1, coveragePercent: 20 } },
      patternClassification: { templates: [], coverageMatrix: {}, summary: { activeCategories: 0, totalReferenceFiles: 0 } },
      durationMs: 100,
    });

    expect(result.version).toBe('1.0.0');
    expect(result.maxStage).toBe(17);
    expect(result.stageReferences[1]).toBeDefined();
    expect(result.stageReferences[1].name).toBe('Draft Idea');
    expect(result.summary.stagesScanned).toBe(1);
  });
});
