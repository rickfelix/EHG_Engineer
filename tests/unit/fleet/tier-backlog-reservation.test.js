/**
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E — FR-6 backlog-gated downward claims.
 *
 *   idleWorkerCensusByTier / lowerTierBacklog (pure helpers)         — TS-1
 *   classifyDispatchIneligibility 'reserved_no_lower_backlog' branch — TS-2
 *   worker-checkin.cjs self-claim wiring (fetchLowerTierBacklogData) — TS-3
 *   dispatch.cjs assertWorkerTierAllowed downward-claim gate         — TS-4
 *   degrade-to-1 + unscored-SD invariants across both sites          — TS-5
 */
import { describe, it, expect } from 'vitest';
import { ladderTopRank } from '../../../lib/fleet/tier-ladder.cjs';
import { idleWorkerCensusByTier, lowerTierBacklog, fetchLowerTierBacklogData } from '../../../lib/fleet/tier-backlog.cjs';
import { classifyDispatchIneligibility } from '../../../lib/fleet/claim-eligibility.cjs';
import { assertWorkerTierAllowed } from '../../../lib/coordinator/dispatch.cjs';

const TOP = ladderTopRank();

// ---- TS-1: pure helpers -----------------------------------------------------
describe('FR-6 idleWorkerCensusByTier / lowerTierBacklog (pure)', () => {
  it('buckets idle live workers by resolveWorkerTierRank into exact + cumulative', () => {
    const census = idleWorkerCensusByTier([
      { metadata: { tier_rank: 1 } },
      { metadata: { tier_rank: 1 } },
      { metadata: { tier_rank: 2 } },
    ]);
    expect(census.exact[1]).toBe(2);
    expect(census.exact[2]).toBe(1);
    expect(census.cumulative[1]).toBe(2);
    expect(census.cumulative[2]).toBe(3); // cumulative includes rank 1
    expect(census.top).toBe(TOP);
  });

  it('an unstamped worker is bucketed at the top rung (conservative-up, matches resolveWorkerTierRank)', () => {
    const census = idleWorkerCensusByTier([{ metadata: {} }]);
    expect(census.exact[TOP]).toBe(1);
  });

  it('empty input -> all-zero census', () => {
    const census = idleWorkerCensusByTier([]);
    expect(Object.values(census.exact).every((n) => n === 0)).toBe(true);
    expect(Object.values(census.cumulative).every((n) => n === 0)).toBe(true);
  });

  it('lowerTierBacklog: claimable > idle (cumulative) -> backlogged (true)', () => {
    const data = { claimableBreakdown: { cumulative: { 1: 5 } }, idleCensus: { cumulative: { 1: 2 } } };
    expect(lowerTierBacklog(1, data)).toBe(true);
  });

  it('lowerTierBacklog: claimable <= idle (cumulative) -> not backlogged (false, reserve)', () => {
    expect(lowerTierBacklog(1, { claimableBreakdown: { cumulative: { 1: 2 } }, idleCensus: { cumulative: { 1: 2 } } })).toBe(false);
    expect(lowerTierBacklog(1, { claimableBreakdown: { cumulative: { 1: 0 } }, idleCensus: { cumulative: { 1: 3 } } })).toBe(false);
  });

  it('lowerTierBacklog fails OPEN (true) on missing/malformed data, never blocking on uncertainty', () => {
    expect(lowerTierBacklog(1, undefined)).toBe(true);
    expect(lowerTierBacklog(1, {})).toBe(true);
    expect(lowerTierBacklog(1, { claimableBreakdown: {}, idleCensus: {} })).toBe(true);
    expect(lowerTierBacklog(NaN, { claimableBreakdown: { cumulative: { 1: 0 } }, idleCensus: { cumulative: { 1: 0 } } })).toBe(true);
  });
});

