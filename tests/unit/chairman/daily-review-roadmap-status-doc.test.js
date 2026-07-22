/**
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-A — unit tests. DB-free (seeded fixtures).
 */
import { describe, it, expect } from 'vitest';
import { buildRoadmapStatusDoc } from '../../../lib/chairman/daily-review/roadmap-status-doc.js';

// ---- Minimal in-memory fake Supabase client for this module's query shapes
// (select/eq/in/gte/order, no updates needed).
function makeFakeSupabase(tables) {
  function query(tableName) {
    const filters = [];
    let orderCol = null;
    let orderAsc = true;
    let limitN = null;

    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push((r) => r[col] === val); return builder; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
      gte(col, val) { filters.push((r) => r[col] != null && r[col] >= val); return builder; },
      order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return builder; },
      limit(n) { limitN = n; return builder; },
      then(resolve) {
        const table = tables[tableName] || [];
        let matched = table.filter((r) => filters.every((f) => f(r)));
        if (orderCol) {
          matched = [...matched].sort((a, b) => {
            const av = a[orderCol], bv = b[orderCol];
            if (av == null && bv == null) return 0;
            if (av == null) return orderAsc ? -1 : 1;
            if (bv == null) return orderAsc ? 1 : -1;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        if (Number.isFinite(limitN)) matched = matched.slice(0, limitN);
        // FR-6: computeForecastRange() reads { count } from a head:true/count:'exact' select —
        // mirror that shape here (matched.length is the exact count a real count:'exact' query
        // would return for these same filters).
        resolve({ data: matched.map((r) => ({ ...r })), count: matched.length, error: null });
        return Promise.resolve();
      },
    };
    return builder;
  }
  return { from: (t) => query(t) };
}

// A live-shaped forecast_basis feedback row (SD-LEO-INFRA-DAILY-BRIEF-E2E-WIRING-001 FR-1),
// mirroring the real live row (fa101872-844f-44c9-b000-23bf88199437) queried directly during
// PLAN-phase discovery — dispatchable_qf dominates chairman_gated_held, so pickDominantDispatchClass
// resolves 'open_queue'.
function makeForecastBasisRow({ dispatchableQf = 53, gatedHeld = 4, fencedSet = 'fleet_desired_slots + apply-5-migrations + chairman email creds' } = {}) {
  return {
    category: 'solomon_forecast_basis',
    created_at: new Date().toISOString(),
    metadata: {
      forecast_basis: {
        gantt_rule_LEGC: 'SEGREGATE fenced/chairman-gated items...',
        dispatch_class_model: {
          open_queue: { queue_wait_median_hrs: 9.5, queue_wait_p90_hrs: 91 },
        },
        work_time_model_started_to_completed: {
          sd_tier: { median_hrs: 1.5, p90_hrs: 4.5 },
        },
        current_state_20260721: {
          dispatchable_qf: dispatchableQf,
          chairman_gated_held: gatedHeld,
          fenced_set: fencedSet,
        },
      },
    },
  };
}

// A supabase double whose strategic_roadmaps query throws, to exercise the fail-soft path.
function makeThrowingSupabase(tables) {
  const real = makeFakeSupabase(tables);
  return {
    from(tableName) {
      if (tableName === 'strategic_roadmaps') {
        return { select: () => ({ eq: () => ({ then: () => { throw new Error('connection reset'); } }) }) };
      }
      return real.from(tableName);
    },
  };
}

// A supabase double whose narrative in_flight query throws, to exercise buildNarrativeSection's
// fail-soft path in isolation — the plan_of_record section's strategic_directives_v2 (forecast)
// query uses status='completed', never 'in_progress', so it is unaffected.
function makeNarrativeThrowingSupabase(tables) {
  const real = makeFakeSupabase(tables);
  return {
    from(tableName) {
      if (tableName === 'strategic_directives_v2') {
        return {
          select() {
            return {
              eq(col, val) {
                if (col === 'status' && val === 'in_progress') {
                  return { order: () => ({ then: () => { throw new Error('narrative in-flight query failed'); } }) };
                }
                return real.from(tableName).select().eq(col, val);
              },
            };
          },
        };
      }
      return real.from(tableName);
    },
  };
}

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 24 * 3_600_000).toISOString();

