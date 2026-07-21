/**
 * SD-LEO-INFRA-DAILY-BRIEF-E2E-WIRING-001 (FR-4) — unit tests for the canonical
 * forecast_basis read-contract (read_contract_corr e38531c6). DB-free (seeded fixtures).
 */
import { describe, it, expect } from 'vitest';
import { readForecastBasis, resolveCurrentState } from '../../../lib/chairman/daily-review/forecast-basis-reader.js';

function makeFakeSupabase(rows) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit(n) {
                      return Promise.resolve({ data: rows.slice(0, n), error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function makeErroringSupabase() {
  return {
    from() {
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: new Error('db unreachable') }) }) }) }),
      };
    },
  };
}

const LIVE_ROW = {
  metadata: {
    forecast_basis: {
      gantt_rule_LEGC: 'SEGREGATE fenced/chairman-gated items...',
      dispatch_class_model: { open_queue: { queue_wait_median_hrs: 9.5, queue_wait_p90_hrs: 91 } },
      work_time_model_started_to_completed: { sd_tier: { median_hrs: 1.5, p90_hrs: 4.5 } },
      current_state_20260721: { dispatchable_qf: 53, chairman_gated_held: 4, fenced_set: 'x + y + z' },
    },
  },
};

describe('readForecastBasis (FR-4)', () => {
  it('TS-8: returns the nested forecast_basis correctly for the live-shape row', async () => {
    const supabase = makeFakeSupabase([LIVE_ROW]);
    const result = await readForecastBasis(supabase);
    expect(result.available).toBe(true);
    expect(result.confidence).toBe('live');
    expect(result.forecast_basis.gantt_rule_LEGC).toMatch(/SEGREGATE/);
    expect(result.current_state).toMatchObject({ dispatchable_qf: 53, chairman_gated_held: 4 });
  });

  it('TS-9: a legacy flat-shape row returns confidence=legacy_flat_shape, does not throw', async () => {
    const supabase = makeFakeSupabase([{ metadata: { velocity_per_day: 1.2, open_scope_count: 30 } }]);
    const result = await readForecastBasis(supabase);
    expect(result.confidence).toBe('legacy_flat_shape');
    expect(result.forecast_basis).toBeNull();
  });

  it('TS-10: zero matching rows returns confidence=no_data, does not throw', async () => {
    const supabase = makeFakeSupabase([]);
    const result = await readForecastBasis(supabase);
    expect(result.confidence).toBe('no_data');
    expect(result.available).toBe(false);
  });

  it('a query error returns confidence=query_error, does not throw', async () => {
    const supabase = makeErroringSupabase();
    const result = await readForecastBasis(supabase);
    expect(result.confidence).toBe('query_error');
    expect(result.available).toBe(false);
  });

  it('a thrown exception is caught, returns confidence=query_error', async () => {
    const supabase = { from() { throw new Error('network down'); } };
    const result = await readForecastBasis(supabase);
    expect(result.confidence).toBe('query_error');
  });
});

describe('resolveCurrentState (TS-13)', () => {
  it('resolves the most-recent current_state_<date> key dynamically', () => {
    const basis = {
      current_state_20260719: { dispatchable_qf: 10 },
      current_state_20260721: { dispatchable_qf: 53 },
      current_state_20260720: { dispatchable_qf: 20 },
    };
    expect(resolveCurrentState(basis)).toEqual({ dispatchable_qf: 53 });
  });

  it('returns null when no current_state_* key is present (stale/absent basis)', () => {
    expect(resolveCurrentState({ gantt_rule_LEGC: 'x' })).toBeNull();
  });

  it('returns null for a null/non-object basis', () => {
    expect(resolveCurrentState(null)).toBeNull();
    expect(resolveCurrentState(undefined)).toBeNull();
  });
});
