/**
 * QF-20260911-388: the QF self-claim loop emitted no per-candidate trace, so a silently
 * refused claim left no error string anywhere the worker or the coordinator could read after
 * the fact (QF-20260911-117 was first-eligible in two seats' candidate lists yet skipped
 * both times with nothing to attribute it to). Additive logging only -- proves the trace
 * carries the real tryClaim error for a refused candidate and ok:true for the one actually
 * claimed, without changing which candidate wins.
 */
import { describe, it, expect } from 'vitest';

const { selfClaimQuickFix } = require('../../scripts/worker-checkin.cjs');

function makeSb({ qfRows, rpcResultBySdId }) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    is() { return chain; },
    order() { return chain; },
    limit() { return Promise.resolve({ data: qfRows, error: null }); },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    single() { return Promise.resolve({ data: null, error: null }); },
    insert() { return chain; },
    update() { return chain; },
    then(res) { return Promise.resolve({ data: null, error: null }).then(res); },
  };
  return {
    from() { return chain; },
    rpc(fn, params) {
      if (fn === 'claim_sd') {
        const result = rpcResultBySdId[params.p_sd_id];
        return Promise.resolve(result || { data: { success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const baseQf = (id, overrides = {}) => ({
  id,
  status: 'open',
  pr_url: null,
  commit_sha: null,
  created_at: new Date().toISOString(),
  routing_tier: 2,
  title: 'fixture',
  description: 'fixture, no SD reference',
  severity: 'medium',
  not_before: null,
  factory_lane: false,
  owner: null,
  release_condition: null,
  target_application: 'EHG_Engineer',
  ...overrides,
});

describe('selfClaimQuickFix — qf_candidates_trace (QF-20260911-388)', () => {
  it('records the first candidate\'s tryClaim error and the second candidate\'s ok:true, and self-claims the second', async () => {
    const qfRows = [baseQf('QF-A'), baseQf('QF-B')];
    const sb = makeSb({
      qfRows,
      rpcResultBySdId: {
        'QF-A': { data: { success: false, error: 'stale_candidate_row' }, error: null },
        'QF-B': { data: { success: true }, error: null },
      },
    });
    const base = {};
    const result = await selfClaimQuickFix(sb, 'session-worker', base, undefined);

    expect(result).toBeTruthy();
    expect(result.action).toBe('self_claimed_qf');
    expect(result.qf).toBe('QF-B'); // the SECOND candidate is the one actually claimed

    expect(Array.isArray(base.qf_candidates_trace)).toBe(true);
    const [traceA, traceB] = base.qf_candidates_trace;

    expect(traceA.qf_id).toBe('QF-A');
    expect(traceA.picker_verdict).toBe('eligible');
    expect(traceA.tryClaim).toEqual({ ok: false, error: 'stale_candidate_row' });

    expect(traceB.qf_id).toBe('QF-B');
    expect(traceB.picker_verdict).toBe('eligible');
    expect(traceB.tryClaim).toEqual({ ok: true, error: null });
  });

  it('caps the trace at 10 entries without changing which candidate is claimed', async () => {
    const qfRows = Array.from({ length: 12 }, (_, i) => baseQf(`QF-${i}`));
    const rpcResultBySdId = {};
    for (let i = 0; i < 11; i++) rpcResultBySdId[`QF-${i}`] = { data: { success: false, error: 'refused' }, error: null };
    rpcResultBySdId['QF-11'] = { data: { success: true }, error: null };
    const sb = makeSb({ qfRows, rpcResultBySdId });
    const base = {};
    const result = await selfClaimQuickFix(sb, 'session-worker', base, undefined);

    expect(result.qf).toBe('QF-11');
    expect(base.qf_candidates_trace).toHaveLength(10);
  });

  it('records a work_class_fenced candidate\'s reason in the trace (tryClaim never attempted)', async () => {
    const qfRows = [baseQf('QF-fable-fenced', { title: 'a full refactor of the venture pipeline' }), baseQf('QF-plain')];
    const sb = makeSb({
      qfRows,
      rpcResultBySdId: { 'QF-plain': { data: { success: true }, error: null } },
    });
    const base = {};
    const result = await selfClaimQuickFix(sb, 'session-worker', base, 'fable');

    expect(result.qf).toBe('QF-plain');
    const traceFenced = base.qf_candidates_trace.find((t) => t.qf_id === 'QF-fable-fenced');
    expect(traceFenced.work_class_reason).toBeTruthy();
    expect(traceFenced.tryClaim).toBeNull();
  });
});
