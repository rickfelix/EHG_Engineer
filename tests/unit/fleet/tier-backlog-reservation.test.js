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
import { tierRankVerdict } from '../../../lib/fleet/tier-ladder.cjs';
import { liveFleetWorkers } from '../../../lib/fleet/genuine-worker.mjs';

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
// SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001: these fixtures test the BACKLOG/enforcement mechanism
// itself (not the provenance-advisory feature), so they carry min_tier_rank_reason to stay binding
// -- otherwise the floor would be advisory and never reach the backlog axis at all.
describe("FR-6 classifyDispatchIneligibility 'reserved_no_lower_backlog' branch", () => {
  const backlogPresent = { claimableBreakdown: { cumulative: { 1: 5 } }, idleCensus: { cumulative: { 1: 1 } } };
  const noBacklog = { claimableBreakdown: { cumulative: { 1: 1 } }, idleCensus: { cumulative: { 1: 1 } } };
  const REASON = 'unit-test floor';

  it('admits a downward claim when the lower tier is genuinely backlogged', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1, min_tier_rank_reason: REASON } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: backlogPresent })).toBeNull();
  });

  it('QF-20260831-419: no longer reserves (blocks) a downward claim when the lower tier has no backlog (advisory only)', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1, min_tier_rank_reason: REASON } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: noBacklog }))
      .toBeNull();
  });

  it('never reserves a claim AT the worker\'s own tier, regardless of backlog data', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 3, min_tier_rank_reason: REASON } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: noBacklog })).toBeNull();
  });

  it('QF-20260831-419: above_worker_tier no longer blocks (advisory only)', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 4, min_tier_rank_reason: REASON } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: backlogPresent }))
      .toBeNull();
  });

  it('unscored SDs are unaffected (no min_tier_rank -> no gate at all)', () => {
    const sd = { sd_key: 'SD-X', metadata: {} };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: noBacklog })).toBeNull();
  });

  it('is byte-identical WORK-DOWN-ALWAYS when ctx omits lower_tier_backlog_data (pre-FR-6 callers)', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1, min_tier_rank_reason: REASON } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true })).toBeNull();
  });

  it('degrade-to-1: the whole axis (including the new gate) is inert when tiering_active is not true', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1, min_tier_rank_reason: REASON } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: false, lower_tier_backlog_data: noBacklog })).toBeNull();
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, lower_tier_backlog_data: noBacklog })).toBeNull();
  });

  it('SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001: an above-worker-tier floor with NO reason is advisory (unblocked)', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 4 } };
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 3, tiering_active: true, lower_tier_backlog_data: noBacklog })).toBeNull();
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
//
// QF-20260830-737: carries a tier_rank_source, mirroring sdRow's min_tier_rank_reason above — these
// fixtures test the backlog/above-tier ENFORCEMENT mechanics, not the worker-side provenance-advisory
// feature itself, so the worker's rank must stay SOURCED to actually reach the refusal branches.
function targetWorkerSession(tierRank) {
  return {
    session_id: 'target-worker', status: 'active', metadata: { tier_rank: tierRank, tier_rank_source: 'unit-test-sourced' },
    heartbeat_at: new Date().toISOString(), sd_key: null, claimed_at: null,
    worktree_path: '/wt/target-worker', continuous_sds_completed: 1,
  };
}

// SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001: this helper's fixtures test the backlog/above-tier
// ENFORCEMENT mechanics, not the provenance-advisory feature itself, so they carry a reason to
// stay binding (an advisory, unreasoned floor would never reach these gates at all).
function sdRow(key, minTierRank, { claimingSessionId = null } = {}) {
  return {
    sd_key: key, sd_type: 'infrastructure', status: 'in_progress', title: `Real SD ${key}`,
    description: 'A real description of reasonable length for belt-eligibility checks.',
    metadata: { min_tier_rank: minTierRank, min_tier_rank_reason: 'unit-test floor' }, target_application: 'EHG_Engineer',
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

  // QF-20260830-660 (census follow-on): a just-released seat is still a live everClaimed
  // worker (correct for ever-worked reporting) but must NOT count as idle DISPATCH-NOW
  // capacity here — this is the same false-negative isRecentlyReleased was built to close
  // (07:56:44Z incident), now verified against this dispatch-facing consumer specifically.
  it('two-sided: excludes a recently-released seat from idle DISPATCH-now capacity, but reporting-side liveFleetWorkers still counts it as live', async () => {
    const shellWindowWorker = { ...liveWorker('w-shell'), released_at: new Date().toISOString() };
    const liveWorkers = [shellWindowWorker];
    const sds = [sdRow('SD-A', 1)];
    const sb = stubSupabase({ liveWorkers, sds });
    const result = await fetchLowerTierBacklogData(sb);
    expect(result.idleCensus.cumulative[TOP]).toBe(0); // dispatch-now: excluded

    const reportingLive = liveFleetWorkers(liveWorkers, null, Date.now());
    expect(reportingLive.map((w) => w.session_id)).toContain('w-shell'); // reporting: still counted
  });
});

// FR-6/TS-4/TS-5's dispatch.cjs assertWorkerTierAllowed downward-claim (backlog) gate tests, and
// TS-5b's both-enforcement-sites-consistent test, were retired: assertWorkerTierAllowed was
// DELETED by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (chairman ratification 20dc072b). The
// classifyDispatchIneligibility-side coverage of the (now-removed) reserved_no_lower_backlog
// branch remains above ("FR-6 classifyDispatchIneligibility 'reserved_no_lower_backlog' branch").