describe('buildRoadmapStatusDoc — plan_of_record section', () => {
  it('degrades to an unavailable-labelled section when no canonical roadmap exists (never throws)', async () => {
    const supabase = makeFakeSupabase({ strategic_roadmaps: [], strategic_directives_v2: [] });
    const result = await buildRoadmapStatusDoc(supabase);
    const por = result.sections.find((s) => s.id === 'plan_of_record');
    expect(por.available).toBe(false);
    expect(por.text).toMatch(/no canonical roadmap/);
  });

  it('degrades to an unavailable-labelled section on a query error (fail-soft, never throws)', async () => {
    const supabase = makeThrowingSupabase({ strategic_directives_v2: [] });
    const result = await buildRoadmapStatusDoc(supabase);
    const por = result.sections.find((s) => s.id === 'plan_of_record');
    expect(por.available).toBe(false);
    expect(por.text).toMatch(/data unavailable/);
    // narrative section must still be produced independently
    const narrative = result.sections.find((s) => s.id === 'narrative');
    expect(narrative.available).toBe(true);
  });

  it('summarizes per-wave item counts, calibrated probability, progress_pct, and overall %', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [
        { id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 50, confidence_score: 0.8 },
        { id: 'w2', roadmap_id: 'r1', title: 'Wave 2', sequence_rank: 2, status: 'approved', progress_pct: 0, confidence_score: 0.4 },
      ],
      v_plan_of_record_remainder: [
        { id: 'i1', wave_id: 'w1', item_disposition: 'promoted', promoted_to_sd_key: 'SD-X-001', remainder_state: 'satisfied_elsewhere' },
        { id: 'i2', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' },
        { id: 'i3', wave_id: 'w2', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' },
      ],
      strategic_directives_v2: [],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const por = result.sections.find((s) => s.id === 'plan_of_record');
    expect(por.available).toBe(true);
    expect(por.data.waves).toHaveLength(2);
    expect(por.data.waves[0]).toMatchObject({
      wave_id: 'w1',
      calibrated_probability: 0.8,
      progress_pct: 50,
      item_counts: { total: 2, promoted: 1 },
    });
    expect(por.data.overall_pct).toBeCloseTo(33.3, 1); // 1 promoted of 3 total
  });

  it('TS-17: returns forecast confidence=insufficient_data (no fabricated date) when no forecast_basis feedback row exists', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const por = result.sections.find((s) => s.id === 'plan_of_record');
    expect(por.data.forecast.confidence).toBe('insufficient_data');
    expect(por.data.forecast.expected_date).toBeNull();
  });

  it('FR-1: produces an optimistic <= expected <= pessimistic calibrated forecast date range from the live forecast_basis', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [
        { id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' },
        { id: 'i2', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' },
      ],
      strategic_directives_v2: [],
      feedback: [makeForecastBasisRow()],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('calibrated');
    expect(f.dispatch_class).toBe('open_queue');
    expect(new Date(f.optimistic_date).getTime()).toBeLessThanOrEqual(new Date(f.expected_date).getTime());
    expect(new Date(f.expected_date).getTime()).toBeLessThanOrEqual(new Date(f.pessimistic_date).getTime());
  });

  it('TS-14/TR-3: surfaces a gating_note (fail-closed visibility) when fleet capacity is partially gated, without fabricating a per-item date suppression', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [makeForecastBasisRow({ gatedHeld: 4 })],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.gating_note).toMatch(/4 fleet item\(s\) currently gated-on-chairman-action/);
  });

  it('QF-20260722-717 (supersedes former TS-3/TR-3): gated volume >= dispatchable volume now yields a fenced-dominant, dispatchable-only calibrated forecast instead of insufficient_data', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [makeForecastBasisRow({ dispatchableQf: 2, gatedHeld: 10 })],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('calibrated');
    expect(f.dispatch_class).toBe('open_queue');
    expect(f.fenced_dominant).toBe(true);
    expect(f.expected_date).not.toBeNull();
    expect(f.gating_note).toMatch(/DISPATCHABLE-ONLY capacity — 10 chairman-gated item\(s\)/);
  });

  it('QF-20260722-717 (supersedes former PR #6387 adversarial finding): an exact tie (dispatchable === gated) is fenced-dominant — still a calibrated dispatchable-only forecast, never fabricated as plain open_queue', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [makeForecastBasisRow({ dispatchableQf: 10, gatedHeld: 10 })],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('calibrated');
    expect(f.fenced_dominant).toBe(true);
    expect(f.expected_date).not.toBeNull();
  });

  it('QF-20260722-717: dispatchable strictly exceeding gated resolves fenced_dominant=false with the original gating_note framing', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [makeForecastBasisRow({ dispatchableQf: 53, gatedHeld: 4 })],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('calibrated');
    expect(f.fenced_dominant).toBe(false);
    expect(f.gating_note).toMatch(/^4 fleet item\(s\) currently gated-on-chairman-action/);
  });

  it('QF-20260722-717 FAIL-LOUD: current_state missing dispatchable_qf/chairman_gated_held names the missing fields instead of a silent insufficient_data', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [{
        category: 'solomon_forecast_basis',
        created_at: new Date().toISOString(),
        metadata: {
          forecast_basis: {
            gantt_rule_LEGC: 'SEGREGATE...',
            dispatch_class_model: { open_queue: { queue_wait_median_hrs: 9.5, queue_wait_p90_hrs: 91 } },
            work_time_model_started_to_completed: { sd_tier: { median_hrs: 1.5, p90_hrs: 4.5 } },
            current_state_20260721: { fenced_set: 'x' }, // re-stamp dropped both fields
          },
        },
      }],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.degraded_reason).toBe('schema_incomplete');
    expect(f.degraded_detail).toMatch(/dispatchable_qf/);
    expect(f.degraded_detail).toMatch(/chairman_gated_held/);
    const por = result.sections.find((s) => s.id === 'plan_of_record');
    expect(por.text).toMatch(/insufficient data \[schema_incomplete\]/);
  });

  it('QF-20260722-717 FAIL-LOUD: a resolved dispatch class whose model is missing queue_wait_median_hrs names the field, distinct from a plain no_data case', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [{
        category: 'solomon_forecast_basis',
        created_at: new Date().toISOString(),
        metadata: {
          forecast_basis: {
            gantt_rule_LEGC: 'SEGREGATE...',
            dispatch_class_model: {}, // open_queue entry missing entirely
            work_time_model_started_to_completed: { sd_tier: { median_hrs: 1.5, p90_hrs: 4.5 } },
            current_state_20260721: { dispatchable_qf: 53, chairman_gated_held: 4, fenced_set: 'x' },
          },
        },
      }],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.degraded_reason).toBe('schema_incomplete');
    expect(f.degraded_detail).toMatch(/dispatch_class_model\.open_queue\.queue_wait_median_hrs/);
  });

  it('QF-20260722-717: the pre-existing no-basis-row insufficient_data case is now labeled degraded_reason="no_data"', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.degraded_reason).toBe('no_data');
  });

  it('QF-20260722-717 adversarial-verify finding: a wrong-type current_state field (present but non-numeric) is caught as schema_incomplete, not silently coerced to 0', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [makeForecastBasisRow({ dispatchableQf: 'unknown', gatedHeld: 5 })],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.degraded_reason).toBe('schema_incomplete');
    expect(f.degraded_detail).toMatch(/dispatchable_qf/);
  });

  it('QF-20260722-717 adversarial-verify finding: a 0/0 (nothing dispatchable, nothing gated) belt is NOT reported as fenced_dominant', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [makeForecastBasisRow({ dispatchableQf: 0, gatedHeld: 0 })],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('calibrated');
    expect(f.fenced_dominant).toBe(false);
    expect(f.gating_note).toBeNull();
  });

  it('QF-20260722-717 adversarial-verify finding: a missing work_time_model is named as schema_incomplete, symmetric with the queue-side guard', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [{
        category: 'solomon_forecast_basis',
        created_at: new Date().toISOString(),
        metadata: {
          forecast_basis: {
            gantt_rule_LEGC: 'SEGREGATE...',
            dispatch_class_model: { open_queue: { queue_wait_median_hrs: 9.5, queue_wait_p90_hrs: 91 } },
            // work_time_model_started_to_completed dropped entirely
            current_state_20260721: { dispatchable_qf: 53, chairman_gated_held: 4, fenced_set: 'x' },
          },
        },
      }],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.degraded_reason).toBe('schema_incomplete');
    expect(f.degraded_detail).toMatch(/work_time_model_started_to_completed/);
  });

  it('adversarial-review finding (PR #6387)/TR-3: a negative queue_wait_median_hrs (corrupted basis) does not fabricate a past date', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [{
        category: 'solomon_forecast_basis',
        created_at: new Date().toISOString(),
        metadata: {
          forecast_basis: {
            gantt_rule_LEGC: 'SEGREGATE...',
            dispatch_class_model: { open_queue: { queue_wait_median_hrs: -5, queue_wait_p90_hrs: 91 } },
            work_time_model_started_to_completed: { sd_tier: { median_hrs: 1.5, p90_hrs: 4.5 } },
            current_state_20260721: { dispatchable_qf: 53, chairman_gated_held: 4, fenced_set: 'x' },
          },
        },
      }],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.expected_date).toBeNull();
  });

  it('adversarial-review finding (PR #6387)/TR-3: an inverted percentile (p90 < median, corrupted basis) does not fabricate an inverted date range', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [{
        category: 'solomon_forecast_basis',
        created_at: new Date().toISOString(),
        metadata: {
          forecast_basis: {
            gantt_rule_LEGC: 'SEGREGATE...',
            dispatch_class_model: { open_queue: { queue_wait_median_hrs: 20, queue_wait_p90_hrs: 5 } }, // p90 < median
            work_time_model_started_to_completed: { sd_tier: { median_hrs: 1.5, p90_hrs: 4.5 } },
            current_state_20260721: { dispatchable_qf: 53, chairman_gated_held: 4, fenced_set: 'x' },
          },
        },
      }],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.expected_date).toBeNull();
  });

  it('TS-13: resolves a date-stamped current_state_<date> key dynamically rather than a hardcoded literal', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [{
        category: 'solomon_forecast_basis',
        created_at: new Date().toISOString(),
        metadata: {
          forecast_basis: {
            gantt_rule_LEGC: 'SEGREGATE...',
            dispatch_class_model: { open_queue: { queue_wait_median_hrs: 9.5, queue_wait_p90_hrs: 91 } },
            work_time_model_started_to_completed: { sd_tier: { median_hrs: 1.5, p90_hrs: 4.5 } },
            current_state_20260722: { dispatchable_qf: 53, chairman_gated_held: 4, fenced_set: 'x' }, // a DIFFERENT (tomorrow's) date-stamp
          },
        },
      }],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('calibrated');
    expect(f.gating_note).toMatch(/4 fleet item\(s\)/);
  });

  it('TS-17: a legacy flat-shape feedback row degrades to insufficient_data, does not throw', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'approved', progress_pct: 0, confidence_score: 0.5 }],
      v_plan_of_record_remainder: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null, remainder_state: 'promotable_now' }],
      strategic_directives_v2: [],
      feedback: [{ category: 'solomon_forecast_basis', created_at: new Date().toISOString(), metadata: { velocity_per_day: 1.2, open_scope_count: 30 } }],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('insufficient_data');
    expect(f.expected_date).toBeNull();
  });
});

