/**
 * Evidence-binding integration tests for the consolidated SUCCESS_METRICS gate
 * (SD-LEO-INFRA-GROUND-SUCCESS-METRICS-001).
 *
 * Covers: bound+verified=100 (evidence-backed), bound+contradicted=0 with the structured
 * SUCCESS_METRICS_EVIDENCE_CONTRADICTED reason code (gate hard-fails), bound+unresolvable
 * advisory fallback to self-report, the auto-populate interaction (bound metrics never get
 * speculative actuals — neither mutated nor persisted), the verification-result override,
 * the evidence_summary counts, and the UNBOUND byte-identical regression lock.
 *
 * The heuristic verifier is mocked to a deterministic per-metric self_reported result so the
 * override path is observable; bindings use db_probe/gate_score kinds only (stub supabase —
 * no process is ever spawned).
 */
import { describe, it, expect, vi } from 'vitest';
import { createSuccessMetricsGate } from './success-metrics-gate.js';
import { GATE_REASON_CODES } from './gate-reason-codes.js';

vi.mock('../../../../../lib/metric-auto-verifier.js', () => ({
  verifyAllMetrics: (metrics) => ({
    results: (metrics || []).map(m => ({
      metric: m.metric || m.name || 'Unnamed',
      reportedValue: String(m.actual ?? ''),
      measuredValue: null,
      score: 65,
      status: 'self_reported',
      issue: null,
    })),
    overallScore: 65,
  }),
}));

/**
 * Routed supabase stub covering every chain the gate + resolver use:
 *  - strategic_directives_v2: children select / parent check / success_metrics fetch / update
 *  - sd_phase_handoffs: auto-populate evidence (select.eq.eq → then) AND gate_score
 *    (select.eq.eq.eq.order.limit → promise)
 *  - user_stories: auto-populate evidence
 *  - any other table: db_probe count head ({count} from cfg.counts)
 */
