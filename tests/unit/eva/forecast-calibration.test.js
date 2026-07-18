/**
 * Tests for the forecast-vs-actual calibration loop.
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-D (Child D)
 *
 * Covers: pure grading (center-error + interval-coverage + the conservative-center +
 * overconfident-narrow-interval bias pair), cross-venture aggregation of durable
 * calibration records, the fail-soft/honest-idle recorder, and the guarantee that a
 * calibration failure never blocks venture kill/complete.
 */

import { describe, it, expect } from 'vitest';
import {
  gradeForecastCalibration,
  analyzeForecastCalibration,
} from '../../../lib/eva/cross-venture-learning.js';
import { recordVentureCalibration } from '../../../lib/eva/event-bus/handlers/record-venture-calibration.js';
import { handleGateEvaluated } from '../../../lib/eva/event-bus/handlers/gate-evaluated.js';

// ── gradeForecastCalibration (pure) ─────────────────────────

describe('gradeForecastCalibration', () => {
  it('flags the conservative-center + overconfident-narrow-interval bias pair', () => {
    // Realistic center (100) is close to the actual (103) but the narrow band [99,101] misses it.
    const forecast = { revenue_projections: { year_2: { pessimistic: 99, realistic: 100, optimistic: 101 } } };
    const g = gradeForecastCalibration(forecast, { revenue_year_2: 103 });

    expect(g.metricsGraded).toBe(1);
    expect(g.metrics[0].covered).toBe(false);
    expect(Math.abs(g.metrics[0].centerErrorRel)).toBeLessThanOrEqual(0.15);
    expect(g.biasPair.conservativeCenter).toBe(true);
    expect(g.biasPair.overconfidentInterval).toBe(true);
    expect(g.coverageRate).toBe(0);
  });

  it('does not flag overconfident interval when a wide band covers the actual', () => {
    const forecast = { revenue_projections: { year_2: { pessimistic: 50, realistic: 120, optimistic: 200 } } };
    const g = gradeForecastCalibration(forecast, { revenue_year_2: 130 });

    expect(g.metrics[0].covered).toBe(true);
    expect(g.coverageRate).toBe(1);
    expect(g.biasPair.overconfidentInterval).toBe(false);
  });

  it('grades multiple metrics and reports a mixed coverage rate', () => {
    const forecast = {
      revenue_projections: { year_2: { pessimistic: 99, realistic: 100, optimistic: 101 } }, // misses
      unit_economics: { ltv_cac_ratio: { pessimistic: 1, realistic: 3, optimistic: 6 } }, // covers
    };
    const g = gradeForecastCalibration(forecast, { revenue_year_2: 103, ltv_cac_ratio: 4 });
    expect(g.metricsGraded).toBe(2);
    expect(g.coverageRate).toBe(0.5);
  });

  it('honest-idles on empty or absent actuals (never fabricates a grade)', () => {
    const forecast = { revenue_projections: { year_2: { pessimistic: 99, realistic: 100, optimistic: 101 } } };
    expect(gradeForecastCalibration(forecast, {}).metricsGraded).toBe(0);
    expect(gradeForecastCalibration(forecast, {}).metrics).toEqual([]);
    expect(gradeForecastCalibration(null, { revenue_year_2: 100 }).metricsGraded).toBe(0);
    expect(gradeForecastCalibration({}, {}).metricsGraded).toBe(0);
  });

  it('is deterministic', () => {
    const forecast = { break_even: { months_to_break_even: { pessimistic: 6, realistic: 12, optimistic: 24 } } };
    const a = gradeForecastCalibration(forecast, { months_to_break_even: 30 });
    const b = gradeForecastCalibration(forecast, { months_to_break_even: 30 });
    expect(a).toEqual(b);
  });
});

// ── analyzeForecastCalibration (aggregation) ────────────────

function auditSelectDb(rows) {
  return {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return Promise.resolve({ data: rows, error: null }); },
      };
      return chain;
    },
  };
}

function calRecord(ventureId, { metric, covered, centerErrorRel, centerBias, coverageRate }) {
  return {
    eva_venture_id: ventureId,
    action_data: {
      trigger: 'kill',
      summary: { centerBias, coverageRate, metricsGraded: 1, biasPair: {} },
      metrics: [{ metric, covered, centerErrorRel }],
    },
  };
}

