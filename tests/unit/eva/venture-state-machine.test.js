/**
 * Tests for VentureStateMachine
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-D
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('../../../lib/agents/modules/venture-state-machine/handoff-operations.js', () => ({
  validateHandoffPackage: vi.fn(),
  verifyCeoAuthority: vi.fn(),
  approveHandoff: vi.fn(),
  rejectHandoff: vi.fn(),
  requestChanges: vi.fn(),
  getStageRequirements: vi.fn().mockReturnValue({ artifacts: [], quality_gates: [] }),
}));

import {
  VentureStateMachine,
  StateStalenessError,
  GoldenNuggetValidationError,
  StageGateValidationError,
} from '../../../lib/agents/venture-state-machine.js';
import {
  validateHandoffPackage,
  verifyCeoAuthority,
  approveHandoff,
  rejectHandoff,
  requestChanges,
} from '../../../lib/agents/modules/venture-state-machine/handoff-operations.js';

const origConsole = {};

function createMockSupabase({ ventureData, stageWorkData, pendingHandoffsData } = {}) {
  const venture = ventureData || { id: 'v-1', name: 'TestVenture', current_lifecycle_stage: 5, status: 'active' };
  const stageWork = stageWorkData || [];
  const pendingHandoffs = pendingHandoffsData || [];

  return {
    from: vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: venture, error: null }),
        };
      }
      if (table === 'venture_stage_work') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: stageWork, error: null }),
        };
      }
      if (table === 'pending_ceo_handoffs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: pendingHandoffs, error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

describe('VentureStateMachine', () => {
  let mockSb;
  let sm;

  beforeEach(() => {
    mockSb = createMockSupabase({
      stageWorkData: [
        { lifecycle_stage: 3, stage_status: 'completed', health_score: 'green' },
        { lifecycle_stage: 4, stage_status: 'completed', health_score: 'green' },
      ],
      pendingHandoffsData: [
        {
          id: 'h-1', vp_agent_id: 'vp-1', from_stage: 5, to_stage: 6,
          handoff_data: { artifacts: [{ type: 'analysis', content: 'done' }] },
          proposed_at: '2026-01-01', status: 'pending',
        },
      ],
    });

    sm = new VentureStateMachine({
      supabaseClient: mockSb,
      ventureId: 'v-1',
      ceoAgentId: 'ceo-1',
    });

    // Silence console output during tests
    origConsole.log = console.log;
    origConsole.warn = console.warn;
    origConsole.error = console.error;
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();

    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = origConsole.log;
    console.warn = origConsole.warn;
    console.error = origConsole.error;
  });

  describe('constructor', () => {
    it('should set ventureId and ceoAgentId', () => {
      expect(sm.ventureId).toBe('v-1');
      expect(sm.ceoAgentId).toBe('ceo-1');
    });

    it('should initialize with uninitialized state', () => {
      expect(sm._initialized).toBe(false);
      expect(sm.currentStage).toBeNull();
      expect(sm.stageStates.size).toBe(0);
      expect(sm.pendingHandoffsCache.size).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should load venture, stage work, and pending handoffs', async () => {
      await sm.initialize();

      expect(sm._initialized).toBe(true);
      expect(sm.currentStage).toBe(5);
      expect(sm.stageStates.size).toBe(2);
      expect(sm.stageStates.get(3)).toEqual({ status: 'completed', health_score: 'green' });
      expect(sm.pendingHandoffsCache.size).toBe(1);
    });

    it('should throw when venture not found', async () => {
      const errorSb = createMockSupabase();
      errorSb.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      }));

      const errorSm = new VentureStateMachine({
        supabaseClient: errorSb, ventureId: 'nonexistent', ceoAgentId: 'ceo-1',
      });

      await expect(errorSm.initialize()).rejects.toThrow('Failed to load venture');
    });

    it('should default to stage 1 when current_lifecycle_stage is null', async () => {
      const sbNull = createMockSupabase({
        ventureData: { id: 'v-1', name: 'Test', current_lifecycle_stage: null, status: 'active' },
      });

      const smNull = new VentureStateMachine({
        supabaseClient: sbNull, ventureId: 'v-1', ceoAgentId: 'ceo-1',
      });

      await smNull.initialize();
      expect(smNull.currentStage).toBe(1);
    });

    it('should return this for chaining', async () => {
      const result = await sm.initialize();
      expect(result).toBe(sm);
    });

    it('should handle empty stage work gracefully', async () => {
      const sbEmpty = createMockSupabase({ stageWorkData: null });
      const smEmpty = new VentureStateMachine({
        supabaseClient: sbEmpty, ventureId: 'v-1', ceoAgentId: 'ceo-1',
      });

      await smEmpty.initialize();
      expect(smEmpty.stageStates.size).toBe(0);
    });
  });

  describe('verifyStateFreshness', () => {
    it('should pass when DB stage matches cached stage', async () => {
      await sm.initialize();
      const result = await sm.verifyStateFreshness();
      expect(result).toBe(true);
    });

    it('should throw StateStalenessError when stages differ', async () => {
      await sm.initialize();
      expect(sm.currentStage).toBe(5);

      // DB now returns stage 6 (someone advanced it externally)
      mockSb.from = vi.fn((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'v-1', name: 'TestVenture', current_lifecycle_stage: 6, status: 'active' },
              error: null,
            }),
          };
        }
        if (table === 'venture_stage_work') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'pending_ceo_handoffs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      try {
        await sm.verifyStateFreshness();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StateStalenessError);
        expect(err.isRetryable).toBe(true);
      }
    });

    it('should throw when DB query fails', async () => {
      await sm.initialize();

      mockSb.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection lost' } }),
      }));

      await expect(sm.verifyStateFreshness()).rejects.toThrow('JIT Truth Check failed');
    });
  });

  describe('getCurrentStage', () => {
    it('should return current stage after initialization', async () => {
      await sm.initialize();
      expect(sm.getCurrentStage()).toBe(5);
    });

    it('should return null before initialization', () => {
      expect(sm.getCurrentStage()).toBeNull();
    });
  });

  describe('getStageState', () => {
    it('should return state for known stage', async () => {
      await sm.initialize();
      const state = sm.getStageState(3);
      expect(state).toEqual({ status: 'completed', health_score: 'green' });
    });

    it('should return default for unknown stage', () => {
      const state = sm.getStageState(99);
      expect(state).toEqual({ status: 'pending', health_score: null });
    });
  });

  describe('getSummary', () => {
    it('should return summary with correct counts', async () => {
      await sm.initialize();
      const summary = sm.getSummary();

      expect(summary.venture_id).toBe('v-1');
      expect(summary.ceo_agent_id).toBe('ceo-1');
      expect(summary.current_lifecycle_stage).toBe(5);
      expect(summary.stages_completed).toBe(2);
      expect(summary.pending_handoffs).toBe(1);
    });

    it('should return zero counts before initialization', () => {
      const summary = sm.getSummary();
      expect(summary.current_lifecycle_stage).toBeNull();
      expect(summary.stages_completed).toBe(0);
      expect(summary.pending_handoffs).toBe(0);
    });
  });

  describe('proposeHandoff', () => {
    it('should return rejected when validation fails', async () => {
      await sm.initialize();

      validateHandoffPackage.mockReturnValue({
        valid: false,
        errors: ['Missing required field: artifacts'],
      });

      const result = await sm.proposeHandoff({
        vpAgentId: 'vp-1',
        fromStage: 5,
        artifacts: [],
        key_decisions: [],
      });

      expect(result.accepted).toBe(false);
      expect(result.status).toBe('rejected');
      expect(result.errors).toContain('Missing required field: artifacts');
    });

    it('should persist handoff and return accepted on valid package', async () => {
      await sm.initialize();

      validateHandoffPackage.mockReturnValue({ valid: true, errors: [] });
      mockSb.rpc.mockResolvedValue({ data: 'h-new', error: null });

      const result = await sm.proposeHandoff({
        vpAgentId: 'vp-1',
        fromStage: 5,
        artifacts: [{ type: 'analysis', content: 'data' }],
        key_decisions: [{ decision: 'proceed' }],
      });

      expect(result.accepted).toBe(true);
      expect(result.handoff_id).toBe('h-new');
      expect(result.status).toBe('pending_ceo_review');
      expect(sm.pendingHandoffsCache.has('h-new')).toBe(true);
    });

    it('should cache the new handoff with correct fields', async () => {
      await sm.initialize();

      validateHandoffPackage.mockReturnValue({ valid: true, errors: [] });
      mockSb.rpc.mockResolvedValue({ data: 'h-new', error: null });

      await sm.proposeHandoff({
        vpAgentId: 'vp-1',
        fromStage: 5,
        artifacts: [{ type: 'a', content: 'c' }],
        key_decisions: [{ d: 'ok' }],
      });

      const cached = sm.pendingHandoffsCache.get('h-new');
      expect(cached.vp_agent_id).toBe('vp-1');
      expect(cached.from_stage).toBe(5);
      expect(cached.to_stage).toBe(6);
      expect(cached.status).toBe('pending');
    });

    it('should return rejected on RPC failure', async () => {
      await sm.initialize();

      validateHandoffPackage.mockReturnValue({ valid: true, errors: [] });
      mockSb.rpc.mockResolvedValue({ data: null, error: { message: 'RPC timeout' } });

      const result = await sm.proposeHandoff({
        vpAgentId: 'vp-1',
        fromStage: 5,
        artifacts: [{ type: 'a', content: 'c' }],
        key_decisions: [{ d: 'ok' }],
      });

      expect(result.accepted).toBe(false);
      expect(result.errors[0]).toContain('Database persistence failed');
    });

    it('should auto-initialize when not initialized', async () => {
      validateHandoffPackage.mockReturnValue({ valid: false, errors: ['test'] });

      expect(sm._initialized).toBe(false);
      await sm.proposeHandoff({ vpAgentId: 'vp', fromStage: 5 });
      expect(sm._initialized).toBe(true);
    });
  });

  describe('commitStageTransition', () => {
    it('should throw on unauthorized CEO', async () => {
      await sm.initialize();
      verifyCeoAuthority.mockResolvedValue(false);

      await expect(sm.commitStageTransition({
        handoffId: 'h-1',
        ceoAgentId: 'fake-ceo',
        decision: 'approve',
      })).rejects.toThrow('UNAUTHORIZED');
    });

    it('should delegate approve to approveHandoff', async () => {
      await sm.initialize();
      verifyCeoAuthority.mockResolvedValue(true);
      approveHandoff.mockResolvedValue({ success: true, new_stage: 6 });

      const result = await sm.commitStageTransition({
        handoffId: 'h-1',
        ceoAgentId: 'ceo-1',
        decision: 'approve',
        ceo_notes: 'Good work',
      });

      expect(approveHandoff).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should delegate reject to rejectHandoff', async () => {
      await sm.initialize();
      verifyCeoAuthority.mockResolvedValue(true);
      rejectHandoff.mockResolvedValue({ success: true, status: 'rejected' });

      const result = await sm.commitStageTransition({
        handoffId: 'h-1',
        ceoAgentId: 'ceo-1',
        decision: 'reject',
        ceo_notes: 'Needs more work',
      });

      expect(rejectHandoff).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should delegate request_changes to requestChanges', async () => {
      await sm.initialize();
      verifyCeoAuthority.mockResolvedValue(true);
      requestChanges.mockResolvedValue({ success: true, status: 'changes_requested' });

      const result = await sm.commitStageTransition({
        handoffId: 'h-1',
        ceoAgentId: 'ceo-1',
        decision: 'request_changes',
        ceo_notes: 'Fix artifact quality',
      });

      expect(requestChanges).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw on invalid decision', async () => {
      await sm.initialize();
      verifyCeoAuthority.mockResolvedValue(true);

      await expect(sm.commitStageTransition({
        handoffId: 'h-1',
        ceoAgentId: 'ceo-1',
        decision: 'invalid_decision',
      })).rejects.toThrow('Invalid decision: invalid_decision');
    });

    it('should throw when handoff not found in cache or DB', async () => {
      await sm.initialize();
      sm.pendingHandoffsCache.clear();
      verifyCeoAuthority.mockResolvedValue(true);

      // pending_ceo_handoffs query returns not found
      mockSb.from = vi.fn((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'v-1', current_lifecycle_stage: 5 },
              error: null,
            }),
          };
        }
        if (table === 'pending_ceo_handoffs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      await expect(sm.commitStageTransition({
        handoffId: 'nonexistent',
        ceoAgentId: 'ceo-1',
        decision: 'approve',
      })).rejects.toThrow('not found or already processed');
    });

    it('should pass context with updateLocalState and cache helpers to handlers', async () => {
      await sm.initialize();
      verifyCeoAuthority.mockResolvedValue(true);
      approveHandoff.mockResolvedValue({ success: true });

      await sm.commitStageTransition({
        handoffId: 'h-1',
        ceoAgentId: 'ceo-1',
        decision: 'approve',
      });

      // Verify context was passed with required functions
      const context = approveHandoff.mock.calls[0][0];
      expect(context.supabase).toBe(mockSb);
      expect(context.ventureId).toBe('v-1');
      expect(typeof context.verifyStateFreshness).toBe('function');
      expect(typeof context.updateLocalState).toBe('function');
    });
  });

  describe('getPendingHandoffs', () => {
    it('should return handoffs from RPC', async () => {
      const handoffs = [{ id: 'h-1', from_stage: 5 }];
      mockSb.rpc.mockResolvedValue({ data: handoffs, error: null });

      const result = await sm.getPendingHandoffs();
      expect(result).toEqual(handoffs);
    });

    it('should fall back to cache on RPC error', async () => {
      await sm.initialize();
      mockSb.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } });

      const result = await sm.getPendingHandoffs();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('h-1');
    });

    it('should return empty array when RPC returns null data and no cache', async () => {
      mockSb.rpc.mockResolvedValue({ data: null, error: null });

      const result = await sm.getPendingHandoffs();
      expect(result).toEqual([]);
    });
  });

  describe('error class exports', () => {
    it('should export StateStalenessError with correct properties', () => {
      const err = new StateStalenessError('test', { cachedStage: 1, dbStage: 2, ventureId: 'v-1' });
      expect(err.name).toBe('StateStalenessError');
      expect(err.isRetryable).toBe(true);
      expect(err.cachedStage).toBe(1);
      expect(err.dbStage).toBe(2);
      expect(err.ventureId).toBe('v-1');
      expect(err.message).toBe('test');
    });

    it('should export GoldenNuggetValidationError', () => {
      const err = new GoldenNuggetValidationError('bad artifacts', { passed: false });
      expect(err.name).toBe('GoldenNuggetValidationError');
      expect(err.validationResults.passed).toBe(false);
    });

    it('should export StageGateValidationError', () => {
      const err = new StageGateValidationError('gate failed', { gate_name: 'Revenue Gate' });
      expect(err.name).toBe('StageGateValidationError');
      expect(err.gateResults.gate_name).toBe('Revenue Gate');
    });
  });

  describe('getStageRequirements', () => {
    it('should delegate to handoff-operations module', () => {
      const result = sm.getStageRequirements(5);
      expect(result).toEqual({ artifacts: [], quality_gates: [] });
    });
  });
});
