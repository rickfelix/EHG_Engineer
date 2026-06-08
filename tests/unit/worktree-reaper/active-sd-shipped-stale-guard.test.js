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

const baseCtx = (activeSdSet, activeQfSet) => ({
  repoRoot: '/repo',
  claimMap: new Map(),
  sdMap: new Set(),
  qfMap: new Set(),
  activeSdSet,
  activeQfSet,
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

  // SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001: QF worktrees (.worktrees/qf/<qf_id>) carry the qf_id as
  // their basename and are never in activeSdSet — they must be protected status-aware via activeQfSet.
  test('SUPPRESSES shipped-stale for an OPEN/in_progress QF worktree (activeQfSet) -> kept', async () => {
    const wt = { path: '/repo/.worktrees/qf/QF-20260423-901', branch: 'qf/QF-20260423-901' };
    const { categories, reasons } = await classifyWorktree(wt, baseCtx(new Set(), new Set(['QF-20260423-901'])));
    expect(categories).not.toContain('shipped-stale');
    expect(reasons['shipped-stale-suppressed']).toBeDefined();
    expect(reasons['shipped-stale-suppressed'].reason).toBe('active-qf-protected');
    expect(reasons['shipped-stale-suppressed'].sd_key).toBe('QF-20260423-901');
    expect(stageForCategories(categories).verdict).toBe('keep');
  });

  test('STILL flags shipped-stale for a completed/cancelled QF worktree (not in activeQfSet)', async () => {
    const wt = { path: '/repo/.worktrees/qf/QF-20260423-902', branch: 'qf/QF-20260423-902' };
    const { categories } = await classifyWorktree(wt, baseCtx(new Set(), new Set(['QF-20260423-901'])));
    expect(categories).toContain('shipped-stale');
    expect(stageForCategories(categories).verdict).toBe('stage1_remove');
  });

  test('empty activeQfSet does not suppress a QF worktree (claim-guard remains primary)', async () => {
    const wt = { path: '/repo/.worktrees/qf/QF-20260423-903', branch: 'qf/QF-20260423-903' };
    const { categories } = await classifyWorktree(wt, baseCtx(new Set(), undefined));
    expect(categories).toContain('shipped-stale');
  });
});

describe('loadSdKeySets returns activeSdSet', () => {
  function mockSupabase({ sdKeys = [], qfIds = [], activeRows = [], qfRows = [] }) {
    return {
      from: vi.fn((table) => {
        const builder = { _table: table, _inStatus: false, _statuses: null };
        builder.select = vi.fn(() => builder);
        builder.in = vi.fn((_col, vals) => { builder._inStatus = true; builder._statuses = vals; return builder; });
        builder.range = vi.fn(async (start) => {
          if (start > 0) return { data: [], error: null };
          if (table === 'strategic_directives_v2') {
            return builder._inStatus
              ? { data: activeRows, error: null }
              : { data: sdKeys.map((k) => ({ sd_key: k })), error: null };
          }
          if (table === 'quick_fixes') {
            if (builder._inStatus) {
              const want = new Set(builder._statuses || []);
              return { data: qfRows.filter((r) => want.has(r.status)), error: null };
            }
            return { data: qfIds.map((id) => ({ id })), error: null };
          }
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

  // SD-LEO-INFRA-WORKTREE-REAPER-QUICK-001
  test('builds activeQfSet (open/in_progress) and terminalQfSet (completed/cancelled), excluding escalated', async () => {
    const supabase = mockSupabase({
      qfIds: ['QF-1', 'QF-2', 'QF-3', 'QF-4', 'QF-5'],
      qfRows: [
        { id: 'QF-1', status: 'open' },
        { id: 'QF-2', status: 'in_progress' },
        { id: 'QF-3', status: 'completed' },
        { id: 'QF-4', status: 'cancelled' },
        { id: 'QF-5', status: 'escalated' },
      ],
    });
    const { qfMap, activeQfSet, terminalQfSet } = await loadSdKeySets(supabase);
    expect(qfMap.has('QF-1')).toBe(true); // existence map unchanged
    expect(activeQfSet.has('QF-1')).toBe(true);
    expect(activeQfSet.has('QF-2')).toBe(true);
    expect(terminalQfSet.has('QF-3')).toBe(true);
    expect(terminalQfSet.has('QF-4')).toBe(true);
    // 'escalated' is in NEITHER set (work moved to an SD) → normal claim/age handling
    expect(activeQfSet.has('QF-5')).toBe(false);
    expect(terminalQfSet.has('QF-5')).toBe(false);
  });

  test('activeQfSet/terminalQfSet are empty Sets (no crash) when supabase is absent', async () => {
    const { activeQfSet, terminalQfSet } = await loadSdKeySets(null);
    expect(activeQfSet instanceof Set).toBe(true);
    expect(terminalQfSet instanceof Set).toBe(true);
    expect(activeQfSet.size).toBe(0);
    expect(terminalQfSet.size).toBe(0);
  });
});
