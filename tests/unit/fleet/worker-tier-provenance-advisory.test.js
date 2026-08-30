/**
 * QF-20260830-737 — worker-side tier_rank provenance advisory.
 *
 * Adam ruling (this row's own description is its record): a worker seat's tier_rank with no
 * recorded metadata.tier_rank_source is a number derived from an absence — the identical
 * principle that makes an unprovenanced SD-side min_tier_rank ADVISORY under ruling 1B
 * (SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 FR-3) must apply symmetrically to the worker side.
 * Measured specimen: Charlie 2b9045cc, tier_rank=4, tier_rank_source empty, hard-refused a
 * WORK_ASSIGNMENT at 17:16Z ("would be reserving capability on ungenuine cheap work") on a
 * stranded parent already unowned 27h.
 *
 * THE QF'S OWN FIXTURE: an unsourced rank dispatch logs advisory; a sourced rank still
 * refuses; stamping flips behaviour. Both real throw sites in assertWorkerTierAllowed are
 * covered — DISPATCH_RESERVED_NO_LOWER_BACKLOG (the specimen) and DISPATCH_ABOVE_WORKER_TIER
 * (the WORK-DOWN-NEVER-UP twin).
 */
import { describe, it, expect } from 'vitest';
import { assertWorkerTierAllowed } from '../../../lib/coordinator/dispatch.cjs';

// Verbatim shape of tier-backlog-reservation.test.js's stubSupabase (same DB-dependent choke
// points: getActiveCoordinatorId's file-first + DB-fallback coordinator scan, which uses
// .filter() and must resolve [] there, distinct from the bulk claude_sessions census read).
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
            return { data: null, error: null };
          }
          if (table === 'strategic_directives_v2') {
            if (targetSd && api._filters.sd_key === targetSd.sd_key) return { data: targetSd, error: null };
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          if (table === 'claude_sessions') {
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

function idleWorker(sessionId, tierRank) {
  return {
    session_id: sessionId, status: 'active', metadata: { tier_rank: tierRank, tier_rank_source: 'unit-test-sourced' },
    heartbeat_at: new Date().toISOString(), sd_key: null, claimed_at: null,
    worktree_path: `/wt/${sessionId}`, continuous_sds_completed: 1,
  };
}

function targetSession(tierRank, { sourced = true } = {}) {
  const metadata = sourced ? { tier_rank: tierRank, tier_rank_source: 'unit-test-sourced' } : { tier_rank: tierRank };
  return {
    session_id: 'target-worker', status: 'active', metadata,
    heartbeat_at: new Date().toISOString(), sd_key: null, claimed_at: null,
    worktree_path: '/wt/target-worker', continuous_sds_completed: 1,
  };
}

function sdRow(key, minTierRank) {
  return {
    sd_key: key, sd_type: 'infrastructure', status: 'in_progress', title: `Real SD ${key}`,
    description: 'A real description of reasonable length for belt-eligibility checks.',
    metadata: { min_tier_rank: minTierRank, min_tier_rank_reason: 'unit-test floor' }, target_application: 'EHG_Engineer',
    claiming_session_id: null,
  };
}

const row = (sdKey) => ({
  message_type: 'WORK_ASSIGNMENT', target_session: 'target-worker', payload: { assigned_sd: sdKey },
});

describe('QF-20260830-737: DISPATCH_RESERVED_NO_LOWER_BACKLOG — worker-side provenance (the measured specimen)', () => {
  it('a SOURCED unfavourable rank still REFUSES (control — enforcement unchanged when sourced)', async () => {
    const tgt = targetSession(4, { sourced: true });
    const sd = sdRow('SD-LOWER-001', 1);
    const sb = stubSupabase({ liveWorkers: [idleWorker('w-1', 1), tgt], sds: [sd], targetSession: tgt, targetSd: sd });
    await expect(assertWorkerTierAllowed(sb, row('SD-LOWER-001'))).rejects.toMatchObject({ code: 'DISPATCH_RESERVED_NO_LOWER_BACKLOG' });
  });

  it('[TWO-SIDED] the IDENTICAL scenario with an UNSOURCED rank logs advisory instead of refusing', async () => {
    const tgt = targetSession(4, { sourced: false });
    const sd = sdRow('SD-LOWER-001', 1);
    const sb = stubSupabase({ liveWorkers: [idleWorker('w-1', 1), tgt], sds: [sd], targetSession: tgt, targetSd: sd });
    const warnings = [];
    const logger = { info: (m) => warnings.push(m), warn() {} };
    await expect(assertWorkerTierAllowed(sb, row('SD-LOWER-001'), logger)).resolves.toBeUndefined();
    expect(warnings.some((m) => /ADVISORY/.test(m) && /QF-20260830-737/.test(m))).toBe(true);
  });
});

describe('QF-20260830-737: DISPATCH_ABOVE_WORKER_TIER — worker-side provenance (WORK-DOWN-NEVER-UP twin)', () => {
  it('a SOURCED below-floor rank still REFUSES (control)', async () => {
    const tgt = targetSession(2, { sourced: true });
    const sd = sdRow('SD-ABOVE-001', 4);
    const sb = stubSupabase({ liveWorkers: [idleWorker('w-1', 1), tgt], sds: [sd], targetSession: tgt, targetSd: sd });
    await expect(assertWorkerTierAllowed(sb, row('SD-ABOVE-001'))).rejects.toMatchObject({ code: 'DISPATCH_ABOVE_WORKER_TIER' });
  });

  it('[TWO-SIDED] the IDENTICAL scenario with an UNSOURCED rank logs advisory instead of refusing', async () => {
    const tgt = targetSession(2, { sourced: false });
    const sd = sdRow('SD-ABOVE-001', 4);
    const sb = stubSupabase({ liveWorkers: [idleWorker('w-1', 1), tgt], sds: [sd], targetSession: tgt, targetSd: sd });
    const warnings = [];
    const logger = { info: (m) => warnings.push(m), warn() {} };
    await expect(assertWorkerTierAllowed(sb, row('SD-ABOVE-001'), logger)).resolves.toBeUndefined();
    expect(warnings.some((m) => /ADVISORY/.test(m) && /QF-20260830-737/.test(m))).toBe(true);
  });
});

describe('QF-20260830-737: stamping flips behaviour (the QF\'s own acceptance bar, end-to-end)', () => {
  it('the SAME fixture refuses when sourced and admits-with-advisory when the source is removed', async () => {
    const sd = sdRow('SD-LOWER-001', 1);
    const sourced = targetSession(4, { sourced: true });
    const sbSourced = stubSupabase({ liveWorkers: [idleWorker('w-1', 1), sourced], sds: [sd], targetSession: sourced, targetSd: sd });
    await expect(assertWorkerTierAllowed(sbSourced, row('SD-LOWER-001'))).rejects.toMatchObject({ code: 'DISPATCH_RESERVED_NO_LOWER_BACKLOG' });

    const unsourced = targetSession(4, { sourced: false });
    const sbUnsourced = stubSupabase({ liveWorkers: [idleWorker('w-1', 1), unsourced], sds: [sd], targetSession: unsourced, targetSd: sd });
    await expect(assertWorkerTierAllowed(sbUnsourced, row('SD-LOWER-001'))).resolves.toBeUndefined();
  });
});
