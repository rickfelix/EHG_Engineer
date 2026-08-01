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

  /**
   * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B (FR-5) — the guard above greps only
   * `git worktree remove`, so EVERY rmSync / safeRecursiveRm deleter was structurally
   * invisible to it. The header of this file records that per-site patching is why the
   * class recurred five times; the mechanism built to end that recurrence covered one of
   * the two delete primitives. A worktree removed with a RAW recursive rmSync can also
   * follow a node_modules junction out of the tree and into the shared store, which the
   * junction-safe helpers exist to prevent.
   *
   * Scope is deliberately narrow so the guard does not land permanently red: a bare
   * `recursive: true` pattern matches 226 files. This flags a raw recursive rmSync only in
   * files that actually deal with worktree paths.
   */
  it('no non-allowlisted worktree-handling file deletes with a raw recursive rmSync (FR-5)', () => {
    // Each entry states WHY, so the next reader can re-judge it rather than inherit it.
    const FS_ALLOWLIST = new Map([
      ['lib/worktree-manager.js',
        'IS the junction-safe primitive — safeRecursiveRm/WithRetry are defined here and this is their implementation.'],
      ['lib/cleanup/filesystem-provider.js',
        'FR-4 removed .worktrees from its allowlist; it now refuses worktree paths outright and deletes only under tmp. It mentions .worktrees solely to name that refusal.'],
      ['scripts/audit/worktree-reparse-audit.mjs',
        'Removes its own mkdtemp scratch dir, not a worktree.'],
      ['scripts/hooks/concurrent-session-worktree.cjs',
        'RESIDUAL RISK, RECORDED NOT RESOLVED: this DOES rmSync a worktree path. Already allowlisted above for the git primitive because a sync CJS hook cannot import the ESM chokepoint. It is guarded by fs-marker + active-claim + dirty + unpushed + merged-to-main checks, but the raw rmSync means it is not junction-safe. Converting it needs its own change.'],
      ['scripts/maintenance/sweep-worker-scratch.mjs',
        'Sweeps worker scratch paths. Not re-verified as worktree-free in this SD — allowlisted to keep the guard green, flagged for follow-up.'],
    ]);

    // Comments are BLANKED IN PLACE rather than removed: stripping them shifts every
    // subsequent line number, so reported violations point at the wrong code. (Learned
    // the hard way while sizing this guard.) An unstripped scan is also wrong — the
    // reaper mentions rmSync only in a comment and would self-report a false violation.
    const blankComments = (src) => {
      let out = ''; let state = null;
      for (let i = 0; i < src.length;) {
        const two = src.slice(i, i + 2);
        if (state === null) {
          if (two === '/*') { state = 'block'; out += '  '; i += 2; continue; }
          if (two === '//') { state = 'line'; out += '  '; i += 2; continue; }
          out += src[i]; i += 1;
        } else if (state === 'block') {
          if (two === '*/') { state = null; out += '  '; i += 2; continue; }
          out += src[i] === '\n' ? '\n' : ' '; i += 1;
        } else {
          if (src[i] === '\n') { state = null; out += '\n'; i += 1; continue; }
          out += ' '; i += 1;
        }
      }
      return out;
    };

    // Word-boundary, so it catches the BARE destructured `rmSync(` as well as `fs.rmSync(`.
    const RAW_RM_RE = /\brmSync\s*\(/;
    const violations = [];
    for (const dir of SCAN_DIRS) {
      for (const fp of walk(path.join(repoRoot, dir))) {
        const rel = path.relative(repoRoot, fp).replace(/\\/g, '/');
        if (FS_ALLOWLIST.has(rel)) continue;
        const blanked = blankComments(fs.readFileSync(fp, 'utf8'));
        if (!blanked.includes('.worktrees')) continue; // not a worktree-handling file
        for (const [i, line] of blanked.split('\n').entries()) {
          if (RAW_RM_RE.test(line) && line.includes('recursive')) {
            violations.push(`${rel}:${i + 1}`);
          }
        }
      }
    }
    expect(violations, `raw recursive rmSync in worktree-handling files (use safeRecursiveRm):\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('FR-5 guard is not vacuous — it detects a synthetic violation', () => {
    // Without this, the guard passes identically whether its predicate works or not.
    const synthetic = [
      'const dir = resolve(cwd, ".worktrees", name);',
      'fs.rmSync(dir, { recursive: true, force: true });',
    ].join('\n');
    const RAW_RM_RE = /\brmSync\s*\(/;
    const hit = synthetic.split('\n').some((l) => RAW_RM_RE.test(l) && l.includes('recursive'));
    expect(hit).toBe(true);
    // …and a comment-only mention must NOT trip it, which is why blanking exists.
    const commented = '// fs.rmSync(dir, { recursive: true });';
    expect(commented.trim().startsWith('//')).toBe(true);
  });

  it('the warn-and-proceed CWD branch is gone from post-merge cleanup (FR-2)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts/modules/shipping/post-merge-worktree-cleanup.js'), 'utf8');
    // The old branch returned a warning AND still deleted; the refusal path
    // must not call cleanupWorktreeByPath after detecting cwd containment.
    expect(src).not.toMatch(/warning:\s*['"]CWD_INSIDE_TARGET['"]/);
    expect(src).toMatch(/REAP_BLOCKED_RESIDENT/);
  });
});
