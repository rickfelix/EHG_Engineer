/**
 * SD-LEO-INFRA-FIX-RECURRENCE-REWIRING-001 — FR-1/FR-2 unit tests. DB-free (seeded fixtures).
 *
 * TS-1: computeEffectiveness/recordSdCompleted resolve against `feedback` (not
 *       leo_feedback), mapping resolution_sd_id (not resolved_by_sd_id).
 * TS-2: a feedback row created via emitFeedback() triggers detectRecurrence
 *       exactly once via the vision-events bus, producing a real
 *       outcome_signals(signal_type='pattern_recurrence') row.
 * TS-3: a throwing FEEDBACK_CREATED subscriber does not propagate an error
 *       back to emitFeedback's caller.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeEffectiveness, recordSdCompleted } from '../../../lib/learning/outcome-tracker.js';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import { registerFeedbackCreatedHandlers, _resetFeedbackCreatedHandlers } from '../../../lib/eva/event-bus/handlers/feedback-created.js';
import { subscribeVisionEvent, VISION_EVENTS, clearVisionSubscribers } from '../../../lib/eva/event-bus/vision-events.js';

// ---- Minimal in-memory fake Supabase client, mutating seeded table arrays in place.
// Models SQL three-valued NULL logic for eq/neq/in/is, a postgres json arrow
// accessor (col->>key), and a generic order() comparator — mirrors the pattern
// established in tests/unit/roadmap/plan-of-record-linkage.test.js.
function parseCol(col) {
  if (col.includes('->>')) {
    const [base, key] = col.split('->>');
    return (r) => r[base]?.[key];
  }
  return (r) => r[col];
}

function makeFakeSupabase(tables) {
  function makeBuilder(tableName) {
    const filters = [];
    let orderCol = null;
    let orderAsc = true;
    let limitN = null;
    let rangeFrom = null;
    let rangeTo = null;
    let mutation = null;

    function table() {
      if (!tables[tableName]) tables[tableName] = [];
      return tables[tableName];
    }

    function matchedRows() {
      return table().filter((r) => filters.every((f) => f(r)));
    }

    function execute() {
      if (mutation) {
        const t = table();
        if (mutation.type === 'insert') {
          const rows = Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload];
          const inserted = rows.map((r, i) => ({ id: r.id ?? `gen-${tableName}-${t.length + i + 1}`, ...r }));
          t.push(...inserted);
          return { data: inserted.map((r) => ({ ...r })), error: null };
        }
        if (mutation.type === 'update') {
          const matched = matchedRows();
          matched.forEach((r) => Object.assign(r, mutation.payload));
          return { data: matched.map((r) => ({ ...r })), error: null };
        }
        if (mutation.type === 'upsert') {
          const conflictCols = mutation.onConflict ? mutation.onConflict.split(',') : null;
          const payloadArr = Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload];
          const out = [];
          for (const row of payloadArr) {
            const existing = conflictCols ? t.find((r) => conflictCols.every((c) => r[c] === row[c])) : null;
            if (existing) { Object.assign(existing, row); out.push(existing); }
            else { t.push({ ...row }); out.push(row); }
          }
          return { data: out.map((r) => ({ ...r })), error: null };
        }
      }
      let rows = matchedRows();
      if (orderCol) {
        rows = [...rows].sort((a, b) => {
          const av = a[orderCol], bv = b[orderCol];
          if (av == null && bv == null) return 0;
          if (av == null) return orderAsc ? -1 : 1;
          if (bv == null) return orderAsc ? 1 : -1;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      if (rangeFrom != null) rows = rows.slice(rangeFrom, rangeTo + 1);
      return { data: rows.map((r) => ({ ...r })), error: null, count: rows.length };
    }

    const builder = {
      select() { return builder; },
      eq(col, val) { const get = parseCol(col); filters.push((r) => get(r) != null && get(r) === val); return builder; },
      neq(col, val) { const get = parseCol(col); filters.push((r) => get(r) != null && get(r) !== val); return builder; },
      in(col, vals) { const get = parseCol(col); filters.push((r) => get(r) != null && vals.includes(get(r))); return builder; },
      is(col, val) { const get = parseCol(col); filters.push((r) => (val === null ? get(r) == null : get(r) === val)); return builder; },
      gte(col, val) { const get = parseCol(col); filters.push((r) => get(r) != null && get(r) >= val); return builder; },
      lte(col, val) { const get = parseCol(col); filters.push((r) => get(r) != null && get(r) <= val); return builder; },
      gt(col, val) { const get = parseCol(col); filters.push((r) => get(r) != null && get(r) > val); return builder; },
      lt(col, val) { const get = parseCol(col); filters.push((r) => get(r) != null && get(r) < val); return builder; },
      order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return builder; },
      limit(n) { limitN = n; return builder; },
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: fetchAllPaginated
      // range-paginates via .range(from, to) — extend the mock chain rather than
      // weaken the assertion (outcome-tracker's detectRecurrence now paginates).
      range(from, to) { rangeFrom = from; rangeTo = to; return builder; },
      update(payload) { mutation = { type: 'update', payload }; return builder; },
      insert(payload) { mutation = { type: 'insert', payload }; return builder; },
      upsert(payload, opts) { mutation = { type: 'upsert', payload, onConflict: opts?.onConflict }; return builder; },
      single() {
        const result = execute();
        if (!result.data || result.data.length === 0) {
          return Promise.resolve({ data: null, error: { message: `${tableName}: row not found` } });
        }
        return Promise.resolve({ data: result.data[0], error: null });
      },
      maybeSingle() {
        const result = execute();
        return Promise.resolve({ data: result.data?.[0] ?? null, error: null });
      },
      then(resolve) {
        resolve(execute());
        return Promise.resolve();
      },
    };
    return builder;
  }
  return { from: (t) => makeBuilder(t) };
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('outcome-tracker retable (FR-1 / TS-1)', () => {
  it('computeEffectiveness resolves pre/post counts from feedback, scoped to the linked sd_id', async () => {
    const tables = {
      strategic_directives_v2: [
        { id: 'sd-1', sd_key: 'SD-TEST-001', category: 'bug', completion_date: daysAgo(5), status: 'completed' },
      ],
      feedback: [
        { id: 'fb-1', sd_id: 'sd-1', created_at: daysAgo(10) },
        { id: 'fb-2', sd_id: 'sd-1', created_at: daysAgo(8) },
        { id: 'fb-3', sd_id: 'sd-1', created_at: daysAgo(2) },
      ],
      sd_effectiveness_metrics: [],
    };
    const supabase = makeFakeSupabase(tables);

    const result = await computeEffectiveness({ supabase, sdId: 'sd-1', completionTime: daysAgo(5) });

    expect(result.preCount).toBe(2);
    expect(result.postCount).toBe(1);
    expect(result.delta).toBe(-1);
    expect(tables.sd_effectiveness_metrics).toHaveLength(1);
    expect(tables.sd_effectiveness_metrics[0].sd_id).toBe('sd-1');
    expect(tables.sd_effectiveness_metrics[0].pre_feedback_count).toBe(2);
    expect(tables.sd_effectiveness_metrics[0].post_feedback_count).toBe(1);
  });

  it('recordSdCompleted resolves linked feedback via resolution_sd_id (not resolved_by_sd_id)', async () => {
    const tables = {
      strategic_directives_v2: [
        { id: 'sd-2', sd_key: 'SD-TEST-002', category: 'bug', completion_date: null, status: 'completed' },
      ],
      feedback: [
        { id: 'fb-open-1', sd_id: 'sd-2', status: 'new', resolution_sd_id: null },
        { id: 'fb-open-2', sd_id: 'sd-2', status: 'new', resolution_sd_id: null },
        { id: 'fb-already-resolved', sd_id: 'sd-2', status: 'resolved', resolution_sd_id: null },
        { id: 'fb-unrelated', sd_id: 'sd-other', status: 'new', resolution_sd_id: null },
      ],
      outcome_signals: [],
      sd_effectiveness_metrics: [],
    };
    const supabase = makeFakeSupabase(tables);

    const result = await recordSdCompleted({ supabase, sdId: 'sd-2', completionTime: new Date() });

    expect(result.linkedFeedbackCount).toBe(3);
    expect(result.resolvedCount).toBe(2);
    expect(result.backfilledCount).toBe(1);

    const byId = Object.fromEntries(tables.feedback.map((r) => [r.id, r]));
    expect(byId['fb-open-1'].status).toBe('resolved');
    expect(byId['fb-open-1'].resolution_sd_id).toBe('sd-2');
    expect(byId['fb-open-2'].status).toBe('resolved');
    expect(byId['fb-open-2'].resolution_sd_id).toBe('sd-2');
    // Already-resolved row gets its resolution_sd_id backfilled without touching status again.
    expect(byId['fb-already-resolved'].status).toBe('resolved');
    expect(byId['fb-already-resolved'].resolution_sd_id).toBe('sd-2');
    // Unrelated SD's feedback is untouched.
    expect(byId['fb-unrelated'].resolution_sd_id).toBe(null);

    expect(tables.outcome_signals.some((s) => s.signal_type === 'sd_completion' && s.sd_id === 'sd-2')).toBe(true);
  });
});

describe('detectRecurrence wiring via emitFeedback (FR-2 / TS-2, TS-3)', () => {
  beforeEach(() => {
    clearVisionSubscribers();
    _resetFeedbackCreatedHandlers();
  });

  it('a new feedback row inserted via emitFeedback triggers detectRecurrence exactly once and writes a real pattern_recurrence signal', async () => {
    registerFeedbackCreatedHandlers();

    const sameText = 'Login button overlaps the password field on iPhone screens';
    const tables = {
      strategic_directives_v2: [
        { id: 'sd-3', sd_key: 'SD-TEST-003', category: 'bug', completion_date: daysAgo(5), status: 'completed' },
      ],
      feedback: [
        {
          id: 'fb-old-pattern',
          title: sameText,
          description: sameText,
          status: 'resolved',
          resolution_sd_id: 'sd-3',
          created_at: daysAgo(6),
          category: 'ui_bug',
          metadata: { dedup_hash: 'sentinel-old-hash' },
        },
      ],
      outcome_signals: [],
    };
    const supabase = makeFakeSupabase(tables);

    const insertResult = await emitFeedback({
      supabase,
      title: sameText,
      description: sameText,
      category: 'ui_bug',
      dedup_key: 'new-report-1',
      metadata: { deferred_from_sd_key: 'n/a' }, // short-circuits the v_active_sessions lookup
    });

    expect(insertResult.deduped).toBe(false);

    // Fire-and-forget handler chain — give it a tick to settle (matches the
    // convention in tests/unit/eva/feedback-quality-updated-handler.test.js).
    await new Promise((resolve) => setTimeout(resolve, 100));

    const recurrenceSignals = tables.outcome_signals.filter((s) => s.signal_type === 'pattern_recurrence');
    expect(recurrenceSignals).toHaveLength(1);
    expect(recurrenceSignals[0].sd_id).toBe('sd-3');
    expect(recurrenceSignals[0].source_feedback_id).toBe(insertResult.id);
  });

  it('a throwing FEEDBACK_CREATED subscriber does not propagate an error back to emitFeedback', async () => {
    subscribeVisionEvent(VISION_EVENTS.FEEDBACK_CREATED, () => {
      throw new Error('simulated subscriber failure');
    });

    const tables = { feedback: [] };
    const supabase = makeFakeSupabase(tables);

    await expect(emitFeedback({
      supabase,
      title: 'Some new issue',
      description: 'Some new issue description',
      metadata: { deferred_from_sd_key: 'n/a' },
    })).resolves.toMatchObject({ deduped: false });

    expect(tables.feedback).toHaveLength(1);
  });
});
