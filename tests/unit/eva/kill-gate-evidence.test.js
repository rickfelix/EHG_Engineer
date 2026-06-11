/**
 * SD-LEO-FIX-PERSIST-KILL-GATE-001 (FR-6) — hermetic tests for kill-gate
 * scoring-evidence persistence, the DA-as-DFE-input rule, and override merge.
 *
 * Before this SD: 1,096 eva_stage_gate_results rows with gate_criteria={} and
 * evaluated_by=NULL — 72/72 S3 kill-gate PASSes were unfalsifiable.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildGateEvidence } from '../../../lib/agents/modules/venture-state-machine/stage-gates.js';
import { evaluateDecision } from '../../../lib/eva/decision-filter-engine.js';
import { recordGateResult, recordGateOverride } from '../../../lib/eva/artifact-persistence-service.js';

const PREFS = { 'filter.min_score': 7, 'filter.cost_max': 500 };

describe('buildGateEvidence (FR-2)', () => {
  const stageInput = {
    stage: '3', score: 8.2, cost: 120, visionScore: 88, sdPhase: 'EXEC',
    technologies: ['a'], vendors: [], patterns: ['p1', 'p2'],
  };

  it('a PASS records what it saw: inputs + threshold snapshot + recommendation', () => {
    const ev = buildGateEvidence({
      stageInput, preferences: PREFS, evaluatedThresholds: [],
      filterResult: { auto_proceed: true, recommendation: 'AUTO_PROCEED' },
    });
    expect(ev.inputs_snapshot).toMatchObject({ stage: '3', score: 8.2, cost: 120, visionScore: 88, pattern_count: 2 });
    expect(ev.threshold_snapshot).toEqual(PREFS);
    expect(ev.recommendation).toBe('AUTO_PROCEED');
  });

  it('stage-03 metric values ride in inputs_snapshot.metrics when stageOutput carries them', () => {
    const ev = buildGateEvidence({
      stageInput, preferences: PREFS, evaluatedThresholds: [],
      filterResult: { auto_proceed: true },
      stageOutput: { marketFit: 81, customerNeed: 77, momentum: 65, revenuePotential: 72, competitiveBarrier: 58, executionFeasibility: 84, designQuality: 70, overallScore: 73 },
    });
    expect(ev.inputs_snapshot.metrics).toMatchObject({ marketFit: 81, designQuality: 70 });
    expect(ev.inputs_snapshot.overall_score).toBe(73);
  });

  it('records DA input and flags divergence when DA challenged but thresholds passed', () => {
    const da = { present: true, artifactId: 'da-1', overallAssessment: 'challenge', highRiskCount: 2 };
    const ev = buildGateEvidence({
      stageInput: { ...stageInput, devilsAdvocate: da },
      preferences: PREFS, evaluatedThresholds: [],
      filterResult: { auto_proceed: true },
    });
    expect(ev.da_input).toMatchObject({ overallAssessment: 'challenge' });
    expect(ev.da_divergence).toBe(true);
  });

  it('stamps venture flags for calibration exclusion', () => {
    const ev = buildGateEvidence({
      stageInput, preferences: PREFS, evaluatedThresholds: [],
      filterResult: { auto_proceed: true },
      ventureFlags: { is_demo: true, is_scaffolding: false },
    });
    expect(ev.venture_flags).toEqual({ is_demo: true, is_scaffolding: false });
  });
});

describe('DFE devils_advocate_challenge rule (FR-4)', () => {
  const base = { stage: '3', score: 9 };

  it('DA challenge forces PRESENT_TO_CHAIRMAN with a HIGH trigger', () => {
    const r = evaluateDecision(
      { ...base, devilsAdvocate: { present: true, overallAssessment: 'challenge', highRiskCount: 0 } },
      { preferences: PREFS }
    );
    expect(r.auto_proceed).toBe(false);
    const t = r.triggers.find(x => x.type === 'devils_advocate_challenge');
    expect(t).toBeTruthy();
    expect(t.severity).toBe('HIGH');
  });

  it('high-severity DA risks force chairman routing even with supportive assessment', () => {
    const r = evaluateDecision(
      { ...base, devilsAdvocate: { present: true, overallAssessment: 'concern', highRiskCount: 3 } },
      { preferences: PREFS }
    );
    expect(r.auto_proceed).toBe(false);
    expect(r.triggers.some(x => x.type === 'devils_advocate_challenge')).toBe(true);
  });

  it('supportive DA changes nothing (fail-toward-current)', () => {
    const withDa = evaluateDecision(
      { ...base, devilsAdvocate: { present: true, overallAssessment: 'support', highRiskCount: 0 } },
      { preferences: PREFS }
    );
    const without = evaluateDecision({ ...base }, { preferences: PREFS });
    expect(withDa.auto_proceed).toBe(without.auto_proceed);
    expect(withDa.triggers.filter(t => t.type === 'devils_advocate_challenge')).toHaveLength(0);
  });

  it('absent DA input is byte-identical to pre-change behavior', () => {
    const r = evaluateDecision({ ...base }, { preferences: PREFS });
    expect(r.triggers.filter(t => t.type === 'devils_advocate_challenge')).toHaveLength(0);
  });
});

/** Recording mock supabase for the persistence-layer tests. @private */
function makeSupabaseMock({ existingGateRow = null } = {}) {
  const writes = [];
  const api = {
    from: vi.fn(() => api),
    select: vi.fn(() => api),
    eq: vi.fn(() => api),
    update: vi.fn((payload) => { writes.push({ op: 'update', payload }); return api; }),
    upsert: vi.fn((payload) => { writes.push({ op: 'upsert', payload }); return api; }),
    maybeSingle: vi.fn(async () => ({ data: existingGateRow, error: null })),
    single: vi.fn(async () => ({ data: { id: 'row-1' }, error: null })),
  };
  return { api, writes };
}

