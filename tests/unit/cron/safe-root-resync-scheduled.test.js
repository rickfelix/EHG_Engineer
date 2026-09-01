/**
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-A / TS-8: the scheduled job's safeRootResync() call must
 * always pass skipLockClear:true (the clear-stale-index-lock step stays manual-only), and
 * abortReasonFor must classify results into stable, dedup-able reason strings.
 */
import { describe, it, expect } from 'vitest';
import { abortReasonFor, PROCESS_KEY } from '../../../scripts/cron/safe-root-resync-scheduled.mjs';

describe('abortReasonFor', () => {
  it('returns null for a successful sync', () => {
    expect(abortReasonFor({ ok: true, synced: true })).toBeNull();
  });

  it('returns null for a benign skip (dirty tree, already current) — not an abort', () => {
    expect(abortReasonFor({ ok: true, skipped: 'dirty' })).toBeNull();
    expect(abortReasonFor({ ok: true, skipped: 'already_current' })).toBeNull();
  });

  it('classifies a non-ff conflict distinctly from other aborts', () => {
    expect(abortReasonFor({ ok: false, conflict: true, behind: 3 })).toBe('non_ff_conflict');
  });

  it('surfaces the named `aborted` reason (worktree_cwd, not_a_git_repo, etc.)', () => {
    expect(abortReasonFor({ ok: false, aborted: 'worktree_cwd' })).toBe('worktree_cwd');
    expect(abortReasonFor({ ok: false, aborted: 'not_a_git_repo' })).toBe('not_a_git_repo');
  });

  it('falls back to a stable label rather than null for an unnamed failure', () => {
    expect(abortReasonFor({ ok: false })).toBe('unknown_abort');
    expect(abortReasonFor(null)).toBe('no_result');
  });
});

describe('PROCESS_KEY', () => {
  it('is a standard_loop key distinct from the manual resync:safe process', () => {
    expect(PROCESS_KEY).toBe('standard_loop:safe-root-resync-fetch-ff-merge');
  });
});
