/**
 * SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 TS-5 — COMPOSED provision-then-delete.
 *
 * WHY THIS IS COMPOSED RATHER THAN A DIRECT REMOVAL TEST. My first TS-5 asserted that a provoked
 * recursive delete leaves the shared store intact — which scripts/safe-worktree-remove.test.js
 * ALREADY proves, against lib/worktree-manager.js code this SD does not modify. It was green
 * before the SD and stays green if the SD is reverted entirely: a third un-failable pin. The
 * PLAN-phase TESTING review caught it.
 *
 * This version traverses the code the SD actually changes. It forces the path that produces a
 * junction UNDER LOAD — lib/worktree-provision.js's isolate_failed_fallback, taken when npm
 * install throws (a 180s wall-clock timeout whose probability RISES with fleet concurrency) — and
 * only then removes the worktree. That composition is what makes the invariant meaningful: the
 * dangerous junction is the one nobody chose.
 *
 * LOCATION IS DELIBERATE. This first went to tests/integration/, where vitest.config.js EXCLUDES
 * the whole tests/integration tree from the `unit` project and no integration project exists — so
 * it would have NEVER RUN. A test that is never executed is the purest form of the un-failable pin
 * this SD keeps tripping over. It lives in lib/__tests__/ because that path IS included.
 *
 * "No error occurred" is INVALID evidence here. The historical wipe was SILENT, so the assertion
 * is an explicit before/after count of the shared store, printed as equality rather than compared
 * against a hard-coded number that would drift on any dependency change.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { removeWorktreeViaGit } from '../worktree-manager.js';
import { provisionWorktreeNodeModules, parseWorktreeNmMode } from '../worktree-provision.js';

const isWin = process.platform === 'win32';
const git = (cmd, cwd) => execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });

/** Sandbox whose repo root carries the shared store at repo/node_modules, with a CANARY. */
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-fallback-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git('init -q', repo);
  git('config user.email t@t.t', repo);
  git('config user.name t', repo);
  git('config commit.gpgsign false', repo);
  fs.writeFileSync(path.join(repo, 'README.md'), '# t');
  git('add -A', repo);
  git('commit -q -m init', repo);
  // The shared store the whole fleet depends on.
  const store = path.join(repo, 'node_modules');
  fs.mkdirSync(path.join(store, '@supabase', 'supabase-js'), { recursive: true });
  fs.writeFileSync(path.join(store, '@supabase', 'supabase-js', 'CANARY.txt'), 'do-not-delete');
  fs.mkdirSync(path.join(store, 'vitest'), { recursive: true });
  return { root, repo, store };
}

const countStore = (store) => fs.readdirSync(store).length;

describe('TS-5 — a FALLBACK junction is still safe to remove (composed)', () => {
  let sb;
  beforeEach(() => { sb = makeSandbox(); });
  afterEach(() => {
    // Lifted from scripts/safe-worktree-remove.test.js: unlink leftover junctions BEFORE the
    // recursive rm, or the teardown itself follows the link and guts what the test linked.
    try {
      const wtDir = path.join(sb.repo, '.worktrees');
      for (const name of (fs.existsSync(wtDir) ? fs.readdirSync(wtDir) : [])) {
        const nm = path.join(wtDir, name, 'node_modules');
        try { if (fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm); } catch { /* noop */ }
      }
    } catch { /* noop */ }
    try { fs.rmSync(sb.root, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('isolate FAILS -> junction fallback -> removal leaves the shared store byte-identical', () => {
    const wt = path.join(sb.repo, '.worktrees', 'SD-FALLBACK');
    fs.mkdirSync(path.dirname(wt), { recursive: true });
    git(`worktree add -q --detach "${wt}"`, sb.repo);

    const before = countStore(sb.store);
    expect(before).toBeGreaterThan(0); // guard: an empty store would make the assertion vacuous

    // Force the ISOLATE decision (>=2 sessions), then make the install THROW so the real
    // isolate_failed_fallback path runs. symlink/writeMarker are the REAL defaults, so an actual
    // junction is created — the hazard is reproduced, not simulated.
    const result = provisionWorktreeNodeModules(wt, {
      repoRoot: sb.repo,
      mode: 'auto',
      activeSessionCount: 4,
      freeDiskBytes: 500 * 1024 * 1024 * 1024,
      deps: { runInstall: () => { throw new Error('simulated npm install timeout'); } }
    });

    expect(result.strategy).toBe('junction');
    expect(result.reason).toBe('isolate_failed_fallback');

    // FR-3: the degraded junction is self-identifying on disk.
    const marker = fs.readFileSync(path.join(wt, '.worktree-nm-mode'), 'utf8');
    expect(parseWorktreeNmMode(marker).degraded).toBe(true);

    // It is a LIVE passthrough — so a follow-through delete WOULD gut the store.
    const through = path.join(wt, 'node_modules', '@supabase', 'supabase-js', 'CANARY.txt');
    expect(fs.readFileSync(through, 'utf8')).toBe('do-not-delete');
    expect(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink()).toBe(true);

    removeWorktreeViaGit(wt, sb.repo);

    const after = countStore(sb.store);
    expect(after).toBe(before); // equality, not a hard-coded literal
    expect(fs.existsSync(path.join(sb.store, '@supabase', 'supabase-js', 'CANARY.txt'))).toBe(true);
  });

  it('the deliberate junction is distinguishable from this degraded one (FR-3)', () => {
    const wt = path.join(sb.repo, '.worktrees', 'SD-DELIBERATE');
    fs.mkdirSync(path.dirname(wt), { recursive: true });
    git(`worktree add -q --detach "${wt}"`, sb.repo);

    // Solo session => junction BY DESIGN, not by failure.
    const result = provisionWorktreeNodeModules(wt, {
      repoRoot: sb.repo, mode: 'auto', activeSessionCount: 1,
      freeDiskBytes: 500 * 1024 * 1024 * 1024, deps: {}
    });
    expect(result.strategy).toBe('junction');
    expect(result.reason).not.toBe('isolate_failed_fallback');

    const marker = fs.readFileSync(path.join(wt, '.worktree-nm-mode'), 'utf8');
    const parsed = parseWorktreeNmMode(marker);
    expect(parsed.mode).toBe('junction');
    expect(parsed.degraded).toBe(false); // THE distinction — both used to write a bare 'junction'
  });
});