describe('recordGateResult evidence params (FR-1)', () => {
  it('persists criteria -> gate_criteria and evaluatedBy -> evaluated_by', async () => {
    const { api, writes } = makeSupabaseMock();
    await recordGateResult(api, {
      ventureId: 'v1', stageNumber: 3, gateType: 'kill', passed: true,
      score: 8.2, criteria: { inputs_snapshot: { score: 8.2 } }, evaluatedBy: 'decision-filter-engine',
    });
    const up = writes.find(w => w.op === 'upsert');
    expect(up.payload.gate_criteria).toMatchObject({ inputs_snapshot: { score: 8.2 } });
    expect(up.payload.evaluated_by).toBe('decision-filter-engine');
    expect(up.payload.overall_score).toBe(8.2);
  });

  it('legacy calls (no new params) write exactly the old row shape', async () => {
    const { api, writes } = makeSupabaseMock();
    await recordGateResult(api, { ventureId: 'v1', stageNumber: 3, gateType: 'kill', passed: true });
    const up = writes.find(w => w.op === 'upsert');
    expect(up.payload).not.toHaveProperty('gate_criteria');
    expect(up.payload).not.toHaveProperty('evaluated_by');
  });
});

describe('recordGateOverride (FR-5)', () => {
  it('merges override into existing criteria without clobbering evidence', async () => {
    const { api, writes } = makeSupabaseMock({
      existingGateRow: { id: 'g-1', gate_criteria: { inputs_snapshot: { score: 5 }, evaluatedThresholds: [{ thresholdId: 'score_min' }] } },
    });
    const id = await recordGateOverride(api, {
      ventureId: 'v1', stageNumber: 3, gateType: 'kill',
      override: { decision_id: 'd-9', decided_by: 'chairman', rationale: 'build-out forcing', at: '2026-06-10T22:00:00Z' },
    });
    expect(id).toBe('g-1');
    const upd = writes.find(w => w.op === 'update');
    expect(upd.payload.gate_criteria.inputs_snapshot).toEqual({ score: 5 });           // preserved
    expect(upd.payload.gate_criteria.evaluatedThresholds).toHaveLength(1);             // preserved
    expect(upd.payload.gate_criteria.override).toMatchObject({ decision_id: 'd-9' }); // added
  });

  it('returns null (fail-soft) when no gate row exists', async () => {
    const { api } = makeSupabaseMock({ existingGateRow: null });
    const id = await recordGateOverride(api, {
      ventureId: 'v1', stageNumber: 3, gateType: 'kill', override: { decision_id: 'd-9' },
    });
    expect(id).toBeNull();
  });

  it('requires a decision_id', async () => {
    const { api } = makeSupabaseMock();
    await expect(recordGateOverride(api, { ventureId: 'v1', stageNumber: 3, gateType: 'kill', override: {} }))
      .rejects.toThrow(/decision_id/);
  });
});
