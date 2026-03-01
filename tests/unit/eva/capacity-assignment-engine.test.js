import { describe, it, expect, vi } from 'vitest';
import {
  getAssignmentRecommendations,
  getCapacityOverview,
  getComplexityTiers,
} from '../../../lib/eva/capacity-assignment-engine.js';

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
        insert: vi.fn(() => ({ data: null, error: null })),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('capacity-assignment-engine', () => {
  describe('getAssignmentRecommendations', () => {
    it('returns error when missing params', async () => {
      const result = await getAssignmentRecommendations(null, {});
      expect(result.recommendations).toEqual([]);
      expect(result.error).toBe('Missing required params');
    });

    it('returns error when no sdId', async () => {
      const supabase = mockSupabase();
      const result = await getAssignmentRecommendations(supabase, {});
      expect(result.recommendations).toEqual([]);
      expect(result.error).toBe('Missing required params');
    });

    it('returns empty when no sessions', async () => {
      const supabase = mockSupabase({
        claude_sessions: { data: [], error: null },
      });

      const result = await getAssignmentRecommendations(supabase, {
        sdId: 'sd-1',
      }, { logger: silentLogger });

      expect(result.recommendations).toEqual([]);
      expect(result.totalSessions).toBe(0);
      expect(result.availableSessions).toBe(0);
    });

    it('returns queue recommendation when all sessions busy', async () => {
      const sessions = [
        { session_id: 's1', sd_id: 'sd-other', status: 'active', heartbeat_at: new Date().toISOString(), metadata: {} },
      ];

      const supabase = mockSupabase({
        claude_sessions: { data: sessions, error: null },
      });

      const result = await getAssignmentRecommendations(supabase, {
        sdId: 'sd-1',
      }, { logger: silentLogger });

      expect(result.recommendations).toEqual([]);
      expect(result.availableSessions).toBe(0);
      expect(result.queueRecommendation).toBeDefined();
    });

    it('ranks available sessions by capacity score', async () => {
      const sessions = [
        { session_id: 's1', sd_id: null, status: 'active', heartbeat_at: new Date().toISOString(), metadata: {} },
        { session_id: 's2', sd_id: null, status: 'idle', heartbeat_at: new Date().toISOString(), metadata: {} },
        { session_id: 's3', sd_id: 'sd-other', status: 'active', heartbeat_at: new Date().toISOString(), metadata: {} },
      ];

      const supabase = mockSupabase({
        claude_sessions: { data: sessions, error: null },
      });

      const result = await getAssignmentRecommendations(supabase, {
        sdId: 'sd-1',
        sdType: 'infrastructure',
      }, { logger: silentLogger });

      expect(result.recommendations).toHaveLength(2); // s1 and s2 (s3 has claim)
      expect(result.availableSessions).toBe(2);
      // Idle session should be ranked higher
      expect(result.recommendations[0].sessionId).toBe('s2');
      expect(result.recommendations[0].rank).toBe(1);
    });

    it('excludes stale sessions', async () => {
      const staleTime = new Date(Date.now() - 600 * 1000).toISOString(); // 10 min ago
      const sessions = [
        { session_id: 's1', sd_id: null, status: 'idle', heartbeat_at: staleTime, metadata: {} },
        { session_id: 's2', sd_id: null, status: 'idle', heartbeat_at: new Date().toISOString(), metadata: {} },
      ];

      const supabase = mockSupabase({
        claude_sessions: { data: sessions, error: null },
      });

      const result = await getAssignmentRecommendations(supabase, {
        sdId: 'sd-1',
      }, { logger: silentLogger });

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].sessionId).toBe('s2');
    });

    it('handles query error', async () => {
      const supabase = mockSupabase({
        claude_sessions: { data: null, error: { message: 'Connection failed' } },
      });

      const result = await getAssignmentRecommendations(supabase, {
        sdId: 'sd-1',
      }, { logger: silentLogger });

      expect(result.recommendations).toEqual([]);
      expect(result.error).toBe('Connection failed');
    });

    it('returns match quality for each recommendation', async () => {
      const sessions = [
        { session_id: 's1', sd_id: null, status: 'idle', heartbeat_at: new Date().toISOString(), metadata: {} },
      ];

      const supabase = mockSupabase({
        claude_sessions: { data: sessions, error: null },
      });

      const result = await getAssignmentRecommendations(supabase, {
        sdId: 'sd-1',
        sdType: 'infrastructure',
        priority: 'high',
      }, { logger: silentLogger });

      expect(result.recommendations[0].matchQuality).toBeDefined();
      expect(result.recommendations[0].reasoning).toBeDefined();
    });
  });

  describe('getCapacityOverview', () => {
    it('returns error when no supabase', async () => {
      const { overview, error } = await getCapacityOverview(null);
      expect(overview.totalSessions).toBe(0);
      expect(error).toBeDefined();
    });

    it('returns capacity breakdown', async () => {
      const now = new Date().toISOString();
      const staleTime = new Date(Date.now() - 600 * 1000).toISOString();

      const sessions = [
        { session_id: 's1', sd_id: 'sd-1', status: 'active', heartbeat_at: now },
        { session_id: 's2', sd_id: null, status: 'idle', heartbeat_at: now },
        { session_id: 's3', sd_id: null, status: 'active', heartbeat_at: staleTime },
      ];

      const supabase = mockSupabase({
        claude_sessions: { data: sessions, error: null },
      });

      const { overview } = await getCapacityOverview(supabase, { logger: silentLogger });
      expect(overview.totalSessions).toBe(3);
      expect(overview.claimed).toBe(1);
      expect(overview.stale).toBe(1);
      expect(overview.available).toBe(1); // 3 - 1 claimed - 1 stale
      expect(overview.utilizationPercent).toBe(33); // 1/3
    });

    it('handles empty sessions', async () => {
      const supabase = mockSupabase({
        claude_sessions: { data: [], error: null },
      });

      const { overview } = await getCapacityOverview(supabase, { logger: silentLogger });
      expect(overview.totalSessions).toBe(0);
      expect(overview.utilizationPercent).toBe(0);
    });
  });

  describe('getComplexityTiers', () => {
    it('returns all tiers', () => {
      const tiers = getComplexityTiers();
      expect(tiers.TIER_1.label).toBe('Auto-approve');
      expect(tiers.TIER_2.maxLOC).toBe(75);
      expect(tiers.TIER_3.weight).toBe(3);
    });

    it('returns a copy', () => {
      const tiers = getComplexityTiers();
      tiers.TIER_1 = null;
      expect(getComplexityTiers().TIER_1).toBeDefined();
    });
  });
});
