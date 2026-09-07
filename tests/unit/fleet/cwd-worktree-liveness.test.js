// QF-20260905-060 — isCwdWorktreeLiveClaim, DB-injected (hermetic: fake `sb`, no live DB).
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isCwdWorktreeLiveClaim } = require('../../../lib/fleet/cwd-worktree-liveness.cjs');

function fakeSb(table, row, error = null) {
  return {
    from: (t) => {
      expect(t).toBe(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      };
    },
  };
}

describe('isCwdWorktreeLiveClaim', () => {
  const SD_CWD = 'C:/Users/x/EHG_Engineer/.worktrees/SD-FOO-001';
  const QF_CWD = 'C:/Users/x/EHG_Engineer/.worktrees/qf/QF-999';

  it('no worktree segment at all: true (irrelevant -- repo-match axis skips it anyway)', async () => {
    const sb = { from: () => { throw new Error('must not query when no worktree key'); } };
    await expect(isCwdWorktreeLiveClaim(sb, 'C:/Users/x/EHG_Engineer')).resolves.toBe(true);
  });

  it('SD worktree, non-terminal status + a live claiming_session_id: true (LIVE)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'in_progress', claiming_session_id: 'sess-1' });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('SD worktree, terminal status: false (a "leftover" -- its own build already shipped)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'completed', claiming_session_id: null });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(false);
  });

  it('SD worktree, non-terminal status but no active claim: false (never actually built here)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'draft', claiming_session_id: null });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(false);
  });

  it('QF worktree, status=in_progress: true (LIVE)', async () => {
    const sb = fakeSb('quick_fixes', { status: 'in_progress' });
    await expect(isCwdWorktreeLiveClaim(sb, QF_CWD)).resolves.toBe(true);
  });

  it('QF worktree, status=completed: false (a "leftover")', async () => {
    const sb = fakeSb('quick_fixes', { status: 'completed' });
    await expect(isCwdWorktreeLiveClaim(sb, QF_CWD)).resolves.toBe(false);
  });

  it('row not found: true (could-not-determine -> old, stricter default)', async () => {
    const sb = fakeSb('strategic_directives_v2', null);
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('query error: true (fail toward the pre-fix default, never toward new leniency)', async () => {
    const sb = fakeSb('strategic_directives_v2', null, new Error('boom'));
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('a thrown error inside the client never propagates: true', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });
});
