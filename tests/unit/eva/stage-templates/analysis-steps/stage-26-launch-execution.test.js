/**
 * Unit tests for Stage 26 Analysis Step - Launch Execution (Pipeline Terminus)
 * Tests real-data (buildRealLaunchExecutionData) path.
 * Lifecycle stage 26: launch execution derived from stages 23-25.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/eva/stage-templates/stage-26.js', () => ({
  verifyLaunchAuthorization: vi.fn(() => ({ authorized: true, reasons: [] })),
}));

import { analyzeStage25 } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-26-launch-execution.js';

const STAGE25_REAL = {
  readiness_checklist: {
    release_confirmed: { status: 'pass', evidence: 'Release confirmed' },
    marketing_complete: { status: 'pass', evidence: '3 items' },
    monitoring_ready: { status: 'waived', evidence: 'Deferred' },
    rollback_plan_exists: { status: 'waived', evidence: 'Deferred' },
  },
  go_no_go_decision: 'go',
  readiness_score: 80,
  chairmanGate: { status: 'approved', rationale: 'Approved for launch' },
  dataSource: 'venture_stage_work',
};

const STAGE23_REAL = {
  release_items: [
    { name: 'Feature A', status: 'approved' },
    { name: 'Feature B', status: 'approved' },
    { name: 'Feature C', status: 'approved' },
  ],
  releaseDecision: { decision: 'release' },
  dataSource: 'venture_stage_work',
};

const STAGE24_REAL = {
  marketing_items: [
    { title: 'Launch Announcement', type: 'launch_announcement', priority: 'critical' },
    { title: 'Blog Post', type: 'content_blog', priority: 'high' },
    { title: 'Product Demo', type: 'product_demo', priority: 'high' },
  ],
  dataSource: 'venture_stage_work',
};

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-26-launch-execution.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Real Data Path (buildRealLaunchExecutionData)', () => {
    it('should use real data when stage25Data has venture_stage_work source', async () => {
      const result = await analyzeStage25({
        stage25Data: STAGE25_REAL,
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'CommitCraft AI',
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.pipeline_terminus).toBe(true);
      expect(result.pipeline_mode).toBe('launch');
    });

    it('should create at least 1 distribution channel', async () => {
      const result = await analyzeStage25({
        stage25Data: STAGE25_REAL,
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'CommitCraft AI',
        logger,
      });

      expect(result.distribution_channels.length).toBeGreaterThanOrEqual(1);
      const ch = result.distribution_channels[0];
      expect(ch.name).toBeTruthy();
      expect(ch.type).toBe('web');
      expect(ch.status).toBe('activating');
      expect(ch.activation_date).toBeTruthy();
    });

    it('should include complete operations handoff', async () => {
      const result = await analyzeStage25({
        stage25Data: STAGE25_REAL,
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'CommitCraft AI',
        logger,
      });

      const handoff = result.operations_handoff;
      expect(handoff.monitoring).toBeDefined();
      expect(handoff.monitoring.dashboards.length).toBeGreaterThanOrEqual(1);
      expect(handoff.monitoring.alerts.length).toBeGreaterThanOrEqual(1);
      expect(handoff.escalation).toBeDefined();
      expect(handoff.escalation.contacts.length).toBeGreaterThanOrEqual(1);
      expect(handoff.maintenance).toBeDefined();
    });

    it('should generate launch summary with min 10 chars', async () => {
      const result = await analyzeStage25({
        stage25Data: STAGE25_REAL,
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'CommitCraft AI',
        logger,
      });

      expect(result.launch_summary.length).toBeGreaterThanOrEqual(10);
      expect(result.launch_summary).toContain('CommitCraft AI');
    });

    it('should set go_live_timestamp ~7 days in the future', async () => {
      const result = await analyzeStage25({
        stage25Data: STAGE25_REAL,
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'CommitCraft AI',
        logger,
      });

      const goLive = new Date(result.go_live_timestamp);
      const now = new Date();
      const diffDays = (goLive - now) / 86400000;
      expect(diffDays).toBeGreaterThan(6);
      expect(diffDays).toBeLessThan(8);
    });

    it('should set pipeline terminus fields', async () => {
      const result = await analyzeStage25({
        stage25Data: STAGE25_REAL,
        stage23Data: STAGE23_REAL,
        stage24Data: STAGE24_REAL,
        ventureName: 'CommitCraft AI',
        logger,
      });

      expect(result.pipeline_terminus).toBe(true);
      expect(result.pipeline_mode).toBe('launch');
      expect(result.channels_total_count).toBe(1);
      expect(result.channels_active_count).toBe(0);
    });

    it('should work with minimal upstream data', async () => {
      const stage25Minimal = {
        go_no_go_decision: 'go',
        dataSource: 'venture_stage_work',
      };

      const result = await analyzeStage25({
        stage25Data: stage25Minimal,
        ventureName: 'MinimalVenture',
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.pipeline_terminus).toBe(true);
      expect(result.distribution_channels.length).toBeGreaterThanOrEqual(1);
      expect(result.operations_handoff).toBeDefined();
    });

    it('should throw REFUSED when dataSource is not venture_stage_work', async () => {
      const stage25NoSource = {
        ...STAGE25_REAL,
        dataSource: undefined,
      };

      await expect(analyzeStage25({
        stage25Data: stage25NoSource,
        ventureName: 'TestVenture',
        logger,
      })).rejects.toThrow('REFUSED');
    });
  });
});