describe('analyzeForecastCalibration', () => {
  it('aggregates calibration records into per-estimate-class track-record weights', async () => {
    const rows = [
      calRecord('v1', { metric: 'revenue_year_2', covered: true, centerErrorRel: 0.1, centerBias: 0.1, coverageRate: 1 }),
      calRecord('v2', { metric: 'revenue_year_2', covered: false, centerErrorRel: -0.4, centerBias: -0.4, coverageRate: 0 }),
      calRecord('v3', { metric: 'revenue_year_2', covered: true, centerErrorRel: 0.05, centerBias: 0.05, coverageRate: 1 }),
    ];
    const res = await analyzeForecastCalibration(auditSelectDb(rows), ['v1', 'v2', 'v3']);

    expect(res.status).toBe('complete');
    expect(res.sample_size).toBe(3);
    expect(res.by_estimate_class.revenue_year_2.coverageRate).toBeCloseTo(0.67, 2);
    expect(res.trackRecordWeights.revenue_year_2).toBeCloseTo(0.67, 2);
  });

  it('honest-idles with insufficient records', async () => {
    const rows = [calRecord('v1', { metric: 'revenue_year_2', covered: true, centerErrorRel: 0.1, centerBias: 0.1, coverageRate: 1 })];
    const res = await analyzeForecastCalibration(auditSelectDb(rows), ['v1', 'v2', 'v3']);
    expect(res.status).toBe('insufficient_data');
    expect(res.sample_size).toBe(1);
  });

  it('honest-idles on empty venture list', async () => {
    const res = await analyzeForecastCalibration(auditSelectDb([]), []);
    expect(res.status).toBe('insufficient_data');
  });
});

// ── recordVentureCalibration (fail-soft / honest-idle) ──────

function auditCaptureDb() {
  const inserts = [];
  return {
    inserts,
    from(table) {
      return { insert(row) { inserts.push({ table, row }); return Promise.resolve({ error: null }); } };
    },
  };
}

describe('recordVentureCalibration', () => {
  const forecast = { revenue_projections: { year_2: { pessimistic: 99, realistic: 100, optimistic: 101 } } };

  it('writes exactly one venture_calibration_recorded audit row when forecast+actuals are present', async () => {
    const db = auditCaptureDb();
    const res = await recordVentureCalibration(db, { ventureId: 'v1', gateId: 'g1', trigger: 'kill', forecast, actuals: { revenue_year_2: 103 } });

    expect(res.recorded).toBe(true);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].table).toBe('eva_audit_log');
    expect(db.inserts[0].row.action_type).toBe('venture_calibration_recorded');
    expect(db.inserts[0].row.action_data.trigger).toBe('kill');
    expect(db.inserts[0].row.action_data.summary.biasPair.overconfidentInterval).toBe(true);
  });

  it('honest-idles (no insert) when the forecast is missing', async () => {
    const db = auditCaptureDb();
    const res = await recordVentureCalibration(db, { ventureId: 'v1', trigger: 'kill', forecast: null, actuals: { revenue_year_2: 103 } });
    expect(res).toEqual({ recorded: false, reason: 'no_forecast' });
    expect(db.inserts).toHaveLength(0);
  });

  it('honest-idles (no insert) when no actuals grade', async () => {
    const db = auditCaptureDb();
    const res = await recordVentureCalibration(db, { ventureId: 'v1', trigger: 'kill', forecast, actuals: {} });
    expect(res).toEqual({ recorded: false, reason: 'no_actuals' });
    expect(db.inserts).toHaveLength(0);
  });
});

// ── Fail-soft: calibration never blocks kill/complete ───────

function killDb() {
  return {
    from(table) {
      if (table === 'eva_ventures') return { update() { return { eq() { return Promise.resolve({ error: null }); } }; } };
      return { insert() { return Promise.resolve({ error: null }); } };
    },
  };
}

function proceedNoNextStageDb() {
  return {
    from(table) {
      if (table === 'eva_ventures') {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          single() { return Promise.resolve({ data: { id: 'v1', status: 'active' }, error: null }); },
          update() { return { eq() { return Promise.resolve({ error: null }); } }; },
        };
        return chain;
      }
      const c = { select() { return c; }, eq() { return c; }, order() { return Promise.resolve({ data: [], error: null }); } };
      return c;
    },
  };
}

describe('calibration recording is fail-soft', () => {
  const throwingRecorder = () => { throw new Error('calibration boom'); };

  it('does not block venture termination when the recorder throws', async () => {
    const res = await handleGateEvaluated(
      { ventureId: 'v1', gateId: 'g1', outcome: 'kill' },
      { supabase: killDb(), recordCalibration: throwingRecorder },
    );
    expect(res).toEqual({ outcome: 'kill', action: 'terminated', ventureId: 'v1', gateId: 'g1' });
  });

  it('does not block pipeline completion when the recorder throws', async () => {
    const res = await handleGateEvaluated(
      { ventureId: 'v1', gateId: 'g1', outcome: 'proceed' },
      { supabase: proceedNoNextStageDb(), recordCalibration: throwingRecorder },
    );
    expect(res).toEqual({ outcome: 'proceed', action: 'pipeline_complete', ventureId: 'v1', gateId: 'g1' });
  });
});
