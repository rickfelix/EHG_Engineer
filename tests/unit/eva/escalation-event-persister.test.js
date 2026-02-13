/**
 * Tests for Escalation Event Persister
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-003)
 */

import { describe, it, expect, vi } from 'vitest';
import { persistEscalationEvent } from '../../../lib/eva/escalation-event-persister.js';

/**
 * Creates a mock Supabase client that returns the given data/error.
 */
function createMockSupabase({ data = null, error = null } = {}) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { from, _mocks: { insert, select, single } };
}

function makeDfeResult(overrides = {}) {
  return {
    auto_proceed: false,
    recommendation: 'PRESENT_TO_CHAIRMAN',
    triggers: [
      {
        type: 'cost_threshold',
        severity: 'HIGH',
        message: 'Cost exceeded threshold',
        details: { cost: 15000, threshold: 10000, thresholdSource: 'chairman_preferences' },
      },
    ],
    ...overrides,
  };
}

describe('EscalationEventPersister', () => {
  describe('persistEscalationEvent', () => {
    it('should persist an escalation event and return eventId', async () => {
      const supabase = createMockSupabase({ data: { event_id: 'evt-123' } });
      const result = await persistEscalationEvent(supabase, {
        dfeResult: makeDfeResult(),
        ventureId: 'v-001',
        ventureName: 'Test Venture',
        stageNumber: 2,
      });

      expect(result.eventId).toBe('evt-123');
      expect(supabase.from).toHaveBeenCalledWith('eva_orchestration_events');

      const insertArg = supabase._mocks.insert.mock.calls[0][0];
      expect(insertArg.event_type).toBe('dfe_triggered');
      expect(insertArg.event_source).toBe('decision_filter_engine');
      expect(insertArg.venture_id).toBe('v-001');
      expect(insertArg.chairman_flagged).toBe(true);
      expect(insertArg.event_data.recommendation).toBe('PRESENT_TO_CHAIRMAN');
      expect(insertArg.event_data.triggers).toBeDefined();
      expect(insertArg.event_data.mitigations).toBeDefined();
    });

    it('should set chairman_flagged=false for AUTO_PROCEED', async () => {
      const supabase = createMockSupabase({ data: { event_id: 'evt-456' } });
      const dfeResult = makeDfeResult({ recommendation: 'AUTO_PROCEED', auto_proceed: true, triggers: [] });

      await persistEscalationEvent(supabase, {
        dfeResult,
        ventureId: 'v-002',
      });

      const insertArg = supabase._mocks.insert.mock.calls[0][0];
      expect(insertArg.chairman_flagged).toBe(false);
    });

    it('should use custom eventSource when provided', async () => {
      const supabase = createMockSupabase({ data: { event_id: 'evt-789' } });
      await persistEscalationEvent(supabase, {
        dfeResult: makeDfeResult(),
        ventureId: 'v-003',
        eventSource: 'manual_review',
      });

      const insertArg = supabase._mocks.insert.mock.calls[0][0];
      expect(insertArg.event_source).toBe('manual_review');
    });

    it('should handle null ventureId', async () => {
      const supabase = createMockSupabase({ data: { event_id: 'evt-000' } });
      await persistEscalationEvent(supabase, {
        dfeResult: makeDfeResult(),
      });

      const insertArg = supabase._mocks.insert.mock.calls[0][0];
      expect(insertArg.venture_id).toBeNull();
    });

    it('should throw when supabase is not provided', async () => {
      await expect(
        persistEscalationEvent(null, { dfeResult: makeDfeResult() }),
      ).rejects.toThrow('supabase client is required');
    });

    it('should throw when dfeResult is not provided', async () => {
      const supabase = createMockSupabase();
      await expect(
        persistEscalationEvent(supabase, {}),
      ).rejects.toThrow('dfeResult is required');
    });

    it('should throw on Supabase insert error', async () => {
      const supabase = createMockSupabase({ error: { message: 'RLS policy violation' } });
      await expect(
        persistEscalationEvent(supabase, {
          dfeResult: makeDfeResult(),
          ventureId: 'v-fail',
        }),
      ).rejects.toThrow('RLS policy violation');
    });

    it('should include trigger_count and max_severity_score in event_data', async () => {
      const supabase = createMockSupabase({ data: { event_id: 'evt-data' } });
      const dfeResult = makeDfeResult({
        triggers: [
          { type: 'cost_threshold', severity: 'HIGH', message: 'Cost', details: { cost: 20000, threshold: 10000, thresholdSource: 'prefs' } },
          { type: 'low_score', severity: 'MEDIUM', message: 'Score', details: { score: 3, threshold: 7, thresholdSource: 'prefs' } },
        ],
      });

      await persistEscalationEvent(supabase, { dfeResult, ventureId: 'v-multi' });

      const insertArg = supabase._mocks.insert.mock.calls[0][0];
      expect(insertArg.event_data.trigger_count).toBe(2);
      expect(insertArg.event_data.max_severity_score).toBe(90);
    });

    it('should include venture_name and stage_number in event_data', async () => {
      const supabase = createMockSupabase({ data: { event_id: 'evt-ctx' } });
      await persistEscalationEvent(supabase, {
        dfeResult: makeDfeResult(),
        ventureId: 'v-ctx',
        ventureName: 'My Venture',
        stageNumber: 5,
      });

      const insertArg = supabase._mocks.insert.mock.calls[0][0];
      expect(insertArg.event_data.venture_name).toBe('My Venture');
      expect(insertArg.event_data.stage_number).toBe(5);
    });
  });
});
