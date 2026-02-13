/**
 * Tests for DFE Escalation Service
 * SD-EVA-FEAT-DFE-PRESENTATION-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DfeEscalationService } from './dfe-escalation-service.js';

// Helper to create a mock Supabase client
function createMockSupabase(overrides = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  };
  // Make from() return a fresh chainable each time
  const fromFn = vi.fn().mockReturnValue(chainable);
  return { from: fromFn, _chainable: chainable };
}

const MOCK_DECISION = {
  id: 'dec-001',
  venture_id: 'ven-001',
  lifecycle_stage: 3,
  dfe_context: {
    auto_proceed: false,
    triggers: [
      { type: 'cost_threshold', severity: 'HIGH', message: 'Budget exceeded by 40%', details: { amount: 140000 } },
      { type: 'novel_pattern', severity: 'INFO', message: 'New tech stack detected', details: {} },
    ],
    recommendation: 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS',
    evaluated_at: '2026-02-13T10:00:00Z',
  },
  mitigation_actions: [],
  recommendation: 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS',
  health_score: 65,
  decision: null,
  status: 'pending',
  summary: 'DFE flagged cost concerns',
  created_at: '2026-02-13T10:00:00Z',
};

describe('DfeEscalationService', () => {
  let service;
  let mockSupabase;

  describe('getEscalationContext', () => {
    it('returns error for invalid decision ID', async () => {
      mockSupabase = createMockSupabase();
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.getEscalationContext(null);
      expect(result).toEqual({ success: false, error: 'Invalid decision ID' });
    });

    it('returns error for non-string decision ID', async () => {
      mockSupabase = createMockSupabase();
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.getEscalationContext(123);
      expect(result).toEqual({ success: false, error: 'Invalid decision ID' });
    });

    it('returns error when decision not found', async () => {
      mockSupabase = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      });
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.getEscalationContext('dec-missing');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Decision not found');
    });

    it('returns error when decision has no DFE context', async () => {
      const noDfeDecision = { ...MOCK_DECISION, dfe_context: null };
      // Need per-call responses: first from() for decision, then for patterns, then for events
      const calls = [];
      const mockFrom = vi.fn().mockImplementation((table) => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: noDfeDecision, error: null }),
        };
        calls.push({ table, chain });
        return chain;
      });
      mockSupabase = { from: mockFrom };
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.getEscalationContext('dec-001');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No DFE escalation context');
    });

    it('returns full escalation context with triggers sorted by severity', async () => {
      const mockPatterns = [
        { id: 'pat-1', pattern_key: 'cost_threshold_exceeded', title: 'Cost Overrun', severity: 'high', resolution: 'Reallocate budget', status: 'active', first_seen: '2026-01-01', last_seen: '2026-02-01', occurrence_count: 5 },
      ];
      const mockEvents = [
        { event_id: 'evt-1', event_type: 'dfe_triggered', event_data: { reason: 'cost' }, chairman_flagged: true, created_at: '2026-02-13T10:00:00Z' },
      ];

      let callIndex = 0;
      const mockFrom = vi.fn().mockImplementation(() => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            // Only the first call (decision fetch) uses .single()
            return Promise.resolve({ data: MOCK_DECISION, error: null });
          }),
        };
        // Override limit to resolve the chain for patterns and events
        const originalLimit = chain.limit;
        chain.limit = vi.fn().mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) {
            // This is the patterns query limit
            return Promise.resolve({ data: mockPatterns, error: null });
          }
          if (callIndex === 2) {
            // This is the events query limit
            return Promise.resolve({ data: mockEvents, error: null });
          }
          return originalLimit();
        });
        return chain;
      });

      mockSupabase = { from: mockFrom };
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.getEscalationContext('dec-001');

      expect(result.success).toBe(true);
      expect(result.data.decisionId).toBe('dec-001');
      expect(result.data.ventureId).toBe('ven-001');
      expect(result.data.lifecycleStage).toBe(3);
      expect(result.data.recommendation).toBe('PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS');
      expect(result.data.autoProceeded).toBe(false);

      // Triggers sorted by severity (HIGH first, then INFO)
      expect(result.data.triggers).toHaveLength(2);
      expect(result.data.triggers[0].severity).toBe('HIGH');
      expect(result.data.triggers[0].label).toBe('Cost Threshold Exceeded');
      expect(result.data.triggers[1].severity).toBe('INFO');
      expect(result.data.triggers[1].label).toBe('Novel Pattern Detected');

      expect(result.data.triggerCount).toBe(2);
      expect(result.data.highSeverityCount).toBe(1);
    });
  });

  describe('recordMitigationAction', () => {
    it('returns error for missing required fields', async () => {
      mockSupabase = createMockSupabase();
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.recordMitigationAction({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('returns error for invalid action', async () => {
      mockSupabase = createMockSupabase();
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.recordMitigationAction({
        decisionId: 'dec-001',
        mitigationId: 'cost_threshold',
        action: 'maybe',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('accept');
    });

    it('returns error when decision not found', async () => {
      mockSupabase = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      });
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.recordMitigationAction({
        decisionId: 'dec-missing',
        mitigationId: 'cost_threshold',
        action: 'accept',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Decision not found');
    });

    it('returns success for idempotent duplicate', async () => {
      const existingActions = [
        { mitigation_id: 'cost_threshold', action: 'accept', idempotency_key: 'key-123' },
      ];
      mockSupabase = createMockSupabase({
        single: vi.fn().mockResolvedValue({
          data: { mitigation_actions: existingActions },
          error: null,
        }),
      });
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.recordMitigationAction({
        decisionId: 'dec-001',
        mitigationId: 'cost_threshold',
        action: 'accept',
        idempotencyKey: 'key-123',
      });
      expect(result.success).toBe(true);
    });

    it('records a new mitigation action', async () => {
      let updatedPayload = null;
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { mitigation_actions: [] },
          error: null,
        }),
        update: vi.fn().mockImplementation((payload) => {
          updatedPayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
      mockSupabase = { from: vi.fn().mockReturnValue(chain) };
      service = new DfeEscalationService({ supabaseClient: mockSupabase });

      const result = await service.recordMitigationAction({
        decisionId: 'dec-001',
        mitigationId: 'cost_threshold',
        action: 'accept',
        reason: 'Budget was reallocated',
      });

      expect(result.success).toBe(true);
      expect(updatedPayload).toBeTruthy();
      expect(updatedPayload.mitigation_actions).toHaveLength(1);
      expect(updatedPayload.mitigation_actions[0].mitigation_id).toBe('cost_threshold');
      expect(updatedPayload.mitigation_actions[0].action).toBe('accept');
      expect(updatedPayload.mitigation_actions[0].reason).toBe('Budget was reallocated');
    });
  });
});
