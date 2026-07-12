/**
 * e2e — SD-LEO-INFRA-MID-FLIGHT-DIRECTIVE-001 / FR-3 (recurred-family doctrine: verify
 * REACHABILITY, not just logic).
 *
 * The live incident that motivated this SD (an unread chairman-priority WORK_ASSIGNMENT
 * with delivered_at=NULL on an active worker) is consistent with coordination-inbox.cjs's
 * canonical-parent worktree delegation silently not firing for that worktree seat — not
 * just a row-selection/starvation bug. This builds a REAL git worktree (not a mock) and
 * confirms findCanonicalParent() correctly resolves a worktree checkout back to its
 * parent, so a hook running FROM inside a worktree actually reaches the parent's (fixed)
 * hook implementation rather than running its own possibly-stale frozen copy.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { findCanonicalParent, isInWorktree } = require('../../lib/hooks/canonical-parent.cjs');

let tempDirs = [];

function makeTempGitRepoWithWorktree() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-inbox-reachability-parent-'));
  execSync('git init -q', { cwd: parent });
  execSync('git config user.email test@example.com', { cwd: parent });
  execSync('git config user.name test', { cwd: parent });
  fs.writeFileSync(path.join(parent, 'marker.txt'), 'parent\n');
  execSync('git add marker.txt && git commit -q -m init', { cwd: parent });

  const worktreeParentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-inbox-reachability-wt-'));
  const worktreePath = path.join(worktreeParentDir, 'wt');
  execSync(`git worktree add -q -b test-worktree-branch "${worktreePath}"`, { cwd: parent });

  tempDirs.push(parent, worktreeParentDir);
  return { parent, worktreePath };
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      // Best-effort: `git worktree remove` first so the parent repo's registry stays clean,
      // then a plain recursive rm for whatever remains.
      execSync('git worktree prune', { cwd: dir, stdio: 'ignore' });
    } catch { /* ignore */ }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* best-effort cleanup; leftover temp dirs are harmless */ }
  }
  tempDirs = [];
});

describe('findCanonicalParent — real git worktree reachability (FR-3)', () => {
  it('isInWorktree is false for the parent repo itself', () => {
    const { parent } = makeTempGitRepoWithWorktree();
    expect(isInWorktree(parent)).toBe(false);
  });

  it('isInWorktree is true for a real worktree checkout', () => {
    const { worktreePath } = makeTempGitRepoWithWorktree();
    expect(isInWorktree(worktreePath)).toBe(true);
  });

  it('findCanonicalParent resolves a real worktree checkout back to the exact parent repo path', () => {
    const { parent, worktreePath } = makeTempGitRepoWithWorktree();
    const resolved = findCanonicalParent(worktreePath);
    // Resolve both sides through fs.realpathSync to normalize any symlink/8.3-path
    // differences (Windows temp dirs can round-trip through a short-name alias).
    expect(fs.realpathSync(resolved)).toBe(fs.realpathSync(parent));
  });

  it('findCanonicalParent returns null for the parent repo (no infinite delegation loop)', () => {
    const { parent } = makeTempGitRepoWithWorktree();
    expect(findCanonicalParent(parent)).toBeNull();
  });

  it('a hook script run FROM inside the worktree actually reaches a parent-only marker file (true delegation reachability, not just path arithmetic)', () => {
    // This is the direct analog of the live incident: place a distinguishing marker only
    // the PARENT's copy of a script can see, run a minimal delegating script from the
    // WORKTREE, and confirm it reads the parent's marker — proving the delegation path
    // is actually exercised end-to-end, not merely that findCanonicalParent's return
    // value LOOKS correct in isolation.
    const { parent, worktreePath } = makeTempGitRepoWithWorktree();
    const parentMarkerPath = path.join(parent, 'canonical-marker.json');
    fs.writeFileSync(parentMarkerPath, JSON.stringify({ source: 'parent' }));

    const delegatingScript = `
      const path = require('path');
      const { findCanonicalParent } = require(${JSON.stringify(path.resolve(__dirname, '../../lib/hooks/canonical-parent.cjs'))});
      const canonical = findCanonicalParent(process.cwd());
      if (!canonical) { console.log(JSON.stringify({ source: 'local-no-delegation' })); process.exit(0); }
      const markerPath = path.join(canonical, 'canonical-marker.json');
      const fs = require('fs');
      console.log(fs.readFileSync(markerPath, 'utf8'));
    `;
    const scriptPath = path.join(worktreePath, 'delegate-probe.cjs');
    fs.writeFileSync(scriptPath, delegatingScript);

    const out = execSync(`node "${scriptPath}"`, { cwd: worktreePath, encoding: 'utf8' });
    expect(JSON.parse(out.trim())).toEqual({ source: 'parent' });
  });
});
