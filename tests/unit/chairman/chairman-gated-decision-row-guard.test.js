/**
 * SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001 — orchestration tests.
 * recordPendingDecision and mergeMetadataKeys are mocked (both own their own DB/side-effect
 * concerns already tested elsewhere) so these tests focus on this module's OWN control flow:
 * selection, exclusion-by-pending-row, backfill, error handling, drift detection.
 * TS-6/TS-7/TS-8 (pure predicate/envelope) live in -envelope.test.js (no mocking needed).
 * TS-10 (SLA-sweep compatibility) lives in -sla-compat.test.js (real selectBlockingSweepRows).
 * TS-5 (rate-cap degradation) lives in -rate-cap.test.js (real recordPendingDecision).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordPendingDecisionMock = vi.fn();
const mergeMetadataKeysMock = vi.fn();

vi.mock('../../../lib/chairman/record-pending-decision.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, recordPendingDecision: (...args) => recordPendingDecisionMock(...args) };
});
vi.mock('../../../lib/coordinator/safe-metadata-merge.mjs', () => ({
  mergeMetadataKeys: (...args) => mergeMetadataKeysMock(...args),
}));

import { runChairmanGatedDecisionRowGuard } from '../../../lib/chairman/chairman-gated-decision-row-guard.mjs';

const NOW = new Date('2026-08-16T12:00:00Z');
const OLD = new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString(); // 48h old — past the 24h floor

function sdRow(overrides = {}) {
  return {
    id: `sd-${Math.random().toString(36).slice(2, 8)}`,
    sd_key: overrides.sd_key || 'SD-TEST-001',
    status: 'draft',
    created_at: OLD,
    metadata: { requires_human_action: true, human_decider: 'chairman' },
    ...overrides,
  };
}

/** Fake multi-table Supabase: strategic_directives_v2 (range-paginated select) + chairman_decisions
 *  (id/status lookup + content-match) + feedback (insert-only). */
