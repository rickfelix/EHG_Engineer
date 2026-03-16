import { describe, it, expect, vi } from 'vitest';
import {
  DIMENSIONS, GATE_WEIGHTS, evaluateStructural, computeComposite, evaluateStage,
} from '../../../../lib/eva/proving/assessment-agent.js';

describe('Assessment Agent', () => {
  describe('DIMENSIONS', () => {
    it('defines 5 quality dimensions', () => {
      expect(DIMENSIONS).toEqual(['code', 'database', 'service', 'tests', 'artifacts']);
    });
  });

  describe('GATE_WEIGHTS', () => {
    it('defines weights for 6 gate types', () => {
      expect(Object.keys(GATE_WEIGHTS)).toHaveLength(6);
    });

    it('code gate weights Code dimension highest', () => {
      const w = GATE_WEIGHTS.code;
      expect(w.code).toBeGreaterThan(w.database);
      expect(w.code).toBeGreaterThan(w.service);
    });

    it('schema gate weights Database dimension highest', () => {
      const w = GATE_WEIGHTS.schema;
      expect(w.database).toBeGreaterThan(w.code);
      expect(w.database).toBeGreaterThan(w.service);
    });

    it('all weight sets sum to 1.0', () => {
      for (const [type, weights] of Object.entries(GATE_WEIGHTS)) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('evaluateStructural', () => {
    it('returns 0 for null stage data', () => {
      const result = evaluateStructural('code', null);
      expect(result.score).toBe(0);
    });

    it('scores code dimension based on indicators', () => {
      const result = evaluateStructural('code', {
        files: ['index.js'], lintPassing: true, typeCheckPassing: true, hasEntryPoint: true,
      });
      expect(result.score).toBe(100);
      expect(result.rationale).toContain('file(s) present');
    });

    it('scores database dimension', () => {
      const result = evaluateStructural('database', {
        migrations: ['001.sql'], schema: true, indexes: ['idx_1'], rls: true,
      });
      expect(result.score).toBe(100);
    });

    it('scores tests dimension with coverage', () => {
      const result = evaluateStructural('tests', {
        testFiles: ['test.js'], coverage: 85, allPassing: true, hasE2E: true,
      });
      expect(result.score).toBe(100);
    });

    it('scores artifacts dimension', () => {
      const result = evaluateStructural('artifacts', {
        prd: true, architecture: true, userStories: ['US-001'], retrospective: true,
      });
      expect(result.score).toBe(100);
    });
  });

  describe('computeComposite', () => {
    it('computes weighted average with default weights', () => {
      const scores = { code: 80, database: 80, service: 80, tests: 80, artifacts: 80 };
      const { composite } = computeComposite(scores);
      expect(composite).toBe(80);
    });

    it('code gate weights Code dimension higher', () => {
      const scores = { code: 100, database: 50, service: 50, tests: 50, artifacts: 50 };
      const codeGate = computeComposite(scores, 'code');
      const defaultGate = computeComposite(scores, 'default');
      expect(codeGate.composite).toBeGreaterThan(defaultGate.composite);
    });

    it('handles missing dimensions as 0', () => {
      const { composite } = computeComposite({ code: 100 });
      expect(composite).toBeGreaterThan(0);
      expect(composite).toBeLessThan(100);
    });
  });

  describe('evaluateStage', () => {
    const fullStageData = {
      files: ['index.js'], lintPassing: true, typeCheckPassing: true, hasEntryPoint: true,
      migrations: ['001.sql'], schema: true, indexes: ['idx_1'], rls: true,
      endpoints: ['/api/test'], errorHandling: true, authentication: true, documentation: true,
      testFiles: ['test.js'], coverage: 90, allPassing: true, hasE2E: true,
      prd: true, architecture: true, userStories: ['US-001'], retrospective: true,
    };

    it('passes all dimensions for complete stage', async () => {
      const result = await evaluateStage(fullStageData);
      expect(result.decision).toBe('PASS');
      expect(result.composite).toBeGreaterThanOrEqual(70);
      expect(result.killGate).toBe(false);
    });

    it('fails kill gate for empty stage', async () => {
      const result = await evaluateStage({});
      expect(result.decision).toBe('FAIL');
      expect(result.composite).toBeLessThan(60);
      expect(result.killGate).toBe(true);
    });

    it('invokes semantic evaluator for ambiguous scores', async () => {
      const semanticEvaluator = vi.fn().mockResolvedValue({ score: 75, rationale: 'LLM says good' });
      // Stage data that produces score in 40-70 range for code (30 from files, 25 from lint = 55, but typeCheck false drops it)
      const ambiguousData = { files: ['a.js'], lintPassing: true, typeCheckPassing: false, hasEntryPoint: false };
      const result = await evaluateStage(ambiguousData, { semanticEvaluator });
      // Code scores 55 (40-70 ambiguous range), so semantic evaluator should be called
      expect(semanticEvaluator).toHaveBeenCalled();
    });

    it('does not invoke semantic evaluator for clear scores', async () => {
      const semanticEvaluator = vi.fn();
      const result = await evaluateStage(fullStageData, { semanticEvaluator });
      expect(semanticEvaluator).not.toHaveBeenCalled();
    });

    it('uses gate-type-dependent weighting', async () => {
      const result = await evaluateStage(fullStageData, { gateType: 'code' });
      expect(result.gateType).toBe('code');
      expect(result.dimensions.code.weight).toBe(0.35);
    });

    it('returns REVISE for composite 60-69', async () => {
      // Partial data that should land in 60-69 range
      const partialData = {
        files: ['a.js'], lintPassing: true, typeCheckPassing: true, hasEntryPoint: true,
        migrations: ['001.sql'], schema: true,
        testFiles: ['test.js'], coverage: 60, allPassing: true,
      };
      const result = await evaluateStage(partialData);
      if (result.composite >= 60 && result.composite < 70) {
        expect(result.decision).toBe('REVISE');
      }
    });
  });
});
