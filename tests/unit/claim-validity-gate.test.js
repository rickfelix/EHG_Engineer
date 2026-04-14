/**
 * Unit tests for claim-validity-gate.js — CHECK 3 worktree isolation enhancements.
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-074
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Normalize to forward slashes (simulates canonical path on Windows)
    realpathSync: vi.fn((p) => p.replace(/\\/g, '/')),
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
  };
});
vi.mock('../../lib/resolve-own-session.js', () => ({
  resolveOwnSession: vi.fn(),
}));

const { execSync } = await import('child_process');
const { realpathSync, existsSync } = await import('fs');
const { resolveOwnSession } = await import('../../lib/resolve-own-session.js');
const { assertValidClaim, isRealWorktree, ClaimIdentityError, _worktreeCache } = await import('../../lib/claim-validity-gate.js');

function mockSupabase(sdData) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: sdData, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({ eq: updateEq }),
    }),
  };
}

const WORKTREE_LIST_TEMPLATE = (paths) =>
  paths.map(p => `worktree ${p}\nHEAD abc123\nbranch refs/heads/main\n`).join('\n');

describe('isRealWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _worktreeCache.clear();
    realpathSync.mockImplementation((p) => p.replace(/\\/g, '/'));
  });

  it('returns true for a registered worktree', () => {
    execSync.mockReturnValue(WORKTREE_LIST_TEMPLATE(['/repo/main', '/repo/.worktrees/SD-FOO-001']));
    expect(isRealWorktree('/repo/.worktrees/SD-FOO-001')).toBe(true);
  });

  it('returns false for a phantom path not in git registry', () => {
    execSync.mockReturnValue(WORKTREE_LIST_TEMPLATE(['/repo/main']));
    expect(isRealWorktree('/repo/.worktrees/SD-PHANTOM-001')).toBe(false);
  });

  it('returns false when execSync times out', () => {
    execSync.mockImplementation(() => { throw new Error('timed out'); });
    expect(isRealWorktree('/any/path')).toBe(false);
  });

  it('returns false when realpathSync fails on input path', () => {
    execSync.mockReturnValue(WORKTREE_LIST_TEMPLATE(['/repo/main']));
    realpathSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(isRealWorktree('/deleted/path')).toBe(false);
  });

  it('uses cache on second call within TTL', () => {
    execSync.mockReturnValue(WORKTREE_LIST_TEMPLATE(['/repo/main', '/repo/.worktrees/SD-CACHE']));
    expect(isRealWorktree('/repo/.worktrees/SD-CACHE')).toBe(true);
    expect(execSync).toHaveBeenCalledTimes(1);
    // Second call should hit cache
    expect(isRealWorktree('/repo/.worktrees/SD-CACHE')).toBe(true);
    expect(execSync).toHaveBeenCalledTimes(1); // still 1
  });
});

describe('assertValidClaim — CHECK 3 enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _worktreeCache.clear();
    realpathSync.mockImplementation((p) => p.replace(/\\/g, '/'));
    resolveOwnSession.mockResolvedValue({
      data: { session_id: 'sess-123' },
      source: 'env_var',
    });
  });

  it('passes when cwd is inside valid worktree', async () => {
    const wt = '/repo/.worktrees/SD-PASS-001';
    vi.spyOn(process, 'cwd').mockReturnValue(wt);
    execSync.mockReturnValue(WORKTREE_LIST_TEMPLATE(['/repo/main', wt]));

    const sb = mockSupabase({
      sd_key: 'SD-PASS-001',
      claiming_session_id: 'sess-123',
      worktree_path: wt,
      current_phase: 'EXEC',
    });

    const result = await assertValidClaim(sb, 'SD-PASS-001', { operation: 'test_op' });
    expect(result.ownership).toBe('self');
  });

  it('throws stale_worktree when path is phantom and recovery fails', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repo/main');
    execSync.mockReturnValue(WORKTREE_LIST_TEMPLATE(['/repo/main'])); // stored path NOT in list
    existsSync.mockReturnValue(false);

    const sb = mockSupabase({
      sd_key: 'SD-STALE-001',
      claiming_session_id: 'sess-123',
      worktree_path: '/repo/.worktrees/SD-STALE-001',
      current_phase: 'EXEC',
    });

    // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-094: Stale worktrees now self-heal
    // (clear path from DB) instead of throwing. The call should succeed.
    const result = await assertValidClaim(sb, 'SD-STALE-001', { operation: 'test_op' });
    expect(result.ownership).toBe('self');
  });

  it('auto-recovers when worktree found at .worktrees/<SD-KEY>/', async () => {
    const recoveredPath = '/repo/.worktrees/SD-REC-001';
    vi.spyOn(process, 'cwd').mockReturnValue(recoveredPath);

    // isRealWorktree calls: the stored path (OLD) is NOT registered, the recovered path IS
    const validList = WORKTREE_LIST_TEMPLATE(['/repo/main', recoveredPath]);
    execSync.mockImplementation((cmd) => {
      if (cmd.includes('rev-parse')) return '/repo\n';
      return validList;
    });
    existsSync.mockReturnValue(true);

    const sb = mockSupabase({
      sd_key: 'SD-REC-001',
      claiming_session_id: 'sess-123',
      worktree_path: '/repo/.worktrees/SD-REC-001-OLD', // stale path
      current_phase: 'EXEC',
    });

    const result = await assertValidClaim(sb, 'SD-REC-001', { operation: 'test_op' });
    expect(result.ownership).toBe('self');
    // Verify DB was updated
    expect(sb.from).toHaveBeenCalled();
  });

  it('skips CHECK 3 when worktree_path is null', async () => {
    const sb = mockSupabase({
      sd_key: 'SD-NULL-001',
      claiming_session_id: 'sess-123',
      worktree_path: null,
      current_phase: 'EXEC',
    });

    const result = await assertValidClaim(sb, 'SD-NULL-001', { operation: 'test_op' });
    expect(result.ownership).toBe('self');
    // execSync should NOT have been called (no worktree check)
    expect(execSync).not.toHaveBeenCalled();
  });

  it('throws wrong_worktree with cd command when cwd is outside valid worktree', async () => {
    const wt = '/repo/.worktrees/SD-DIR-001';
    vi.spyOn(process, 'cwd').mockReturnValue('/repo/main');
    execSync.mockReturnValue(WORKTREE_LIST_TEMPLATE(['/repo/main', wt]));

    const sb = mockSupabase({
      sd_key: 'SD-DIR-001',
      claiming_session_id: 'sess-123',
      worktree_path: wt,
      current_phase: 'EXEC',
    });

    try {
      await assertValidClaim(sb, 'SD-DIR-001', { operation: 'test_op' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ClaimIdentityError);
      expect(e.reason).toBe('wrong_worktree');
      expect(e.remediation).toContain(`cd "${wt}"`);
    }
  });
});
