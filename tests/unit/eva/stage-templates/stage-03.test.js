import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  METRICS,
  PASS_THRESHOLD,
  REVISE_THRESHOLD,
  METRIC_THRESHOLD,
  S3_CATASTROPHIC_OVERALL,
  S3_CATASTROPHIC_METRIC_FLOOR,
  THREAT_LEVELS,
  evaluateKillGate,
} from '../../../../lib/eva/stage-templates/stage-03.js';

function metricsWith(overrides = {}) {
  return {
    marketFit: 60, customerNeed: 60, momentum: 60, revenuePotential: 60,
    competitiveBarrier: 60, executionFeasibility: 60, designQuality: 60,
    ...overrides,
  };
}

describe('stage-03 — Kill Gate', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-03');
    expect(TEMPLATE.slug).toBe('validation');
    expect(TEMPLATE.title).toBe('Kill Gate');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('competitorEntities');
    expect(Array.isArray(d.competitorEntities)).toBe(true);
    expect(d).toHaveProperty('risk_factors');
    expect(d).toHaveProperty('go_conditions');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports METRICS as a non-empty array', () => {
    expect(Array.isArray(METRICS)).toBe(true);
    expect(METRICS.length).toBeGreaterThan(0);
  });

  it('exports numeric thresholds', () => {
    expect(typeof PASS_THRESHOLD).toBe('number');
    expect(typeof REVISE_THRESHOLD).toBe('number');
    expect(typeof METRIC_THRESHOLD).toBe('number');
  });

  it('exports THREAT_LEVELS array', () => {
    expect(Array.isArray(THREAT_LEVELS)).toBe(true);
    expect(THREAT_LEVELS).toContain('H');
    expect(THREAT_LEVELS).toContain('L');
  });

  it('exports evaluateKillGate as a function', () => {
    expect(typeof evaluateKillGate).toBe('function');
  });
});

describe('stage-03 — evaluateKillGate soft-gate redesign (SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001)', () => {
  it('FR-1: a single weak metric no longer forces a kill (compensated by strong others) -> REVISE', () => {
    const r = evaluateKillGate({ overallScore: 55, metrics: metricsWith({ executionFeasibility: 45 }) });
    expect(r.decision).toBe('revise');
  });

  it('FR-2: catastrophic — overall < 35 AND no metric >= 55 -> KILL', () => {
    const r = evaluateKillGate({
      overallScore: 30,
      metrics: metricsWith({ marketFit: 30, customerNeed: 40, momentum: 35, revenuePotential: 30, competitiveBarrier: 45, executionFeasibility: 40, designQuality: 50 }),
    });
    expect(r.decision).toBe('kill');
    expect(r.blockProgression).toBe(true);
  });

  it('FR-2: low overall but a redeeming dimension (>=55) is NOT catastrophic -> REVISE', () => {
    const r = evaluateKillGate({
      overallScore: 30,
      metrics: metricsWith({ marketFit: 70, customerNeed: 20, momentum: 20, revenuePotential: 20, competitiveBarrier: 20, executionFeasibility: 20, designQuality: 20 }),
    });
    expect(r.decision).toBe('revise');
  });

  it('FR-2: borderline overall (35-69) with a weak metric -> REVISE, not kill', () => {
    const r = evaluateKillGate({ overallScore: 40, metrics: metricsWith({ executionFeasibility: 45 }) });
    expect(r.decision).toBe('revise');
  });

  it('PASS: strong composite (overall >= 70) -> PASS even with one weak metric', () => {
    const r = evaluateKillGate({ overallScore: 72, metrics: metricsWith({ designQuality: 45 }) });
    expect(r.decision).toBe('pass');
    expect(r.blockProgression).toBe(false);
  });

  it('REVISE surfaces sub-threshold metrics as ADVISORY (not kill) reasons', () => {
    const r = evaluateKillGate({ overallScore: 55, metrics: metricsWith({ executionFeasibility: 45 }) });
    const advisory = r.reasons.find(x => x.type === 'metric_below_threshold_advisory');
    expect(advisory).toBeDefined();
    expect(advisory.metric).toBe('executionFeasibility');
    expect(r.reasons.find(x => x.type === 'overall_catastrophic')).toBeUndefined();
  });

  it('catastrophic constants are exported and match research Option B', () => {
    expect(S3_CATASTROPHIC_OVERALL).toBe(35);
    expect(S3_CATASTROPHIC_METRIC_FLOOR).toBe(55);
  });
});
