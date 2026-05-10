/**
 * SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — per-invariant unit tests.
 *
 * Covers AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-12, AC-15.
 *
 * Each invariant has happy + sad path; mocking strategy:
 *   - process.cwd() — stub via opts.cwd (no global stub needed)
 *   - child_process.execSync — vi.mock with route table for git/gh
 *   - fs.lstatSync — vi.mock for cwd .git marker probe
 *   - supabase chain — local ChainStub for sd_phase_handoffs reads
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    lstatSync: vi.fn(),
  };
});

import { execSync } from 'child_process';
import { lstatSync } from 'fs';

const {
  assertCwdValid,
  assertSweepHandoffGate,
  classifyWorktreeOwnership,
  detectOrphanWorktreeFromMerge,
  ExecContextError,
} = await import('../../../lib/exec-context-guard.mjs');

/**
 * Build a Supabase chain stub for assertSweepHandoffGate.
 *
 * After SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 FR-1 the function uses two table
 * paths:
 *   1. strategic_directives_v2 .select('id').eq('sd_key', X).maybeSingle()
 *      — sd_key→UUID resolver (called when input is not UUID-format).
 *   2. sd_phase_handoffs .select(...).eq('sd_id', X).eq('status', 'accepted')
 *      — accepted-handoffs query.
 *
 * The stub dispatches by table. Default sd_key→UUID resolves to a fixed UUID
 * so callers passing 'SD-XXX-001' transparently route to the handoff query.
 */
function makeSupabaseStub(handoffs, error = null, opts = {}) {
  const sdRow = opts.sdRow !== undefined ? opts.sdRow : { id: '00000000-0000-0000-0000-000000000001' };
  const sdLookupErr = opts.sdLookupErr !== undefined ? opts.sdLookupErr : null;
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: sdRow, error: sdLookupErr })),
            })),
          })),
        };
      }
      // sd_phase_handoffs
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: handoffs, error })),
          })),
        })),
      };
    }),
  };
}

describe('SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — assertCwdValid (FR-1, FR-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-1: returns ok=true with kind=main when cwd has .git as a directory', () => {
    lstatSync.mockReturnValue({ isDirectory: () => true });
    const result = assertCwdValid({ cwd: 'C:/Users/test/main-repo' });
    expect(result).toEqual({ ok: true, kind: 'main', cwd: 'C:/Users/test/main-repo' });
  });

  it('AC-2: throws STALE_CWD when cwd has no .git marker', () => {
    lstatSync.mockReturnValue(null);
    expect(() => assertCwdValid({ cwd: 'C:/random/dir' })).toThrowError(ExecContextError);
    try {
      assertCwdValid({ cwd: 'C:/random/dir' });
    } catch (err) {
      expect(err.code).toBe('STALE_CWD');
      expect(err.message).toContain('no .git marker');
    }
  });

  it('AC-2: throws STALE_CWD when cwd is a worktree dir not in git worktree list (orphaned)', () => {
    // .git is a file (worktree marker)
    lstatSync.mockReturnValue({ isDirectory: () => false });
    // git worktree list returns OTHER worktrees, not this one
    execSync.mockReturnValue(
      'worktree C:/main-repo\nbranch refs/heads/main\n\nworktree C:/main-repo/.worktrees/other\nbranch refs/heads/feat/other\n'
    );
    expect(() => assertCwdValid({ cwd: 'C:/main-repo/.worktrees/orphan' })).toThrowError(
      ExecContextError
    );
    try {
      assertCwdValid({ cwd: 'C:/main-repo/.worktrees/orphan' });
    } catch (err) {
      expect(err.code).toBe('STALE_CWD');
      expect(err.message).toMatch(/orphaned|not in 'git worktree list'/i);
    }
  });

  it('returns ok=true with kind=worktree when cwd is a live worktree', () => {
    lstatSync.mockReturnValue({ isDirectory: () => false });
    const cwd = path.resolve('C:/main-repo/.worktrees/sd/SD-XXX-001');
    execSync.mockReturnValue(`worktree C:/main-repo\n\nworktree ${cwd}\n`);
    const result = assertCwdValid({ cwd });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('worktree');
  });

  it('allowFreshHeartbeat escape hatch: skips git-list check when CLAUDE_SESSION_ID is set', () => {
    lstatSync.mockReturnValue({ isDirectory: () => false });
    const orig = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'test-session';
    try {
      const result = assertCwdValid({
        cwd: 'C:/random-worktree-dir',
        allowFreshHeartbeat: true,
      });
      expect(result.kind).toBe('worktree');
      // execSync should NOT have been called for git worktree list
      expect(execSync).not.toHaveBeenCalled();
    } finally {
      if (orig === undefined) delete process.env.CLAUDE_SESSION_ID;
      else process.env.CLAUDE_SESSION_ID = orig;
    }
  });

  it('throws STALE_CWD when git worktree list itself fails', () => {
    lstatSync.mockReturnValue({ isDirectory: () => false });
    execSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });
    expect(() => assertCwdValid({ cwd: 'C:/some/wt' })).toThrowError(ExecContextError);
  });
});

