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

    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push((r) => r[col] === val); return builder; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
      gte(col, val) { filters.push((r) => r[col] != null && r[col] >= val); return builder; },
      order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return builder; },
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
        resolve({ data: matched.map((r) => ({ ...r })), error: null });
        return Promise.resolve();
      },
    };
    return builder;
  }
  return { from: (t) => query(t) };
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
        { id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 50, confidence_score: 0.8 },
        { id: 'w2', roadmap_id: 'r1', title: 'Wave 2', sequence_rank: 2, status: 'approved', progress_pct: 0, confidence_score: 0.4 },
      ],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'w1', item_disposition: 'promoted', promoted_to_sd_key: 'SD-X-001' },
        { id: 'i2', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null },
        { id: 'i3', wave_id: 'w2', item_disposition: 'pending', promoted_to_sd_key: null },
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

  it('returns forecast confidence=insufficient_data when no recent completions exist', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 0, confidence_score: 0.5 }],
      roadmap_wave_items: [{ id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null }],
      strategic_directives_v2: [],
    });
    const result = await buildRoadmapStatusDoc(supabase);
    const por = result.sections.find((s) => s.id === 'plan_of_record');
    expect(por.data.forecast.confidence).toBe('insufficient_data');
    expect(por.data.forecast.expected_date).toBeNull();
  });

  it('produces an optimistic <= expected <= pessimistic forecast date range when velocity > 0', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 0, confidence_score: 0.5 }],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null },
        { id: 'i2', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null },
      ],
      strategic_directives_v2: [
        { sd_key: 'SD-A-001', status: 'completed', completion_date: daysAgo(1) },
        { sd_key: 'SD-B-001', status: 'completed', completion_date: daysAgo(3) },
        { sd_key: 'SD-C-001', status: 'completed', completion_date: daysAgo(30) }, // outside lookback
      ],
    });
    const result = await buildRoadmapStatusDoc(supabase, { velocityLookbackDays: 14 });
    const f = result.sections.find((s) => s.id === 'plan_of_record').data.forecast;
    expect(f.confidence).toBe('medium'); // 2 completions in window
    expect(new Date(f.optimistic_date).getTime()).toBeLessThanOrEqual(new Date(f.expected_date).getTime());
    expect(new Date(f.expected_date).getTime()).toBeLessThanOrEqual(new Date(f.pessimistic_date).getTime());
  });

  it('returns forecast confidence=high at >=5 completions in the lookback window', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 0, confidence_score: 0.5 }],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null },
        { id: 'i2', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null },
      ],
      strategic_directives_v2: Array.from({ length: 5 }, (_, i) => ({
        sd_key: `SD-H-${i}`, status: 'completed', completion_date: daysAgo(i + 1),
      })),
    });
    const result = await buildRoadmapStatusDoc(supabase, { velocityLookbackDays: 14 });
    expect(result.sections.find((s) => s.id === 'plan_of_record').data.forecast.confidence).toBe('high');
  });

  it('returns forecast confidence=low at 1 completion in the lookback window', async () => {
    const supabase = makeFakeSupabase({
      strategic_roadmaps: [{ id: 'r1', title: 'Main Roadmap', status: 'active', current_baseline_version: 0 }],
      roadmap_waves: [{ id: 'w1', roadmap_id: 'r1', title: 'Wave 1', sequence_rank: 1, status: 'active', progress_pct: 0, confidence_score: 0.5 }],
      roadmap_wave_items: [
        { id: 'i1', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null },
        { id: 'i2', wave_id: 'w1', item_disposition: 'pending', promoted_to_sd_key: null },
      ],
      strategic_directives_v2: [{ sd_key: 'SD-L-1', status: 'completed', completion_date: daysAgo(1) }],
    });
    const result = await buildRoadmapStatusDoc(supabase, { velocityLookbackDays: 14 });
    expect(result.sections.find((s) => s.id === 'plan_of_record').data.forecast.confidence).toBe('low');
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
