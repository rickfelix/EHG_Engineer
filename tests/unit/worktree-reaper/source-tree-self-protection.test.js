/**
 * EXEC SECURITY S1 (CRITICAL) — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * THE HAZARD THIS SD CREATED FOR ITSELF. A dedicated execution tree (.reaper-source / .spawn-source)
 * has a branch matching none of the feat|qf|fix|chore|hotfix patterns and a basename in no SD/QF
 * map, so the reaper's own detector classifies it `orphan-sd` -> `stage2_remove`. The only thing
 * standing between it and deletion was the 30-minute tree-residency window — which holds by
 * COINCIDENCE, because origin/main happens to move often. This host runs
 * WORKTREE_REAPER_EXECUTE=stage2.
 *
 * So the direct consequence of this SD SUCCEEDING — un-starving the reaper — is a reaper that
 * deletes the tree it is executing from, the first time main goes quiet for half an hour. The SD
 * about a reaper that cannot run would have handed the newly-working reaper its own source as a
 * target. Found by the EXEC SECURITY review, not by me; there was no test covering it.
 *
 * TWO INDEPENDENT LAYERS ARE ASSERTED, because this is a data-loss path and either one alone is a
 * single point of failure:
 *   (1) a .reap-protected.json marker written into the tree at creation AND re-asserted on reuse
 *       (the reaper honours it at worktree-reaper.mjs:899 and :1372), and
 *   (2) the dirnames registered in the reaper's own NON_SD_PREFIXES, so protection survives the
 *       marker file being deleted.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  ensureSourceTreeWorktree, REAPER_SOURCE_DIRNAME, REAPER_SOURCE_BRANCH, SPAWN_SOURCE_DIRNAME,
} = require_('../../../lib/fleet/source-tree-refresh.cjs');
const { PROTECTED_MARKER_FILENAME, hasReapProtectedMarker } =
  require_('../../../lib/worktree-reaper/reap-protected-marker.js');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'src-protect-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('S1: the reaper must never be able to delete the tree it executes from', () => {
  it('LAYER 1 — a freshly CREATED source tree is marked reap-protected', () => {
    const created = [];
    const res = ensureSourceTreeWorktree({
      repoRoot: tmp,
      dirname: REAPER_SOURCE_DIRNAME,
      branch: REAPER_SOURCE_BRANCH,
      label: 'reaper-source',
      // Simulate `git worktree add` by materialising the directory, as real git would.
      exists: () => false,
      runner: (args) => { created.push(args.join(' ')); fs.mkdirSync(res_dir(tmp), { recursive: true }); },
    });
    expect(created.some((c) => c.startsWith('worktree add'))).toBe(true);
    expect(hasReapProtectedMarker(res.dir)).toBe(true);
  });

  it('LAYER 1 — protection SELF-HEALS: a reused tree missing its marker gets it back', () => {
    // A tree created BEFORE this fix has no marker, and a marker can simply be deleted. Asserting
    // only the creation path would leave every pre-existing tree permanently unprotected.
    const dir = res_dir(tmp);
    fs.mkdirSync(dir, { recursive: true });
    expect(hasReapProtectedMarker(dir)).toBe(false);

    const res = ensureSourceTreeWorktree({
      repoRoot: tmp,
      dirname: REAPER_SOURCE_DIRNAME,
      branch: REAPER_SOURCE_BRANCH,
      label: 'reaper-source',
      exists: () => true,
      runner: () => {},
    });
    expect(res.created).toBe(false);
    expect(hasReapProtectedMarker(res.dir)).toBe(true);
  });

  it('LAYER 2 — both dirnames are registered in the reaper\'s NON_SD_PREFIXES', () => {
    // Independent of the marker: if the file is deleted, the classifier must STILL not treat these
    // as abandoned SD worktrees. Reads the detector source because NON_SD_PREFIXES is module-local.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'worktree-reaper', 'detectors.js'), 'utf8',
    );
    const line = src.split('\n').find((l) => l.includes('const NON_SD_PREFIXES'));
    expect(line).toBeTruthy();
    expect(line).toContain(REAPER_SOURCE_DIRNAME);
    expect(line).toContain(SPAWN_SOURCE_DIRNAME);
  });

  it('the marker names WHY, so a human deleting it understands the consequence', () => {
    const res = ensureSourceTreeWorktree({
      repoRoot: tmp,
      dirname: REAPER_SOURCE_DIRNAME,
      branch: REAPER_SOURCE_BRANCH,
      label: 'reaper-source',
      exists: () => false,
      runner: () => { fs.mkdirSync(res_dir(tmp), { recursive: true }); },
    });
    const marker = JSON.parse(fs.readFileSync(path.join(res.dir, PROTECTED_MARKER_FILENAME), 'utf8'));
    expect(String(marker.reason || '')).toMatch(/EXECUTES FROM/i);
  });
});

function res_dir(root) { return path.join(root, REAPER_SOURCE_DIRNAME); }