// ---- TS-2: classifier branch -------------------------------------------------
describe("FR-6 classifyDispatchIneligibility 'reserved_no_lower_backlog' branch", () => {
  const backlogPresent = { claimableBreakdown: { cumulative: { 1: 5 } }, idleCensus: { cumulative: { 1: 1 } } };
  const noBacklog = { claimableBreakdown: { cumulative: { 1: 1 } }, idleCensus: { cumulative: { 1: 1 } } };

  it('admits a downward claim when the lower tier is genuinely backlogged', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: backlogPresent })).toBeNull();
  });

  it('reserves (blocks) a downward claim when the lower tier has no backlog', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: noBacklog }))
      .toBe('reserved_no_lower_backlog');
  });

  it('never reserves a claim AT the worker\'s own tier, regardless of backlog data', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 3 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: noBacklog })).toBeNull();
  });

  it('above_worker_tier still takes precedence over the backlog axis', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 4 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: backlogPresent }))
      .toBe('above_worker_tier');
  });

  it('unscored SDs are unaffected (no min_tier_rank -> no gate at all)', () => {
    const sd = { sd_key: 'SD-X', metadata: {} };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: noBacklog })).toBeNull();
  });

  it('is byte-identical WORK-DOWN-ALWAYS when ctx omits lower_tier_backlog_data (pre-FR-6 callers)', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true })).toBeNull();
  });

  it('degrade-to-1: the whole axis (including the new gate) is inert when tiering_active is not true', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: false, lower_tier_backlog_data: noBacklog })).toBeNull();
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, lower_tier_backlog_data: noBacklog })).toBeNull();
  });
});

// ---- Shared stub supabase for the two DB-dependent enforcement sites --------
/**
 * Serves the two queries fetchLowerTierBacklogData issues (strategic_directives_v2 bulk fetch,
 * claude_sessions bulk fetch) plus the single-row lookups assertWorkerTierAllowed itself needs
 * (target session by id, SD by sd_key). getActiveCoordinatorId's internal queries (file-first +
 * DB-fallback coordinator scan) are tolerated defensively (`.filter()` no-op, `.maybeSingle()`
 * returns null) — fetchLowerTierBacklogData wraps that resolution in `.catch(() => null)`, so
 * whatever it resolves to never matches a synthetic `w-N` / `target-worker` session id here.
 */
