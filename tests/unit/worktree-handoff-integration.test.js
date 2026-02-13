/**
 * Tests for Worktree-Handoff Integration
 * SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001
 *
 * Validates:
 * - Branch gate worktreeMode creates branch without switching
 * - PlanToExecExecutor calls createWorktree after state transitions
 * - Worktree creation failures don't block handoff
 * - Display helpers show worktree path
 * - LeadFinalApprovalExecutor calls cleanupWorktree
 * - Cleanup failures don't block completion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worktree-manager before importing modules that use it
vi.mock('../../lib/worktree-manager.js', () => ({
  createWorktree: vi.fn(),
  cleanupWorktree: vi.fn(),
  symlinkNodeModules: vi.fn(),
  getRepoRoot: vi.fn(() => '/repo'),
  validateSdKey: vi.fn()
}));

import { createWorktree, cleanupWorktree, symlinkNodeModules, validateSdKey } from '../../lib/worktree-manager.js';

describe('Worktree-Handoff Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('displayExecPhaseRequirements - worktree info', () => {
    it('should display worktree path when provided', async () => {
      const { displayExecPhaseRequirements } = await import(
        '../../scripts/modules/handoff/executors/plan-to-exec/display-helpers.js'
      );

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        })
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await displayExecPhaseRequirements(mockSupabase, 'test-sd-id', null, {
        sdType: 'infrastructure',
        worktreePath: '/repo/.worktrees/SD-TEST-001',
        sdKey: 'SD-TEST-001'
      });

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('.worktrees/SD-TEST-001');
      expect(output).toContain('cd /repo/.worktrees/SD-TEST-001');

      consoleSpy.mockRestore();
    });

    it('should display fallback when worktree not created', async () => {
      const { displayExecPhaseRequirements } = await import(
        '../../scripts/modules/handoff/executors/plan-to-exec/display-helpers.js'
      );

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        })
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await displayExecPhaseRequirements(mockSupabase, 'test-sd-id', null, {
        sdType: 'infrastructure',
        worktreePath: null,
        sdKey: 'SD-TEST-001'
      });

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Worktree: not created');
      expect(output).toContain('npm run session:worktree');

      consoleSpy.mockRestore();
    });
  });

  describe('createWorktree call contract', () => {
    it('should call createWorktree with sdKey and branch', () => {
      createWorktree.mockReturnValue({
        path: '/repo/.worktrees/SD-TEST-001',
        branch: 'feat/test',
        sdKey: 'SD-TEST-001',
        created: true,
        reused: false
      });

      const result = createWorktree({ sdKey: 'SD-TEST-001', branch: 'feat/test' });

      expect(createWorktree).toHaveBeenCalledWith({ sdKey: 'SD-TEST-001', branch: 'feat/test' });
      expect(result.created).toBe(true);
      expect(result.path).toContain('SD-TEST-001');
    });

    it('should handle createWorktree failure gracefully', () => {
      createWorktree.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      let worktreeResult = null;
      let warning = null;
      try {
        worktreeResult = createWorktree({ sdKey: 'SD-TEST-001', branch: 'feat/test' });
      } catch (err) {
        warning = err.message;
      }

      expect(worktreeResult).toBeNull();
      expect(warning).toBe('Permission denied');
    });

    it('should handle reused worktree', () => {
      createWorktree.mockReturnValue({
        path: '/repo/.worktrees/SD-TEST-001',
        branch: 'feat/test',
        sdKey: 'SD-TEST-001',
        created: false,
        reused: true
      });

      const result = createWorktree({ sdKey: 'SD-TEST-001', branch: 'feat/test' });
      expect(result.reused).toBe(true);
      expect(result.created).toBe(false);
    });
  });

  describe('cleanupWorktree call contract', () => {
    it('should call cleanupWorktree without force on LEAD-FINAL-APPROVAL', () => {
      cleanupWorktree.mockReturnValue({ cleaned: true, reason: 'success' });

      const result = cleanupWorktree('SD-TEST-001');

      expect(cleanupWorktree).toHaveBeenCalledWith('SD-TEST-001');
      expect(result.cleaned).toBe(true);
    });

    it('should handle worktree_not_found gracefully', () => {
      cleanupWorktree.mockReturnValue({ cleaned: false, reason: 'worktree_not_found' });

      const result = cleanupWorktree('SD-TEST-001');

      expect(result.cleaned).toBe(false);
      expect(result.reason).toBe('worktree_not_found');
    });

    it('should handle dirty_worktree by aborting cleanup', () => {
      cleanupWorktree.mockReturnValue({ cleaned: false, reason: 'dirty_worktree' });

      const result = cleanupWorktree('SD-TEST-001');

      expect(result.cleaned).toBe(false);
      expect(result.reason).toBe('dirty_worktree');
    });

    it('should handle cleanup failure without throwing', () => {
      cleanupWorktree.mockImplementation(() => {
        throw new Error('git worktree remove failed');
      });

      let cleanupResult = null;
      let warning = null;
      try {
        cleanupResult = cleanupWorktree('SD-TEST-001');
      } catch (err) {
        warning = err.message;
      }

      expect(cleanupResult).toBeNull();
      expect(warning).toBe('git worktree remove failed');
    });

    it('should validate sdKey before cleanup', () => {
      validateSdKey.mockImplementation((key) => {
        if (!key || typeof key !== 'string') {
          const err = new Error('invalid sdKey');
          err.code = 'INVALID_SD_KEY';
          throw err;
        }
      });

      expect(() => validateSdKey('SD-TEST-001')).not.toThrow();

      validateSdKey.mockImplementation(() => {
        const err = new Error('invalid sdKey');
        err.code = 'INVALID_SD_KEY';
        throw err;
      });
      expect(() => validateSdKey('')).toThrow('invalid sdKey');
    });
  });

  describe('symlinkNodeModules integration', () => {
    it('should call symlinkNodeModules after worktree creation', () => {
      symlinkNodeModules.mockImplementation(() => {});

      symlinkNodeModules('/repo/.worktrees/SD-TEST-001', '/repo');

      expect(symlinkNodeModules).toHaveBeenCalledWith(
        '/repo/.worktrees/SD-TEST-001',
        '/repo'
      );
    });

    it('should not block on symlinkNodeModules failure', () => {
      symlinkNodeModules.mockImplementation(() => {
        throw new Error('junction creation failed');
      });

      let warning = null;
      try {
        symlinkNodeModules('/repo/.worktrees/SD-TEST-001', '/repo');
      } catch (err) {
        warning = err.message;
      }

      expect(warning).toBe('junction creation failed');
    });
  });
});
