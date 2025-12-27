/**
 * Unit tests for ManifestoMode
 * SD-MANIFESTO-004: Manifesto Mode Activation System
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ManifestoMode,
  ManifestoNotActiveError,
  ManifestoActivationError,
  ManifestoVersionMismatchError,
  getManifestoMode,
  resetManifestoMode
} from '../../../lib/governance/manifesto-mode.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

function createMockSupabaseClient() {
  return {
    from: jest.fn()
  };
}

function createMockChain(returnValue = { data: null, error: null }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue(returnValue),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue(returnValue),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(returnValue)
  };
  return chain;
}

// =============================================================================
// TESTS
// =============================================================================

describe('ManifestoMode', () => {
  let manifestoMode;
  let mockSupabaseClient;

  beforeEach(() => {
    jest.clearAllMocks();
    resetManifestoMode();
    mockSupabaseClient = createMockSupabaseClient();
    manifestoMode = new ManifestoMode({ supabaseClient: mockSupabaseClient });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetManifestoMode();
  });

  describe('isActive', () => {
    it('should return true when manifesto_active is true', async () => {
      const chain = createMockChain({ data: { value: true }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.isActive();

      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('system_configuration');
    });

    it('should return false when manifesto_active is false', async () => {
      const chain = createMockChain({ data: { value: false }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.isActive();

      expect(result).toBe(false);
    });

    it('should return false when no configuration exists', async () => {
      const chain = createMockChain({ data: null, error: { code: 'PGRST116' } });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.isActive();

      expect(result).toBe(false);
    });

    it('should cache results for 5 seconds', async () => {
      const chain = createMockChain({ data: { value: true }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      // First call
      await manifestoMode.isActive();
      // Second call should use cache
      await manifestoMode.isActive();

      // Should only call database once
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1);
    });

    it('should throw on database error (non-PGRST116)', async () => {
      const chain = createMockChain({ data: null, error: { code: 'OTHER_ERROR', message: 'DB failure' } });
      mockSupabaseClient.from.mockReturnValue(chain);

      // When the error is not PGRST116 (no rows), it should reject
      await expect(manifestoMode.isActive()).rejects.toMatchObject({ code: 'OTHER_ERROR' });
    });
  });

  describe('getVersion', () => {
    it('should return version string when configured', async () => {
      const chain = createMockChain({ data: { value: '1.0.0' }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.getVersion();

      expect(result).toBe('1.0.0');
    });

    it('should return null when no version configured', async () => {
      const chain = createMockChain({ data: null, error: { code: 'PGRST116' } });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.getVersion();

      expect(result).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return complete status object', async () => {
      const chain = createMockChain({ data: { value: true }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.getStatus();

      expect(result).toHaveProperty('isActive');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('targetActivationDate');
      expect(result).toHaveProperty('daysUntilTarget');
      expect(result).toHaveProperty('canActivateNow');
    });
  });

  describe('activate', () => {
    it('should activate manifesto for L0_CHAIRMAN', async () => {
      // First call checks isActive (returns false)
      // Subsequent calls do upsert and insert
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { value: false }, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await manifestoMode.activate({
        activatedBy: 'chairman_001',
        authorityLevel: 'L0_CHAIRMAN',
        reason: 'Constitution Signing Ceremony'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Constitution Signing complete');
    });

    it('should reject activation by non-L0 authority', async () => {
      await expect(manifestoMode.activate({
        activatedBy: 'ceo_001',
        authorityLevel: 'L2_CEO',
        reason: 'Attempted activation'
      })).rejects.toThrow(ManifestoActivationError);
    });

    it('should return early if already active', async () => {
      const chain = createMockChain({ data: { value: true }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.activate({
        activatedBy: 'chairman_001',
        authorityLevel: 'L0_CHAIRMAN'
      });

      expect(result.alreadyActive).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('should require a reason for deactivation', async () => {
      await expect(manifestoMode.deactivate({
        deactivatedBy: 'chairman_001',
        authorityLevel: 'L0_CHAIRMAN',
        reason: '' // Empty reason
      })).rejects.toThrow('Deactivation reason is MANDATORY');
    });

    it('should reject deactivation by non-L0 authority', async () => {
      await expect(manifestoMode.deactivate({
        deactivatedBy: 'eva_001',
        authorityLevel: 'L1_EVA',
        reason: 'Emergency shutdown'
      })).rejects.toThrow(ManifestoActivationError);
    });

    it('should deactivate when authorized', async () => {
      // Need eq to support chaining for isActive() check: from().select().eq().single()
      // Also need eq to resolve for update: from().update().eq()
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(() => {
          // Return self for chaining, but also be thenable for direct await
          const result = { ...mockChain };
          result.then = (resolve) => resolve({ data: null, error: null });
          return result;
        }),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { value: true }, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await manifestoMode.deactivate({
        deactivatedBy: 'chairman_001',
        authorityLevel: 'L0_CHAIRMAN',
        reason: 'Emergency maintenance required'
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe('Emergency maintenance required');
    });
  });

  describe('verifyOperationAllowed', () => {
    it('should allow operations when manifesto inactive', async () => {
      const chain = createMockChain({ data: { value: false }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.verifyOperationAllowed({
        operationType: 'venture_creation',
        agentId: 'eva_001',
        authorityLevel: 'L1_EVA'
      });

      expect(result.allowed).toBe(true);
      expect(result.manifestoActive).toBe(false);
    });

    it('should log L2+ operations when manifesto active', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { value: true }, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await manifestoMode.verifyOperationAllowed({
        operationType: 'venture_creation',
        agentId: 'eva_001',
        authorityLevel: 'L1_EVA'
      });

      expect(result.allowed).toBe(true);
      expect(result.manifestoActive).toBe(true);
      expect(result.requiresOathEnforcement).toBe(true);
    });

    it('should skip logging for non-L2+ operations', async () => {
      const chain = createMockChain({ data: { value: true }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await manifestoMode.verifyOperationAllowed({
        operationType: 'health_check', // Not in L2+ list
        agentId: 'agent_001',
        authorityLevel: 'L4_CREW'
      });

      expect(result.allowed).toBe(true);
      expect(result.requiresOathEnforcement).toBeUndefined();
    });
  });

  describe('updateVersion', () => {
    it('should update version for L0_CHAIRMAN', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { value: '1.0.0' }, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await manifestoMode.updateVersion({
        newVersion: '1.1.0',
        updatedBy: 'chairman_001',
        authorityLevel: 'L0_CHAIRMAN',
        changelog: 'Added new oath provisions'
      });

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe('1.1.0');
      expect(result.previousVersion).toBe('1.0.0');
    });

    it('should reject version update by non-L0 authority', async () => {
      await expect(manifestoMode.updateVersion({
        newVersion: '1.1.0',
        updatedBy: 'ceo_001',
        authorityLevel: 'L2_CEO',
        changelog: 'Attempted update'
      })).rejects.toThrow(ManifestoActivationError);
    });
  });

  describe('requireActive', () => {
    it('should not throw when manifesto is active', async () => {
      const chain = createMockChain({ data: { value: true }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      await expect(manifestoMode.requireActive()).resolves.not.toThrow();
    });

    it('should throw ManifestoNotActiveError when inactive', async () => {
      const chain = createMockChain({ data: { value: false }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      await expect(manifestoMode.requireActive()).rejects.toThrow(ManifestoNotActiveError);
    });
  });

  describe('clearCache', () => {
    it('should clear internal cache', async () => {
      const chain = createMockChain({ data: { value: true }, error: null });
      mockSupabaseClient.from.mockReturnValue(chain);

      // Populate cache
      await manifestoMode.isActive();
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1);

      // Clear cache
      manifestoMode.clearCache();

      // Should query database again
      await manifestoMode.isActive();
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Singleton helpers', () => {
  beforeEach(() => {
    resetManifestoMode();
  });

  afterEach(() => {
    resetManifestoMode();
  });

  describe('getManifestoMode', () => {
    it('should return singleton instance', () => {
      const instance1 = getManifestoMode();
      const instance2 = getManifestoMode();

      expect(instance1).toBe(instance2);
    });
  });

  describe('resetManifestoMode', () => {
    it('should reset singleton instance', () => {
      const instance1 = getManifestoMode();
      resetManifestoMode();
      const instance2 = getManifestoMode();

      expect(instance1).not.toBe(instance2);
    });
  });
});

describe('Error classes', () => {
  describe('ManifestoNotActiveError', () => {
    it('should have correct name and message', () => {
      const error = new ManifestoNotActiveError('Custom message');

      expect(error.name).toBe('ManifestoNotActiveError');
      expect(error.message).toContain('MANIFESTO INACTIVE');
      expect(error.message).toContain('Custom message');
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('ManifestoActivationError', () => {
    it('should have correct name and context', () => {
      const error = new ManifestoActivationError('Activation failed', { code: 'AUTH_001' });

      expect(error.name).toBe('ManifestoActivationError');
      expect(error.message).toContain('MANIFESTO ACTIVATION FAILED');
      expect(error.context.code).toBe('AUTH_001');
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('ManifestoVersionMismatchError', () => {
    it('should have correct properties', () => {
      const error = new ManifestoVersionMismatchError('1.0.0', '0.9.0');

      expect(error.name).toBe('ManifestoVersionMismatchError');
      expect(error.expectedVersion).toBe('1.0.0');
      expect(error.actualVersion).toBe('0.9.0');
      expect(error.message).toContain('VERSION MISMATCH');
    });
  });
});