function makeFakeSupabase({ sds = [], decisions = [] } = {}) {
  const feedbackInserts = [];
  return {
    _feedbackInserts: feedbackInserts,
    from(table) {
      if (table === 'strategic_directives_v2') {
        const ctx = { filters: [] };
        const api = {
          select: () => api,
          is: () => api,
          not: () => api,
          range: (from, to) => {
            const page = sds.slice(from, to + 1);
            return Promise.resolve({ data: page, error: null });
          },
        };
        return api;
      }
      if (table === 'chairman_decisions') {
        const ctx = { filters: [], op: 'select' };
        const api = {
          select: () => api,
          eq: (col, val) => { ctx.filters.push([col, val]); return api; },
          or: () => api, // content-match OR clause — filtered precisely in .then() below via decisions array scan
          maybeSingle: async () => {
            const idFilter = ctx.filters.find(([c]) => c === 'id');
            const row = idFilter ? decisions.find((d) => d.id === idFilter[1]) : null;
            return { data: row || null, error: null };
          },
          then: (resolve) => {
            // QF-20260816-118: the real query no longer filters status server-side (a DECIDED
            // row must also be fetchable so rowStillExcludes can honor its re-ask interval) —
            // content match + still-excludes filtering both happen client-side in
            // resolveExistingPendingDecision. Return every decision here, matching that shape.
            resolve({ data: decisions, error: null });
          },
        };
        return api;
      }
      if (table === 'feedback') {
        return {
          insert: async (row) => {
            feedbackInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`makeFakeSupabase: unhandled table '${table}'`);
    },
  };
}

beforeEach(() => {
  recordPendingDecisionMock.mockReset();
  mergeMetadataKeysMock.mockReset();
  mergeMetadataKeysMock.mockResolvedValue({ merged: true, sdKey: 'x' });
});

describe('TS-1: fixture SD fenced to chairman with no chairman_decisions row', () => {
  it('records via recordPendingDecision and stamps metadata.chairman_decision_id', async () => {
    const sd = sdRow({ sd_key: 'SD-FENCED-001' });
    recordPendingDecisionMock.mockResolvedValue({ recorded: true, id: 'dec-1', escalated: true });
    const sb = makeFakeSupabase({ sds: [sd], decisions: [] });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(1);
    expect(result.recorded).toBe(1);
    expect(recordPendingDecisionMock).toHaveBeenCalledTimes(1);
    const [, envelope] = recordPendingDecisionMock.mock.calls[0];
    expect(envelope.decisionType).toBe('session_question');
    expect(envelope.blocking).toBe(true);
    expect(envelope.raisedBy).toBe('adam');
    expect(mergeMetadataKeysMock).toHaveBeenCalledWith('SD-FENCED-001', { chairman_decision_id: 'dec-1' });
  });
});

describe('TS-2: SD already has metadata.chairman_decision_id stamped, pointing to a PENDING row', () => {
  it('is excluded — no new row, no duplicate stamp attempt', async () => {
    const sd = sdRow({ sd_key: 'SD-STAMPED-001', metadata: { requires_human_action: true, human_decider: 'chairman', chairman_decision_id: 'dec-existing' } });
    const sb = makeFakeSupabase({ sds: [sd], decisions: [{ id: 'dec-existing', status: 'pending' }] });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(0);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
  });
});

describe('TS-3: existing content-matched PENDING row, no stamped id (backfill)', () => {
  it('backfills the existing row id without creating a new row', async () => {
    const sd = sdRow({ sd_key: 'SD-BACKFILL-001' });
    const sb = makeFakeSupabase({
      sds: [sd],
      decisions: [{ id: 'dec-precreated', status: 'pending', brief_data: { context: { sd_key: 'SD-BACKFILL-001' } } }],
    });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(0);
    expect(result.backfilled).toBe(1);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
    expect(mergeMetadataKeysMock).toHaveBeenCalledWith('SD-BACKFILL-001', { chairman_decision_id: 'dec-precreated' });
  });
});

describe('TS-4: stamp fails with {merged:false} and NO error field', () => {
  it('is treated as a failure regardless of a missing .error field', async () => {
    const sd = sdRow({ sd_key: 'SD-STAMPFAIL-001' });
    recordPendingDecisionMock.mockResolvedValue({ recorded: true, id: 'dec-2', escalated: true });
    mergeMetadataKeysMock.mockResolvedValue({ merged: false, sdKey: 'SD-STAMPFAIL-001' }); // no .error, matches real zero-row-match shape
    const sb = makeFakeSupabase({ sds: [sd], decisions: [] });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].sd_key).toBe('SD-STAMPFAIL-001');
    expect(errSpy.mock.calls.some((c) => String(c[0]).startsWith('QUIET_TICK_CHAIRMAN_GATED_STAMP_ERROR'))).toBe(true);
    errSpy.mockRestore();
  });
});

