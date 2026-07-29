// SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 FR-4 + FR-3.
//
// FR-4: validateWorktreeSubstrate checked lstat PRESENCE only, and SUBSTRATE_ITEMS lists
// 'node_modules'. A directory holding just Vite's .vite cache therefore satisfied it, no
// WORKTREE_INCOMPLETE was raised, and the worktree reported HEALTHY while every downstream tool
// failed module-not-found. The provisioning guard and this health guard were BOTH existence-only,
// so fixing either alone left the silent-failure path open.
//
// TS-7 is the regression guard: the PLAN-phase TESTING review caught that FR-4, as originally
// written, would have REOPENED the PR #3488 finding-1 regression. lstat was chosen over a
// read-through check because a junction's target is transiently absent during a concurrent npm
// install at the main repo (.staging atomic swap) — reading through would tear down a HEALTHY
// junctioned worktree, under load, when the store is busiest. It manifests only under concurrency.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateWorktreeSubstrate } from '../../../lib/worktree-manager.js';
import { parseWorktreeNmMode } from '../../../lib/worktree-provision.js';

function tmpWorktree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-substrate-'));
  // Minimal substrate so only node_modules is under test.
  fs.mkdirSync(path.join(dir, 'node_modules'));
  return dir;
}

describe('validateWorktreeSubstrate — population, not presence (FR-4)', () => {
  it('reports a HOLLOW node_modules as missing', () => {
    const dir = tmpWorktree();
    fs.mkdirSync(path.join(dir, 'node_modules', '.vite'));
    // The exact on-disk shape measured on this fleet: a cache dir and no packages.
    expect(validateWorktreeSubstrate(dir, ['node_modules']).missing).toContain('node_modules');
  });

  it('reports a node_modules poisoned by a NON-.vite stray as missing', () => {
    // An _archive worktree was found holding only .rank-pass-trigger.lock and no .vite at all, so
    // a name-based fix would under-cover. This pins the emptiness rule instead.
    const dir = tmpWorktree();
    fs.writeFileSync(path.join(dir, 'node_modules', '.rank-pass-trigger.lock'), '');
    expect(validateWorktreeSubstrate(dir, ['node_modules']).missing).toContain('node_modules');
  });

  it('accepts a POPULATED node_modules', () => {
    const dir = tmpWorktree();
    fs.mkdirSync(path.join(dir, 'node_modules', '.vite'));
    fs.mkdirSync(path.join(dir, 'node_modules', 'vitest'));
    const res = validateWorktreeSubstrate(dir, ['node_modules']);
    expect(res.missing).not.toContain('node_modules');
    expect(res.ok).toBe(true);
  });

  it('still reports a genuinely ABSENT node_modules as missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-substrate-none-'));
    expect(validateWorktreeSubstrate(dir, ['node_modules']).missing).toContain('node_modules');
  });
});

describe('TS-7 — a JUNCTION must NOT be read through (PR #3488 finding 1)', () => {
  it('accepts a symlinked node_modules whose target is EMPTY', (ctx) => {
    // Reading through would see an empty target and declare the worktree incomplete. Under a real
    // concurrent .staging swap that target is transiently absent, so a read-through check would
    // tear down a healthy worktree exactly when the store is busiest.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-substrate-link-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-store-'));
    try {
      fs.symlinkSync(target, path.join(dir, 'node_modules'), 'junction');
    } catch {
      // ctx.skip(), NOT a bare return: vitest reports an early return as PASSED, so on a host that
      // cannot create junctions this becomes a SILENT GREEN on the exact regression it guards.
      ctx.skip();
    }
    const res = validateWorktreeSubstrate(dir, ['node_modules']);
    expect(res.missing).not.toContain('node_modules');
    expect(res.ok).toBe(true);
  });
});

describe('parseWorktreeNmMode — a degraded junction is self-identifying (FR-3)', () => {
  it('distinguishes a deliberate junction from a failed isolation', () => {
    expect(parseWorktreeNmMode('junction:auto_solo').degraded).toBe(false);
    expect(parseWorktreeNmMode('junction:isolate_failed_fallback').degraded).toBe(true);
  });

  it('exposes mode and reason separately so consumers need not string-match', () => {
    expect(parseWorktreeNmMode('isolated:auto_concurrent')).toEqual({
      mode: 'isolated', reason: 'auto_concurrent', degraded: false
    });
  });

  it('tolerates the LEGACY bare form still on disk', () => {
    expect(parseWorktreeNmMode('junction')).toEqual({ mode: 'junction', reason: null, degraded: false });
  });

  it('is null-safe on an absent or blank marker', () => {
    expect(parseWorktreeNmMode(null).mode).toBeNull();
    expect(parseWorktreeNmMode('   ').mode).toBeNull();
  });
});
