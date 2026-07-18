/**
 * Fail-soft venture calibration recorder.
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-D (Child D)
 *
 * Grades a venture's Stage-0 modeling.js forecast against realized actuals at
 * kill/complete and records the grading durably via the existing eva_audit_log path
 * (action_type='venture_calibration_recorded'). The cross-venture aggregation
 * (lib/eva/cross-venture-learning.js analyzeForecastCalibration) later reads these
 * records to emit per-estimate-class track-record weighting.
 *
 * Contract:
 *   - honest-idle: never fabricates a grade when a forecast or actuals are absent.
 *   - fail-soft: callers wrap this in try/catch so a calibration failure NEVER blocks
 *     venture termination/completion.
 */

import { logEvaAudit } from './_log-eva-audit.js';
import { gradeForecastCalibration } from '../../cross-venture-learning.js';

/**
 * Best-effort loader for a venture's persisted Stage-0 forecast + realized actuals.
 *
 * The modeling.js forecast is persisted with the venture brief (synthesisResult.metadata.forecast).
 * eva_ventures exposes orchestrator_state (jsonb) — read it best-effort. Until ventures
 * persist a forecast/actuals payload this returns nulls and the caller honest-idles.
 * No phantom columns are referenced.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<{forecast: Object|null, actuals: Object|null}>}
 */
export async function loadVentureForecastAndActuals(supabase, ventureId) {
  try {
    const { data, error } = await supabase
      .from('eva_ventures')
      .select('id, orchestrator_state')
      .eq('id', ventureId)
      .maybeSingle();

    if (error || !data) return { forecast: null, actuals: null };

    const state = data.orchestrator_state && typeof data.orchestrator_state === 'object'
      ? data.orchestrator_state
      : {};
    const forecast = state.forecast || state.stage_zero?.forecast || null;
    const actuals = state.actuals || state.calibration_actuals || null;
    return { forecast, actuals };
  } catch {
    return { forecast: null, actuals: null };
  }
}

/**
 * Grade and record a venture's forecast-vs-actual calibration.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} args
 * @param {string} args.ventureId - eva_ventures.id
 * @param {string} [args.gateId]
 * @param {string} args.trigger - 'kill' | 'complete'
 * @param {Object} [args.forecast] - injected forecast (defaults to loader)
 * @param {Object} [args.actuals] - injected actuals (defaults to loader)
 * @param {Function} [args.loader] - override loader (testing)
 * @returns {Promise<{recorded: boolean, reason: string, grade?: Object}>}
 */
export async function recordVentureCalibration(
  supabase,
  { ventureId, gateId = null, trigger, forecast, actuals, loader = loadVentureForecastAndActuals } = {},
) {
  let f = forecast;
  let a = actuals;
  if (f === undefined || a === undefined) {
    const loaded = await loader(supabase, ventureId);
    if (f === undefined) f = loaded.forecast;
    if (a === undefined) a = loaded.actuals;
  }

  if (!f) return { recorded: false, reason: 'no_forecast' };

  const grade = gradeForecastCalibration(f, a || {});
  if (grade.metricsGraded === 0) return { recorded: false, reason: 'no_actuals' };

  const summary = {
    metricsGraded: grade.metricsGraded,
    centerBias: grade.centerBias,
    coverageRate: grade.coverageRate,
    avgIntervalWidthRel: grade.avgIntervalWidthRel,
    biasPair: grade.biasPair,
  };

  const res = await logEvaAudit(
    supabase,
    {
      eva_venture_id: ventureId,
      action_type: 'venture_calibration_recorded',
      action_data: { trigger, gateId, summary, metrics: grade.metrics },
      actor_type: 'event_bus',
    },
    { handler: 'RecordVentureCalibration' },
  );

  return { recorded: res.ok, reason: res.ok ? 'recorded' : 'audit_write_failed', grade: summary };
}