describe('TS-9: repeat-unsurfaced drift dedup over a STATEFUL multi-tick sequence', () => {
  // REGRESSION (EXEC-TO-PLAN evidence f03f1509, TESTING-F1/F2): a hand-authored 3-tick fixture
  // (each tick's SD metadata typed in by hand, not derived from what mergeMetadataKeys actually
  // stamped the tick before) could NOT catch the "unconditional prior_hit_at stamp" bug — the
  // bug only manifests when metadata genuinely carries forward tick-to-tick. This test uses a
  // real, mutating metadata store so mergeMetadataKeys' patches actually persist across ticks,
  // exactly like the live DB does.
  it('fires drift on tick 2, does NOT re-fire on ticks 3-6 while the SD stays stuck (6-tick stateful run)', async () => {
    let liveMetadata = { requires_human_action: true, human_decider: 'chairman' };
    mergeMetadataKeysMock.mockImplementation(async (sdKey, patch) => {
      liveMetadata = { ...liveMetadata, ...patch };
      return { merged: true, sdKey };
    });
    recordPendingDecisionMock.mockResolvedValue({ recorded: false, error: 'insert_failed' }); // stays stuck every tick

    const feedbackCounts = [];
    for (let tick = 1; tick <= 6; tick++) {
      const sd = sdRow({ sd_key: 'SD-DRIFT-001', metadata: { ...liveMetadata } });
      const now = new Date(NOW.getTime() + tick * 60 * 60 * 1000);
      const sb = makeFakeSupabase({ sds: [sd], decisions: [] });
      // eslint-disable-next-line no-await-in-loop -- sequential ticks are the point.
      await runChairmanGatedDecisionRowGuard(sb, { now });
      feedbackCounts.push(sb._feedbackInserts.length);
    }

    // tick 1: first sighting, no drift yet. tick 2: drift fires (still stuck since tick 1).
    // ticks 3-6: MUST NOT re-fire — this is exactly the "fires every other tick" regression.
    expect(feedbackCounts).toEqual([0, 1, 0, 0, 0, 0]);
    // prior_hit_at must stay PINNED to when the SD was first seen (tick 1's timestamp), not
    // advance on every tick — the actual fix, not just its symptom.
    expect(liveMetadata.gated_guard_prior_hit_at).toBe(new Date(NOW.getTime() + 1 * 60 * 60 * 1000).toISOString());
  });

  it('a full two-episode lifecycle (stuck -> recover -> re-fence -> stuck again) fires drift on BOTH episodes, not just the first', async () => {
    // REGRESSION (EXEC-TO-PLAN re-verification, testing-agent F10/F11): the original version of
    // this test never actually drove a second episode, despite its title claiming it did — its
    // own inline comment asserted the stale markers were "harmless", a claim three independent
    // probes falsified (episode2_drift_rows=0, permanently, once F1/F2's fix pinned prior_hit_at
    // without ever clearing it on recovery). This version drives the FULL lifecycle for real,
    // including the `excluded` branch (a pending decision existing) that the fix's marker-clear
    // lives in — the prior version never reached that branch at all.
    let liveMetadata = { requires_human_action: true, human_decider: 'chairman' };
    mergeMetadataKeysMock.mockImplementation(async (sdKey, patch) => {
      liveMetadata = { ...liveMetadata, ...patch };
      return { merged: true, sdKey };
    });
    const feedbackPerTick = [];
    const tickAt = (n) => new Date(NOW.getTime() + n * 60 * 60 * 1000);

    // Episode 1, ticks 1-2: stuck (record fails) — drift fires tick 2.
    recordPendingDecisionMock.mockResolvedValue({ recorded: false, error: 'insert_failed' });
    for (const tick of [1, 2]) {
      const sd = sdRow({ sd_key: 'SD-DRIFT-002', metadata: { ...liveMetadata } });
      const sb = makeFakeSupabase({ sds: [sd], decisions: [] });
      // eslint-disable-next-line no-await-in-loop
      await runChairmanGatedDecisionRowGuard(sb, { now: tickAt(tick) });
      feedbackPerTick.push(sb._feedbackInserts.length);
    }
    expect(feedbackPerTick).toEqual([0, 1]);
    expect(liveMetadata.gated_guard_drift_flagged_at).toBeTruthy();
    expect(liveMetadata.gated_guard_prior_hit_at).toBeTruthy();

    // Tick 3: recovers — record now succeeds, chairman_decision_id stamped to 'dec-1' (status pending).
    recordPendingDecisionMock.mockResolvedValue({ recorded: true, id: 'dec-1', escalated: true });
    {
      const sd = sdRow({ sd_key: 'SD-DRIFT-002', metadata: { ...liveMetadata } });
      const sb = makeFakeSupabase({ sds: [sd], decisions: [] });
      await runChairmanGatedDecisionRowGuard(sb, { now: tickAt(3) });
      feedbackPerTick.push(sb._feedbackInserts.length);
    }
    expect(liveMetadata.chairman_decision_id).toBe('dec-1');

    // Tick 4: the SD is now EXCLUDED (dec-1 exists and is still pending) — this is the branch
    // the fix lives in. Both drift markers must be cleared here, ending episode 1 for real.
    {
      const sd = sdRow({ sd_key: 'SD-DRIFT-002', metadata: { ...liveMetadata } });
      const sb = makeFakeSupabase({ sds: [sd], decisions: [{ id: 'dec-1', status: 'pending' }] });
      const result = await runChairmanGatedDecisionRowGuard(sb, { now: tickAt(4) });
      expect(result.hits).toBe(0); // excluded, not a hit
      feedbackPerTick.push(sb._feedbackInserts.length);
    }
    expect(liveMetadata.gated_guard_prior_hit_at).toBeNull();
    expect(liveMetadata.gated_guard_drift_flagged_at).toBeNull();

    // Tick 5: dec-1 resolves (approved) and the SD is re-fenced — FR-1's collapsed check makes
    // it a hit again (episode 2, tick 1). record fails again (stuck once more). No drift yet —
    // this is a FRESH first sighting, markers were genuinely cleared.
    recordPendingDecisionMock.mockResolvedValue({ recorded: false, error: 'insert_failed_again' });
    {
      const sd = sdRow({ sd_key: 'SD-DRIFT-002', metadata: { ...liveMetadata } });
      const sb = makeFakeSupabase({ sds: [sd], decisions: [{ id: 'dec-1', status: 'approved' }] });
      const result = await runChairmanGatedDecisionRowGuard(sb, { now: tickAt(5) });
      expect(result.hits).toBe(1); // re-fenced, a genuine new hit (resolved row does not exclude)
      feedbackPerTick.push(sb._feedbackInserts.length);
    }

    // Tick 6: episode 2, tick 2 — still stuck. Drift MUST fire again — this is the assertion
    // the original test's title promised and never made.
    {
      const sd = sdRow({ sd_key: 'SD-DRIFT-002', metadata: { ...liveMetadata } });
      const sb = makeFakeSupabase({ sds: [sd], decisions: [{ id: 'dec-1', status: 'approved' }] });
      await runChairmanGatedDecisionRowGuard(sb, { now: tickAt(6) });
      feedbackPerTick.push(sb._feedbackInserts.length);
    }

    // [ep1-t1, ep1-t2, recovery-t3, excluded-t4, ep2-t5, ep2-t6]
    expect(feedbackPerTick).toEqual([0, 1, 0, 0, 0, 1]);
  });
});

