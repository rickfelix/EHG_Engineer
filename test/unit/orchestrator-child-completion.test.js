/**
 * Unit Tests: Orchestrator Child Completion Flow
 *
 * Tests the per-child post-completion with parent finalization.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase before importing the module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn()
      }))
    }))
  }))
}));

// Import after mocking
import { createClient } from '@supabase/supabase-js';

describe('Orchestrator Child Completion Flow', () => {
  let mockSupabase;
  let mockFrom;
  let mockSelect;

  beforeEach(() => {
    vi.resetModules();

    // Set up mock chain
    mockSelect = vi.fn();
    mockFrom = vi.fn(() => ({
      select: mockSelect,
      update: vi.fn(() => ({
        eq: vi.fn()
      }))
    }));
    mockSupabase = {
      from: mockFrom
    };

    createClient.mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getChildPostCompletionCommands', () => {
    it('should return ship and learn for normal child SD', async () => {
      const { getChildPostCompletionCommands } = await import('../../lib/utils/orchestrator-child-completion.js');

      const childSd = {
        sd_type: 'feature',
        source: null
      };

      const commands = getChildPostCompletionCommands(childSd);

      expect(commands).toContain('ship');
      expect(commands).toContain('learn');
    });

    it('should skip learn for child SD created by learn command', async () => {
      const { getChildPostCompletionCommands } = await import('../../lib/utils/orchestrator-child-completion.js');

      const childSd = {
        sd_type: 'feature',
        source: 'learn'
      };

      const commands = getChildPostCompletionCommands(childSd);

      expect(commands).toContain('ship');
      expect(commands).not.toContain('learn');
    });
  });

  describe('getParentFinalizationCommands', () => {
    it('should return document and leo next for parent', async () => {
      const { getParentFinalizationCommands } = await import('../../lib/utils/orchestrator-child-completion.js');

      const parentSd = {
        sd_type: 'orchestrator',
        sd_key: 'SD-PARENT-001'
      };

      const commands = getParentFinalizationCommands(parentSd);

      expect(commands).toContain('document');
      expect(commands).toContain('leo next');
      expect(commands.length).toBe(2);
    });
  });

  describe('autoProceedChildCompletion', () => {
    it('should return command sequence structure', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 1,
              sd_key: 'SD-CHILD-001',
              title: 'Child SD',
              sd_type: 'feature',
              status: 'completed',
              parent_sd_id: null, // Non-child for simplicity
              source: null
            },
            error: null
          })
        })
      });

      const { autoProceedChildCompletion } = await import('../../lib/utils/orchestrator-child-completion.js');

      const result = await autoProceedChildCompletion('SD-CHILD-001');

      expect(result).toHaveProperty('childComplete');
      expect(result).toHaveProperty('commandSequence');
      expect(result).toHaveProperty('parentReady');
      expect(result).toHaveProperty('message');
      expect(Array.isArray(result.commandSequence)).toBe(true);
    });
  });

  describe('Module exports', () => {
    it('should export all required functions', async () => {
      const module = await import('../../lib/utils/orchestrator-child-completion.js');

      expect(typeof module.handleChildCompletion).toBe('function');
      expect(typeof module.getChildPostCompletionCommands).toBe('function');
      expect(typeof module.getParentFinalizationCommands).toBe('function');
      expect(typeof module.checkSiblingCompletion).toBe('function');
      expect(typeof module.autoProceedChildCompletion).toBe('function');
      expect(typeof module.isOrchestratorChild).toBe('function');

      // Check default export
      expect(typeof module.default.handleChildCompletion).toBe('function');
    });
  });
});
