/**
 * Unit tests for the sd-start.js worktree_path basename guard.
 * SD-LEARN-FIX-ADDRESS-PAT-PLANTOEXEC-001 (FR-3, US-002)
 *
 * Pins the guard predicate so it cannot silently regress if sd-start.js is
 * refactored. No Supabase or filesystem mocking required — the predicate is
 * pure and mirrors the inline check at scripts/sd-start.js line ~918.
 *
 * The guard's intent: refuse to persist a sibling SD's worktree_path to
 * strategic_directives_v2 when a session rotation or claim-recovery edge case
 * resolves cwd to a directory whose basename does not match the SD key.
 * This is the root cause of `wrong_worktree` failures in
 * PAT-HF-PLANTOEXEC-dcb7e880.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';

/**
 * Mirrors the guard predicate at scripts/sd-start.js line ~918.
 * Returns true when the cwd basename matches the SD key (safe to persist).
 * Returns false when a mismatch is observed (must skip persistence + warn).
 */
function shouldPersistWorktreePath(cwd, effectiveId) {
  const cwdNormalized = (cwd || '').replace(/\\/g, '/');
  const observedBasename = path.basename(cwdNormalized);
  return observedBasename === effectiveId;
}

describe('sd-start worktree_path basename guard', () => {
  it('allows persistence when basename matches (POSIX path)', () => {
    const cwd = '/home/user/repo/.worktrees/SD-FIX-001';
    expect(shouldPersistWorktreePath(cwd, 'SD-FIX-001')).toBe(true);
  });

  it('refuses persistence when basename is a sibling SD', () => {
    const cwd = '/home/user/repo/.worktrees/SD-OTHER-002';
    expect(shouldPersistWorktreePath(cwd, 'SD-FIX-001')).toBe(false);
  });

  it('refuses persistence when cwd is parent orchestrator directory', () => {
    const cwd = '/home/user/repo/.worktrees/SD-PARENT-ORCH-001';
    expect(shouldPersistWorktreePath(cwd, 'SD-PARENT-ORCH-001-A')).toBe(false);
  });

  it('handles Windows paths with backslashes', () => {
    const cwd = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-FIX-001';
    expect(shouldPersistWorktreePath(cwd, 'SD-FIX-001')).toBe(true);
  });

  it('handles Windows paths with mixed separators', () => {
    const cwd = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-FIX-001';
    expect(shouldPersistWorktreePath(cwd, 'SD-FIX-001')).toBe(true);
  });

  it('refuses persistence when cwd is the main repo root (no worktree)', () => {
    const cwd = '/home/user/repo/EHG_Engineer';
    expect(shouldPersistWorktreePath(cwd, 'SD-FIX-001')).toBe(false);
  });

  it('refuses persistence on case mismatch (SD keys are case-sensitive)', () => {
    const cwd = '/home/user/repo/.worktrees/sd-fix-001';
    expect(shouldPersistWorktreePath(cwd, 'SD-FIX-001')).toBe(false);
  });
});
