/**
 * Unit tests for Stage 24 Analysis Step - Marketing Preparation
 * Tests real-data (buildRealMarketingData) path.
 * Lifecycle stage 24: marketing prep derived from stage 23 release readiness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/eva/stage-templates/stage-24.js', () => ({
  checkReleaseReadiness: vi.fn(() => ({ ready: true, reasons: [] })),
}));

import { analyzeStage23 } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-24-marketing-prep.js';

const STAGE23_REAL = {
  release_items: [
    { name: 'User Authentication', category: 'feature', status: 'approved', approver: 'leo-protocol' },
    { name: 'Dashboard Widget', category: 'feature', status: 'approved', approver: 'leo-protocol' },
    { name: 'API Endpoints', category: 'feature', status: 'approved', approver: 'leo-protocol' },
    { name: 'Performance Fix', category: 'performance', status: 'approved', approver: 'leo-protocol' },
  ],
  releaseDecision: { decision: 'release', rationale: 'All items approved', approver: 'leo-protocol' },
  total_items: 4,
  approved_items: 4,
  all_approved: true,
  dataSource: 'venture_stage_work',
};

const STAGE01_DATA = {
  idea_brief: 'A SaaS platform for team collaboration and project management',
};

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-24-marketing-prep.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Real Data Path (buildRealMarketingData)', () => {
    it('should use real data when stage23Data has venture_stage_work source', async () => {
      const result = await analyzeStage23({
        stage23Data: STAGE23_REAL,
        stage01Data: STAGE01_DATA,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.sds_created_count).toBe(0);
      expect(result.marketing_items.length).toBeGreaterThanOrEqual(3);
      expect(result.sd_bridge_payloads).toEqual([]);
      expect(result.marketing_sds).toEqual([]);
    });

    it('should create marketing items from approved release items', async () => {
      const result = await analyzeStage23({
        stage23Data: STAGE23_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      // Each approved release item maps to a marketing item
      expect(result.marketing_items.length).toBe(4);
      // First item should be launch_announcement
      expect(result.marketing_items[0].type).toBe('launch_announcement');
      expect(result.marketing_items[0].priority).toBe('critical');
      // All items have required fields
      for (const item of result.marketing_items) {
        expect(item.title).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.type).toBeTruthy();
        expect(item.priority).toBeTruthy();
      }
    });

    it('should pad to minimum 3 items when fewer approved release items', async () => {
      const stage23 = {
        ...STAGE23_REAL,
        release_items: [
          { name: 'Single Feature', category: 'feature', status: 'approved', approver: 'leo-protocol' },
        ],
        total_items: 1,
        approved_items: 1,
      };

      const result = await analyzeStage23({
        stage23Data: stage23,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.marketing_items.length).toBe(3);
    });

    it('should include idea brief in marketing strategy summary', async () => {
      const result = await analyzeStage23({
        stage23Data: STAGE23_REAL,
        stage01Data: STAGE01_DATA,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.marketing_strategy_summary).toContain('TestVenture');
      expect(result.marketing_strategy_summary).toContain('SaaS platform');
      expect(result.marketing_strategy_summary.length).toBeGreaterThanOrEqual(10);
    });

    it('should compute marketing readiness percentage', async () => {
      const result = await analyzeStage23({
        stage23Data: STAGE23_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.marketing_readiness_pct).toBe(100); // 4/4 approved
      expect(result.total_marketing_items).toBe(4);
    });

    it('should set target_audience', async () => {
      const result = await analyzeStage23({
        stage23Data: STAGE23_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.target_audience.length).toBeGreaterThanOrEqual(5);
    });

    it('should return null (and throw REFUSED) when no approved release items', async () => {
      const stage23NoApproved = {
        ...STAGE23_REAL,
        release_items: [
          { name: 'Blocked Feature', category: 'feature', status: 'rejected', approver: 'leo-protocol' },
        ],
      };

      await expect(analyzeStage23({
        stage23Data: stage23NoApproved,
        ventureName: 'TestVenture',
        logger,
      })).rejects.toThrow('REFUSED');
    });

    it('should throw REFUSED when dataSource is not venture_stage_work', async () => {
      const stage23NoSource = {
        ...STAGE23_REAL,
        dataSource: undefined,
      };

      await expect(analyzeStage23({
        stage23Data: stage23NoSource,
        ventureName: 'TestVenture',
        logger,
      })).rejects.toThrow('REFUSED');
    });
  });
});
