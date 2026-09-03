/**
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-A / TS-8: the scheduled job's safeRootResync() call must
 * always pass skipLockClear:true (the clear-stale-index-lock step stays manual-only), and
 * abortReasonFor must classify results into stable, dedup-able reason strings.
 */
import { describe, it, expect } from 'vitest';
import { abortReasonFor, PROCESS_KEY } from '../../../scripts/cron/safe-root-resync-scheduled.mjs';
import { trackAbortEscalation } from '../../../lib/git/resync-escalation.js';

describe('abortReasonFor', () => {
  it('returns null for a successful sync', () => {
    expect(abortReasonFor({ ok: true, synced: true })).toBeNull();
  });

  it('returns null for a genuinely benign skip (already current) — not an abort', () => {
    expect(abortReasonFor({ ok: true, skipped: 'already_current' })).toBeNull();
  });

  // QF-20260902-805: a dirty-tree skip did NOT advance to origin/main — the exact
  // did-not-fast-forward shape that silently stalled the fleet for 14.6h (RCA 9a02a76d). It must
  // be tracked, not treated as a benign no-op indistinguishable from a real success.
  it('returns dirty_skip for a dirty-tree skip — trackable, not benign', () => {
    expect(abortReasonFor({ ok: true, skipped: 'dirty', dirtyFiles: ['M foo.js'] })).toBe('dirty_skip');
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

// QF-20260902-805 acceptance checks: N consecutive dirty skips escalate once; a clean
// fast-forward (or genuinely-already-current run) resets the counter. abortReasonFor() now feeds
// 'dirty_skip' into the SAME generic trackAbortEscalation() every other abort reason already uses.
describe('dirty-skip escalation (via abortReasonFor + trackAbortEscalation)', () => {
  it('does not escalate on a single dirty skip', () => {
    const reason = abortReasonFor({ ok: true, skipped: 'dirty' });
    const { escalated } = trackAbortEscalation(null, reason);
    expect(escalated).toBe(false);
  });

  it('escalates on the second consecutive dirty skip', () => {
    const reason = abortReasonFor({ ok: true, skipped: 'dirty' });
    const first = trackAbortEscalation(null, reason);
    const second = trackAbortEscalation(first.nextState, reason);
    expect(second.escalated).toBe(true);
  });

  it('a fast-forward success resets the counter after prior dirty skips', () => {
    const dirtyReason = abortReasonFor({ ok: true, skipped: 'dirty' });
    const afterOneDirty = trackAbortEscalation(null, dirtyReason);
    const successReason = abortReasonFor({ ok: true, synced: true });
    const afterSuccess = trackAbortEscalation(afterOneDirty.nextState, successReason);
    expect(afterSuccess.escalated).toBe(false);
    expect(afterSuccess.nextState.consecutiveCount).toBe(0);
  });
});
