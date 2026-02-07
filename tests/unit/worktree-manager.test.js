/**
 * Tests for Worktree Manager
 * SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We test the module functions by mocking child_process.execSync and fs operations
// since actual git worktree operations require a real git repo.

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

import { execSync } from 'child_process';

// Import after mocking
const {
  getRepoRoot,
  getSessionsDir,
  createWorktree,
  symlinkNodeModules,
  removeWorktree,
  listWorktrees,
  resolveExpectedBranch
} = await import('../../lib/worktree-manager.js');

describe('Worktree Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRepoRoot', () => {
    it('should return trimmed git toplevel path', () => {
      execSync.mockReturnValue('/home/user/project\n');
      expect(getRepoRoot()).toBe('/home/user/project');
      expect(execSync).toHaveBeenCalledWith('git rev-parse --show-toplevel', { encoding: 'utf8' });
    });
  });

  describe('getSessionsDir', () => {
    it('should return .sessions under provided repo root', () => {
      const result = getSessionsDir('/home/user/project');
      expect(result).toBe(path.join('/home/user/project', '.sessions'));
    });

    it('should call getRepoRoot when no root provided', () => {
      execSync.mockReturnValue('/home/user/project\n');
      const result = getSessionsDir();
      expect(result).toBe(path.join('/home/user/project', '.sessions'));
    });
  });

  describe('resolveExpectedBranch', () => {
    it('should return branch from .session.json if it exists', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
      const configPath = path.join(tmpDir, '.session.json');
      fs.writeFileSync(configPath, JSON.stringify({ expectedBranch: 'feat/test-branch' }));

      const result = await resolveExpectedBranch(tmpDir);
      expect(result).toBe('feat/test-branch');

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should return null when no .session.json and no supabase', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));

      const result = await resolveExpectedBranch(tmpDir);
      expect(result).toBeNull();

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should fall back to supabase v_active_sessions', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ sd_id: 'SD-TEST', branch: 'feat/from-db' }],
                  error: null
                })
              })
            })
          })
        })
      };

      const result = await resolveExpectedBranch(tmpDir, mockSupabase);
      expect(result).toBe('feat/from-db');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should return null when supabase query fails', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));

      const mockSupabase = {
        from: vi.fn().mockImplementation(() => { throw new Error('DB down'); })
      };

      const result = await resolveExpectedBranch(tmpDir, mockSupabase);
      expect(result).toBeNull();

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('listWorktrees', () => {
    it('should return empty array when .sessions/ does not exist', () => {
      execSync.mockReturnValue('/nonexistent/path\n');
      const result = listWorktrees();
      expect(result).toEqual([]);
    });
  });
});