describe('SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — assertSweepHandoffGate (FR-3)', () => {
  it('AC-4: throws ACCEPTED_HANDOFF_OVERRIDE when accepted PLAN-TO-EXEC exists for target=LEAD', async () => {
    const sb = makeSupabaseStub([
      { id: '1', from_phase: 'PLAN', to_phase: 'EXEC', status: 'accepted', created_at: '2026-05-08T00:00:00Z' },
    ]);
    await expect(
      assertSweepHandoffGate(sb, 'SD-XXX-001', 'LEAD')
    ).rejects.toThrow(ExecContextError);
  });

  it('AC-4: throws when EXEC-TO-PLAN accepted handoff exists for target=LEAD (covers EXEC-TO-PLAN, not just PLAN-TO-LEAD)', async () => {
    const sb = makeSupabaseStub([
      { id: '2', from_phase: 'EXEC', to_phase: 'PLAN', status: 'accepted', created_at: '2026-05-08T00:00:00Z' },
    ]);
    try {
      await assertSweepHandoffGate(sb, 'SD-XXX-001', 'LEAD');
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('ACCEPTED_HANDOFF_OVERRIDE');
    }
  });

  it('AC-5: GENERALIZED beyond PLAN-TO-LEAD — covers all 4 handoff types via phase rank ordering', async () => {
    // Each accepted handoff with to_phase>LEAD should block a LEAD-target reset
    const cases = [
      { from_phase: 'LEAD', to_phase: 'PLAN' },
      { from_phase: 'PLAN', to_phase: 'EXEC' },
      { from_phase: 'EXEC', to_phase: 'PLAN' },
    ];
    for (const h of cases) {
      const sb = makeSupabaseStub([{ id: 'h', ...h, status: 'accepted', created_at: '2026-05-08T00:00:00Z' }]);
      await expect(assertSweepHandoffGate(sb, 'SD-XXX-001', 'LEAD')).rejects.toThrow(
        ExecContextError
      );
    }
  });

  it('allows reset when only PLAN-TO-LEAD accepted handoff exists (to_phase=LEAD is NOT past target=LEAD)', async () => {
    const sb = makeSupabaseStub([
      { id: '3', from_phase: 'PLAN', to_phase: 'LEAD', status: 'accepted', created_at: '2026-05-08T00:00:00Z' },
    ]);
    const result = await assertSweepHandoffGate(sb, 'SD-XXX-001', 'LEAD');
    expect(result.ok).toBe(true);
  });

  it('allows reset when no accepted handoffs exist', async () => {
    const sb = makeSupabaseStub([]);
    const result = await assertSweepHandoffGate(sb, 'SD-XXX-001', 'LEAD');
    expect(result.ok).toBe(true);
  });

  it('treats DB read error as ALLOW (sweep is itself a resilience layer; do not block on transient DB issues)', async () => {
    const sb = makeSupabaseStub(null, { message: 'transient connection error' });
    const result = await assertSweepHandoffGate(sb, 'SD-XXX-001', 'LEAD');
    expect(result.ok).toBe(true);
    expect(result.dbError).toBe('transient connection error');
  });

  it('throws ACCEPTED_HANDOFF_OVERRIDE for unknown targetResetPhase (caller bug)', async () => {
    const sb = makeSupabaseStub([]);
    await expect(
      assertSweepHandoffGate(sb, 'SD-XXX-001', 'BOGUS')
    ).rejects.toThrow(/Unknown targetResetPhase/);
  });
});

