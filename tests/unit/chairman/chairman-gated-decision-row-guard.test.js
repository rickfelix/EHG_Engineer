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
            // status='pending' + content match handled by caller (resolveExistingPendingDecision
            // filters client-side); return the full pending set here.
            resolve({ data: decisions.filter((d) => d.status === 'pending'), error: null });
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

describe('TS-9: repeat-unsurfaced across two consecutive ticks', () => {
  it('inserts exactly one adam_adherence_drift feedback row, not two', async () => {
    // Tick 1: hit fails to record (simulating a stuck recording error) — no drift row yet
    // (first time seen), but the prior-hit marker gets stamped.
    recordPendingDecisionMock.mockResolvedValue({ recorded: false, error: 'insert_failed' });
    const sd1 = sdRow({ sd_key: 'SD-DRIFT-001' });
    const sb1 = makeFakeSupabase({ sds: [sd1], decisions: [] });
    await runChairmanGatedDecisionRowGuard(sb1, { now: NOW });
    expect(sb1._feedbackInserts).toHaveLength(0);
    const priorHitStamp = mergeMetadataKeysMock.mock.calls.find(([, patch]) => patch.gated_guard_prior_hit_at)?.[1];
    expect(priorHitStamp).toBeTruthy();

    // Tick 2 (1h later): same SD, now carrying the prior-hit marker from tick 1 — still failing
    // to record — should emit exactly ONE drift row.
    mergeMetadataKeysMock.mockReset();
    mergeMetadataKeysMock.mockResolvedValue({ merged: true });
    const sd2 = sdRow({
      sd_key: 'SD-DRIFT-001',
      metadata: { requires_human_action: true, human_decider: 'chairman', gated_guard_prior_hit_at: priorHitStamp.gated_guard_prior_hit_at },
    });
    const later = new Date(NOW.getTime() + 60 * 60 * 1000);
    const sb2 = makeFakeSupabase({ sds: [sd2], decisions: [] });
    const result2 = await runChairmanGatedDecisionRowGuard(sb2, { now: later });

    expect(sb2._feedbackInserts).toHaveLength(1);
    expect(sb2._feedbackInserts[0].category).toBe('adam_adherence_drift');

    // Tick 3, same tick's SD state would now carry gated_guard_drift_flagged_at >= prior_hit_at
    // — re-running with that marker present must NOT insert a second row.
    mergeMetadataKeysMock.mockReset();
    mergeMetadataKeysMock.mockResolvedValue({ merged: true });
    const sd3 = sdRow({
      sd_key: 'SD-DRIFT-001',
      metadata: {
        requires_human_action: true,
        human_decider: 'chairman',
        gated_guard_prior_hit_at: later.toISOString(),
        gated_guard_drift_flagged_at: later.toISOString(),
      },
    });
    const later2 = new Date(later.getTime() + 60 * 60 * 1000);
    const sb3 = makeFakeSupabase({ sds: [sd3], decisions: [] });
    await runChairmanGatedDecisionRowGuard(sb3, { now: later2 });
    expect(sb3._feedbackInserts).toHaveLength(0);
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

describe('population filters', () => {
  it('a fixture SD younger than the 24h floor is not a hit', async () => {
    const sd = sdRow({ sd_key: 'SD-TOOYOUNG-001', created_at: NOW.toISOString() });
    const sb = makeFakeSupabase({ sds: [sd], decisions: [] });
    const result = await runChairmanGatedDecisionRowGuard(sb, { now: NOW });
    expect(result.hits).toBe(0);
    expect(recordPendingDecisionMock).not.toHaveBeenCalled();
  });
});