function stubSupabase({ liveWorkers = [], sds = [], targetSession = null, targetSd = null } = {}) {
  return {
    from(table) {
      let usedFilter = false;
      const api = {
        _table: table, _filters: {},
        select() { return api; },
        not() { return api; },
        in() { return api; },
        gte() { return api; },
        order() { return api; },
        limit() { return api; },
        filter() { usedFilter = true; return api; },
        eq(col, val) { api._filters[col] = val; return api; },
        async maybeSingle() {
          if (table === 'claude_sessions') {
            if (targetSession && api._filters.session_id === targetSession.session_id) {
              return { data: targetSession, error: null };
            }
            return { data: null, error: null }; // getActiveCoordinatorId file-first probe: no match
          }
          if (table === 'strategic_directives_v2') {
            if (targetSd && api._filters.sd_key === targetSd.sd_key) return { data: targetSd, error: null };
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          if (table === 'claude_sessions') {
            // queryDbForCoordinator's bulk scan uses .filter(); the census fetch never does.
            return resolve(usedFilter ? { data: [], error: null } : { data: liveWorkers, error: null });
          }
          if (table === 'strategic_directives_v2') return resolve({ data: sds, error: null });
          return resolve({ data: [], error: null });
        },
      };
      return api;
    },
  };
}

function liveWorker(sessionId, { claimed = false, tierRank = null } = {}) {
  return {
    session_id: sessionId, status: 'active', metadata: tierRank ? { tier_rank: tierRank } : {},
    heartbeat_at: new Date().toISOString(),
    sd_key: claimed ? 'SD-SOMETHING' : null, claimed_at: claimed ? new Date().toISOString() : null,
    worktree_path: `/wt/${sessionId}`, continuous_sds_completed: 1,
  };
}

// The directed-dispatch target must ALSO satisfy isFleetWorker/everClaimed (status + heartbeat_at +
// worktree_path) so it counts toward isTieringActive's live-fleet total AND fetchLowerTierBacklogData's
// idle census — a minimal { session_id, metadata } shape silently drops out of both live-fleet filters,
// making isTieringActive() under-count and mask the very branch these tests exist to exercise.
function targetWorkerSession(tierRank) {
  return {
    session_id: 'target-worker', status: 'active', metadata: { tier_rank: tierRank },
    heartbeat_at: new Date().toISOString(), sd_key: null, claimed_at: null,
    worktree_path: '/wt/target-worker', continuous_sds_completed: 1,
  };
}

function sdRow(key, minTierRank, { claimingSessionId = null } = {}) {
  return {
    sd_key: key, sd_type: 'infrastructure', status: 'in_progress', title: `Real SD ${key}`,
    description: 'A real description of reasonable length for belt-eligibility checks.',
    metadata: { min_tier_rank: minTierRank }, target_application: 'EHG_Engineer',
    claiming_session_id: claimingSessionId,
  };
}

// ---- TS-3: fetchLowerTierBacklogData (shared fetcher) -----------------------
describe('FR-6 fetchLowerTierBacklogData (shared DB-dependent fetcher)', () => {
  it('computes claimable-by-tier and idle-by-tier from live DB state', async () => {
    const liveWorkers = [
      liveWorker('w-1'), // idle, everyClaimed via worktree_path so it counts as genuine
      liveWorker('w-2', { claimed: true }),
    ];
    const sds = [sdRow('SD-A', 1), sdRow('SD-B', 1, { claimingSessionId: 'w-2' })];
    const sb = stubSupabase({ liveWorkers, sds });
    const result = await fetchLowerTierBacklogData(sb);
    expect(result).not.toBeNull();
    // SD-B is claimed (excluded from the claimable pool); only SD-A (rank 1) is claimable.
    expect(result.claimableBreakdown.cumulative[1]).toBe(1);
    // w-2 has an active claim (SD-B) so it is NOT idle; w-1 is idle.
    expect(result.idleCensus.cumulative[TOP]).toBe(1);
  });

  it('fails open (returns null) on a query fault, never throwing', async () => {
    const broken = { from() { throw new Error('boom'); } };
    await expect(fetchLowerTierBacklogData(broken)).resolves.toBeNull();
  });
});

// ---- TS-4/TS-5: dispatch.cjs assertWorkerTierAllowed downward-claim gate ----
describe('FR-6 dispatch.cjs assertWorkerTierAllowed downward-claim (backlog) gate', () => {
  const row = () => ({
    message_type: 'WORK_ASSIGNMENT', target_session: 'target-worker',
    payload: { assigned_sd: 'SD-LOWER-001' },
  });

  it('refuses a downward WORK_ASSIGNMENT when the lower tier has no backlog (reserve)', async () => {
    const targetSession = targetWorkerSession(4);
    const targetSd = sdRow('SD-LOWER-001', 1);
    // w-1 is idle AND native to rank 1 -> its idle capacity at/below rank 1 already covers the
    // one claimable rank-1 SD, so rank 1 is NOT backlogged -> the tier-4 target should reserve.
    const liveWorkers = [liveWorker('w-1', { tierRank: 1 }), targetSession];
    const sds = [targetSd];
    const sb = stubSupabase({ liveWorkers, sds, targetSession, targetSd });
    await expect(assertWorkerTierAllowed(sb, row())).rejects.toMatchObject({ code: 'DISPATCH_RESERVED_NO_LOWER_BACKLOG' });
  });

  it('allows a downward WORK_ASSIGNMENT when the lower tier IS backlogged', async () => {
    const targetSession = targetWorkerSession(4);
    const targetSd = sdRow('SD-LOWER-001', 1);
    // Two live workers total (tiering active), but NO idle worker at all -> any claimable
    // work at rank 1 is unabsorbed -> genuinely backlogged.
    const liveWorkers = [liveWorker('w-1', { claimed: true }), targetSession];
    const sds = [targetSd, sdRow('SD-W1', 4, { claimingSessionId: 'w-1' })];
    const sb = stubSupabase({ liveWorkers, sds, targetSession, targetSd });
    await expect(assertWorkerTierAllowed(sb, row())).resolves.toBeUndefined();
  });

  it('never gates an at-own-tier WORK_ASSIGNMENT on backlog', async () => {
    const targetSession = targetWorkerSession(1);
    const targetSd = sdRow('SD-LOWER-001', 1);
    const liveWorkers = [liveWorker('w-1'), liveWorker('w-2'), targetSession];
    const sds = [targetSd];
    const sb = stubSupabase({ liveWorkers, sds, targetSession, targetSd });
    await expect(assertWorkerTierAllowed(sb, row())).resolves.toBeUndefined();
  });

  it('fails open (allows) when fetchLowerTierBacklogData cannot resolve backlog data', async () => {
    const targetSession = targetWorkerSession(4);
    const targetSd = sdRow('SD-LOWER-001', 1);
    // A supabase whose claude_sessions single-row + bulk queries work (so isTieringActive() itself
    // resolves true, actually reaching the downward-claim branch) but whose strategic_directives_v2
    // BULK read throws (breaks fetchLowerTierBacklogData specifically, not the outer tiering check).
    const sb = {
      from(table) {
        const api = {
          select() { return api; }, not() { return api; }, in() { return api; },
          gte() { return api; }, order() { return api; }, limit() { return api; }, filter() { return api; },
          eq(col, val) { api._filters = { ...(api._filters || {}), [col]: val }; return api; },
          async maybeSingle() {
            if (table === 'claude_sessions' && api._filters?.session_id === 'target-worker') return { data: targetSession, error: null };
            if (table === 'strategic_directives_v2' && api._filters?.sd_key === 'SD-LOWER-001') return { data: targetSd, error: null };
            return { data: null, error: null };
          },
          then(resolve) {
            if (table === 'claude_sessions') return resolve({ data: [liveWorker('w-1'), targetSession], error: null });
            throw new Error('strategic_directives_v2 bulk fetch broken');
          },
        };
        return api;
      },
    };
    await expect(assertWorkerTierAllowed(sb, row())).resolves.toBeUndefined();
  });

  it('degrade-to-1: with < 2 live workers the backlog gate is inert, downward assignment allowed', async () => {
    const targetSession = targetWorkerSession(4);
    const targetSd = sdRow('SD-LOWER-001', 1);
    const liveWorkers = [targetSession]; // only 1 live worker -> isTieringActive() false
    const sds = [targetSd];
    const sb = stubSupabase({ liveWorkers, sds, targetSession, targetSd });
    await expect(assertWorkerTierAllowed(sb, row())).resolves.toBeUndefined();
  });

  it('unscored SD (no min_tier_rank) is unaffected by the backlog gate', async () => {
    const targetSession = targetWorkerSession(4);
    const targetSd = { sd_key: 'SD-LOWER-001', metadata: {} };
    const liveWorkers = [liveWorker('w-1'), liveWorker('w-2'), targetSession];
    const sb = stubSupabase({ liveWorkers, sds: [], targetSession, targetSd });
    await expect(assertWorkerTierAllowed(sb, row())).resolves.toBeUndefined();
  });
});

// ---- TS-5b: both-enforcement-sites-consistent -------------------------------
describe('FR-6 both-enforcement-sites-consistent: same backlog data, same verdict', () => {
  it('classifyDispatchIneligibility and assertWorkerTierAllowed agree given the same fetched backlog data', async () => {
    const targetSession = targetWorkerSession(4);
    const targetSd = sdRow('SD-LOWER-001', 1);
    const liveWorkers = [liveWorker('w-1', { tierRank: 1 }), targetSession]; // w-1 idle -> absorbs the one rank-1 SD
    const sds = [targetSd];
    const sb = stubSupabase({ liveWorkers, sds, targetSession, targetSd });

    const backlogData = await fetchLowerTierBacklogData(sb);
    const selfClaimVerdict = classifyDispatchIneligibility(targetSd, {
      worker_tier_rank: 4, tiering_active: true, lower_tier_backlog_data: backlogData,
    });
    expect(selfClaimVerdict).toBe('reserved_no_lower_backlog');
    // The directed-dispatch path, using the SAME fetcher, must reach the SAME confirmed refusal.
    await expect(assertWorkerTierAllowed(sb, {
      message_type: 'WORK_ASSIGNMENT', target_session: 'target-worker', payload: { assigned_sd: 'SD-LOWER-001' },
    })).rejects.toMatchObject({ code: 'DISPATCH_RESERVED_NO_LOWER_BACKLOG' });
  });
});
