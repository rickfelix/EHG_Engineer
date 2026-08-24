/**
 * QF-20260823-098 (follow-up to SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5, PR #7465).
 *
 * Found via peer investigation after that SD merged: analyzeGitDiff's outer try/catch
 * (scripts/modules/complete-quick-fix/git-operations.js:591-707) can throw AFTER
 * filesChanged is already populated (e.g. the `git diff ${diffRange} --stat` call), in
 * which case the catch swallows the exception and returns whatever `diffAnalysis` was at
 * that point. Pre-fix, that was a bare `{}` — diffAnalysis.diffSourceTier read as
 * `undefined`, not an explicit "unknown". Fixed by defaulting diffAnalysis to
 * `{ diffSourceTier: null }` up front so any exception path still returns an explicit,
 * falsy-but-present tier value (consumed by lib/quick-fix/sensitive-path-registry.js's
 * `diffSourceTier || 'unknown'` fallback in its refusal reason string).
 *
 * This test exercises the real function against a genuinely non-git temp directory (not a
 * mock) so the very first execSync call throws for real, forcing the outer catch.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyzeGitDiff } from '../../scripts/modules/complete-quick-fix/git-operations.js';

describe('analyzeGitDiff — diffSourceTier defaults to null (never undefined) on an exception path', () => {
  let nonGitDir;

  beforeAll(() => {
    nonGitDir = mkdtempSync(path.join(tmpdir(), 'analyze-git-diff-non-git-'));
  });

  afterAll(() => {
    rmSync(nonGitDir, { recursive: true, force: true });
  });

  it('returns diffAnalysis.diffSourceTier === null (not undefined) when git commands fail', () => {
    const { diffAnalysis } = analyzeGitDiff(nonGitDir, '');

    expect(diffAnalysis.diffSourceTier).toBe(null);
    expect('diffSourceTier' in diffAnalysis).toBe(true);
  });
});
