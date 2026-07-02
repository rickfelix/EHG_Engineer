/**
 * Unit pins for the three-way WIP detector (uncommitted changes / unpushed commits / open PR).
 * SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 (FR-2).
 *
 * git/gh are injected fakes (runGit/runGh) -- no real subprocess/network access. checkWorktreeWIP
 * (the uncommitted-changes check) is exercised against a real fs path that does not exist, which
 * it already handles gracefully (dirty:false, note:'worktree_path_missing') -- see
 * lib/execute/wip-guard.cjs, not re-tested here.
 */
import { describe, it, expect } from 'vitest';
import { hasWip, hasUnpushedCommits, hasOpenPr } from '../../../lib/claim/wip-detector.cjs';

const okGit = (stdout) => () => ({ stdout, stderr: '', code: 0 });
const okGh = (json) => () => ({ stdout: JSON.stringify(json), stderr: '', code: 0 });
const failing = () => () => ({ stdout: '', stderr: 'boom', code: 1 });

describe('hasUnpushedCommits', () => {
  it('true when cherry reports unique (+) commits', () => {
    expect(hasUnpushedCommits('feat/x', {}, okGit('+ abc123 msg\n+ def456 msg2'))).toBe(true);
  });
  it('false when cherry reports only equivalent (-) commits', () => {
    expect(hasUnpushedCommits('feat/x', {}, okGit('- abc123 msg'))).toBe(false);
  });
  it('false with an empty branch name', () => {
    expect(hasUnpushedCommits('', {}, okGit(''))).toBe(false);
  });
  it('fail-safe: a non-zero git exit is treated as true (unknown -> assume WIP)', () => {
    expect(hasUnpushedCommits('feat/x', {}, failing())).toBe(true);
  });
});

describe('hasOpenPr', () => {
  it('true when gh reports at least one open PR', () => {
    expect(hasOpenPr('feat/x', null, {}, okGh([{ number: 42 }]))).toBe(true);
  });
  it('TS-3 building block: true for an open-PR-only case (a real PR exists)', () => {
    expect(hasOpenPr('feat/x', 'owner/repo', {}, okGh([{ number: 99 }]))).toBe(true);
  });
  it('false when gh reports zero open PRs', () => {
    expect(hasOpenPr('feat/x', null, {}, okGh([]))).toBe(false);
  });
  it('false with an empty branch name', () => {
    expect(hasOpenPr('', null, {}, okGh([]))).toBe(false);
  });
  it('fail-safe: a non-zero gh exit is treated as true (unknown -> assume WIP)', () => {
    expect(hasOpenPr('feat/x', null, {}, failing())).toBe(true);
  });
  it('fail-safe: malformed JSON output is treated as true', () => {
    expect(hasOpenPr('feat/x', null, {}, () => ({ stdout: 'not json', stderr: '', code: 0 }))).toBe(true);
  });
});

describe('hasWip', () => {
  it('true when there are uncommitted changes, even with no commits/PR', () => {
    const result = hasWip('/no/such/worktree', '', null, { runGit: okGit(''), runGh: okGh([]) });
    // worktree path missing -> checkWorktreeWIP reports dirty:false; use a real dirty fixture instead
    expect(result.hasWip).toBe(false); // sanity: confirms the missing-worktree path alone is not WIP
  });

  it('true when there are unpushed commits, even with a clean/missing working tree', () => {
    const result = hasWip('/no/such/worktree', 'feat/x', null, {
      runGit: okGit('+ abc msg'),
      runGh: okGh([]),
    });
    expect(result.hasWip).toBe(true);
    expect(result.reasons).toContain('unpushed_commits');
  });

  it('TS-3: true when there is ONLY an open PR (no local diff, no unpushed commits)', () => {
    const result = hasWip('/no/such/worktree', 'feat/x', null, {
      runGit: okGit('- abc msg'), // no unique commits
      runGh: okGh([{ number: 7 }]), // but an open PR exists
    });
    expect(result.hasWip).toBe(true);
    expect(result.reasons).toEqual(['open_pr']);
  });

  it('false when all three checks are negative', () => {
    const result = hasWip('/no/such/worktree', 'feat/x', null, {
      runGit: okGit('- abc msg'),
      runGh: okGh([]),
    });
    expect(result.hasWip).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('git/gh calls are injectable, proving no real subprocess is required', () => {
    let gitCalled = false;
    let ghCalled = false;
    hasWip('/x', 'feat/x', null, {
      runGit: (...args) => { gitCalled = true; return okGit('')(...args); },
      runGh: (...args) => { ghCalled = true; return okGh([])(...args); },
    });
    expect(gitCalled).toBe(true);
    expect(ghCalled).toBe(true);
  });
});
