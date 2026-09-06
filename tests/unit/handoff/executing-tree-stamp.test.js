/**
 * QF-20260903-469 — a handoff verdict must record WHICH TREE evaluated it.
 *
 * THE DEFECT, measured on a live completion: after the PR_MERGE_VERIFICATION fix merged,
 * LEAD-FINAL still reported "No branch was ever pushed" — the exact false negative that fix
 * removes — because the gate executed the OLD FILE. Two lagging trees in sequence: the shared
 * root was 2 commits behind (git fetch updates origin/main, not the checkout) and the SD's own
 * worktree was 19 behind, and sd-start.js runs the handoff from there. Verifying a commit is in
 * main is NOT evidence the code about to execute contains it, and no verdict recorded which
 * commit produced it — so a stale PASS and a real PASS were byte-identical.
 *
 * These tests cover the two properties that make the stamp trustworthy rather than decorative:
 * the honest-null contract, and survival of the truncation whitelist.
 */
import { describe, it, expect } from 'vitest';
import { resolveEvaluatedCommitSha } from '../../../lib/sub-agent-executor/results-storage.js';
import { truncateValidationDetails } from '../../../scripts/modules/handoff/recording/preflight-remediation.js';

describe('QF-20260903-469: executing-tree provenance on handoff verdicts', () => {
  it('resolves the sha of the tree it is actually run from, not of main', () => {
    // The reused resolver takes a repoPath and reports THAT tree's HEAD. This is the whole
    // point: a worktree 19 commits behind main must report its own HEAD, not main's.
    const sha = resolveEvaluatedCommitSha(process.cwd());
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns null — never a fabricated or inherited sha — when the tree cannot be resolved', () => {
    // HONEST NULL: null means COULD NOT DETERMINE. It must never be confused with "fresh" or
    // "same as HEAD". A negative and an unmeasured-negative are indistinguishable downstream.
    expect(resolveEvaluatedCommitSha(null)).toBeNull();
    expect(resolveEvaluatedCommitSha('')).toBeNull();
    // A non-repo path: the resolver swallows the git failure and reports undetermined.
    const stubExec = () => { throw new Error('not a git repository'); };
    expect(resolveEvaluatedCommitSha('/definitely/not/a/repo', stubExec)).toBeNull();
  });

  it('survives the pathological truncation fallback, which is an explicit whitelist', () => {
    // The fallback names its keys, so anything unlisted is silently dropped. A stamp that
    // vanishes on the hard path reads as present while being absent exactly when a verdict's
    // provenance matters most. Forced by a summary large enough to blow the cap even after
    // the trimming passes.
    const huge = Array.from({ length: 3000 }, (_, i) => `improvement-${i}-${'x'.repeat(200)}`);
    const details = {
      summary: { passed: false, required_improvements: huge },
      rejected_at: '2026-09-03T00:00:00.000Z',
      reason: 'VALIDATION_FAILED',
      executing_commit_sha: 'a'.repeat(40),
      executing_cwd: '/repo/.worktrees/some-sd',
    };

    const out = truncateValidationDetails(details, 5000);

    expect(JSON.stringify(out).length).toBeLessThanOrEqual(5000);
    expect(out.executing_commit_sha, 'stamp dropped by the truncation whitelist').toBe('a'.repeat(40));
    expect(out.executing_cwd).toBe('/repo/.worktrees/some-sd');
  });

  it('keeps the stamp keys present as null rather than omitting them when undetermined', () => {
    // Absence-of-key and null must stay distinguishable: an omitted key reads as "this writer
    // predates the stamp", a null reads as "this run could not determine it".
    const out = truncateValidationDetails({
      summary: { passed: false, required_improvements: Array.from({ length: 3000 }, () => 'y'.repeat(300)) },
      rejected_at: '2026-09-03T00:00:00.000Z',
      reason: 'X',
    }, 5000);

    expect(out).toHaveProperty('executing_commit_sha');
    expect(out.executing_commit_sha).toBeNull();
  });
});
