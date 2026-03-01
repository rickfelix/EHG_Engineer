import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  logDecision,
  queryAuditTrail,
  getBufferSize,
  clearBuffer,
  DECISION_TYPES,
} from '../../../lib/eva/orchestrator-audit-trail.js';

function mockSupabase(overrides = {}) {
  const insertResult = overrides.insertError
    ? { error: { message: overrides.insertError } }
    : { error: null };

  const resolvedValue = overrides.queryData
    ? { data: overrides.queryData, error: null }
    : overrides.queryError
      ? { data: null, error: { message: overrides.queryError } }
      : { data: [], error: null };

  // Thenable chain — each method returns `chain`, and `await chain` resolves
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (resolve) => resolve(resolvedValue),
  };

  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => Promise.resolve(insertResult)),
      ...chain,
    })),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('orchestrator-audit-trail', () => {
  beforeEach(() => {
    clearBuffer();
  });

  describe('DECISION_TYPES', () => {
    it('exports frozen decision type constants', () => {
      expect(DECISION_TYPES.ROUTING).toBe('routing_decision');
      expect(DECISION_TYPES.HANDLER_SELECTION).toBe('handler_selection');
      expect(DECISION_TYPES.STATE_TRANSITION).toBe('state_transition');
      expect(DECISION_TYPES.ESCALATION).toBe('escalation_decision');
      expect(DECISION_TYPES.HEALTH_CHECK).toBe('health_check_result');
      expect(DECISION_TYPES.STRATEGY_OVERRIDE).toBe('strategy_override');
      expect(Object.isFrozen(DECISION_TYPES)).toBe(true);
    });
  });

  describe('logDecision', () => {
    it('logs a routing decision to Supabase', async () => {
      const supabase = mockSupabase();
      const result = await logDecision(
        supabase,
        {
          type: DECISION_TYPES.ROUTING,
          eventType: 'venture.stage.completed',
          routingMode: 'EVENT',
          handlerName: 'stageCompletionHandler',
          correlationId: 'corr-123',
          ventureId: 'v-1',
          outcome: 'dispatched',
        },
        { logger: silentLogger },
      );

      expect(result.logged).toBe(true);
      expect(result.entryId).toBeDefined();
      expect(supabase.from).toHaveBeenCalledWith('eva_orchestration_events');
    });

    it('logs with minimal fields', async () => {
      const supabase = mockSupabase();
      const result = await logDecision(
        supabase,
        { eventType: 'test.event' },
        { logger: silentLogger },
      );

      expect(result.logged).toBe(true);
      expect(result.entryId).toBeDefined();
    });

    it('buffers entry when supabase is null', async () => {
      const result = await logDecision(null, {
        type: DECISION_TYPES.ESCALATION,
        eventType: 'escalation.triggered',
      });

      expect(result.logged).toBe(false);
      expect(result.error).toContain('buffered');
      expect(getBufferSize()).toBe(1);
    });

    it('buffers entry when Supabase insert fails', async () => {
      const supabase = mockSupabase({ insertError: 'Connection refused' });
      const result = await logDecision(
        supabase,
        { type: DECISION_TYPES.ROUTING, eventType: 'test' },
        { logger: silentLogger },
      );

      expect(result.logged).toBe(false);
      expect(result.error).toBe('Connection refused');
      expect(getBufferSize()).toBe(1);
    });

    it('respects max buffer size', async () => {
      for (let i = 0; i < 105; i++) {
        await logDecision(null, { eventType: `event-${i}` });
      }
      expect(getBufferSize()).toBe(100);
    });
  });

  describe('queryAuditTrail', () => {
    it('returns empty when supabase is null', async () => {
      const result = await queryAuditTrail(null);
      expect(result.entries).toEqual([]);
      expect(result.error).toContain('No supabase');
    });

    it('queries with event type filter', async () => {
      const supabase = mockSupabase({
        queryData: [
          {
            event_id: 'e1',
            event_type: DECISION_TYPES.ROUTING,
            event_data: { correlationId: 'c1' },
          },
        ],
      });

      const result = await queryAuditTrail(supabase, {
        eventType: DECISION_TYPES.ROUTING,
      });

      expect(result.entries).toHaveLength(1);
    });

    it('filters by correlationId in event_data', async () => {
      const supabase = mockSupabase({
        queryData: [
          { event_id: 'e1', event_data: { correlationId: 'match' } },
          { event_id: 'e2', event_data: { correlationId: 'no-match' } },
        ],
      });

      const result = await queryAuditTrail(supabase, {
        correlationId: 'match',
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].event_id).toBe('e1');
    });
  });

  describe('buffer management', () => {
    it('clearBuffer empties the buffer', async () => {
      await logDecision(null, { eventType: 'buffered' });
      expect(getBufferSize()).toBe(1);

      clearBuffer();
      expect(getBufferSize()).toBe(0);
    });
  });
});
