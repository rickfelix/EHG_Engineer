/**
 * SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 — per-FR regression tests for
 * complexity-tiered worker assignment.
 *
 *   FR-1 rubric (computeMinTierRank)         — TS-1
 *   FR-2 ladder + worker-tier resolution     — TS-2
 *   FR-3 'above_worker_tier' verdict          — TS-3
 *   FR-4 coordinator dispatch tier guard      — TS-4
 *   FR-5 degrade-to-1 invariant               — TS-5
 */
import { describe, it, expect } from 'vitest';
import { computeMinTierRank } from '../../../lib/fleet/sd-tier-rank.mjs';
import { LADDER, ladderTopRank, clamp, resolveWorkerTierRank, isTieringActive, MIN_LIVE_FOR_TIERING } from '../../../lib/fleet/tier-ladder.cjs';
import { classifyDispatchIneligibility } from '../../../lib/fleet/claim-eligibility.cjs';
import { assertWorkerTierAllowed } from '../../../lib/coordinator/dispatch.cjs';

const TOP = ladderTopRank();

// ---- TS-1: FR-1 rubric ----------------------------------------------------
describe('FR-1 computeMinTierRank rubric', () => {
  it('floors a risk-keyword SD to the top rung', () => {
    expect(computeMinTierRank({ sd_type: 'infrastructure', title: 'Add a DB migration', description: 'alter table ventures' })).toBe(TOP);
    expect(computeMinTierRank({ sd_type: 'documentation', description: 'a new feature for the cockpit' })).toBe(TOP);
  });

  it('scores a small no-risk documentation SD to rank 1', () => {
    expect(computeMinTierRank({ sd_type: 'documentation', title: 'Fix a typo in the README', estimated_loc: 5 })).toBe(1);
  });

  it('scores a mid-size (31-75 LOC) no-risk SD to an intermediate rung (conservative-up)', () => {
    const rank = computeMinTierRank({ sd_type: 'infrastructure', title: 'Tidy a helper', description: 'small cleanup', estimated_loc: 50 });
    expect(rank).toBeGreaterThanOrEqual(2);
    expect(rank).toBeLessThanOrEqual(3);
  });

  it('defaults to the top rung when there is no scoreable signal (fail-safe-up)', () => {
    expect(computeMinTierRank({ sd_type: 'infrastructure', title: 'Do the thing', description: 'thing' })).toBe(TOP);
  });

  it('honors tier_hint conservatively', () => {
    expect(computeMinTierRank({ sd_type: 'infrastructure', title: 'x', description: 'y', metadata: { tier_hint: 1 } })).toBe(1);
  });
});

// ---- TS-2: FR-2 ladder + worker tier --------------------------------------
describe('FR-2 tier ladder + worker tier resolution', () => {
  it('reads ladder cardinality from config, not a hardcoded 4', () => {
    expect(LADDER.length).toBe(ladderTopRank());
    expect(LADDER[0]).toMatchObject({ rank: 1, model: 'sonnet', effort: 'max' });
  });

  it('resolveWorkerTierRank returns the declared stamp when present', () => {
    expect(resolveWorkerTierRank({ metadata: { tier_rank: 1 } })).toBe(1);
    expect(resolveWorkerTierRank({ metadata: { tier_rank: '2' } })).toBe(2);
  });

  it('resolveWorkerTierRank defaults an unstamped worker to the top rung', () => {
    expect(resolveWorkerTierRank({ metadata: {} })).toBe(TOP);
    expect(resolveWorkerTierRank({})).toBe(TOP);
    expect(resolveWorkerTierRank({ metadata: { tier_rank: 99 } })).toBe(TOP);
  });

  it('clamp bounds a rank to [1, top]', () => {
    expect(clamp(0)).toBe(1);
    expect(clamp(99)).toBe(TOP);
    expect(clamp('nope')).toBe(TOP);
    expect(clamp(2)).toBe(2);
  });
});

// ---- TS-3: FR-3 above_worker_tier verdict ---------------------------------
describe('FR-3 above_worker_tier eligibility verdict', () => {
  it('returns above_worker_tier for a below-rung worker vs a higher-tier SD when tiering active', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: 3 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 1, tiering_active: true })).toBe('above_worker_tier');
  });

  it('returns null when the worker rung >= SD min rank (higher rung may take lower work)', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true })).toBeNull();
  });

  it('is byte-identical (no tier verdict) when ctx omits worker_tier_rank', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: 4 } };
    expect(classifyDispatchIneligibility(sd, { cwd: '/repo' })).toBeNull();
    expect(classifyDispatchIneligibility(sd)).toBeNull();
  });

  it('does not fire for an unscored SD (no min_tier_rank)', () => {
    const sd = { sd_key: 'SD-X-001', metadata: {} };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 1, tiering_active: true })).toBeNull();
  });
});

