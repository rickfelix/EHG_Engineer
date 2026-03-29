/**
 * Unit tests for Stage 25 Analysis Step - Launch Readiness
 * Tests real-data (buildRealLaunchReadinessData) path.
 * Lifecycle stage 25: launch readiness derived from stage 23 + stage 24.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { analyzeStage24 } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-25-launch-readiness.js';

const STAGE23_REAL = {
  releaseDecision: { decision: 'release', rationale: 'All approved', approver: 'leo-protocol' },
  release_items: [
    { name: 'Feature A', status: 'approved' },
    { name: 'Feature B', status: 'approved' },
    { name: 'Feature C', status: 'approved' },
  ],
  total_items: 3,
  approved_items: 3,
  all_approved: true,
  dataSource: 'venture_stage_work',
};

const STAGE24_REAL = {
  marketing_items: [
    { title: 'Launch Announcement', type: 'launch_announcement', priority: 'critical', description: 'Main launch' },
    { title: 'Blog Post', type: 'content_blog', priority: 'high', description: 'Feature blog' },
    { title: 'Product Demo', type: 'product_demo', priority: 'high', description: 'Demo video' },
  ],
  marketing_strategy_summary: 'Comprehensive launch strategy',
  dataSource: 'venture_stage_work',
};

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-25-launch-readiness.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Real Data Path (buildRealLaunchReadinessData)', () => {
    it('should use real data when stage23Data has venture_stage_work source', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.readiness_checklist).toBeDefined();
      expect(result.go_no_go_decision).toBeDefined();
      expect(result.chairmanGate.status).toBe('pending');
    });

    it('should set release_confirmed to pass when release decision is release', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.readiness_checklist.release_confirmed.status).toBe('pass');
      expect(result.readiness_checklist.release_confirmed.evidence).toContain('release');
    });

    it('should set marketing_complete to pass when 3+ marketing items', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.readiness_checklist.marketing_complete.status).toBe('pass');
      expect(result.readiness_checklist.marketing_complete.evidence).toContain('3');
    });

    it('should waive monitoring_ready and rollback_plan_exists', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.readiness_checklist.monitoring_ready.status).toBe('waived');
      expect(result.readiness_checklist.rollback_plan_exists.status).toBe('waived');
    });

    it('should compute go decision when all checks pass or waived', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.go_no_go_decision).toBe('go');
      expect(result.all_checks_pass).toBe(true);
      expect(result.blocking_items).toEqual([]);
    });

    it('should compute no_go when release not confirmed', async () => {
      const stage23Hold = {
        ...STAGE23_REAL,
        releaseDecision: { decision: 'hold', rationale: 'Blockers remain' },
      };

      const result = await analyzeStage24({
        stage23Data: stage23Hold,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.go_no_go_decision).toBe('no_go');
      expect(result.readiness_checklist.release_confirmed.status).toBe('fail');
      expect(result.blocking_items).toContain('release_confirmed');
    });

    it('should compute no_go when insufficient marketing items', async () => {
      const stage24Few = {
        ...STAGE24_REAL,
        marketing_items: [{ title: 'Only one', type: 'press_release', priority: 'low', description: 'Solo' }],
      };

      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: stage24Few,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.readiness_checklist.marketing_complete.status).toBe('fail');
      expect(result.blocking_items).toContain('marketing_complete');
    });

    it('should compute readiness score with correct weights', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      // release=pass(0.35*100=35), marketing=pass(0.25*100=25), monitoring=waived(0.20*50=10), rollback=waived(0.20*50=10)
      expect(result.readiness_score).toBe(80);
    });

    it('should include required string fields with min length', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.decision_rationale.length).toBeGreaterThanOrEqual(10);
      expect(result.incident_response_plan.length).toBeGreaterThanOrEqual(10);
      expect(result.monitoring_setup.length).toBeGreaterThanOrEqual(10);
      expect(result.rollback_plan.length).toBeGreaterThanOrEqual(10);
    });

    it('should include launch risks array', async () => {
      const result = await analyzeStage24({
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'TestVenture',
        logger,
      });

      expect(result.launch_risks.length).toBeGreaterThanOrEqual(1);
      for (const risk of result.launch_risks) {
        expect(risk.risk).toBeTruthy();
        expect(risk.severity).toBeTruthy();
        expect(risk.mitigation).toBeTruthy();
      }
    });

    it('should throw when stage23Data is missing', async () => {
      await expect(analyzeStage24({
        stage23Data: null,
        ventureName: 'TestVenture',
        logger,
      })).rejects.toThrow('Stage 25 launch readiness requires Stage 23');
    });
  });
});