// ---- SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001 (FR-4/TS-5): shared tier-rank predicate ----
//
// Before this SD, lib/fleet/claim-eligibility.cjs tierAxes and lib/coordinator/dispatch.cjs
// assertWorkerTierAllowed independently hand-rolled the SAME minRank/workerRank comparison,
// sharing only leaf primitives (resolveWorkerTierRank, lowerTierBacklog) — confirmed by direct
// code read during this SD's PLAN phase, not assumed. tierAxes defensively checked
// Number.isFinite(workerTierRank) before comparing; assertWorkerTierAllowed did not, relying
// entirely on resolveWorkerTierRank's current contract (never returns non-finite) to stay correct
// by coincidence rather than by its own construction. Both now delegate to tierRankVerdict
// (lib/fleet/tier-ladder.cjs).
describe('FR-4 tierRankVerdict — the ONE shared tier-rank predicate', () => {
  it('unscored SD (non-finite minTierRank) -> null, regardless of workerTierRank', () => {
    expect(tierRankVerdict(1, undefined)).toBeNull();
    expect(tierRankVerdict(undefined, undefined)).toBeNull();
    expect(tierRankVerdict(1, NaN)).toBeNull();
  });

  it('missing/non-finite workerTierRank on a SCORED SD -> tier_stamp_missing (fail closed)', () => {
    expect(tierRankVerdict(undefined, 4)).toBe('tier_stamp_missing');
    expect(tierRankVerdict(NaN, 4)).toBe('tier_stamp_missing');
  });

  it('workerTierRank below minTierRank, provenance-bearing floor -> above_worker_tier (binding)', () => {
    expect(tierRankVerdict(2, 4, { hasProvenance: true })).toBe('above_worker_tier');
  });

  it('SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001: below minTierRank, NO provenance -> above_worker_tier_advisory (default)', () => {
    expect(tierRankVerdict(2, 4)).toBe('above_worker_tier_advisory');
    expect(tierRankVerdict(2, 4, {})).toBe('above_worker_tier_advisory');
    expect(tierRankVerdict(2, 4, { hasProvenance: false })).toBe('above_worker_tier_advisory');
  });

  it('TIER_FLOOR_PROVENANCE_ADVISORY=off restores always-binding regardless of provenance', () => {
    const prior = process.env.TIER_FLOOR_PROVENANCE_ADVISORY;
    process.env.TIER_FLOOR_PROVENANCE_ADVISORY = 'off';
    try {
      expect(tierRankVerdict(2, 4)).toBe('above_worker_tier');
      expect(tierRankVerdict(2, 4, { hasProvenance: false })).toBe('above_worker_tier');
    } finally {
      if (prior === undefined) delete process.env.TIER_FLOOR_PROVENANCE_ADVISORY;
      else process.env.TIER_FLOOR_PROVENANCE_ADVISORY = prior;
    }
  });

  it('workerTierRank at or above minTierRank -> null (allowed)', () => {
    expect(tierRankVerdict(4, 4)).toBeNull();
    expect(tierRankVerdict(5, 4)).toBeNull();
  });

  // SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 (coordinator review question, verified): a
  // provenance-free FLOOR and a MISSING WORKER STAMP are different states. Ruling 1B makes the
  // former advisory; the latter stays hard-binding regardless of hasProvenance, because provenance
  // describes the SD's floor, not the worker's own rank -- an unknown worker rank cannot be
  // compared to any floor at all, justified or not. This pins the two-sided distinction so a future
  // edit that folds hasProvenance into the tier_stamp_missing branch (producing a HALF-advisory
  // floor read as "the same fix, just the other verdict string") is caught immediately.
  it('a provenance-free floor above the seat -> advisory (unblocked)', () => {
    expect(tierRankVerdict(2, 4, { hasProvenance: false })).toBe('above_worker_tier_advisory');
  });
  it('a MISSING worker stamp on a scored SD -> tier_stamp_missing, EVEN with hasProvenance:true', () => {
    expect(tierRankVerdict(undefined, 4, { hasProvenance: true })).toBe('tier_stamp_missing');
    expect(tierRankVerdict(undefined, 4, { hasProvenance: false })).toBe('tier_stamp_missing');
    expect(tierRankVerdict(NaN, 4)).toBe('tier_stamp_missing');
  });

  // SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (ratification 20dc072b): the reachability pin proving
  // BOTH call sites delegated to tierRankVerdict is retired -- dispatch.cjs's call site
  // (assertWorkerTierAllowed) was deleted, and claim-eligibility.cjs's tierAxes no longer calls
  // tierRankVerdict either (its dead above_worker_tier/tier_stamp_missing branches were deleted;
  // the two still-live branches, fable_window_downward_claim_blocked and unverified_seat_capability,
  // never called tierRankVerdict to begin with). tierRankVerdict itself is DECIDED KEPT (not
  // deleted): it remains a correctly-tested, exported pure utility in tier-ladder.cjs with no
  // current production caller -- available for reintroduction rather than removed outright, since
  // deleting it would also require resolving its lint-rule entanglement
  // (scripts/lint/tier-rank-direct-comparison-lint.mjs), which is out of this SD's scope.
});

// FR-4's "above_worker_tier agreement between the two real call sites" describe block is retired:
// both tests called assertWorkerTierAllowed, deleted by SD-FDBK-INFRA-RETIRE-SEAT-TIER-001
// (chairman ratification 20dc072b).