describe('SEC-F1 regression: anchored content-match does not confuse sibling SD keys', () => {
  it('a pending row for the LONGER sibling key does not exclude the SHORTER key\'s SD (unanchored substring would have matched)', async () => {
    const sd = sdRow({ sd_key: 'SD-NAV-CMD-001' });
    recordPendingDecisionMock.mockResolvedValue({ recorded: true, id: 'dec-new', escalated: true });
    const sb = makeFakeSupabase({
      sds: [sd],
      decisions: [{ id: 'dec-sibling', status: 'pending', summary: '[FENCED-SD GO/DEFER SD-NAV-CMD-001C]', brief_data: {} }],
    });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(1); // NOT excluded by the sibling's summary
    expect(recordPendingDecisionMock).toHaveBeenCalledTimes(1);
  });

  it('a pending row for the EXACT same key still correctly excludes (anchoring did not break the real match)', async () => {
    const sd = sdRow({ sd_key: 'SD-NAV-CMD-001' });
    const sb = makeFakeSupabase({
      sds: [sd],
      decisions: [{ id: 'dec-exact', status: 'pending', summary: '[FENCED-SD GO/DEFER SD-NAV-CMD-001]', brief_data: {} }],
    });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(0);
    expect(result.backfilled).toBe(1);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
  });
});