describe('buildRoadmapStatusDoc — narrative section', () => {
  it('includes SDs completed within the window (sinceIso) and excludes ones outside it', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [],
      strategic_directives_v2: [
        { sd_key: 'SD-IN-001', title: 'In window', status: 'completed', completion_date: hoursAgo(2), target_application: 'EHG' },
        { sd_key: 'SD-OUT-001', title: 'Out of window', status: 'completed', completion_date: hoursAgo(48), target_application: 'EHG' },
      ],
    });
    const result = await buildRoadmapStatusDoc(supabase, { sinceIso: hoursAgo(24) });
    const narrative = result.sections.find((s) => s.id === 'narrative');
    expect(narrative.data.completed_since).toHaveLength(1);
    expect(narrative.data.completed_since[0].sd_key).toBe('SD-IN-001');
  });

  it('includes all in_progress SDs regardless of roadmap linkage', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [],
      strategic_directives_v2: [
        { sd_key: 'SD-IP-001', title: 'In flight', status: 'in_progress', current_phase: 'EXEC', updated_at: hoursAgo(1) },
        { sd_key: 'SD-DRAFT-001', title: 'Not yet started', status: 'draft', current_phase: 'LEAD', updated_at: hoursAgo(1) },
      ],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const narrative = result.sections.find((s) => s.id === 'narrative');
    expect(narrative.data.in_flight).toHaveLength(1);
    expect(narrative.data.in_flight[0].sd_key).toBe('SD-IP-001');
  });

  it('degrades the narrative section to unavailable on a query error, while plan_of_record still builds independently', async () => {
    const supabase = makeNarrativeThrowingSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 50, confidence_score: 0.8 }],
      roadmap_wave_items: [{ id: 'i1', wave_id: 'w1', item_disposition: 'promoted', promoted_to_sd_key: 'SD-X-001' }],
      strategic_directives_v2: [],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const narrative = result.sections.find((s) => s.id === 'narrative');
    expect(narrative.available).toBe(false);
    expect(narrative.text).toMatch(/data unavailable/);
    const por = result.sections.find((s) => s.id === 'plan_of_record');
    expect(por.available).toBe(true);
  });
});

