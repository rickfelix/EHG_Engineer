/**
 * Tests for Worktree Manager (SD-Keyed)
 * SD-LEO-INFRA-REFACTOR-WORKTREE-MANAGER-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

import { execSync } from 'child_process';

const {
  getRepoRoot,
  getWorktreesDir,
  getSessionsDir,
  createWorktree,
  cleanupWorktree,
  listWorktrees,
  resolveExpectedBranch,
  validateSdKey,
  _resetDeprecationWarning
} = await import('../../lib/worktree-manager.js');

describe('Worktree Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetDeprecationWarning();
  });

  describe('getRepoRoot', () => {
    it('should return trimmed git toplevel path', () => {
      execSync.mockReturnValue('/home/user/project\n');
      expect(getRepoRoot()).toBe('/home/user/project');
      expect(execSync).toHaveBeenCalledWith('git rev-parse --show-toplevel', { encoding: 'utf8' });
    });
  });

  describe('getWorktreesDir', () => {
    it('should return .worktrees under provided repo root', () => {
      const result = getWorktreesDir('/home/user/project');
      expect(result).toBe(path.join('/home/user/project', '.worktrees'));
    });

    it('should call getRepoRoot when no root provided', () => {
      execSync.mockReturnValue('/home/user/project\n');
      const result = getWorktreesDir();
      expect(result).toBe(path.join('/home/user/project', '.worktrees'));
    });
  });

  describe('getSessionsDir (deprecated alias)', () => {
    it('should return same as getWorktreesDir', () => {
      const a = getWorktreesDir('/home/user/project');
      const b = getSessionsDir('/home/user/project');
      expect(a).toBe(b);
    });
  });

  describe('validateSdKey', () => {
    it('should accept valid SD keys', () => {
      expect(() => validateSdKey('SD-LEO-INFRA-001')).not.toThrow();
      expect(() => validateSdKey('abc123')).not.toThrow();
      expect(() => validateSdKey('my_key-test')).not.toThrow();
    });

    it('should reject empty/null sdKey', () => {
      expect(() => validateSdKey('')).toThrow('invalid sdKey');
      expect(() => validateSdKey(null)).toThrow('invalid sdKey');
      expect(() => validateSdKey(undefined)).toThrow('invalid sdKey');
    });

    it('should reject path traversal characters', () => {
      expect(() => validateSdKey('../x')).toThrow('invalid sdKey');
      expect(() => validateSdKey('a/b')).toThrow('invalid sdKey');
      expect(() => validateSdKey('a\\b')).toThrow('invalid sdKey');
    });

    it('should reject keys longer than 128 chars', () => {
      const longKey = 'a'.repeat(129);
      expect(() => validateSdKey(longKey)).toThrow('invalid sdKey');
    });

    it('should set error code to INVALID_SD_KEY', () => {
      try {
        validateSdKey('');
      } catch (err) {
        expect(err.code).toBe('INVALID_SD_KEY');
      }
    });
  });

  describe('createWorktree', () => {
    it('should use sdKey for worktree path', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'git rev-parse --show-toplevel') return '/repo\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      // Mock fs operations
      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      fs.existsSync = vi.fn().mockReturnValue(false);
      fs.mkdirSync = vi.fn();
      fs.writeFileSync = vi.fn();

      try {
        const result = createWorktree({ sdKey: 'SD-TEST-001', branch: 'feat/test' });
        expect(result.sdKey).toBe('SD-TEST-001');
        expect(result.path).toContain('.worktrees');
        expect(result.path).toContain('SD-TEST-001');
        expect(result.created).toBe(true);
      } finally {
        fs.existsSync = origExists;
        fs.mkdirSync = origMkdir;
        fs.writeFileSync = origWrite;
      }
    });

    it('should map legacy session to sdKey with deprecation warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      execSync.mockImplementation((cmd) => {
        if (cmd === 'git rev-parse --show-toplevel') return '/repo\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      fs.existsSync = vi.fn().mockReturnValue(false);
      fs.mkdirSync = vi.fn();
      fs.writeFileSync = vi.fn();

      try {
        const result = createWorktree({ session: 'legacy123', branch: 'feat/test' });
        expect(result.sdKey).toBe('session-legacy123');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('session-keyed worktrees are deprecated')
        );
      } finally {
        fs.existsSync = origExists;
        fs.mkdirSync = origMkdir;
        fs.writeFileSync = origWrite;
        warnSpy.mockRestore();
      }
    });

    it('should rate-limit deprecation warning to once per process', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      execSync.mockImplementation((cmd) => {
        if (cmd === 'git rev-parse --show-toplevel') return '/repo\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      fs.existsSync = vi.fn().mockReturnValue(false);
      fs.mkdirSync = vi.fn();
      fs.writeFileSync = vi.fn();

      try {
        createWorktree({ session: 'call1', branch: 'feat/test1' });
        createWorktree({ session: 'call2', branch: 'feat/test2' });
        // Only one deprecation warning
        const deprecationWarnings = warnSpy.mock.calls.filter(
          c => c[0].includes('deprecated')
        );
        expect(deprecationWarnings).toHaveLength(1);
      } finally {
        fs.existsSync = origExists;
        fs.mkdirSync = origMkdir;
        fs.writeFileSync = origWrite;
        warnSpy.mockRestore();
      }
    });

    it('should prefer sdKey over session when both provided', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      execSync.mockImplementation((cmd) => {
        if (cmd === 'git rev-parse --show-toplevel') return '/repo\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      fs.existsSync = vi.fn().mockReturnValue(false);
      fs.mkdirSync = vi.fn();
      fs.writeFileSync = vi.fn();

      try {
        const result = createWorktree({
          sdKey: 'SD-EXPLICIT',
          session: 'legacy',
          branch: 'feat/test'
        });
        expect(result.sdKey).toBe('SD-EXPLICIT');
        // No deprecation warning since sdKey was used
        const deprecationWarnings = warnSpy.mock.calls.filter(
          c => c[0]?.includes?.('deprecated')
        );
        expect(deprecationWarnings).toHaveLength(0);
      } finally {
        fs.existsSync = origExists;
        fs.mkdirSync = origMkdir;
        fs.writeFileSync = origWrite;
        warnSpy.mockRestore();
      }
    });

    it('should reject invalid sdKey with INVALID_SD_KEY code', () => {
      expect(() => createWorktree({ sdKey: '../traversal', branch: 'feat/test' }))
        .toThrow('invalid sdKey');
    });
  });

  describe('cleanupWorktree', () => {
    it('should return worktree_not_found when worktree does not exist', () => {
      execSync.mockReturnValue('/repo\n');
      const result = cleanupWorktree('nonexistent-key');
      expect(result).toEqual({ cleaned: false, reason: 'worktree_not_found' });
    });

    it('should reject invalid sdKey', () => {
      expect(() => cleanupWorktree('../bad')).toThrow('invalid sdKey');
    });
  });

  describe('resolveExpectedBranch', () => {
    it('should return branch from .worktree.json if it exists', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
      const configPath = path.join(tmpDir, '.worktree.json');
      fs.writeFileSync(configPath, JSON.stringify({ expectedBranch: 'feat/sd-branch' }));

      const result = await resolveExpectedBranch(tmpDir);
      expect(result).toBe('feat/sd-branch');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should fall back to .session.json for legacy worktrees', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
      const configPath = path.join(tmpDir, '.session.json');
      fs.writeFileSync(configPath, JSON.stringify({ expectedBranch: 'feat/legacy-branch' }));

      const result = await resolveExpectedBranch(tmpDir);
      expect(result).toBe('feat/legacy-branch');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should prefer .worktree.json over .session.json', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
      fs.writeFileSync(
        path.join(tmpDir, '.worktree.json'),
        JSON.stringify({ expectedBranch: 'feat/new-style' })
      );
      fs.writeFileSync(
        path.join(tmpDir, '.session.json'),
        JSON.stringify({ expectedBranch: 'feat/old-style' })
      );

      const result = await resolveExpectedBranch(tmpDir);
      expect(result).toBe('feat/new-style');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should return null when no config and no supabase', async () => {
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
    it('should return empty array when .worktrees/ does not exist', () => {
      execSync.mockReturnValue('/nonexistent/path\n');
      const result = listWorktrees();
      expect(result).toEqual([]);
    });
  });
});
