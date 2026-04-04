/**
 * Tests for lib/worktree-guards.js
 * SD: SD-LEO-INFRA-AUTO-WORKTREE-START-001
 *
 * Covers PRD test scenarios TS1-TS4:
 * - TS1/TS2: Guard functions called during sd:start (integration-level, tested via sanitize/dirty/gitignore)
 * - TS3: Stale replacement with dirty guard
 * - TS4: Branch name sanitization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeBranchName, checkDirtyWorktree, verifyGitignore } from '../../lib/worktree-guards.js';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: vi.fn() }));

describe('worktree-guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeBranchName', () => {
    it('should accept valid branch names', () => {
      const result = sanitizeBranchName('feat/SD-FOO-001');
      expect(result).toEqual({ safe: true, sanitized: 'feat/SD-FOO-001' });
    });

    it('should accept names with dots and underscores', () => {
      expect(sanitizeBranchName('fix/SD-FOO.bar')).toEqual({ safe: true, sanitized: 'fix/SD-FOO.bar' });
      expect(sanitizeBranchName('feat/SD_FOO_001')).toEqual({ safe: true, sanitized: 'feat/SD_FOO_001' });
    });

    it('should reject empty or non-string input', () => {
      expect(sanitizeBranchName('')).toMatchObject({ safe: false });
      expect(sanitizeBranchName(null)).toMatchObject({ safe: false });
      expect(sanitizeBranchName(undefined)).toMatchObject({ safe: false });
    });

    it('should reject shell metacharacters', () => {
      expect(sanitizeBranchName('feat/$(whoami)')).toMatchObject({ safe: false });
      expect(sanitizeBranchName('feat/`rm -rf`')).toMatchObject({ safe: false });
      expect(sanitizeBranchName('feat/foo;bar')).toMatchObject({ safe: false });
      expect(sanitizeBranchName('feat/foo|bar')).toMatchObject({ safe: false });
    });

    it('should reject path traversal', () => {
      const result = sanitizeBranchName('feat/../evil');
      expect(result).toMatchObject({ safe: false, reason: expect.stringContaining('path traversal') });
    });

    it('should reject whitespace', () => {
      expect(sanitizeBranchName('feat/ bad name')).toMatchObject({ safe: false });
      expect(sanitizeBranchName('feat/\tbad')).toMatchObject({ safe: false });
    });

    it('should trim whitespace before validation', () => {
      const result = sanitizeBranchName('  feat/SD-FOO-001  ');
      expect(result).toEqual({ safe: true, sanitized: 'feat/SD-FOO-001' });
    });
  });

  describe('checkDirtyWorktree', () => {
    it('should return not dirty when path does not exist', () => {
      existsSync.mockReturnValue(false);
      expect(checkDirtyWorktree('/nonexistent')).toEqual({ dirty: false });
    });

    it('should return dirty when git status has output', () => {
      existsSync.mockReturnValue(true);
      execSync.mockReturnValue(' M src/foo.js\n?? new-file.txt\n');
      const result = checkDirtyWorktree('/some/worktree');
      expect(result.dirty).toBe(true);
      expect(result.changes).toContain('foo.js');
    });

    it('should return not dirty when git status is clean', () => {
      existsSync.mockReturnValue(true);
      execSync.mockReturnValue('');
      expect(checkDirtyWorktree('/some/worktree')).toEqual({ dirty: false });
    });

    it('should return not dirty when git status fails', () => {
      existsSync.mockReturnValue(true);
      execSync.mockImplementation(() => { throw new Error('not a git dir'); });
      expect(checkDirtyWorktree('/some/worktree')).toEqual({ dirty: false });
    });

    it('should pass correct options to execSync', () => {
      existsSync.mockReturnValue(true);
      execSync.mockReturnValue('');
      checkDirtyWorktree('/my/worktree');
      expect(execSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: '/my/worktree', encoding: 'utf8', stdio: 'pipe'
      });
    });
  });

  describe('verifyGitignore', () => {
    it('should return not ignored when path does not exist', () => {
      existsSync.mockReturnValue(false);
      const result = verifyGitignore('/nonexistent');
      expect(result.ignored).toBe(false);
      expect(result.reason).toContain('does not exist');
    });

    it('should return ignored when git check-ignore succeeds', () => {
      existsSync.mockReturnValue(true);
      execSync.mockReturnValue('');
      expect(verifyGitignore('/some/worktree')).toEqual({ ignored: true });
    });

    it('should return not ignored when git check-ignore fails', () => {
      existsSync.mockReturnValue(true);
      execSync.mockImplementation(() => { throw new Error('exit code 1'); });
      const result = verifyGitignore('/some/worktree');
      expect(result.ignored).toBe(false);
      expect(result.reason).toContain('.env');
    });
  });
});
