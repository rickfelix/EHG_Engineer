/**
 * Unit Tests: VentureStateMachine JIT Truth Check
 * SD-UNIFIED-PATH-1.2.1: State Machine Refactor with JIT Truth Check
 *
 * Tests:
 * 1. StateStalenessError is exported and retryable
 * 2. verifyStateFreshness detects stale state
 * 3. verifyStateFreshness passes with fresh state
 * 4. _approveHandoff calls verifyStateFreshness before mutation
 * 5. _ensureInitialized calls initialize when not initialized
 * 6. Write-through updates venture_stage_work
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VentureStateMachine, StateStalenessError } from '../../../lib/agents/venture-state-machine.js';

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234'
}));

describe('VentureStateMachine JIT Truth Check', () => {
  let mockSupabase;
  let stateMachine;

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      single: vi.fn(),
      upsert: vi.fn(() => ({ error: null })),
      rpc: vi.fn()
    };

    stateMachine = new VentureStateMachine({
      supabaseClient: mockSupabase,
      ventureId: 'test-venture-123',
      ceoAgentId: 'test-ceo-456'
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('StateStalenessError', () => {
    it('should be exported from the module', () => {
      expect(StateStalenessError).toBeDefined();
    });

    it('should have isRetryable=true', () => {
      const error = new StateStalenessError('Test error');
      expect(error.isRetryable).toBe(true);
    });

    it('should include state details', () => {
      const error = new StateStalenessError('Test error', {
        cachedStage: 3,
        dbStage: 5,
        ventureId: 'venture-abc'
      });
      expect(error.cachedStage).toBe(3);
      expect(error.dbStage).toBe(5);
      expect(error.ventureId).toBe('venture-abc');
    });

    it('should have name StateStalenessError', () => {
      const error = new StateStalenessError('Test');
      expect(error.name).toBe('StateStalenessError');
    });
  });

  describe('verifyStateFreshness', () => {
    it('should pass when cache matches database', async () => {
      // Set cached state
      stateMachine.currentStage = 5;
      stateMachine._initialized = true;

      // Mock DB returns same stage
      mockSupabase.single.mockResolvedValue({
        data: { current_lifecycle_stage: 5 },
        error: null
      });

      const result = await stateMachine.verifyStateFreshness();
      expect(result).toBe(true);
    });

    it('should throw StateStalenessError when cache differs from database', async () => {
      // Set cached state
      stateMachine.currentStage = 3;
      stateMachine._initialized = true;

      // Mock DB returns different stage
      mockSupabase.single.mockResolvedValue({
        data: { current_lifecycle_stage: 5 },
        error: null
      });

      // Mock initialize for rehydration
      stateMachine.initialize = vi.fn().mockResolvedValue(stateMachine);

      await expect(stateMachine.verifyStateFreshness())
        .rejects.toThrow(StateStalenessError);

      // Should have called initialize for rehydration
      expect(stateMachine.initialize).toHaveBeenCalled();
    });

    it('should throw regular Error on DB failure', async () => {
      stateMachine.currentStage = 3;
      stateMachine._initialized = true;

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      await expect(stateMachine.verifyStateFreshness())
        .rejects.toThrow('JIT Truth Check failed: Database connection failed');
    });
  });

  describe('_ensureInitialized', () => {
    it('should call initialize when not initialized', async () => {
      stateMachine._initialized = false;
      stateMachine.initialize = vi.fn().mockResolvedValue(stateMachine);

      await stateMachine._ensureInitialized();

      expect(stateMachine.initialize).toHaveBeenCalled();
    });

    it('should not call initialize when already initialized', async () => {
      stateMachine._initialized = true;
      stateMachine.initialize = vi.fn();

      await stateMachine._ensureInitialized();

      expect(stateMachine.initialize).not.toHaveBeenCalled();
    });
  });

  describe('_approveHandoff with JIT Truth Check', () => {
    const mockHandoff = {
      id: 'handoff-123',
      from_stage: 3,
      to_stage: 4,
      package: {
        artifacts: [{ type: 'test', content: 'test' }],
        key_decisions: ['decision 1']
      }
    };

    beforeEach(() => {
      stateMachine._initialized = true;
      stateMachine.currentStage = 3;
      stateMachine.ceoAgentId = 'ceo-123';
    });

    it('should call verifyStateFreshness before mutation', async () => {
      // Mock fresh state
      mockSupabase.single.mockResolvedValue({
        data: { current_lifecycle_stage: 3 },
        error: null
      });

      // Mock RPC success
      mockSupabase.rpc.mockResolvedValue({
        data: { was_duplicate: false, idempotency_key: 'key-123' },
        error: null
      });

      // Mock upsert success
      mockSupabase.upsert = vi.fn().mockResolvedValue({ error: null });

      const spy = vi.spyOn(stateMachine, 'verifyStateFreshness');

      await stateMachine._approveHandoff(mockHandoff, 'CEO approved');

      expect(spy).toHaveBeenCalled();
    });

    it('should abort if state is stale', async () => {
      // Mock stale state
      mockSupabase.single.mockResolvedValue({
        data: { current_lifecycle_stage: 5 },
        error: null
      });

      // Mock initialize
      stateMachine.initialize = vi.fn().mockResolvedValue(stateMachine);

      await expect(stateMachine._approveHandoff(mockHandoff, 'CEO notes'))
        .rejects.toThrow(StateStalenessError);

      // RPC should NOT have been called
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should write-through to venture_stage_work after mutation', async () => {
      // Mock fresh state
      mockSupabase.single.mockResolvedValue({
        data: { current_lifecycle_stage: 3 },
        error: null
      });

      // Mock RPC success
      mockSupabase.rpc.mockResolvedValue({
        data: { was_duplicate: false },
        error: null
      });

      // Track upsert calls
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      mockSupabase.from = vi.fn((table) => {
        if (table === 'venture_stage_work') {
          return { upsert: upsertMock };
        }
        return mockSupabase;
      });

      await stateMachine._approveHandoff(mockHandoff, 'CEO approved');

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          venture_id: 'test-venture-123',
          lifecycle_stage: 3,
          stage_status: 'completed',
          health_score: 'green'
        }),
        expect.objectContaining({ onConflict: 'venture_id,lifecycle_stage' })
      );
    });
  });

  describe('proposeHandoff with initialization guard', () => {
    it('should call _ensureInitialized before processing', async () => {
      stateMachine._initialized = false;

      // Mock initialize
      stateMachine.initialize = vi.fn().mockImplementation(async () => {
        stateMachine._initialized = true;
        stateMachine.currentStage = 1;
        return stateMachine;
      });

      // Mock RPC for handoff creation
      mockSupabase.rpc.mockResolvedValue({
        data: 'handoff-id-123',
        error: null
      });

      await stateMachine.proposeHandoff({
        vpAgentId: 'vp-123',
        fromStage: 1,
        artifacts: [{ type: 'test', content: 'content' }],
        key_decisions: ['decision']
      });

      expect(stateMachine.initialize).toHaveBeenCalled();
    });
  });

  describe('commitStageTransition with initialization guard', () => {
    it('should call _ensureInitialized before processing', async () => {
      stateMachine._initialized = false;

      // Mock initialize
      stateMachine.initialize = vi.fn().mockImplementation(async () => {
        stateMachine._initialized = true;
        stateMachine.currentStage = 1;
        return stateMachine;
      });

      // Mock CEO authority check
      mockSupabase.single.mockResolvedValue({
        data: { agent_type: 'venture_ceo' },
        error: null
      });

      // Expect it to fail after initialization (no handoff found)
      await expect(
        stateMachine.commitStageTransition({
          handoffId: 'nonexistent',
          ceoAgentId: 'ceo-123',
          decision: 'approve'
        })
      ).rejects.toThrow();

      // But initialize should have been called first
      expect(stateMachine.initialize).toHaveBeenCalled();
    });
  });
});
