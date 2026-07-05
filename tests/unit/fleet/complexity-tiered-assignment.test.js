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
    // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B: LADDER is now the static SAFE-DEFAULT
    // ladder (K=4 before any live fleet is observed) rather than the sole ranking source
    // -- a live fleet's dense rank comes from deriveLiveLadder/deriveWorkerTierRank
    // instead (see tests/unit/fleet/tier-ladder-strength-engine.test.js).
    // QF-20260705-953: LADDER[0]'s effort moved from 'max' to 'low' — sonnet/high and
    // sonnet/xhigh dense-rank at 2 now (see tests/unit/fleet/tier-ladder-fable-rungs.test.js).
    expect(LADDER[0]).toMatchObject({ rank: 1, model: 'sonnet', effort: 'low' });
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

// ---- QF-20260703-242: fail-closed (not fail-open) on a missing/non-finite worker tier stamp ----
describe('QF-20260703-242 tier_stamp_missing fail-closed verdict', () => {
  it('refuses a tier-gated SD when tiering is active but worker_tier_rank is absent', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: 2 } };
    expect(classifyDispatchIneligibility(sd, { tiering_active: true })).toBe('tier_stamp_missing');
  });

  it('refuses a tier-gated SD when worker_tier_rank is present but non-finite (NaN)', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: 2 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: NaN, tiering_active: true })).toBe('tier_stamp_missing');
  });

  it('does not fire for an unscored SD (no min_tier_rank) even with a missing stamp — nothing to gate', () => {
    const sd = { sd_key: 'SD-X-001', metadata: {} };
    expect(classifyDispatchIneligibility(sd, { tiering_active: true })).toBeNull();
  });

  it('stays inert when tiering_active is not true, even with a missing stamp (degrade-to-1 preserved)', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: 2 } };
    expect(classifyDispatchIneligibility(sd, { tiering_active: false })).toBeNull();
    expect(classifyDispatchIneligibility(sd, {})).toBeNull();
  });

  it('leaves the finite worker_tier_rank paths (above_worker_tier / null) byte-unchanged', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: 3 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 1, tiering_active: true })).toBe('above_worker_tier');
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true })).toBeNull();
  });
});

// ---- TS-4/TS-5: FR-4 dispatch guard + FR-5 degrade-to-1 -------------------
/** Minimal supabase stub: serves claude_sessions (workers), strategic_directives_v2 (SD), and a
 *  live-worker list so isTieringActive can resolve. */
