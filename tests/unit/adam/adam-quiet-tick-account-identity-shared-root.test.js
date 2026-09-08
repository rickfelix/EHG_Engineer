/**
 * QF-20260906-601 — the automated account-switch notice re-fired seven identical rows for
 * ONE switch (measured: cc8cf7c3). detectAccountSwitch's compare-and-persist-on-confirmed-
 * delivery logic (lib/fleet/account-identity.cjs, covered by tests/unit/fleet/account-identity.test.js
 * "Test 4 — silent across N stable ticks with the same identity") was already correct in
 * isolation -- the actual defect was that ACCOUNT_IDENTITY_STATE_FILE was resolved via
 * `resolve(__dirname, '..')`, which points at whichever worktree the tick script's own file
 * happens to live in. Every worktree that runs this tick kept an independent, private baseline,
 * so N different live worktrees each independently discovered the same real-world switch and
 * each independently notified -- one row per worktree, not one per transition.
 *
 * `main()` is not unit-testable without extracting it into smaller exported functions (see
 * tests/unit/adam/adam-quiet-tick-presend-consult.test.js's documented rationale), so this
 * exercises resolveMainRepoRoot() directly -- the piece that now anchors
 * ACCOUNT_IDENTITY_STATE_FILE to a location shared across every worktree of the repo, instead
 * of one private to whichever worktree invoked the tick.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { resolveMainRepoRoot } from '../../../scripts/adam-quiet-tick.mjs';

describe('adam-quiet-tick.mjs resolveMainRepoRoot (QF-20260906-601)', () => {
  it('resolves to the actual git-common-dir root, independently re-derived', () => {
    const independentCommon = execFileSync(
      'git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    expect(resolveMainRepoRoot(process.cwd())).toBe(dirname(independentCommon));
  });

  it('returns the SAME root for two different subdirectories of the same checkout -- the exact defect: a plain resolve(dir, "..") would differ per subdirectory depth, fragmenting the baseline per caller location', () => {
    const fromTop = resolveMainRepoRoot(process.cwd());
    const fromNested = resolveMainRepoRoot(join(process.cwd(), 'lib', 'fleet'));
    expect(fromNested).toBe(fromTop);
  });

  it('never resolves to a path inside .worktrees/ -- the shared root must sit outside any single worktree', () => {
    const root = resolveMainRepoRoot(process.cwd());
    expect(root.includes('.worktrees')).toBe(false);
  });
});