describe('TESTING-F3/SEC-F2 regression: a query error fails closed, never silently proceeds as "not excluded"', () => {
  it('an id-lookup query error is surfaced as an error, not treated as a genuine hit', async () => {
    const sd = sdRow({ sd_key: 'SD-QERR-001', metadata: { requires_human_action: true, human_decider: 'chairman', chairman_decision_id: 'dec-x' } });
    const sb = makeFakeSupabase({ sds: [sd], decisions: [] });
    sb.from = new Proxy(sb.from.bind(sb), {
      apply(target, thisArg, args) {
        const api = target(...args);
        if (args[0] === 'chairman_decisions') {
          const origMaybeSingle = api.maybeSingle;
          api.maybeSingle = async () => ({ data: null, error: { message: 'connection reset' } });
          return api;
        }
        return api;
      },
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(0); // fails closed: never proceeds to record a duplicate
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('id_lookup_failed');
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('TS-11: a stale chairman_decision_id (pointing to a resolved row) does not permanently suppress a re-fence', () => {
  it('is selected as a hit and a NEW row is recorded', async () => {
    const sd = sdRow({
      sd_key: 'SD-REFENCE-001',
      metadata: { requires_human_action: true, human_decider: 'chairman', chairman_decision_id: 'dec-resolved' },
    });
    recordPendingDecisionMock.mockResolvedValue({ recorded: true, id: 'dec-new', escalated: true });
    const sb = makeFakeSupabase({ sds: [sd], decisions: [{ id: 'dec-resolved', status: 'approved' }] });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(1);
    expect(recordPendingDecisionMock).toHaveBeenCalledTimes(1);
    expect(mergeMetadataKeysMock).toHaveBeenCalledWith('SD-REFENCE-001', { chairman_decision_id: 'dec-new' });
  });
});

describe('QF-20260816-118 regression: a DECIDED row keeps excluding within the re-ask interval', () => {
  it('a row decided 1 hour ago (status=deferred, decided_by set) excludes — no new row, no new email', async () => {
    const decidedAt = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(); // 1h ago
    const sd = sdRow({
      sd_key: 'SD-JUST-DECIDED-001',
      metadata: { requires_human_action: true, human_decider: 'chairman', chairman_decision_id: 'dec-decided' },
    });
    const sb = makeFakeSupabase({
      sds: [sd],
      decisions: [{ id: 'dec-decided', status: 'deferred', decided_by: 'chairman', updated_at: decidedAt }],
    });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(0);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
    // chairman_decision_at is stamped from the decided row's own updated_at (audit trail for the interval).
    expect(mergeMetadataKeysMock).toHaveBeenCalledWith('SD-JUST-DECIDED-001', { chairman_decision_at: decidedAt });
  });

  it('a row decided 15 days ago (past the 14d re-ask interval) does NOT exclude — mints a new row', async () => {
    const decidedAt = new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(); // 15d ago
    const sd = sdRow({
      sd_key: 'SD-STALE-DECISION-001',
      metadata: { requires_human_action: true, human_decider: 'chairman', chairman_decision_id: 'dec-old' },
    });
    recordPendingDecisionMock.mockResolvedValue({ recorded: true, id: 'dec-refresh', escalated: true });
    const sb = makeFakeSupabase({
      sds: [sd],
      decisions: [{ id: 'dec-old', status: 'deferred', decided_by: 'chairman', updated_at: decidedAt }],
    });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(1);
    expect(recordPendingDecisionMock).toHaveBeenCalledTimes(1);
  });

  it('a non-pending row with NO decided_by (a bare status flip, not a real decision) does NOT exclude', async () => {
    const sd = sdRow({
      sd_key: 'SD-NO-DECIDER-001',
      metadata: { requires_human_action: true, human_decider: 'chairman', chairman_decision_id: 'dec-nodecider' },
    });
    recordPendingDecisionMock.mockResolvedValue({ recorded: true, id: 'dec-new2', escalated: true });
    const sb = makeFakeSupabase({
      sds: [sd],
      decisions: [{ id: 'dec-nodecider', status: 'deferred', updated_at: NOW.toISOString() }], // no decided_by
    });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(1);
    expect(recordPendingDecisionMock).toHaveBeenCalledTimes(1);
  });

  it('the same decided row is found via content-match when no id is stamped (backfill still works post-decision)', async () => {
    const decidedAt = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    const sd = sdRow({ sd_key: 'SD-CONTENT-DECIDED-001' }); // no chairman_decision_id stamped
    const sb = makeFakeSupabase({
      sds: [sd],
      decisions: [{
        id: 'dec-content', status: 'deferred', decided_by: 'chairman', updated_at: decidedAt,
        brief_data: { context: { sd_key: 'SD-CONTENT-DECIDED-001' } }, summary: '[FENCED-SD GO/DEFER SD-CONTENT-DECIDED-001]',
      }],
    });

    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });

    expect(result.hits).toBe(0);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
    expect(mergeMetadataKeysMock).toHaveBeenCalledWith('SD-CONTENT-DECIDED-001', { chairman_decision_id: 'dec-content', chairman_decision_at: decidedAt });
  });
});

describe('population filters', () => {
  it('a fixture SD younger than the 24h floor is not a hit', async () => {
    const sd = sdRow({ sd_key: 'SD-TOOYOUNG-001', created_at: NOW.toISOString() });
    const sb = makeFakeSupabase({ sds: [sd], decisions: [] });
    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });
    expect(result.hits).toBe(0);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
  });
});