// ---- TS-4/TS-5: FR-4 dispatch guard + FR-5 degrade-to-1 -------------------
/** Minimal supabase stub: serves claude_sessions (workers), strategic_directives_v2 (SD), and a
 *  live-worker list so isTieringActive can resolve. */
function stubSupabase({ liveWorkers = 2, workerTierRank = 1, sdMinRank = 3, coordinatorRpc = null } = {}) {
  const sessions = [];
  for (let i = 0; i < liveWorkers; i++) {
    sessions.push({
      session_id: `w-${i}`, status: 'active', metadata: {}, heartbeat_at: new Date().toISOString(),
      sd_key: `SD-LIVE-${i}`, claimed_at: new Date().toISOString(), worktree_path: `/wt/${i}`, continuous_sds_completed: 1,
    });
  }
  const targetSession = { session_id: 'target-worker', metadata: { tier_rank: workerTierRank } };
  return {
    rpc: async () => ({ data: coordinatorRpc, error: null }),
    from(table) {
      const api = {
        _table: table, _filters: {},
        select() { return api; },
        not() { return api; },
        eq(col, val) { api._filters[col] = val; return api; },
        async maybeSingle() {
          if (table === 'claude_sessions') {
            if (api._filters.session_id === 'target-worker') return { data: targetSession, error: null };
            return { data: null, error: null };
          }
          if (table === 'strategic_directives_v2') {
            return { data: { metadata: { min_tier_rank: sdMinRank } }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          // bare `await supabase.from('claude_sessions').select(...)` (the isTieringActive list read)
          if (table === 'claude_sessions') return resolve({ data: sessions, error: null });
          return resolve({ data: [], error: null });
        },
      };
      return api;
    },
  };
}

describe('FR-4 coordinator dispatch tier guard + FR-5 degrade-to-1', () => {
  const row = (overrides = {}) => ({
    message_type: 'WORK_ASSIGNMENT', target_session: 'target-worker',
    payload: { assigned_sd: 'SD-NEEDS-OPUS-001' }, ...overrides,
  });

  it('refuses an above-tier WORK_ASSIGNMENT when tiering is active', async () => {
    const sb = stubSupabase({ liveWorkers: 2, workerTierRank: 1, sdMinRank: 3 });
    await expect(assertWorkerTierAllowed(sb, row())).rejects.toMatchObject({ code: 'DISPATCH_ABOVE_WORKER_TIER' });
  });

  it('allows a work-down assignment (worker rung >= SD min rank)', async () => {
    const sb = stubSupabase({ liveWorkers: 2, workerTierRank: 4, sdMinRank: 3 });
    await expect(assertWorkerTierAllowed(sb, row())).resolves.toBeUndefined();
  });

  it('FR-5: with < 2 live workers, tiering is OFF and the above-tier assignment is allowed', async () => {
    const sb = stubSupabase({ liveWorkers: 1, workerTierRank: 1, sdMinRank: 4 });
    await expect(assertWorkerTierAllowed(sb, row())).resolves.toBeUndefined();
  });

  it('ignores non-WORK_ASSIGNMENT rows and SD-less / QF rows', async () => {
    const sb = stubSupabase({ liveWorkers: 2, workerTierRank: 1, sdMinRank: 4 });
    await expect(assertWorkerTierAllowed(sb, row({ message_type: 'INFO' }))).resolves.toBeUndefined();
    await expect(assertWorkerTierAllowed(sb, row({ payload: { assigned_sd: 'QF-20260101-001' } }))).resolves.toBeUndefined();
    await expect(assertWorkerTierAllowed(sb, row({ payload: {}, target_sd: undefined }))).resolves.toBeUndefined();
  });
});

describe('FR-5 isTieringActive', () => {
  it('is true at >= MIN_LIVE_FOR_TIERING live workers, false below', async () => {
    expect(MIN_LIVE_FOR_TIERING).toBe(2);
    expect(await isTieringActive(stubSupabase({ liveWorkers: 2 }))).toBe(true);
    expect(await isTieringActive(stubSupabase({ liveWorkers: 1 }))).toBe(false);
    expect(await isTieringActive(stubSupabase({ liveWorkers: 0 }))).toBe(false);
  });
});
