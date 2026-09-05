// QF-20260905-646 — fixtures modeled on the three Bravo classifier-block specimens: a heredoc
// git commit, a node -e one-liner, and a follow-on script invocation, each chained after a `cd`.
import { describe, it, expect } from 'vitest';
import { findCdAndRunViolations } from './no-cd-and-run-recipe-lint.mjs';

describe('findCdAndRunViolations', () => {
  it('flags a heredoc git commit chained after cd', () => {
    const md = '```bash\ncd .worktrees/SD-X\ngit commit -m "$(cat <<\'EOF\'\nmsg\nEOF\n)"\n```';
    expect(findCdAndRunViolations(md).length).toBeGreaterThan(0);
  });

  it('flags a node -e one-liner chained after cd with &&', () => {
    const md = '```bash\ncd .worktrees/SD-X && node -e "require(\'./lib/ship/review-gate.js\')"\n```';
    expect(findCdAndRunViolations(md).length).toBeGreaterThan(0);
  });

  it('flags a script invocation on the line following cd', () => {
    const md = '```bash\ncd .worktrees/SD-X\nnode scripts/one-off/attempt-auto-merge.mjs\n```';
    expect(findCdAndRunViolations(md).length).toBeGreaterThan(0);
  });

  it('allows a bare cd with nothing else in the block', () => {
    const md = '```bash\ncd .worktrees/SD-X\n```';
    expect(findCdAndRunViolations(md)).toEqual([]);
  });

  it('allows absolute-path invocation with no cd at all', () => {
    const md = '```bash\nnode scripts/one-off/attempt-auto-merge.mjs\n```';
    expect(findCdAndRunViolations(md)).toEqual([]);
  });
});
