// Tests for lib/worktree/stale-base-guard.mjs
// SD-LEO-INFRA-SD-START-STALE-BASE-WARN-001
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideStaleBaseAction,
  renderStaleBaseWarning,
  runStaleBaseGuard,
} from '../../lib/worktree/stale-base-guard.mjs';

test('decideStaleBaseAction: behind=0 => none', () => {
  assert.equal(decideStaleBaseAction({ behind: 0 }).action, 'none');
  assert.equal(decideStaleBaseAction({ behind: 0, autoRebase: true }).action, 'none');
});

test('decideStaleBaseAction: behind>0, warn-by-default (no auto-rebase)', () => {
  assert.equal(decideStaleBaseAction({ behind: 3, autoRebase: false }).action, 'warn');
});

test('decideStaleBaseAction: behind>0 + autoRebase + clean => rebase', () => {
  assert.equal(decideStaleBaseAction({ behind: 3, autoRebase: true, treeClean: true }).action, 'rebase');
});

test('decideStaleBaseAction: behind>0 + autoRebase + DIRTY => warn (never clobber WIP)', () => {
  assert.equal(decideStaleBaseAction({ behind: 3, autoRebase: true, treeClean: false }).action, 'warn');
});

test('decideStaleBaseAction: negative/garbage behind clamps to none', () => {
  assert.equal(decideStaleBaseAction({ behind: -5 }).action, 'none');
  assert.equal(decideStaleBaseAction({ behind: NaN }).action, 'none');
});

test('renderStaleBaseWarning names behind-count + clean-tree remedy (reset --hard preserves untracked)', () => {
  const out = renderStaleBaseWarning({ behind: 4, baseRef: 'origin/main' });
  assert.match(out, /behind origin\/main by 4/);
  assert.match(out, /git reset --hard origin\/main/);
  assert.match(out, /preserves untracked/);
  assert.match(out, /SD_START_AUTO_REBASE/);
});

test('renderStaleBaseWarning: dirty tree recommends commit/stash + merge, NOT reset', () => {
  const out = renderStaleBaseWarning({ behind: 2, dirty: true });
  assert.match(out, /commit\/stash first/);
  assert.doesNotMatch(out, /reset --hard/);
});

test('renderStaleBaseWarning surfaces protocol drift when present', () => {
  const out = renderStaleBaseWarning({ behind: 1, criticalDiff: ['CLAUDE.md'] });
  assert.match(out, /Protocol file\(s\) also drifted/);
  assert.match(out, /CLAUDE\.md/);
});

test('runStaleBaseGuard: behind=0 => action none, no warning emitted', () => {
  const warns = [];
  const r = runStaleBaseGuard({ cwd: '/wt', freshnessFn: () => ({ behind: 0, criticalDiff: [] }), warn: (m) => warns.push(m), log: () => {} });
  assert.equal(r.action, 'none');
  assert.equal(warns.length, 0);
});

test('runStaleBaseGuard: behind=0 but protocol drift => still warns', () => {
  const warns = [];
  const r = runStaleBaseGuard({ cwd: '/wt', freshnessFn: () => ({ behind: 0, criticalDiff: ['CLAUDE_CORE.md'] }), warn: (m) => warns.push(m), log: () => {} });
  assert.equal(r.action, 'none');
  assert.equal(warns.length, 1);
  assert.match(warns[0], /CLAUDE_CORE\.md/);
});

test('runStaleBaseGuard: behind>0, warn-by-default emits the warning, does NOT reset', () => {
  const warns = [];
  let resetCalled = false;
  const git = { isClean: () => true, resetHard: () => { resetCalled = true; } };
  const r = runStaleBaseGuard({ cwd: '/wt', autoRebase: false, git, freshnessFn: () => ({ behind: 5, criticalDiff: [] }), warn: (m) => warns.push(m), log: () => {} });
  assert.equal(r.action, 'warn');
  assert.equal(r.behind, 5);
  assert.equal(resetCalled, false);
  assert.match(warns[0], /behind origin\/main by 5/);
});

test('runStaleBaseGuard: behind>0 + autoRebase + clean => resets and logs', () => {
  const logs = [];
  let resetTo = null;
  const git = { isClean: () => true, resetHard: (ref) => { resetTo = ref; } };
  const r = runStaleBaseGuard({ cwd: '/wt', autoRebase: true, git, freshnessFn: () => ({ behind: 2, criticalDiff: [] }), log: (m) => logs.push(m), warn: () => {} });
  assert.equal(r.action, 'rebase');
  assert.equal(r.rebased, true);
  assert.equal(resetTo, 'origin/main');
  assert.match(logs[0], /auto-rebased/);
});

test('runStaleBaseGuard: behind>0 + autoRebase + DIRTY => warns, does NOT reset', () => {
  const warns = [];
  let resetCalled = false;
  const git = { isClean: () => false, resetHard: () => { resetCalled = true; } };
  const r = runStaleBaseGuard({ cwd: '/wt', autoRebase: true, git, freshnessFn: () => ({ behind: 1, criticalDiff: [] }), warn: (m) => warns.push(m), log: () => {} });
  assert.equal(r.action, 'warn');
  assert.equal(resetCalled, false);
});

test('runStaleBaseGuard: rebase failure falls back to a loud warn', () => {
  const warns = [];
  const git = { isClean: () => true, resetHard: () => { throw new Error('reset boom'); } };
  const r = runStaleBaseGuard({ cwd: '/wt', autoRebase: true, git, freshnessFn: () => ({ behind: 2, criticalDiff: [] }), warn: (m) => warns.push(m), log: () => {} });
  assert.equal(r.action, 'warn');
  assert.equal(r.rebased, false);
  assert.ok(warns.some((w) => /reset boom/.test(w)));
});

test('runStaleBaseGuard: FAIL-OPEN — freshnessFn throws => skipped, never re-throws', () => {
  const r = runStaleBaseGuard({ cwd: '/wt', freshnessFn: () => { throw new Error('git down'); }, warn: () => {}, log: () => {} });
  assert.equal(r.skipped, true);
  assert.equal(r.action, 'none');
});

test('runStaleBaseGuard: no cwd => skipped', () => {
  const r = runStaleBaseGuard({ cwd: null, warn: () => {}, log: () => {} });
  assert.equal(r.skipped, true);
});
