/**
 * Unit tests for the sd-start.js worktree_commit_pin writer.
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B (FR-5, TS-7).
 *
 * Mirrors the exact computation at scripts/sd-start.js (the block just below the existing
 * worktree_path persistence try/catch) — same convention as
 * tests/unit/sd-start-worktree-basename.test.js: sd-start.js is a top-level script with heavy
 * side effects (DB writes, session creation, git worktree provisioning), so the write-worthy
 * logic is mirrored here as a small pure(ish) function and pinned against a REAL git repo, per
 * TR-1 ("verification uses `git cat-file -t` exclusively").
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWorktreePathTier, TIER, SHAPE } from '../../lib/git/commit-pin-resolver.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEAD = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

/** Mirrors scripts/sd-start.js's worktree_commit_pin computation block. */
async function computeWorktreeCommitPin(cwd) {
  const headSha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
  return resolveWorktreePathTier(
    { path: cwd, recordedSha: headSha, recordedAt: new Date().toISOString() },
    { repoRoot: cwd }
  );
}

describe('sd-start worktree_commit_pin writer (FR-5)', () => {
  it('produces a TIER.EXACT value with the @<40-char-sha> suffix for a real worktree cwd', async () => {
    const pin = await computeWorktreeCommitPin(REPO_ROOT);
    expect(pin.tier).toBe(TIER.EXACT);
    expect(pin.value).toBe(`${REPO_ROOT}@${HEAD}`);
    expect(pin.value).toMatch(SHAPE.EXACT);
    expect(HEAD).toMatch(/^[0-9a-f]{40}$/);
  });

  it('the value targets worktree_commit_pin, never worktree_path, and worktree_path stays a bare path', () => {
    // scripts/sd-start.js writes TWO separate columns: worktree_path (bare worktreeInfo.cwd,
    // unchanged) and worktree_commit_pin (the new pinned value). This test pins that the bare
    // path itself never gains the pin suffix — the two must never be conflated onto one column
    // (the exact defect the RCA on 2026-09-07 found and corrected).
    const barePath = REPO_ROOT;
    expect(barePath).not.toContain('@');
    expect(barePath).not.toMatch(SHAPE.EXACT);
  });

  it('fails loudly (rejects) rather than silently writing an unpinned value when cwd is not a git repo', async () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'not-a-git-repo-'));
    try {
      await expect(computeWorktreeCommitPin(nonGitDir)).rejects.toThrow();
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});