function makeSupabase(cfg = {}) {
  const updates = [];
  const handoffRows = cfg.gateScoreHandoffs || [];
  function from(table) {
    if (table === 'strategic_directives_v2') {
      const chain = {
        _select: null, _update: null,
        select(f) { this._select = f; return this; },
        eq() { return this; },
        update(payload) { this._update = payload; updates.push(payload); return this; },
        async single() {
          if (this._select && this._select.includes('parent_sd_id')) return { data: { parent_sd_id: null }, error: null };
          if (this._select && this._select.includes('success_metrics')) return { data: { success_metrics: cfg.successMetrics }, error: null };
          return { data: null, error: null };
        },
        then(resolve) {
          if (this._select === 'id') return Promise.resolve({ data: [], error: null }).then(resolve); // no children
          if (this._update) return Promise.resolve({ data: null, error: null }).then(resolve);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    }
    if (table === 'sd_phase_handoffs') {
      const filters = {};
      const chain = {
        select() { return chain; },
        eq(col, val) { filters[col] = val; return chain; },
        order() { return chain; },
        limit() {
          const rows = handoffRows.filter(h => h.handoff_type === filters.handoff_type && h.status === filters.status);
          return Promise.resolve({ data: rows, error: null });
        },
        then(resolve) { return Promise.resolve({ data: cfg.acceptedHandoffs || [], error: null }).then(resolve); },
      };
      return chain;
    }
    if (table === 'user_stories') {
      return { select() { return this; }, eq() { return this; }, then(resolve) { return Promise.resolve({ data: cfg.stories || [], error: null }).then(resolve); } };
    }
    // db_probe target tables
    return {
      select() { return this; }, eq() { return this; },
      then(resolve) {
        if (cfg.probeError) return resolve({ count: null, error: { message: cfg.probeError } });
        return resolve({ count: (cfg.counts || {})[table] ?? 0, error: null });
      },
    };
  }
  return { from, _updates: updates };
}

const run = async (sb, sdType = 'feature') => {
  const gate = createSuccessMetricsGate(sb);
  return gate.validator({ sd: { id: 'uuid-1', sd_type: sdType }, sdId: 'uuid-1' });
};

describe('evidence-bound achievement', () => {
  it('bound+VERIFIED scores 100 from the machine check, not the actual text', async () => {
    const sb = makeSupabase({
      counts: { widgets: 5 },
      successMetrics: [
        { metric: 'Rows present', target: 'descriptive prose target', actual: 'descriptive prose actual',
          evidence: { kind: 'db_probe', ref: { table: 'widgets', expect: '>=1' } } },
      ],
    });
    const r = await run(sb);
    const ms = r.details.achievement.metric_scores[0];
    expect(ms.score).toBe(100);
    expect(ms.evidence_backed).toBe(true);
    expect(ms.reason).toMatch(/Evidence verified/);
    expect(r.details.evidence_summary).toMatchObject({ bound: 1, evidence_backed: 1, self_reported: 0 });
    expect(r.passed).toBe(true);
  });

  it('bound+CONTRADICTED scores 0 with the structured reason code and hard-fails the gate', async () => {
    const sb = makeSupabase({
      gateScoreHandoffs: [{ handoff_type: 'EXEC-TO-PLAN', status: 'accepted', validation_score: 60, accepted_at: 'x' }],
      successMetrics: [
        { metric: 'Gate quality', target: '>=99', actual: '100% — definitely met',
          evidence: { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=99' } } },
      ],
    });
    const r = await run(sb);
    const ms = r.details.achievement.metric_scores[0];
    expect(ms.score).toBe(0);
    expect(ms.reason_code).toBe(GATE_REASON_CODES.SUCCESS_METRICS_EVIDENCE_CONTRADICTED);
    expect(r.passed).toBe(false);
    expect(r.issues.some(i => i.includes('SUCCESS_METRICS_EVIDENCE_CONTRADICTED'))).toBe(true);
  });

  it('bound+UNRESOLVABLE falls back to self-report scoring (advisory, not a failure)', async () => {
    const sb = makeSupabase({
      probeError: 'permission denied',
      successMetrics: [
        { metric: 'Rows present', target: '>=1', actual: '3',
          evidence: { kind: 'db_probe', ref: { table: 'widgets', expect: '>=1' } } },
      ],
    });
    const r = await run(sb);
    const ms = r.details.achievement.metric_scores[0];
    expect(ms.score).toBe(100); // self-report path: 3 >= 1
    expect(ms.evidence_backed).toBeUndefined();
    expect(r.details.evidence_summary).toMatchObject({ bound: 1, evidence_backed: 0, unresolvable: 1 });
    expect(r.passed).toBe(true);
  });
});

describe('auto-populate interaction (evidence precedence over speculation)', () => {
  it('a bound metric with an EMPTY actual is scored by evidence and never auto-populated', async () => {
    const sb = makeSupabase({
      counts: { widgets: 5 },
      acceptedHandoffs: [{ handoff_type: 'EXEC-TO-PLAN', status: 'accepted', validation_score: 90 }],
      stories: [{ status: 'completed' }],
      successMetrics: [
        { metric: 'Rows present', target: '>=1', actual: '',
          evidence: { kind: 'db_probe', ref: { table: 'widgets', expect: '>=1' } } },
      ],
    });
    const r = await run(sb);
    expect(r.details.achievement.metric_scores[0]).toMatchObject({ score: 100, evidence_backed: true });
    // hasEmptyActuals excludes evidence-resolved metrics → auto-populate block never ran
    expect(sb._updates.length).toBe(0);
    expect(r.passed).toBe(true);
  });

  it('mixed: the unbound empty metric is auto-populated; the bound one is left untouched', async () => {
    const sb = makeSupabase({
      counts: { widgets: 5 },
      acceptedHandoffs: [{ handoff_type: 'EXEC-TO-PLAN', status: 'accepted', validation_score: 90 }],
      stories: [{ status: 'completed' }, { status: 'completed' }],
      successMetrics: [
        { metric: 'Rows present', target: '>=1', actual: '',
          evidence: { kind: 'db_probe', ref: { table: 'widgets', expect: '>=1' } } },
        { metric: 'Implementation completeness', target: '100%', actual: '' },
      ],
    });
    const r = await run(sb);
    expect(r.details.achievement.metric_scores[0]).toMatchObject({ score: 100, evidence_backed: true });
    // auto-populate persisted once, and the BOUND metric inside the payload is untouched
    expect(sb._updates.length).toBe(1);
    const persisted = sb._updates[0].success_metrics;
    expect(persisted[0]._auto_populated).toBeUndefined();
    expect(persisted[0].actual).toBe('');
    expect(persisted[1]._auto_populated).toBe(true);
  });
});

describe('verification override + summary surfaces', () => {
  it('evidence-resolved metrics override the heuristic verifier result', async () => {
    const sb = makeSupabase({
      counts: { widgets: 5 },
      successMetrics: [
        { metric: 'Rows present', target: '>=1', actual: 'prose',
          evidence: { kind: 'db_probe', ref: { table: 'widgets', expect: '>=1' } } },
        { metric: 'Unbound thing', target: '>=1', actual: '2' },
      ],
    });
    const r = await run(sb);
    const vr = r.details.verification.results;
    expect(vr[0]).toMatchObject({ status: 'verified', score: 100, evidence_backed: true });
    expect(vr[1]).toMatchObject({ status: 'self_reported', score: 65 }); // heuristic untouched
  });

  it('UNBOUND-ONLY metrics behave exactly as before (regression lock)', async () => {
    const sb = makeSupabase({
      successMetrics: [
        { metric: 'A', target: '>=1', actual: '2' },     // met → 100
        { metric: 'B', target: '>=5', actual: '3' },     // not met → 50
        { metric: 'C', target: 'N/A', actual: 'prose words' }, // non-numeric → 75
      ],
    });
    const r = await run(sb);
    const scores = r.details.achievement.metric_scores.map(m => m.score);
    expect(scores).toEqual([100, 50, 75]);
    expect(r.details.achievement.score).toBe(75); // round((100+50+75)/3)
    expect(r.details.evidence_summary).toMatchObject({ bound: 0, self_reported: 3 });
    // no metric carries evidence flags on the unbound path
    expect(r.details.achievement.metric_scores.every(m => m.evidence_backed === undefined)).toBe(true);
    expect(sb._updates.length).toBe(0); // no auto-populate (all actuals present)
  });
});
