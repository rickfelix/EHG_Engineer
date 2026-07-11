/**
 * SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001 (FR-5) — static delete-primitive guard.
 *
 * Per-site patching is why the self-reap class recurred (#3670-#3674 -> #4316,
 * #4657, #4669, #5853, twice on 2026-07-11): each fix hardened one writer while
 * new/unlisted writers kept executing `git worktree remove` directly, bypassing
 * every guard. This scan fails CI when a non-allowlisted file executes the
 * delete primitive — all deletes must route through the guarded chokepoint
 * (removeWorktreeViaGit in lib/worktree-manager.js).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Files allowed to contain the execution string.
const ALLOWLIST = new Set([
  // The chokepoint itself (primary path + rollbackWorktreeFilesystemSync, a
  // creation-failure rollback of a just-created worktree — not a reap).
  'lib/worktree-manager.js',
  // Stale CONCURRENT-session worktrees (hook context, PowerShell git): guarded
  // by fs-marker + active-claim + dirty + unpushed + merged-to-main checks and
  // structurally unable to import ESM chokepoint from a sync CJS hook.
  'scripts/hooks/concurrent-session-worktree.cjs',
  // Ephemeral temp BUILD worktree created and removed inside one function call
  // (finally-block); never a session workspace.
  'lib/gates/cross-repo-build-check.js',
]);

const SCAN_DIRS = ['lib', 'scripts'];
const EXT_RE = /\.(m?c?js)$/;
const PRIMITIVE_RE = /git\s+worktree\s+remove/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(fp);
    } else if (EXT_RE.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) {
      // Test/spec files may reference the primitive in mocks and assertions.
      yield fp;
    }
  }
}

describe('worktree delete primitive is chokepoint-only (FR-5)', () => {
  it('no non-allowlisted file executes `git worktree remove` directly', () => {
    const violations = [];
    for (const dir of SCAN_DIRS) {
      for (const fp of walk(path.join(repoRoot, dir))) {
        const rel = path.relative(repoRoot, fp).replace(/\\/g, '/');
        if (ALLOWLIST.has(rel)) continue;
        const src = fs.readFileSync(fp, 'utf8');
        if (!PRIMITIVE_RE.test(src)) continue;
        // Only flag EXECUTION contexts (exec/spawn/run/PowerShell), not comments
        // or log strings mentioning the command.
        for (const [i, line] of src.split('\n').entries()) {
          if (!PRIMITIVE_RE.test(line)) continue;
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;
          if (/\b(execSync|exec|spawnSync|spawn|run|runGit|gitViaPowerShell)\s*\(/.test(line)) {
            violations.push(`${rel}:${i + 1}`);
          }
        }
      }
    }
    expect(violations, `direct 'git worktree remove' outside the guarded chokepoint:\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('the warn-and-proceed CWD branch is gone from post-merge cleanup (FR-2)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts/modules/shipping/post-merge-worktree-cleanup.js'), 'utf8');
    // The old branch returned a warning AND still deleted; the refusal path
    // must not call cleanupWorktreeByPath after detecting cwd containment.
    expect(src).not.toMatch(/warning:\s*['"]CWD_INSIDE_TARGET['"]/);
    expect(src).toMatch(/REAP_BLOCKED_RESIDENT/);
  });
});
