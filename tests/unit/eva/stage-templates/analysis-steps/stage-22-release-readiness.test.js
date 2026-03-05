/**
 * Unit tests for Stage 22 Analysis Step - Release Readiness
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-C
 *
 * Tests both LLM-synthesis and real-data (buildRealReleaseData) paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

vi.mock('../../../../../lib/eva/stage-templates/stage-22.js', () => ({
  evaluatePromotionGate: vi.fn(() => ({
    passed: true,
    score: 85,
    dimensions: [],
  })),
}));

import { analyzeStage22, RELEASE_DECISIONS, RELEASE_CATEGORIES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-22-release-readiness.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createLLMResponse(overrides = {}) {
  const base = {
    releaseItems: [
      { name: 'Feature A', category: 'feature', status: 'approved', approver: 'PO' },
    ],
    releaseNotes: 'Sprint delivered core features successfully.',
    targetDate: '2026-04-01',
    releaseDecision: {
      decision: 'release',
      rationale: 'QA and review passed',
      approver: 'Product Owner',
    },
    sprintRetrospective: {
      wentWell: ['Velocity met target'],
      wentPoorly: ['Documentation gaps'],
      actionItems: ['Improve docs coverage'],
    },
    sprintSummary: {
      sprintGoal: 'Ship MVP',
      itemsPlanned: 5,
      itemsCompleted: 4,
      qualityAssessment: '95% pass rate',
      integrationStatus: '3/3 integrations passing',
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
};

const STAGE21_DATA = {
  reviewDecision: { decision: 'approve' },
  passing_integrations: 3,
  total_integrations: 3,
};

const STAGE19_DATA = {
  tasks: [
    { name: 'T1', status: 'done' },
    { name: 'T2', status: 'done' },
    { name: 'T3', status: 'blocked' },
  ],
  total_tasks: 3,
  completed_tasks: 2,
  blocked_tasks: 1,
};

const STAGE18_DATA = {
  sprint_goal: 'Ship MVP',
  total_items: 3,
};

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-22-release-readiness.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LLM Path', () => {
    it('should generate release readiness assessment', async () => {
      setupMock();
      const result = await analyzeStage22({
        stage20Data: STAGE20_DATA,
        stage21Data: STAGE21_DATA,
        logger,
      });

      expect(result.release_items).toHaveLength(1);
      expect(result.releaseDecision.decision).toBe('release');
      expect(result.sprintRetrospective.wentWell).toHaveLength(1);
      expect(result.promotion_gate).toBeDefined();
    });

    it('should throw without stage20Data or stage21Data', async () => {
      await expect(analyzeStage22({ stage21Data: STAGE21_DATA, logger }))
        .rejects.toThrow('Stage 22 release readiness requires Stage 20');
      await expect(analyzeStage22({ stage20Data: STAGE20_DATA, logger }))
        .rejects.toThrow('Stage 22 release readiness requires Stage 20');
    });

    it('should normalize invalid release categories', async () => {
      setupMock({
        releaseItems: [{ name: 'X', category: 'INVALID', status: 'approved', approver: 'A' }],
      });
      const result = await analyzeStage22({ stage20Data: STAGE20_DATA, stage21Data: STAGE21_DATA, logger });

      expect(result.release_items[0].category).toBe('feature');
    });

    it('should derive hold decision when only QA passes', async () => {
      setupMock({ releaseDecision: { decision: 'invalid' } });
      const stage21Fail = { ...STAGE21_DATA, reviewDecision: { decision: 'reject' } };

      const result = await analyzeStage22({
        stage20Data: STAGE20_DATA,
        stage21Data: stage21Fail,
        logger,
      });

      expect(result.releaseDecision.decision).toBe('hold');
    });
  });

  describe('Real Data Path (buildRealReleaseData)', () => {
    it('should use real data when all upstream stages have venture_stage_work source', async () => {
      const stage19Real = { ...STAGE19_DATA, dataSource: 'venture_stage_work' };
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };
      const stage21Real = { ...STAGE21_DATA, dataSource: 'venture_stage_work' };

      const result = await analyzeStage22({
        stage18Data: STAGE18_DATA,
        stage19Data: stage19Real,
        stage20Data: stage20Real,
        stage21Data: stage21Real,
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.llmFallbackCount).toBe(0);
      // 2 done → approved, 1 blocked → rejected
      expect(result.release_items.filter(ri => ri.status === 'approved')).toHaveLength(2);
      expect(result.release_items.filter(ri => ri.status === 'rejected')).toHaveLength(1);
    });

    it('should compute hold decision when not all items approved', async () => {
      const stage19Real = { ...STAGE19_DATA, dataSource: 'venture_stage_work' };
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };
      const stage21Real = { ...STAGE21_DATA, dataSource: 'venture_stage_work' };

      const result = await analyzeStage22({
        stage18Data: STAGE18_DATA,
        stage19Data: stage19Real,
        stage20Data: stage20Real,
        stage21Data: stage21Real,
        logger,
      });

      // Has blocked tasks → not all_approved → hold (since QA passes)
      expect(result.releaseDecision.decision).toBe('hold');
    });

    it('should compute release decision when everything passes', async () => {
      const allDone = {
        tasks: [
          { name: 'T1', status: 'done' },
          { name: 'T2', status: 'done' },
        ],
        total_tasks: 2,
        completed_tasks: 2,
        blocked_tasks: 0,
        dataSource: 'venture_stage_work',
      };
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };
      const stage21Real = { ...STAGE21_DATA, dataSource: 'venture_stage_work' };

      const result = await analyzeStage22({
        stage18Data: STAGE18_DATA,
        stage19Data: allDone,
        stage20Data: stage20Real,
        stage21Data: stage21Real,
        logger,
      });

      expect(result.releaseDecision.decision).toBe('release');
      expect(result.all_approved).toBe(true);
    });

    it('should fall back to LLM when only some upstream stages use real data', async () => {
      setupMock();
      const stage19Real = { ...STAGE19_DATA, dataSource: 'venture_stage_work' };
      // stage20 and stage21 do NOT have dataSource

      const result = await analyzeStage22({
        stage19Data: stage19Real,
        stage20Data: STAGE20_DATA,
        stage21Data: STAGE21_DATA,
        logger,
      });

      expect(result.dataSource).toBeUndefined();
    });

    it('should include sprint retrospective from real data', async () => {
      const stage19Real = {
        tasks: [{ name: 'T1', status: 'done' }],
        total_tasks: 1,
        completed_tasks: 1,
        blocked_tasks: 0,
        dataSource: 'venture_stage_work',
      };
      const stage20Real = { ...STAGE20_DATA, dataSource: 'venture_stage_work' };
      const stage21Real = { ...STAGE21_DATA, dataSource: 'venture_stage_work' };

      const result = await analyzeStage22({
        stage18Data: STAGE18_DATA,
        stage19Data: stage19Real,
        stage20Data: stage20Real,
        stage21Data: stage21Real,
        logger,
      });

      expect(result.sprintRetrospective.wentWell[0]).toContain('1 of 1');
      expect(result.sprintSummary.sprintGoal).toBe('Ship MVP');
    });
  });

  describe('Constants', () => {
    it('should export correct constants', () => {
      expect(RELEASE_DECISIONS).toEqual(['release', 'hold', 'cancel']);
      expect(RELEASE_CATEGORIES).toContain('security');
      expect(RELEASE_CATEGORIES).toContain('performance');
    });
  });
});
