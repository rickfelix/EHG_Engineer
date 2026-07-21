/**
 * forecast-basis-reader — SD-LEO-INFRA-DAILY-BRIEF-E2E-WIRING-001 (FR-4).
 *
 * Canonical read-contract (read_contract_corr e38531c6) for Solomon's calibrated forecast
 * basis: reads the most recent `feedback` row where category='solomon_forecast_basis' and
 * returns its nested metadata.forecast_basis object (gantt_rule_LEGC, dispatch_class_model,
 * work_time_model_started_to_completed, current_state_<date>). Never throws — a missing row,
 * a query error, or an unexpected (legacy flat: {velocity_per_day, open_scope_count}) shape
 * all degrade to a flagged, non-throwing result so callers can fail-closed instead of crashing.
 */

/**
 * The live basis stamps its per-item snapshot under a DATE-STAMPED key (e.g.
 * current_state_20260721 — the date the row was written), not a fixed literal. Resolve the
 * most-recent current_state_* key present rather than hardcoding any single date.
 * @param {object} basis forecast_basis object
 * @returns {object|null} the resolved current_state_* value, or null if none present
 */
export function resolveCurrentState(basis) {
  if (!basis || typeof basis !== 'object') return null;
  const keys = Object.keys(basis).filter((k) => /^current_state_\d{8}$/.test(k)).sort();
  if (keys.length === 0) return null;
  return basis[keys[keys.length - 1]];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{available: boolean, forecast_basis: object|null, confidence: string, current_state: object|null}>}
 *   confidence: 'live' (nested shape present) | 'legacy_flat_shape' (old {velocity_per_day,
 *   open_scope_count} shape) | 'no_data' (no matching row) | 'query_error'
 */
export async function readForecastBasis(supabase) {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('metadata, created_at')
      .eq('category', 'solomon_forecast_basis')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return { available: false, forecast_basis: null, confidence: 'query_error', current_state: null };
    }

    const row = data && data[0];
    if (!row) {
      return { available: false, forecast_basis: null, confidence: 'no_data', current_state: null };
    }

    const basis = row.metadata?.forecast_basis;
    if (basis && typeof basis === 'object' && basis.gantt_rule_LEGC) {
      return {
        available: true,
        forecast_basis: basis,
        confidence: 'live',
        current_state: resolveCurrentState(basis),
      };
    }

    // Legacy flat shape ({velocity_per_day, open_scope_count} directly on metadata) or any
    // other unrecognized shape — flag as degraded, never throw.
    if (row.metadata && (typeof row.metadata.velocity_per_day === 'number')) {
      return { available: true, forecast_basis: null, confidence: 'legacy_flat_shape', current_state: null };
    }

    return { available: false, forecast_basis: null, confidence: 'no_data', current_state: null };
  } catch {
    return { available: false, forecast_basis: null, confidence: 'query_error', current_state: null };
  }
}

export default { readForecastBasis, resolveCurrentState };
