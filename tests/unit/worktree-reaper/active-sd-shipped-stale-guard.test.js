/**
 * SD-FDBK-ENH-WORKTREE-REAPER-MJS-001 — the worktree-reaper must NOT git-remove a
 * live-claimed (active-SD) worktree as "shipped-stale".
 *
 * Root cause (RCA f76fc1ec): a freshly sd-start-created branch has no commits yet, so
 * isPatchEquivalentToMain returns matched=true (shipped-stale); combined with a
 * heartbeat-stale claim-guard false-negative the cron git-removed in-flight worktrees
 * mid-build. Fix = classifyWorktree suppresses shipped-stale when the worktree's SD
 * (basename of .worktrees/<sd_key>) is in activeSdSet (status IN draft/active/in_progress).
 *
 * These tests FAIL against the pre-fix reaper (which always pushed 'shipped-stale').
 */
import { describe, test, expect, vi } from 'vitest';

// Force the shipped-stale signal ON and every other category OFF so the test isolates the guard.
vi.mock('../../../lib/worktree-reaper/detectors.js', () => ({
  isNested: vi.fn(() => ({ matched: false })),
  isZombieOnMain: vi.fn(() => ({ matched: false })),
  hasOrphanSD: vi.fn(() => ({ matched: false })),
  isPatchEquivalentToMain: vi.fn(async () => ({ matched: true, reason: 'patch_equivalent_absorbed', evidence: {} })),
  isIdle: vi.fn(() => ({ matched: false })),
}));

import { classifyWorktree, stageForCategories, loadSdKeySets } from '../../../scripts/worktree-reaper.mjs';

const baseCtx = (activeSdSet) => ({
  repoRoot: '/repo',
  claimMap: new Map(),
  sdMap: new Set(),
  qfMap: new Set(),
  activeSdSet,
  idleThresholdMs: 7 * 24 * 60 * 60 * 1000,
});

describe('active-SD shipped-stale guard (classifyWorktree)', () => {
  test('SUPPRESSES shipped-stale for a worktree whose SD is active -> kept, not reaped', async () => {
    const wt = { path: '/repo/.worktrees/SD-ACTIVE-001', branch: 'feat/SD-ACTIVE-001' };
    const { categories, reasons } = await classifyWorktree(wt, baseCtx(new Set(['SD-ACTIVE-001'])));
    expect(categories).not.toContain('shipped-stale');
    expect(reasons['shipped-stale-suppressed']).toBeDefined();
    expect(reasons['shipped-stale-suppressed'].reason).toBe('active-sd-protected');
    expect(reasons['shipped-stale-suppressed'].sd_key).toBe('SD-ACTIVE-001');
    expect(stageForCategories(categories).verdict).toBe('keep');
  });

  test('STILL flags shipped-stale for a worktree whose SD is NOT active -> legitimate cleanup preserved', async () => {
    const wt = { path: '/repo/.worktrees/SD-DONE-002', branch: 'feat/SD-DONE-002' };
    const { categories } = await classifyWorktree(wt, baseCtx(new Set(['SD-ACTIVE-001'])));
    expect(categories).toContain('shipped-stale');
    expect(stageForCategories(categories).verdict).toBe('stage1_remove');
  });

  test('missing/empty activeSdSet does not crash and does not suppress (claim-guard remains primary)', async () => {
    const wt = { path: '/repo/.worktrees/SD-X-003', branch: 'feat/SD-X-003' };
    const { categories } = await classifyWorktree(wt, baseCtx(undefined));
    expect(categories).toContain('shipped-stale');
    expect(stageForCategories(categories).verdict).toBe('stage1_remove');
  });
});

describe('loadSdKeySets returns activeSdSet', () => {
  function mockSupabase({ sdKeys = [], qfIds = [], activeRows = [] }) {
    return {
      from: vi.fn((table) => {
        const builder = { _table: table, _inStatus: false };
        builder.select = vi.fn(() => builder);
        builder.in = vi.fn(() => { builder._inStatus = true; return builder; });
        builder.range = vi.fn(async (start) => {
          if (start > 0) return { data: [], error: null };
          if (table === 'strategic_directives_v2') {
            return builder._inStatus
              ? { data: activeRows, error: null }
              : { data: sdKeys.map((k) => ({ sd_key: k })), error: null };
          }
          if (table === 'quick_fixes') return { data: qfIds.map((id) => ({ id })), error: null };
          return { data: [], error: null };
        });
        return builder;
      }),
    };
  }

  test('builds activeSdSet from draft/active/in_progress rows', async () => {
    const supabase = mockSupabase({
      sdKeys: ['SD-A', 'SD-B', 'SD-C'],
      qfIds: ['QF-1'],
      activeRows: [{ sd_key: 'SD-A', status: 'active' }, { sd_key: 'SD-C', status: 'draft' }],
    });
    const { sdMap, qfMap, activeSdSet } = await loadSdKeySets(supabase);
    expect(sdMap.has('SD-A')).toBe(true);
    expect(qfMap.has('QF-1')).toBe(true);
    expect(activeSdSet.has('SD-A')).toBe(true);
    expect(activeSdSet.has('SD-C')).toBe(true);
    expect(activeSdSet.has('SD-B')).toBe(false); // present in sdMap but not active
  });

  test('activeSdSet is empty (no crash) when supabase is absent', async () => {
    const { activeSdSet } = await loadSdKeySets(null);
    expect(activeSdSet instanceof Set).toBe(true);
    expect(activeSdSet.size).toBe(0);
  });
});
