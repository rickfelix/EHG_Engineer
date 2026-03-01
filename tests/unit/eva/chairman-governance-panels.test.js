import { describe, it, expect, vi } from 'vitest';
import {
  getPortfolioRiskPanel,
  getDecisionPipelinePanel,
  getSDLifecyclePanel,
  isPanelStale,
} from '../../../lib/eva/chairman-governance-panels.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('chairman-governance-panels', () => {
  describe('getPortfolioRiskPanel', () => {
    it('returns empty panel when no supabase', async () => {
      const { panel, error } = await getPortfolioRiskPanel(null);
      expect(panel.type).toBe('portfolio_risk');
      expect(panel.empty).toBe(true);
      expect(error).toBeDefined();
    });

    it('returns empty panel on query failure', async () => {
      const supabase = mockSupabase({
        strategic_directives_v2: { data: null, error: { message: 'Connection failed' } },
      });

      const { panel, error } = await getPortfolioRiskPanel(supabase, { logger: silentLogger });
      expect(panel.empty).toBe(true);
      expect(error).toBe('Connection failed');
    });

    it('returns zero-state with no SDs', async () => {
      const supabase = mockSupabase({
        strategic_directives_v2: { data: [], error: null },
        eva_vision_scores: { data: [], error: null },
      });

      const { panel } = await getPortfolioRiskPanel(supabase, { logger: silentLogger });
      expect(panel.totalVentures).toBe(0);
      expect(panel.totalActiveSDs).toBe(0);
      expect(panel.atRiskSDCount).toBe(0);
      expect(panel.overallRiskScore).toBe(0);
      expect(panel.generatedAt).toBeDefined();
    });

    it('aggregates multi-venture data correctly', async () => {
      const sds = [
        { id: 'sd-1', sd_key: 'SD-001', status: 'in_progress', priority: 'medium', venture_id: 'v1', current_phase: 'EXEC', progress: 50 },
        { id: 'sd-2', sd_key: 'SD-002', status: 'blocked', priority: 'high', venture_id: 'v1', current_phase: 'PLAN', progress: 20 },
        { id: 'sd-3', sd_key: 'SD-003', status: 'in_progress', priority: 'medium', venture_id: 'v2', current_phase: 'EXEC', progress: 80 },
        { id: 'sd-4', sd_key: 'SD-004', status: 'in_progress', priority: 'critical', venture_id: 'v2', current_phase: 'LEAD', progress: 10 },
      ];

      const scores = [
        { sd_id: 'sd-1', total_score: 85, threshold_action: 'accept', created_at: new Date().toISOString() },
        { sd_id: 'sd-3', total_score: 60, threshold_action: 'gap_closure_sd', created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        strategic_directives_v2: { data: sds, error: null },
        eva_vision_scores: { data: scores, error: null },
      });

      const { panel } = await getPortfolioRiskPanel(supabase, { logger: silentLogger });
      expect(panel.totalVentures).toBe(2);
      expect(panel.totalActiveSDs).toBe(4);
      // v1: sd-2 blocked = at risk. v2: sd-3 score<70 = at risk, sd-4 critical = at risk
      expect(panel.atRiskSDCount).toBe(3);
      expect(panel.ventures).toHaveLength(2);
      expect(panel.stale).toBe(false);
    });

    it('handles score query failure gracefully', async () => {
      const supabase = mockSupabase({
        strategic_directives_v2: { data: [{ id: 's1', sd_key: 'K1', status: 'draft', priority: 'low', venture_id: 'v1', current_phase: 'LEAD', progress: 0 }], error: null },
        eva_vision_scores: { data: null, error: { message: 'Score table error' } },
      });

      const { panel } = await getPortfolioRiskPanel(supabase, { logger: silentLogger });
      expect(panel.totalActiveSDs).toBe(1);
      expect(panel.generatedAt).toBeDefined();
    });
  });

  describe('getDecisionPipelinePanel', () => {
    it('returns empty panel when no supabase', async () => {
      const { panel, error } = await getDecisionPipelinePanel(null);
      expect(panel.type).toBe('decision_pipeline');
      expect(panel.empty).toBe(true);
      expect(error).toBeDefined();
    });

    it('returns zero-state with no decisions', async () => {
      const supabase = mockSupabase({
        chairman_decisions: { data: [], error: null },
      });

      const { panel } = await getDecisionPipelinePanel(supabase, { logger: silentLogger });
      expect(panel.totalDecisions).toBe(0);
      expect(panel.statusCounts).toEqual({});
      expect(panel.avgResolutionHours).toBe(0);
    });

    it('aggregates decision data with trend', async () => {
      const now = new Date();
      const recent = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
      const old = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();

      const decisions = [
        { id: 'd1', decision_type: 'escalation', status: 'approved', created_at: recent, resolved_at: new Date(new Date(recent).getTime() + 3600000).toISOString() },
        { id: 'd2', decision_type: 'escalation', status: 'pending', created_at: recent, resolved_at: null },
        { id: 'd3', decision_type: 'override', status: 'approved', created_at: old, resolved_at: new Date(new Date(old).getTime() + 7200000).toISOString() },
      ];

      const supabase = mockSupabase({
        chairman_decisions: { data: decisions, error: null },
      });

      const { panel } = await getDecisionPipelinePanel(supabase, { logger: silentLogger });
      expect(panel.totalDecisions).toBe(3);
      expect(panel.statusCounts.approved).toBe(2);
      expect(panel.statusCounts.pending).toBe(1);
      expect(panel.typeCounts.escalation).toBe(2);
      expect(panel.trend7d.total).toBe(2); // Only recent ones
      expect(panel.avgResolutionHours).toBeGreaterThan(0);
    });
  });

  describe('getSDLifecyclePanel', () => {
    it('returns empty panel when no supabase', async () => {
      const { panel, error } = await getSDLifecyclePanel(null);
      expect(panel.type).toBe('sd_lifecycle');
      expect(panel.empty).toBe(true);
      expect(error).toBeDefined();
    });

    it('returns zero-state with no SDs', async () => {
      const supabase = mockSupabase({
        strategic_directives_v2: { data: [], error: null },
      });

      const { panel } = await getSDLifecyclePanel(supabase, { logger: silentLogger });
      expect(panel.totalSDs).toBe(0);
      expect(panel.completedLast30d).toBe(0);
      expect(panel.avgInProgressPercent).toBe(0);
    });

    it('aggregates lifecycle data correctly', async () => {
      const now = new Date();
      const sds = [
        { id: 's1', sd_key: 'K1', status: 'completed', current_phase: 'LEAD_FINAL_APPROVAL', progress: 100, created_at: new Date(now - 10 * 86400000).toISOString(), completion_date: new Date(now - 2 * 86400000).toISOString() },
        { id: 's2', sd_key: 'K2', status: 'in_progress', current_phase: 'EXEC', progress: 60, created_at: new Date(now - 5 * 86400000).toISOString(), completion_date: null },
        { id: 's3', sd_key: 'K3', status: 'in_progress', current_phase: 'PLAN_PRD', progress: 30, created_at: new Date(now - 3 * 86400000).toISOString(), completion_date: null },
        { id: 's4', sd_key: 'K4', status: 'draft', current_phase: 'LEAD', progress: 0, created_at: now.toISOString(), completion_date: null },
      ];

      const supabase = mockSupabase({
        strategic_directives_v2: { data: sds, error: null },
      });

      const { panel } = await getSDLifecyclePanel(supabase, { logger: silentLogger });
      expect(panel.totalSDs).toBe(4);
      expect(panel.statusDistribution.completed).toBe(1);
      expect(panel.statusDistribution.in_progress).toBe(2);
      expect(panel.statusDistribution.draft).toBe(1);
      expect(panel.completedLast30d).toBe(1);
      expect(panel.inProgressCount).toBe(2);
      expect(panel.avgInProgressPercent).toBe(45); // (60+30)/2
    });
  });

  describe('isPanelStale', () => {
    it('returns true for null panel', () => {
      expect(isPanelStale(null)).toBe(true);
    });

    it('returns true for panel without generatedAt', () => {
      expect(isPanelStale({})).toBe(true);
    });

    it('returns false for fresh panel', () => {
      expect(isPanelStale({ generatedAt: new Date().toISOString() })).toBe(false);
    });

    it('returns true for old panel', () => {
      const old = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      expect(isPanelStale({ generatedAt: old })).toBe(true);
    });

    it('respects custom threshold', () => {
      const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
      expect(isPanelStale({ generatedAt: oneMinAgo }, 30000)).toBe(true); // 30s threshold
      expect(isPanelStale({ generatedAt: oneMinAgo }, 120000)).toBe(false); // 2min threshold
    });
  });
});