function stubSupabase({ liveWorkers = 2, workerTierRank = 1, sdMinRank = 3, coordinatorRpc = null, extraSessions = [] } = {}) {
  const sessions = [];
  for (let i = 0; i < liveWorkers; i++) {
    sessions.push({
      session_id: `w-${i}`, status: 'active', metadata: {}, heartbeat_at: new Date().toISOString(),
      sd_key: `SD-LIVE-${i}`, claimed_at: new Date().toISOString(), worktree_path: `/wt/${i}`, continuous_sds_completed: 1,
    });
  }
  sessions.push(...extraSessions);
  const targetSession = { session_id: 'target-worker', metadata: { tier_rank: workerTierRank } };
  const lastQuery = { in: null, gte: null, order: null, limit: null };
  return {
    rpc: async () => ({ data: coordinatorRpc, error: null }),
    _lastQuery: lastQuery,
    from(table) {
      const api = {
        _table: table, _filters: {},
        select() { return api; },
        not() { return api; },
        eq(col, val) { api._filters[col] = val; return api; },
        // FR-3 (SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-A): pass-through no-ops so the bounded
        // isTieringActive() query chain (.in/.gte/.order/.limit) doesn't throw "api.X is not a
        // function"; each call is recorded on lastQuery so tests can assert bounding shape.
        in(col, vals) { lastQuery.in = { col, vals }; return api; },
        gte(col, val) { lastQuery.gte = { col, val }; return api; },
        order(col, opts) { lastQuery.order = { col, opts }; return api; },
        limit(n) { lastQuery.limit = n; return api; },
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
          // bare `await supabase.from('claude_sessions').select(...)` (the isTieringActive list read,
          // and SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E's fetchLowerTierBacklogData live-session read).
          if (table === 'claude_sessions') return resolve({ data: sessions, error: null });
          // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6): fetchLowerTierBacklogData's bulk
          // strategic_directives_v2 read (the claimable-pool half of the backlog gate). A single
          // generic unclaimed row at sdMinRank keeps every pre-FR-6 test in this file's original
          // above/below-tier intent unaffected (none of these auto-generated sessions are stamped
          // at sdMinRank, so claimable > idle at that rank -> backlogged=true -> admit, matching
          // the pre-FR-6 WORK-DOWN-ALWAYS expectation these tests assert). Tests targeting the
          // reservation behavior itself live in tier-backlog-reservation.test.js.
          if (table === 'strategic_directives_v2') {
            return resolve({
              data: [{
                sd_key: 'SD-BACKLOG-FILLER-001', sd_type: 'infrastructure', status: 'in_progress',
                title: 'Filler backlog SD', description: 'Keeps pre-FR-6 dispatch tests admitting downward claims.',
                metadata: { min_tier_rank: sdMinRank }, target_application: 'EHG_Engineer', claiming_session_id: null,
              }],
              error: null,
            });
          }
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

// ---- SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-A (FR-1: bounded live-worker query) ----
describe('FR-1 isTieringActive() bounded claude_sessions query', () => {
  it('detects >=2 live workers even with a >1000-row simulated claude_sessions page', async () => {
    // Simulate the real-world shape the bug hit: a large table where the 2 genuinely live
    // workers are not guaranteed to be at the front of an unbounded/unordered page. The stub
    // itself doesn't truncate (no real pagination to model), so this also exercises the query
    // being called with a bounding shape below, not just the raw count.
    const staleFiller = Array.from({ length: 1200 }, (_, i) => ({
      session_id: `stale-${i}`, status: 'released', metadata: {},
      heartbeat_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0,
    }));
    const sb = stubSupabase({ liveWorkers: 2, extraSessions: staleFiller });
    expect(await isTieringActive(sb)).toBe(true);
  });

  it('constructs a bounded query: status in active/idle, heartbeat >= now-15min, ordered desc, limit 200', async () => {
    const nowMs = Date.now();
    const sb = stubSupabase({ liveWorkers: 2 });
    await isTieringActive(sb, { nowMs });
    expect(sb._lastQuery.in).toMatchObject({ col: 'status', vals: ['active', 'idle'] });
    expect(sb._lastQuery.gte.col).toBe('heartbeat_at');
    expect(new Date(sb._lastQuery.gte.val).getTime()).toBe(nowMs - 900000);
    expect(sb._lastQuery.order).toMatchObject({ col: 'heartbeat_at', opts: { ascending: false } });
    expect(sb._lastQuery.limit).toBe(200);
  });

  it('inertness invariant (risk-agent GO-WITH-CONDITIONS): tiering active + all workers unstamped => zero above_worker_tier blocks', async () => {
    const sb = stubSupabase({ liveWorkers: 2, workerTierRank: undefined, sdMinRank: 4 });
    expect(await isTieringActive(sb)).toBe(true);
    // An unstamped worker resolves to the TOP rung (resolveWorkerTierRank), and clamp() caps
    // every SD's min_tier_rank at that same top rung — so above_worker_tier is unreachable.
    const unstampedWorkerRank = resolveWorkerTierRank({ metadata: {} });
    expect(unstampedWorkerRank).toBe(TOP);
    const sd = { sd_key: 'SD-X-001', metadata: { min_tier_rank: clamp(999) } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: unstampedWorkerRank, tiering_active: true })).toBeNull();
  });
});

describe('SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-D: ladder-relative mid rung (guardrail-preserving)', () => {
  it('preserves the Opus-med floor: feature / mid-LOC / tier_hint=2 -> the mid rung (3 on the default K=4 ladder)', () => {
    expect(ladderTopRank()).toBe(4); // v1 static safe-default ladder
    expect(computeMinTierRank({ sd_type: 'feature' })).toBe(3);       // NOT 2 (ceil would loosen the guardrail)
    expect(computeMinTierRank({ estimated_loc: 50 })).toBe(3);        // 31..75 mid-LOC band
    expect(computeMinTierRank({ metadata: { tier_hint: 2 } })).toBe(3);
  });
  it('is ladder-relative, not a fixed literal: the mid rung equals floor(ladderTopRank()/2)+1', () => {
    const midExpected = Math.floor(ladderTopRank() / 2) + 1;
    expect(computeMinTierRank({ sd_type: 'feature' })).toBe(midExpected);
    // Upper-middle scaling (documented): K=4->3, K=6->4, K=8->5 (ceil(K/2) would give the loosening 2 at K=4).
    expect(Math.floor(4 / 2) + 1).toBe(3);
    expect(Math.floor(6 / 2) + 1).toBe(4);
    expect(Math.floor(8 / 2) + 1).toBe(5);
  });
  it('floor and ceiling stay at the ladder extremes', () => {
    expect(computeMinTierRank({ estimated_loc: 10 })).toBe(1);                                   // small-LOC -> floor
    expect(computeMinTierRank({ sd_type: 'feature', estimated_loc: 999 })).toBe(ladderTopRank()); // large-LOC MAX -> ceiling
  });
});
