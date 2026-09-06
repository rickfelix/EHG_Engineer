/**
 * QF-20260903-950: sync-deliverables-from-git.js's evidence model must survive squash-merge.
 * Exercises the real git plumbing (runHardenedGit + anchoredKeyPattern) directly against this
 * repo's own live history rather than mocking git, since the defect is specifically about the
 * git QUESTION asked (branch-diff vs. every-commit-subject), not the parsing of its output.
 */
import { describe, it, expect } from 'vitest';
import { runHardenedGit } from '../../lib/git/hardened-runner.cjs';
import { anchoredKeyPattern, LANDED_LOG_MAX_BUFFER_BYTES } from '../../lib/drive-loop/score/leg1-landed-alocal.js';

const REPO_ROOT = process.cwd();

function findCommitsForKey(key, ref = 'main') {
  const pattern = anchoredKeyPattern(key);
  const subjectLog = runHardenedGit(['log', ref, '--format=%H|%s'], { cwd: REPO_ROOT, maxBuffer: LANDED_LOG_MAX_BUFFER_BYTES });
  return subjectLog.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => { const sep = l.indexOf('|'); return sep === -1 ? null : { hash: l.slice(0, sep), subject: l.slice(sep + 1) }; })
    .filter((r) => r && pattern.test(r.subject));
}

describe('QF-20260903-950 defect 3 — squash-merge structural blindness', () => {
  it('finds commits for an SD whose PR already merged into main, via subject scan not branch diff', () => {
    // SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 (PR #8168) has no live `feat/` branch left to
    // diff against -- the old model would read zero here even though the work is plainly on main.
    const matches = findCommitsForKey('SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('a per-commit --show --name-status fetch parses into the {hash, message, date, files} shape', () => {
    const [first] = findCommitsForKey('SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001');
    const out = runHardenedGit(['show', first.hash, '--name-status', '--format=%H|%s|%ai'], { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 });
    const [header, ...rest] = out.split('\n');
    const [hash, message] = header.split('|');
    expect(hash).toBe(first.hash);
    expect(message).toBe(first.subject);
    expect(rest.some((l) => /^[AMD]\t/.test(l))).toBe(true);
  });

  it('a genuinely bogus ref throws (never silently reads as zero commits)', () => {
    expect(() => runHardenedGit(['log', 'refs/heads/DEFINITELY-NOT-A-REAL-REF-XYZ', '--format=%H|%s'], { cwd: REPO_ROOT }))
      .toThrow();
  });

  it('anchoredKeyPattern does not cross-match a sibling key that merely shares a prefix', () => {
    const pattern = anchoredKeyPattern('SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001');
    expect(pattern.test('fix(SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001-B): unrelated child')).toBe(false);
  });
});
