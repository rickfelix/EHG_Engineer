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
  safeRecursiveRm,
  safeRecursiveCp,
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

    it('should strip .worktrees/ path when called from inside a worktree', () => {
      execSync.mockReturnValue('/home/user/project/.worktrees/SD-XXX-001\n');
      expect(getRepoRoot()).toBe('/home/user/project');
    });

    it('should strip nested .worktrees/ path', () => {
      execSync.mockReturnValue('/home/user/project/.worktrees/SD-A/.worktrees/SD-B\n');
      expect(getRepoRoot()).toBe('/home/user/project');
    });

    it('should handle Windows backslash paths inside worktrees', () => {
      execSync.mockReturnValue('C:\\Users\\user\\project\\.worktrees\\SD-XXX\n');
      expect(getRepoRoot()).toBe('C:\\Users\\user\\project');
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
        // QF-20260530-566: satisfy verifyWorktreeRegisteredSync post-condition
        // (SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001) — `git worktree list
        // --porcelain` must report the newly-created worktree(s). Listing all
        // fixture paths is harmless: verify only checks its own path is present.
        if (cmd.includes('worktree list')) return [
          'worktree /repo/.worktrees/SD-TEST-001',
          'worktree /repo/.worktrees/session-legacy123',
          'worktree /repo/.worktrees/session-call1',
          'worktree /repo/.worktrees/session-call2',
          'worktree /repo/.worktrees/SD-EXPLICIT'
        ].join('\n') + '\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      // Mock fs operations
      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      // QF-20260530-566: report the worktree dir absent (pre-creation) but its
      // .git pointer present (post-creation) so the atomicity post-condition passes.
      fs.existsSync = vi.fn((p) => String(p).replace(/\\/g, '/').endsWith('/.git'));
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
        // QF-20260530-566: satisfy verifyWorktreeRegisteredSync post-condition
        // (SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001) — `git worktree list
        // --porcelain` must report the newly-created worktree(s). Listing all
        // fixture paths is harmless: verify only checks its own path is present.
        if (cmd.includes('worktree list')) return [
          'worktree /repo/.worktrees/SD-TEST-001',
          'worktree /repo/.worktrees/session-legacy123',
          'worktree /repo/.worktrees/session-call1',
          'worktree /repo/.worktrees/session-call2',
          'worktree /repo/.worktrees/SD-EXPLICIT'
        ].join('\n') + '\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      // QF-20260530-566: report the worktree dir absent (pre-creation) but its
      // .git pointer present (post-creation) so the atomicity post-condition passes.
      fs.existsSync = vi.fn((p) => String(p).replace(/\\/g, '/').endsWith('/.git'));
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
        // QF-20260530-566: satisfy verifyWorktreeRegisteredSync post-condition
        // (SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001) — `git worktree list
        // --porcelain` must report the newly-created worktree(s). Listing all
        // fixture paths is harmless: verify only checks its own path is present.
        if (cmd.includes('worktree list')) return [
          'worktree /repo/.worktrees/SD-TEST-001',
          'worktree /repo/.worktrees/session-legacy123',
          'worktree /repo/.worktrees/session-call1',
          'worktree /repo/.worktrees/session-call2',
          'worktree /repo/.worktrees/SD-EXPLICIT'
        ].join('\n') + '\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      // QF-20260530-566: report the worktree dir absent (pre-creation) but its
      // .git pointer present (post-creation) so the atomicity post-condition passes.
      fs.existsSync = vi.fn((p) => String(p).replace(/\\/g, '/').endsWith('/.git'));
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
        // QF-20260530-566: satisfy verifyWorktreeRegisteredSync post-condition
        // (SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001) — `git worktree list
        // --porcelain` must report the newly-created worktree(s). Listing all
        // fixture paths is harmless: verify only checks its own path is present.
        if (cmd.includes('worktree list')) return [
          'worktree /repo/.worktrees/SD-TEST-001',
          'worktree /repo/.worktrees/session-legacy123',
          'worktree /repo/.worktrees/session-call1',
          'worktree /repo/.worktrees/session-call2',
          'worktree /repo/.worktrees/SD-EXPLICIT'
        ].join('\n') + '\n';
        if (cmd.includes('show-ref')) return '';
        if (cmd.includes('ls-remote')) return '';
        if (cmd.includes('worktree add')) return '';
        return '';
      });

      const origExists = fs.existsSync;
      const origMkdir = fs.mkdirSync;
      const origWrite = fs.writeFileSync;
      // QF-20260530-566: report the worktree dir absent (pre-creation) but its
      // .git pointer present (post-creation) so the atomicity post-condition passes.
      fs.existsSync = vi.fn((p) => String(p).replace(/\\/g, '/').endsWith('/.git'));
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

  // SD-FDBK-ENH-SESSION-WORKTREE-CLEANUP-001
  describe('safeRecursiveRm', () => {
    it('returns silently when path does not exist (force=true default)', () => {
      const missing = path.join(os.tmpdir(), `srm-${Date.now()}-missing`);
      expect(() => safeRecursiveRm(missing)).not.toThrow();
    });

    it('removes a regular directory tree like fs.rmSync', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srm-'));
      fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'b');
      safeRecursiveRm(dir);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('unlinks a top-level junction child WITHOUT touching the junction target', () => {
      const target = fs.mkdtempSync(path.join(os.tmpdir(), 'srm-target-'));
      const sentinel = path.join(target, 'sentinel.txt');
      fs.writeFileSync(sentinel, 'PRESERVE_ME');

      const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'srm-wt-'));
      fs.writeFileSync(path.join(wt, 'src.txt'), 'worktree-content');
      const linkPath = path.join(wt, 'node_modules');
      try {
        fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        // Windows without admin / developer-mode can't create symlinks; skip
        fs.rmSync(target, { recursive: true, force: true });
        fs.rmSync(wt, { recursive: true, force: true });
        return;
      }

      safeRecursiveRm(wt);

      expect(fs.existsSync(wt)).toBe(false);
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.existsSync(sentinel)).toBe(true);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('PRESERVE_ME');
      fs.rmSync(target, { recursive: true, force: true });
    });

    it('unlinks the path itself when it is a symlink/junction (no recursion)', () => {
      const target = fs.mkdtempSync(path.join(os.tmpdir(), 'srm-target2-'));
      fs.writeFileSync(path.join(target, 'keep.txt'), 'KEEP');
      const link = path.join(os.tmpdir(), `srm-link-${Date.now()}`);
      try {
        fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        fs.rmSync(target, { recursive: true, force: true });
        return;
      }

      safeRecursiveRm(link);

      expect(fs.existsSync(link)).toBe(false);
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.existsSync(path.join(target, 'keep.txt'))).toBe(true);
      fs.rmSync(target, { recursive: true, force: true });
    });
  });

  describe('safeRecursiveCp', () => {
    it('throws when source does not exist', () => {
      const missing = path.join(os.tmpdir(), `scp-${Date.now()}-missing`);
      const dest = path.join(os.tmpdir(), `scp-dest-${Date.now()}`);
      expect(() => safeRecursiveCp(missing, dest)).toThrow(/source does not exist/);
    });

    it('copies a regular directory tree faithfully', () => {
      const src = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-src-'));
      fs.writeFileSync(path.join(src, 'a.txt'), 'A');
      fs.mkdirSync(path.join(src, 'sub'));
      fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'B');

      const dest = path.join(os.tmpdir(), `scp-dest-${Date.now()}`);
      safeRecursiveCp(src, dest, { recursive: true });

      expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('A');
      expect(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf8')).toBe('B');
      fs.rmSync(src, { recursive: true, force: true });
      fs.rmSync(dest, { recursive: true, force: true });
    });

    it('does NOT copy junction TARGET contents into destination', () => {
      const target = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-target-'));
      // Sentinel that proves target was NOT copied into dest
      fs.writeFileSync(path.join(target, 'BIG_SENTINEL.txt'), 'x'.repeat(1024));

      const src = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-src-'));
      fs.writeFileSync(path.join(src, 'real.txt'), 'real-content');
      try {
        fs.symlinkSync(target, path.join(src, 'node_modules'),
          process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        fs.rmSync(target, { recursive: true, force: true });
        fs.rmSync(src, { recursive: true, force: true });
        return;
      }

      const dest = path.join(os.tmpdir(), `scp-dest-${Date.now()}`);
      safeRecursiveCp(src, dest, { recursive: true });

      expect(fs.readFileSync(path.join(dest, 'real.txt'), 'utf8')).toBe('real-content');
      // Critical assertion: target file MUST NOT have been copied through the junction
      const destNodeModules = path.join(dest, 'node_modules');
      // Either the link was recreated (so reading the sentinel via the link is OK,
      // but the file at destNodeModules itself is a SYMLINK, not a regular file
      // containing the copied content) OR the link was skipped entirely.
      if (fs.existsSync(destNodeModules)) {
        const destStat = fs.lstatSync(destNodeModules);
        expect(destStat.isSymbolicLink()).toBe(true);
      }
      // Even if we read through the link, the SOURCE target's sentinel still exists
      // because we never wrote a copy. Assert source target unchanged.
      expect(fs.existsSync(path.join(target, 'BIG_SENTINEL.txt'))).toBe(true);

      fs.rmSync(target, { recursive: true, force: true });
      fs.rmSync(src, { recursive: true, force: true });
      // Use safeRecursiveRm for dest in case junction was recreated
      safeRecursiveRm(dest);
    });
  });
});
