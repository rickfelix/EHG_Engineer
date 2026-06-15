/**
 * SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FR-1) — briefHarness emits scored
 * candidates anchored to REAL key_results KRs; unmappable signals are EXCLUDED,
 * never fabricated. Pure tests + a mocked supabase for briefHarness (no live DB).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  summarizeHarness,
  buildCandidateFromSignal,
  briefHarness,
  fetchKrByObjective,
} from '../../../lib/adam/briefings/harness.js';
import { evaluateCandidate, hasLiveAnchor } from '../../../lib/adam/rationale-bar.js';

// A realistic live KR row (shape from key_results).
const krRow = (over = {}) => ({
  id: 'kr-uuid-1',
  code: 'KR-GOV-1.1',
  title: 'Reduce dead code references to zero',
  status: 'on_track',
  objective_id: 'obj-gov-1',
  current_value: 2,
  target_value: 0,
  ...over,
});

describe('buildCandidateFromSignal (FR-1 anchoring)', () => {
  it('anchors a candidate to a REAL KR row (objective_kr.kr === the live code)', () => {
    const c = buildCandidateFromSignal({
      signalClass: 'harness-backlog',
      objectiveCode: 'O-GOV-1',
      krRows: [krRow()],
      count: 3,
      contribution_type: 'enabling',
      confidence: 0.6,
      dedup_key: 'harness-backlog-cleanup',
      copy: { opportunity: 'o', evidence: 'e', rationale: 'r', risk: 'k', counterfactual: 'cf' },
    });
    expect(c).not.toBeNull();
    expect(c.objective_kr.kr).toBe('KR-GOV-1.1'); // the REAL code, not invented
    expect(c.objective_kr.key_result_id).toBe('kr-uuid-1');
    expect(c.objective_kr.kr_status).toBe('on_track');
    expect(c.objective_kr.off_track_delta).toBe(2); // current(2) - target(0), derived
    expect(hasLiveAnchor(c)).toBe(true);
    expect(c.class).toBe('harness-backlog');
  });

  it('EXCLUDES a signal that maps to NO live KR (returns null, never fabricates)', () => {
    const c = buildCandidateFromSignal({
      signalClass: 'gate-tuning',
      objectiveCode: 'O-GOV-2',
      krRows: [], // no live KR under this objective
      count: 5,
      contribution_type: 'direct',
      dedup_key: 'harness-gate-tuning',
      copy: { opportunity: 'o', evidence: 'e', rationale: 'r', risk: 'k', counterfactual: 'cf' },
    });
    expect(c).toBeNull();
  });

  it('returns null when there is no signal (count 0) even with live KRs', () => {
    const c = buildCandidateFromSignal({
      signalClass: 'harness-backlog',
      objectiveCode: 'O-GOV-1',
      krRows: [krRow()],
      count: 0,
      contribution_type: 'enabling',
      dedup_key: 'x',
      copy: { opportunity: 'o', evidence: 'e', rationale: 'r', risk: 'k', counterfactual: 'cf' },
    });
    expect(c).toBeNull();
  });

  it('prefers the worst-status KR under an objective as the anchor', () => {
    const c = buildCandidateFromSignal({
      signalClass: 'harness-backlog',
      objectiveCode: 'O-GOV-1',
      krRows: [krRow({ code: 'KR-A', status: 'achieved' }), krRow({ code: 'KR-B', status: 'at_risk' })],
      count: 1,
      contribution_type: 'enabling',
      dedup_key: 'x',
      copy: { opportunity: 'o', evidence: 'e', rationale: 'r', risk: 'k', counterfactual: 'cf' },
    });
    expect(c.objective_kr.kr).toBe('KR-B'); // at_risk outranks achieved
  });
});

describe('summarizeHarness (FR-1)', () => {
  const krByObjective = new Map([
    ['O-GOV-1', [krRow({ code: 'KR-GOV-1.1', status: 'on_track' })]],
    ['O-GOV-2', [krRow({ code: 'KR-GOV-2.2', status: 'at_risk', objective_id: 'obj-gov-2' })]],
    ['O-GOV-3', [krRow({ code: 'KR-GOV-3.1', status: 'at_risk', objective_id: 'obj-gov-3' })]],
  ]);

  it('emits >=1 KR-anchored candidate that clears the rationale bar end-to-end', () => {
    const r = summarizeHarness({
      backlog: [1, 2, 3],
      gateRecs: [{ recommendation: 'INCREASE (+5%): tighten' }],
      evaRecs: [{ action_type: 'create_sd' }],
      krByObjective,
    });
    expect(r.candidates.length).toBeGreaterThanOrEqual(1);
    for (const c of r.candidates) {
      const e = evaluateCandidate(c, { openSdKeys: new Set() });
      expect(e.clears).toBe(true); // legitimately clears (real anchor, non-zero score)
      expect(c.objective_kr.kr).toMatch(/^KR-GOV-/);
    }
  });

  it('excludes the gate-tuning candidate when no recommendation is actionable (MONITOR only)', () => {
    const r = summarizeHarness({
      backlog: [],
      gateRecs: [{ recommendation: 'MONITOR: keep tracking' }],
      evaRecs: [],
      krByObjective,
    });
    expect(r.candidates.find((c) => c.class === 'gate-tuning')).toBeUndefined();
    expect(r.signals.actionable_gate_recs).toBe(0);
  });

  it('returns NO candidates (candidates:[]) when no live KR map is provided (cardinal rule)', () => {
    const r = summarizeHarness({ backlog: [1, 2], gateRecs: [{ recommendation: 'INCREASE' }], evaRecs: [{ action_type: 'create_sd' }] });
    expect(r.candidates).toEqual([]); // every signal excluded — none fabricated
  });
});

describe('fetchKrByObjective + briefHarness (mocked supabase, no live DB)', () => {
  // A chainable supabase mock that resolves table reads to fixtures.
  function mockSupabase(fixtures) {
    return {
      from(table) {
        const ctx = { table };
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          in() { return chain; },
          then(resolve) { return Promise.resolve({ data: fixtures[ctx.table] || [], error: null }).then(resolve); },
        };
        return chain;
      },
    };
  }

  it('groups live KRs by O-GOV objective code', async () => {
    const sb = mockSupabase({
      objectives: [{ id: 'obj-gov-1', code: 'O-GOV-1' }, { id: 'obj-gov-2', code: 'O-GOV-2' }],
      key_results: [
        krRow({ id: 'k1', code: 'KR-GOV-1.1', objective_id: 'obj-gov-1' }),
        krRow({ id: 'k2', code: 'KR-GOV-2.2', objective_id: 'obj-gov-2' }),
      ],
    });
    const map = await fetchKrByObjective(sb);
    expect(map.get('O-GOV-1')[0].code).toBe('KR-GOV-1.1');
    expect(map.get('O-GOV-2')[0].code).toBe('KR-GOV-2.2');
  });

  it('briefHarness returns KR-anchored candidates (not candidates:[]) when signals + KRs exist', async () => {
    const sb = mockSupabase({
      feedback: [{ id: 'f1' }, { id: 'f2' }],
      retrospectives: [{ id: 'r1' }],
      v_ai_quality_tuning_recommendations: [{ sd_type: 'bugfix', recommendation: 'INCREASE (+5%)' }],
      eva_consultant_recommendations: [{ id: 'e1', action_type: 'create_sd', confidence_tier: 'medium' }],
      objectives: [
        { id: 'obj-gov-1', code: 'O-GOV-1' },
        { id: 'obj-gov-2', code: 'O-GOV-2' },
        { id: 'obj-gov-3', code: 'O-GOV-3' },
      ],
      key_results: [
        krRow({ id: 'k1', code: 'KR-GOV-1.1', objective_id: 'obj-gov-1', status: 'on_track' }),
        krRow({ id: 'k2', code: 'KR-GOV-2.2', objective_id: 'obj-gov-2', status: 'at_risk' }),
        krRow({ id: 'k3', code: 'KR-GOV-3.1', objective_id: 'obj-gov-3', status: 'at_risk' }),
      ],
    });
    const r = await briefHarness(sb);
    expect(r.candidates.length).toBeGreaterThanOrEqual(1);
    expect(r.candidates.every((c) => /^KR-GOV-/.test(c.objective_kr.kr))).toBe(true);
  });

  it('briefHarness fails soft to candidates:[] when the KR query errors (never fabricates)', async () => {
    const sb = {
      from(table) {
        const chain = {
          select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; }, in() { return chain; },
          then(resolve) {
            if (table === 'key_results' || table === 'objectives') return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve);
            if (table === 'feedback') return Promise.resolve({ data: [{ id: 'f1' }], error: null }).then(resolve);
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        };
        return chain;
      },
    };
    const r = await briefHarness(sb);
    expect(r.candidates).toEqual([]);
  });
});
