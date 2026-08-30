/**
 * QF-20260830-415 — the fleet blocked on WORKTREE_CREATE_FAILED with the pool full (28/28
 * registered) AND `worktree-reaper.mjs --orphan-sweep` reporting reapable=0/excluded=286.
 * excluded_count alone gave no way to tell WHY without source-level instrumentation. Live
 * diagnosis found EVERY excluded dir shared reason='too_recent' -- not 286 individually recent
 * directories, but the recency guard (WORKTREE_ORPHAN_MIN_AGE_MS) itself firing on all of them,
 * left at a 10-year 2026-08-01 incident disarm (see .env comment for the documented, apparently
 * unmet revert condition). This pins buildOrphanSummary's new excluded_by_reason census so the
 * next fleet-wide exhaustion self-diagnoses from the summary alone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { selectReapableOrphans, buildOrphanSummary } from '../../../lib/worktree-reaper/orphan-sweep.js';

let root, worktreesDir;

const mkDir = (rel) => fs.mkdirSync(path.join(worktreesDir, rel), { recursive: true });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-census-'));
  worktreesDir = path.join(root, '.worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('buildOrphanSummary — excluded_by_reason census (QF-20260830-415)', () => {
  it('a blanket too_recent disarm (minAgeMs absurdly large) is visible as ONE reason covering ALL excluded dirs', () => {
    mkDir('old-one');
    mkDir('old-two');
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 315360000000 });
    const summary = buildOrphanSummary(sel, { reclaimed_count: 0, reclaimed_bytes: 0, failed: [], dry_run: true });

    expect(summary.excluded_count).toBe(2);
    expect(summary.excluded_by_reason).toEqual({ too_recent: 2 });
    // The census is what turns "0 reapable, 2 excluded" from opaque into diagnosable: the
    // threshold is the culprit, not the individual directories.
    expect(summary.excluded_by_reason.too_recent).toBe(summary.excluded_count);
  });

  it('a healthy sweep (minAgeMs=0) reports an empty census, not a phantom reason key', () => {
    mkDir('reapable-one');
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });
    const summary = buildOrphanSummary(sel, { reclaimed_count: 0, reclaimed_bytes: 0, failed: [], dry_run: true });

    expect(summary.excluded_count).toBe(0);
    expect(summary.excluded_by_reason).toEqual({});
    expect(sel.reapableDirs.find((d) => d.dir === 'reapable-one')).toBeDefined();
  });

  it('mixed exclusion reasons are counted independently, not collapsed', () => {
    mkDir('live-owned');
    mkDir('too-new');
    const liveOwners = new Set([path.join(worktreesDir, 'live-owned').split(path.sep).join('/')]);
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 999999999, liveOwners, now: Date.now() });
    const summary = buildOrphanSummary(sel, { reclaimed_count: 0, reclaimed_bytes: 0, failed: [], dry_run: true });

    expect(summary.excluded_by_reason.live_owner).toBe(1);
    expect(summary.excluded_by_reason.too_recent).toBe(1);
    expect(summary.excluded_count).toBe(2);
  });
});
