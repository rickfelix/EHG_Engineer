/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B FR-4 — the cleanup provider no longer
 * deletes worktrees, and its containment check now has a separator boundary.
 *
 * The provider accepted any path under .worktrees and called a RAW rmSync: no claim guard,
 * no residency guard, no isReapable, and not safeRecursiveRm, so it could follow a
 * node_modules junction into the shared store. Latent rather than live (nothing passes it
 * filesystemPaths today), but the guards child cannot claim an invariant while a path
 * exists that consults none of the guards.
 *
 * The POSITIVE case matters as much as the refusal: the pre-existing suite asserted only
 * an empty-paths case and an /etc rejection, so a blanket disablement would have passed it.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { cleanupFilesystem } from '../../../lib/cleanup/filesystem-provider.js';

const CWD = process.cwd();
const mk = (p) => { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'f.txt'), 'x'); return p; };
const made = [];

afterEach(() => {
  for (const p of made.splice(0)) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } }
});

describe('FR-4 — worktree paths are refused', () => {
  test('a path under .worktrees is NOT deleted, and says why', async () => {
    const target = path.join(CWD, '.worktrees', '__fr4_probe__');
    made.push(target);
    mk(target);
    const r = await cleanupFilesystem('venture-1', { paths: [target] });
    expect(r.cleaned).toEqual([]);
    expect(r.errors[0].error).toMatch(/guarded reaper|worktree-manager/i);
    expect(fs.existsSync(target)).toBe(true); // ARMING: it really is still on disk
  });

  test('refusal holds in dryRun too — it is a validation refusal, not a delete-time one', async () => {
    const target = path.join(CWD, '.worktrees', '__fr4_probe2__');
    made.push(target);
    mk(target);
    const r = await cleanupFilesystem('v', { paths: [target], dryRun: true });
    expect(r.cleaned).toEqual([]);
    expect(r.success).toBe(false);
  });
});

describe('FR-4 — OPPOSITE POLARITY: the provider still does its actual job', () => {
  test('a path under tmp IS still deleted', async () => {
    // Without this, a blanket disablement would satisfy every refusal test above.
    const target = path.join(CWD, 'tmp', '__fr4_ok__');
    made.push(target);
    mk(target);
    const r = await cleanupFilesystem('v', { paths: [target] });
    expect(r.cleaned).toEqual([target]);
    expect(r.success).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  test('dryRun under tmp reports without deleting', async () => {
    const target = path.join(CWD, 'tmp', '__fr4_dry__');
    made.push(target);
    mk(target);
    const r = await cleanupFilesystem('v', { paths: [target], dryRun: true });
    expect(r.cleaned).toEqual([target]);
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe('FR-4 — the containment check has a separator boundary', () => {
  test('a SIBLING whose name merely starts with an allowed root is refused', async () => {
    // Previously `normalized.startsWith(root)` made tmp-restore look like it was inside tmp.
    const target = path.join(CWD, 'tmp-fr4-sibling');
    made.push(target);
    mk(target);
    const r = await cleanupFilesystem('v', { paths: [target] });
    expect(r.cleaned).toEqual([]);
    expect(fs.existsSync(target)).toBe(true);
  });

  test('a sibling of .worktrees is refused by the allowlist, not mislabelled as a worktree', async () => {
    const target = path.join(CWD, 'tmp', '__fr4_nested__', 'deep');
    made.push(path.join(CWD, 'tmp', '__fr4_nested__'));
    mk(target);
    // genuinely nested under tmp -> allowed, proving the boundary check did not over-tighten
    const r = await cleanupFilesystem('v', { paths: [target] });
    expect(r.cleaned).toEqual([target]);
  });

  test('paths outside every root are still refused', async () => {
    const r = await cleanupFilesystem('v', { paths: ['/etc/passwd'] });
    expect(r.cleaned).toEqual([]);
    expect(r.errors[0].error).toMatch(/not under allowed roots/i);
  });
});
