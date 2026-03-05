/**
 * Unit tests for Stage 21 Analysis Step - Build Review
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-C
 *
 * Tests both LLM-synthesis and real-data (buildRealIntegrationData) paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import { analyzeStage21, INTEGRATION_STATUSES, SEVERITY_LEVELS, ENVIRONMENTS, REVIEW_DECISIONS } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-21-build-review.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createLLMResponse(overrides = {}) {
  const base = {
    integrations: [
      { name: 'API→DB', source: 'API', target: 'Database', status: 'pass', severity: 'high', environment: 'development', errorMessage: null },
      { name: 'Auth→API', source: 'Auth', target: 'API', status: 'pass', severity: 'critical', environment: 'staging', errorMessage: null },
    ],
    reviewDecision: {
      decision: 'approve',
      rationale: 'All integrations passing',
      conditions: [],
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

function setupMock(responseOverrides = {}) {
  const mockComplete = vi.fn().mockResolvedValue(createLLMResponse(responseOverrides));
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const STAGE20_DATA = {
  qualityDecision: { decision: 'pass' },
  overall_pass_rate: 98,
  coverage_pct: 85,
  known_defects: [],
};

const STAGE19_DATA = {
  tasks: [
    { name: 'Build API', status: 'done', sprint_item_ref: 'SD-A' },
    { name: 'Build UI', status: 'done', sprint_item_ref: 'SD-B' },
  ],
  total_tasks: 2,
  completed_tasks: 2,
};

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-21-build-review.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LLM Path', () => {
    it('should generate build review from QA data', async () => {
      setupMock();
      const result = await analyzeStage21({ stage20Data: STAGE20_DATA, logger });

      expect(result.integrations).toHaveLength(2);
      expect(result.total_integrations).toBe(2);
      expect(result.reviewDecision.decision).toBe('approve');
      expect(result.all_passing).toBe(true);
    });

    it('should throw without stage20Data', async () => {
      await expect(analyzeStage21({ logger })).rejects.toThrow('Stage 21 build review requires Stage 20');
    });

    it('should fallback to default integration when LLM returns empty', async () => {
      setupMock({ integrations: [] });
      const result = await analyzeStage21({ stage20Data: STAGE20_DATA, logger });

      expect(result.integrations).toHaveLength(1);
      expect(result.integrations[0].name).toBe('Core System Integration');
    });

    it('should normalize invalid statuses', async () => {
      setupMock({
        integrations: [{ name: 'Test', source: 'A', target: 'B', status: 'INVALID', severity: 'INVALID', environment: 'INVALID' }],
      });
      const result = await analyzeStage21({ stage20Data: STAGE20_DATA, logger });

      expect(result.integrations[0].status).toBe('pending');
      expect(result.integrations[0].severity).toBe('medium');
      expect(result.integrations[0].environment).toBe('development');
    });

    it('should set errorMessage only for fail status', async () => {
      setupMock({
        integrations: [
          { name: 'OK', source: 'A', target: 'B', status: 'pass', severity: 'low', environment: 'development', errorMessage: 'Should be null' },
          { name: 'BAD', source: 'C', target: 'D', status: 'fail', severity: 'high', environment: 'development', errorMessage: 'Connection refused' },
        ],
      });
      const result = await analyzeStage21({ stage20Data: STAGE20_DATA, logger });

      expect(result.integrations[0].errorMessage).toBeNull();
      expect(result.integrations[1].errorMessage).toBe('Connection refused');
    });
  });

  describe('Real Data Path (buildRealIntegrationData)', () => {
    it('should use real data when both upstream stages have venture_stage_work source', async () => {
      const stage19Real = { ...STAGE19_DATA, dataSource: 'venture_stage_work' };
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };

      const result = await analyzeStage21({
        stage20Data: stage20Real,
        stage19Data: stage19Real,
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.integrations).toHaveLength(2);
      expect(result.integrations[0].status).toBe('pass'); // done → pass
      expect(result.reviewDecision.decision).toBe('approve'); // all passing + QA pass
      expect(result.llmFallbackCount).toBe(0);
    });

    it('should map blocked tasks to fail integrations', async () => {
      const stage19Real = {
        tasks: [
          { name: 'Done Task', status: 'done', sprint_item_ref: 'SD-A' },
          { name: 'Blocked Task', status: 'blocked', sprint_item_ref: 'SD-B' },
        ],
        dataSource: 'venture_stage_work',
      };
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };

      const result = await analyzeStage21({
        stage20Data: stage20Real,
        stage19Data: stage19Real,
        logger,
      });

      expect(result.integrations[1].status).toBe('fail');
      expect(result.integrations[1].errorMessage).toContain('Task blocked');
      expect(result.reviewDecision.decision).toBe('conditional'); // has failures
      expect(result.failing_integrations).toHaveLength(1);
    });

    it('should reject when QA fails', async () => {
      const stage19Real = {
        tasks: [{ name: 'T1', status: 'done', sprint_item_ref: 'SD-A' }],
        dataSource: 'venture_stage_work',
      };
      const stage20Real = {
        ...STAGE20_DATA,
        qualityDecision: { decision: 'fail' },
        dataSource: 'venture_stage_work',
      };

      const result = await analyzeStage21({
        stage20Data: stage20Real,
        stage19Data: stage19Real,
        logger,
      });

      expect(result.reviewDecision.decision).toBe('reject');
    });

    it('should fall back to LLM when only stage20 uses real data', async () => {
      setupMock();
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };
      // stage19 has no dataSource

      const result = await analyzeStage21({
        stage20Data: stage20Real,
        stage19Data: STAGE19_DATA,
        logger,
      });

      // Should use LLM since stage19 doesn't have dataSource
      expect(result.dataSource).toBeUndefined();
    });

    it('should return null and fall back when tasks array is empty', async () => {
      setupMock();
      const stage19Real = { tasks: [], dataSource: 'venture_stage_work' };
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };

      const result = await analyzeStage21({
        stage20Data: stage20Real,
        stage19Data: stage19Real,
        logger,
      });

      // buildRealIntegrationData returns null for empty tasks → falls back to LLM
      expect(result.dataSource).toBeUndefined();
    });
  });

  describe('Constants', () => {
    it('should export correct constants', () => {
      expect(INTEGRATION_STATUSES).toEqual(['pass', 'fail', 'skip', 'pending']);
      expect(REVIEW_DECISIONS).toEqual(['approve', 'conditional', 'reject']);
      expect(SEVERITY_LEVELS).toContain('critical');
      expect(ENVIRONMENTS).toContain('production');
    });
  });
});