describe('buildRoadmapStatusDoc — top-level shape', () => {
  it('returns {title, sections[], plainTextBody, generated_at} with both sections present, no HTML/MMS markup', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 50, confidence_score: 0.8 }],
      roadmap_wave_items: [{ id: 'i1', wave_id: 'w1', item_disposition: 'promoted', promoted_to_sd_key: 'SD-X-001' }],
      strategic_directives_v2: [
        { sd_key: 'SD-X-001', title: 'Shipped thing', status: 'completed', completion_date: hoursAgo(2), target_application: 'EHG' },
        { sd_key: 'SD-Y-001', title: 'In progress thing', status: 'in_progress', current_phase: 'EXEC', updated_at: hoursAgo(1) },
      ],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    expect(result.title).toMatch(/^Daily Review — \d{4}-\d{2}-\d{2}$/);
    expect(result.sections).toHaveLength(2);
    expect(result.sections.map((s) => s.id)).toEqual(['plan_of_record', 'narrative']);
    expect(result.plainTextBody).toContain('PLAN OF RECORD');
    expect(result.plainTextBody).toContain('WHAT MOVED YESTERDAY / PLAN FOR TODAY');
    expect(result.plainTextBody).toContain('SD-X-001');
    expect(result.plainTextBody).toContain('SD-Y-001');
    expect(result.plainTextBody).not.toMatch(/<[a-z]+>/i);
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
