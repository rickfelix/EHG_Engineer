/**
 * Unit Tests: Dependency Chain Validator
 *
 * Tests the AUTO-PROCEED dependency chain validation logic.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-D
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase before importing the module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        })),
        in: vi.fn()
      }))
    }))
  }))
}));

// Import after mocking
import { createClient } from '@supabase/supabase-js';

describe('Dependency Chain Validator', () => {
  let mockSupabase;
  let mockFrom;
  let mockSelect;

  beforeEach(() => {
    vi.resetModules();

    // Set up mock chain
    mockSelect = vi.fn();
    mockFrom = vi.fn(() => ({
      select: mockSelect
    }));
    mockSupabase = {
      from: mockFrom
    };

    createClient.mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateDependencyChain', () => {
    it('should return canProceed=true when SD has no dependencies', async () => {
      // Mock SD with no dependency_chain
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 1,
              sd_key: 'SD-TEST-001',
              title: 'Test SD',
              dependency_chain: null,
              status: 'in_progress',
              progress: 50
            },
            error: null
          })
        })
      });

      // Re-import to get fresh module with mocks
      const { validateDependencyChain } = await import('../../lib/utils/dependency-chain-validator.js');

      const result = await validateDependencyChain('SD-TEST-001');

      expect(result.canProceed).toBe(true);
      expect(result.blockedBy).toEqual([]);
      expect(result.message).toBe('No dependencies required');
    });

    it('should return canProceed=false when SD is not found', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' }
          })
        })
      });

      const { validateDependencyChain } = await import('../../lib/utils/dependency-chain-validator.js');

      const result = await validateDependencyChain('SD-NONEXISTENT');

      expect(result.canProceed).toBe(false);
      expect(result.message).toContain('SD not found');
    });
  });

  describe('DependencyValidationResult structure', () => {
    it('should have required properties', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 1,
              sd_key: 'SD-TEST-001',
              dependency_chain: [],
              status: 'in_progress',
              progress: 50
            },
            error: null
          })
        })
      });

      const { validateDependencyChain } = await import('../../lib/utils/dependency-chain-validator.js');

      const result = await validateDependencyChain('SD-TEST-001');

      // Check structure
      expect(result).toHaveProperty('canProceed');
      expect(result).toHaveProperty('blockedBy');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('dependencyStatus');

      // Check types
      expect(typeof result.canProceed).toBe('boolean');
      expect(Array.isArray(result.blockedBy)).toBe(true);
      expect(typeof result.message).toBe('string');
      expect(Array.isArray(result.dependencyStatus)).toBe(true);
    });
  });

  describe('autoProceedDependencyCheck', () => {
    it('should return canProceed and waited properties', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 1,
              sd_key: 'SD-TEST-001',
              dependency_chain: null,
              status: 'in_progress',
              progress: 50
            },
            error: null
          })
        })
      });

      const { autoProceedDependencyCheck } = await import('../../lib/utils/dependency-chain-validator.js');

      const result = await autoProceedDependencyCheck('SD-TEST-001');

      expect(result).toHaveProperty('canProceed');
      expect(result).toHaveProperty('waited');
      expect(result).toHaveProperty('message');
      expect(result.waited).toBe(false); // No dependencies to wait for
    });
  });

  describe('Module exports', () => {
    it('should export all required functions', async () => {
      const module = await import('../../lib/utils/dependency-chain-validator.js');

      expect(typeof module.validateDependencyChain).toBe('function');
      expect(typeof module.waitForDependency).toBe('function');
      expect(typeof module.autoProceedDependencyCheck).toBe('function');
      expect(typeof module.getDependencyStatusDisplay).toBe('function');

      // Check default export
      expect(typeof module.default.validateDependencyChain).toBe('function');
      expect(typeof module.default.waitForDependency).toBe('function');
      expect(typeof module.default.autoProceedDependencyCheck).toBe('function');
      expect(typeof module.default.getDependencyStatusDisplay).toBe('function');
    });
  });
});