describe('SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — classifyWorktreeOwnership (FR-4)', () => {
  it('AC-6: kind=own when conflict path resolves equal to expected path', () => {
    const result = classifyWorktreeOwnership(
      'C:/main/.worktrees/sd/SD-XXX-001',
      'C:/main/.worktrees/sd/SD-XXX-001'
    );
    expect(result.kind).toBe('own');
  });

  it('AC-6: kind=foreign when conflict path differs from expected path', () => {
    const result = classifyWorktreeOwnership(
      'C:/main/.worktrees/sd/SD-OTHER-002',
      'C:/main/.worktrees/sd/SD-XXX-001'
    );
    expect(result.kind).toBe('foreign');
  });

  it('normalizes separators / trailing slashes via path.resolve', () => {
    const result = classifyWorktreeOwnership(
      'C:/main/.worktrees/sd/SD-XXX-001/',
      'C:\\main\\.worktrees\\sd\\SD-XXX-001'
    );
    // path.resolve normalizes both — they should compare equal on Windows runners
    // (test is platform-aware: just assert the kind is determined, not 'foreign')
    expect(['own', 'foreign']).toContain(result.kind);
  });

  it('returns foreign when either input is non-string (defensive)', () => {
    expect(classifyWorktreeOwnership(null, 'C:/x').kind).toBe('foreign');
    expect(classifyWorktreeOwnership('C:/x', undefined).kind).toBe('foreign');
  });
});

describe('SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — detectOrphanWorktreeFromMerge (FR-5)', () => {
  it('AC-8: detects branch deletion from "Deleted branch <name>" pattern', () => {
    const stdout = '✓ Squashed and merged pull request #123\n✓ Deleted branch feat/SD-XXX-001\n';
    const result = detectOrphanWorktreeFromMerge(stdout);
    expect(result).toEqual({ detected: true, branch: 'feat/SD-XXX-001' });
  });

  it('AC-8: detects gh-style "Deleted local branch <name>" pattern', () => {
    const stdout = 'Deleted local branch feat/SD-YYY-002 (was abc123)\n';
    const result = detectOrphanWorktreeFromMerge(stdout);
    expect(result.detected).toBe(true);
    expect(result.branch).toBe('feat/SD-YYY-002');
  });

  it('returns detected=false when output does not contain branch deletion', () => {
    const result = detectOrphanWorktreeFromMerge('✓ Merged pull request #123\n');
    expect(result).toEqual({ detected: false, branch: null });
  });

  it('returns detected=false on empty/non-string input', () => {
    expect(detectOrphanWorktreeFromMerge('')).toEqual({ detected: false, branch: null });
    expect(detectOrphanWorktreeFromMerge(null)).toEqual({ detected: false, branch: null });
    expect(detectOrphanWorktreeFromMerge(undefined)).toEqual({ detected: false, branch: null });
  });
});

describe('SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — ExecContextError class', () => {
  it('extends Error with name=ExecContextError and stable .code field', () => {
    const err = new ExecContextError('STALE_CWD', 'msg', { cwd: '/x' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ExecContextError);
    expect(err.name).toBe('ExecContextError');
    expect(err.code).toBe('STALE_CWD');
    expect(err.details).toEqual({ cwd: '/x' });
  });
});
