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

// ── FR-5 predicate, at MODULE scope so the self-test below can drive THE REAL ONE ──
//
// RETRO-F1: the previous self-test re-declared this regex inside its own `it()` and ran it
// against a string literal, because every helper lived inside the scan `it()` and was out of
// scope. It therefore passed no matter what the guard did — WINDOW could go back to 1,
// blankComments could be deleted, the allowlist could swallow every file. That is the
// correct-but-not-wired failure this SD spent a commit fixing elsewhere, re-committed inside
// the fix for the line-number bug, in a commit whose message claimed verification by planted
// violation. The manual planted runs were real; what got committed was not them.

/** Blank comment BODIES in place, preserving newlines so line numbers stay accurate. */
function blankComments(src) {
  const NL = String.fromCharCode(10);
  let out = ''; let state = null;
  for (let i = 0; i < src.length;) {
    const two = src.slice(i, i + 2);
    if (state === null) {
      if (two === '/*') { state = 'block'; out += '  '; i += 2; continue; }
      if (two === '//') { state = 'line'; out += '  '; i += 2; continue; }
      out += src[i]; i += 1;
    } else if (state === 'block') {
      if (two === '*/') { state = null; out += '  '; i += 2; continue; }
      out += src[i] === NL ? NL : ' '; i += 1;
    } else {
      if (src[i] === NL) { state = null; out += NL; i += 1; continue; }
      out += ' '; i += 1;
    }
  }
  return out;
}

// Word-boundary, so the BARE destructured `rmSync(` is caught alongside `fs.rmSync(`.
const RAW_RM_RE = /\brmSync\s*\(/;
// SECURITY: the first version required `rmSync(` and `recursive` on the SAME line, and
// Prettier splits a long call — the reformatted call sailed through a guard whose entire
// purpose is ending a five-time recurrence. The options object is searched in a window.
const RM_WINDOW = 4;

/**
 * Line numbers (1-based) of raw recursive rmSync calls in `src`.
 * THE single implementation — the scan and its non-vacuity test both call this.
 */
function findRawRecursiveRmSync(src) {
  const NL = String.fromCharCode(10);
  const lines = blankComments(src).split(NL);
  const hits = [];
  for (const [i, line] of lines.entries()) {
    if (!RAW_RM_RE.test(line)) continue;
    if (lines.slice(i, i + RM_WINDOW).join(NL).includes('recursive')) hits.push(i + 1);
  }
  return hits;
}

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
   * the two delete primitives.
   *
   * WHY, CORRECTED (SEC-08): the original justification here claimed a raw recursive
   * rmSync follows a nested node_modules junction out of the tree. SECURITY could NOT
   * reproduce that on Node v24.12.0 — the nested junction was unlinked and its target
   * survived. The real reason to route through the junction-safe helpers is that they
   * unlink links deliberately and are the single place that behaviour is maintained; a
   * raw rmSync is an unreviewed second implementation of a delete policy. Keeping a false
   * threat premise in a control's rationale is its own hazard: it points readers at a safe
   * route and away from the real one (intermediate-segment junctions, see SEC-01).
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
        'FR-4 removed .worktrees from its allowlist and it refuses worktree paths outright. SECURITY disproved the first version of this reason by escaping the LEXICAL containment check via an intermediate-segment junction; containment is now realpath-based and the resolved path is what gets deleted, so the claim holds as restated.'],
      ['scripts/audit/worktree-reparse-audit.mjs',
        'Removes its own mkdtemp scratch dir, not a worktree.'],
      ['scripts/one-off/fr4-portability-dry-run-repo-hygiene-path-001.mjs',
        'Removes its own mkdtemp scratch dir (DRYRUN_ROOT, a throwaway copy of a few files used to prove path-resolution portability), not a worktree -- same shape as worktree-reparse-audit.mjs above. Mentions .worktrees only in comments/scenario labels describing the layout it simulates.'],
      ['scripts/hooks/concurrent-session-worktree.cjs',
        'CORRECTED BY SECURITY: it DOES rmSync a worktree path, but it is NOT unsafe — :610 calls _unlinkNestedLinks(wtPath) inside the retry loop immediately before every rmSync at :612, mirroring the canonical _unlinkLinksRecursive (worktree-manager.js:1334). My earlier reason here said it was not junction-safe; that was wrong. The real (minor) issue is DUPLICATION of the primitive rather than reuse, which is a drift risk, not a wipe risk.'],
      ['scripts/maintenance/sweep-worker-scratch.mjs',
        'CORRECTED BY SECURITY: verifiably safe, not merely unverified — :57 lists .worktrees/ in its never-walk EXCLUDE set. My earlier reason was weaker than the truth and would have sent a future reader chasing a non-hazard.'],
    ]);

    const violations = [];
    for (const dir of SCAN_DIRS) {
      for (const fp of walk(path.join(repoRoot, dir))) {
        const rel = path.relative(repoRoot, fp).replace(/\\/g, '/');
        if (FS_ALLOWLIST.has(rel)) continue;
        const src = fs.readFileSync(fp, 'utf8');
        if (!blankComments(src).includes('.worktrees')) continue; // not a worktree-handling file
        for (const line of findRawRecursiveRmSync(src)) violations.push(`${rel}:${line}`);
      }
    }
    expect(violations, `raw recursive rmSync in worktree-handling files (use safeRecursiveRm):\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('FR-5 predicate is not vacuous — it detects BOTH call shapes and ignores comments', () => {
    // Drives findRawRecursiveRmSync itself. Acceptance for RETRO-F1: setting RM_WINDOW
    // back to 1 must turn this RED, which is impossible if the test re-implements it.
    const NL = String.fromCharCode(10);
    const singleLine = [
      'const dir = resolve(cwd, ".worktrees", name);',
      'fs.rmSync(dir, { recursive: true, force: true });',
    ].join(NL);
    expect(findRawRecursiveRmSync(singleLine)).toEqual([2]);

    // The multi-line form Prettier emits — the shape that evaded the first version.
    const multiLine = [
      'const dir = resolve(cwd, ".worktrees", name);',
      'fs.rmSync(dir, {',
      '  recursive: true,',
      '  force: true,',
      '});',
    ].join(NL);
    expect(findRawRecursiveRmSync(multiLine)).toEqual([2]);

    // The bare destructured call, not just the dotted form.
    expect(findRawRecursiveRmSync('rmSync(p, { recursive: true });')).toEqual([1]);

    // A comment-only mention must NOT trip it — this is what blankComments buys, and it
    // is asserted THROUGH the predicate rather than by re-checking the string.
    expect(findRawRecursiveRmSync('// fs.rmSync(dir, { recursive: true });')).toEqual([]);
    const blockComment = ['/*', ' fs.rmSync(dir, {', ' recursive: true,', ' });', '*/'].join(NL);
    expect(findRawRecursiveRmSync(blockComment)).toEqual([]);

    // A non-recursive rmSync is out of scope and must not be flagged.
    expect(findRawRecursiveRmSync('fs.rmSync(file);')).toEqual([]);
  });
  it('the warn-and-proceed CWD branch is gone from post-merge cleanup (FR-2)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts/modules/shipping/post-merge-worktree-cleanup.js'), 'utf8');
    // The old branch returned a warning AND still deleted; the refusal path
    // must not call cleanupWorktreeByPath after detecting cwd containment.
    expect(src).not.toMatch(/warning:\s*['"]CWD_INSIDE_TARGET['"]/);
    expect(src).toMatch(/REAP_BLOCKED_RESIDENT/);
  });
});
