import { describe, it, expect, vi } from 'vitest';
import {
  routeGateFailure,
  detectPatterns,
  getEscalationQueue,
  getGateSLAConfig,
} from '../../../lib/eva/dfe-gate-escalation-router.js';

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

describe('dfe-gate-escalation-router', () => {
  describe('routeGateFailure', () => {
    it('returns error when missing params', async () => {
      const result = await routeGateFailure(null, { sdId: 'sd-1', gateType: 'PRD_QUALITY' });
      expect(result.routed).toBe(false);
      expect(result.error).toBe('Missing required params');
    });

    it('returns error when missing sdId', async () => {
      const supabase = mockSupabase();
      const result = await routeGateFailure(supabase, { gateType: 'PRD_QUALITY', score: 50, threshold: 70 });
      expect(result.routed).toBe(false);
      expect(result.error).toBe('Missing required params');
    });

    it('does not route when no pattern detected', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: [], error: null },
      });

      const result = await routeGateFailure(supabase, {
        sdId: 'sd-1',
        gateType: 'PRD_QUALITY',
        score: 50,
        threshold: 70,
      }, { logger: silentLogger });

      expect(result.routed).toBe(false);
      expect(result.patternDetected).toBe(false);
    });

    it('routes when pattern detected', async () => {
      // Create 3 failures (meets pattern threshold)
      const failures = Array.from({ length: 3 }, (_, i) => ({
        id: `evt-${i}`,
        payload: { sd_id: 'sd-1', gate_type: 'PRD_QUALITY', score: 50 },
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }));

      const supabase = mockSupabase({
        eva_event_log: { data: failures, error: null },
        chairman_decisions: { data: null, error: null },
      });

      const result = await routeGateFailure(supabase, {
        sdId: 'sd-1',
        gateType: 'PRD_QUALITY',
        score: 50,
        threshold: 70,
      }, { logger: silentLogger });

      expect(result.patternDetected).toBe(true);
      expect(result.routed).toBe(true);
      expect(result.escalationLevel).toBeDefined();
    });

    it('assigns L3 for 5+ occurrences', async () => {
      const failures = Array.from({ length: 5 }, (_, i) => ({
        id: `evt-${i}`,
        payload: { sd_id: 'sd-1', gate_type: 'PRD_QUALITY', score: 30 },
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }));

      const supabase = mockSupabase({
        eva_event_log: { data: failures, error: null },
        chairman_decisions: { data: null, error: null },
      });

      const result = await routeGateFailure(supabase, {
        sdId: 'sd-1',
        gateType: 'PRD_QUALITY',
        score: 30,
        threshold: 70,
      }, { logger: silentLogger });

      expect(result.escalationLevel).toBe('L3');
    });
  });

  describe('detectPatterns', () => {
    it('returns empty when no supabase', async () => {
      const result = await detectPatterns(null);
      expect(result.patterns).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('returns empty when no failures', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: [], error: null },
      });

      const result = await detectPatterns(supabase, { logger: silentLogger });
      expect(result.patterns).toEqual([]);
      expect(result.totalFailures).toBe(0);
    });

    it('detects pattern with 3+ occurrences', async () => {
      const failures = Array.from({ length: 4 }, (_, i) => ({
        id: `evt-${i}`,
        payload: { sd_id: 'sd-1', gate_type: 'PRD_QUALITY', score: 40 + i },
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }));

      const supabase = mockSupabase({
        eva_event_log: { data: failures, error: null },
      });

      const result = await detectPatterns(supabase, {
        sdId: 'sd-1',
        gateType: 'PRD_QUALITY',
        logger: silentLogger,
      });

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].occurrences).toBe(4);
      expect(result.patterns[0].gateType).toBe('PRD_QUALITY');
    });

    it('filters by sdId', async () => {
      const failures = [
        { id: 'e1', payload: { sd_id: 'sd-1', gate_type: 'X', score: 50 }, created_at: new Date().toISOString() },
        { id: 'e2', payload: { sd_id: 'sd-2', gate_type: 'X', score: 50 }, created_at: new Date().toISOString() },
        { id: 'e3', payload: { sd_id: 'sd-1', gate_type: 'X', score: 50 }, created_at: new Date().toISOString() },
        { id: 'e4', payload: { sd_id: 'sd-1', gate_type: 'X', score: 50 }, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        eva_event_log: { data: failures, error: null },
      });

      const result = await detectPatterns(supabase, {
        sdId: 'sd-1',
        logger: silentLogger,
      });

      expect(result.totalFailures).toBe(3); // Only sd-1 events
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].sdId).toBe('sd-1');
    });

    it('handles query error', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: null, error: { message: 'Query failed' } },
      });

      const result = await detectPatterns(supabase, { logger: silentLogger });
      expect(result.patterns).toEqual([]);
      expect(result.error).toBe('Query failed');
    });
  });

  describe('getEscalationQueue', () => {
    it('returns empty when no supabase', async () => {
      const result = await getEscalationQueue(null);
      expect(result.queue).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('returns empty when no pending decisions', async () => {
      const supabase = mockSupabase({
        chairman_decisions: { data: [], error: null },
      });

      const result = await getEscalationQueue(supabase, { logger: silentLogger });
      expect(result.queue).toEqual([]);
      expect(result.totalPending).toBe(0);
    });

    it('returns queue with overdue detection', async () => {
      const decisions = [
        {
          id: 'd-1',
          decision_type: 'gate_escalation',
          status: 'pending',
          context: { gate_type: 'PRD_QUALITY', sd_id: 'sd-1', escalation_level: 'L2', pattern_count: 3 },
          created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago (SLA is 4)
        },
        {
          id: 'd-2',
          decision_type: 'gate_escalation',
          status: 'pending',
          context: { gate_type: 'RETROSPECTIVE_QUALITY_GATE', sd_id: 'sd-2', escalation_level: 'L1', pattern_count: 3 },
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago (SLA is 8)
        },
      ];

      const supabase = mockSupabase({
        chairman_decisions: { data: decisions, error: null },
      });

      const result = await getEscalationQueue(supabase, { logger: silentLogger });
      expect(result.queue).toHaveLength(2);
      expect(result.totalPending).toBe(2);
      expect(result.overdueCount).toBe(1); // Only PRD_QUALITY is overdue (5h > 4h SLA)
      expect(result.queue[0].overdue).toBe(true);
      expect(result.queue[1].overdue).toBe(false);
    });
  });

  describe('getGateSLAConfig', () => {
    it('returns SLA config', () => {
      const config = getGateSLAConfig();
      expect(config.PRD_QUALITY).toBe(4);
      expect(config.DEFAULT).toBe(12);
    });

    it('returns a copy', () => {
      const config = getGateSLAConfig();
      config.PRD_QUALITY = 999;
      expect(getGateSLAConfig().PRD_QUALITY).toBe(4);
    });
  });
});
