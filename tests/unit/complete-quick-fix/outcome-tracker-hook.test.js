/**
 * SD-LEO-INFRA-FIX-RECURRENCE-REWIRING-001 FR-4 (TS-5) — QF completion outcome-tracker hook.
 *
 * recordQfOutcomeOnComplete is additive to resolve-feedback.js's existing
 * resolution write (status/resolved_at/quick_fix_id/resolution_notes). This
 * pins the routing decision (escalated -> recordSdCompleted, else ->
 * recordQfCompleted) and proves both writers coexist on the same feedback row
 * without conflicting.
 */
import { describe, it, expect } from 'vitest';
import { recordQfOutcomeOnComplete } from '../../../scripts/modules/complete-quick-fix/orchestrator.js';
import { resolveFeedback } from '../../../lib/governance/resolve-feedback.js';

function makeFakeSupabase(tables) {
  function makeBuilder(tableName) {
    const filters = [];
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
        if (mutation.type === 'update') {
          const matched = matchedRows();
          matched.forEach((r) => Object.assign(r, mutation.payload));
          return { data: matched.map((r) => ({ ...r })), error: null };
        }
        if (mutation.type === 'insert') {
          const t = table();
          const rows = Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload];
          const inserted = rows.map((r, i) => ({ id: r.id ?? `gen-${tableName}-${t.length + i + 1}`, ...r }));
          t.push(...inserted);
          return { data: inserted.map((r) => ({ ...r })), error: null };
        }
        if (mutation.type === 'upsert') {
          const t = table();
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
      return { data: matchedRows().map((r) => ({ ...r })), error: null };
    }
    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push((r) => r[col] != null && r[col] === val); return builder; },
      neq(col, val) { filters.push((r) => r[col] != null && r[col] !== val); return builder; },
      is(col, val) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return builder; },
      in(col, vals) { filters.push((r) => r[col] != null && vals.includes(r[col])); return builder; },
      gte(col, val) { filters.push((r) => r[col] != null && r[col] >= val); return builder; },
      lte(col, val) { filters.push((r) => r[col] != null && r[col] <= val); return builder; },
      lt(col, val) { filters.push((r) => r[col] != null && r[col] < val); return builder; },
      gt(col, val) { filters.push((r) => r[col] != null && r[col] > val); return builder; },
      order() { return builder; },
      limit() { return builder; },
      update(payload) { mutation = { type: 'update', payload }; return builder; },
      insert(payload) { mutation = { type: 'insert', payload }; return builder; },
      upsert(payload, opts) { mutation = { type: 'upsert', payload, onConflict: opts?.onConflict }; return builder; },
      single() {
        const result = execute();
        if (!result.data?.length) return Promise.resolve({ data: null, error: { message: `${tableName}: not found` } });
        return Promise.resolve({ data: result.data[0], error: null });
      },
      then(resolve) { resolve(execute()); return Promise.resolve(); },
    };
    return builder;
  }
  return { from: (t) => makeBuilder(t) };
}

describe('recordQfOutcomeOnComplete routing', () => {
  it('routes to recordQfCompleted (schema-safe) for a non-escalated QF, never touching outcome_signals', async () => {
    const tables = {
      feedback: [
        { id: 'fb-1', quick_fix_id: 'QF-20260716-001', status: 'resolved', resolution_notes: 'Shipped via QF-20260716-001', metadata: { dedup_hash: 'x' } },
      ],
      outcome_signals: [],
    };
    const supabase = makeFakeSupabase(tables);

    const result = await recordQfOutcomeOnComplete(supabase, { escalated_to_sd_id: null }, 'QF-20260716-001');

    expect(result.qfId).toBe('QF-20260716-001');
    expect(result.taggedCount).toBe(1);
    expect(tables.outcome_signals).toHaveLength(0); // no FK-unsafe write attempted

    const row = tables.feedback[0];
    expect(row.metadata.outcome_tracked_via).toBe('qf_completion');
    expect(row.metadata.dedup_hash).toBe('x'); // pre-existing metadata preserved, not clobbered
    // resolve-feedback.js's own fields are untouched by this hook.
    expect(row.status).toBe('resolved');
    expect(row.resolution_notes).toBe('Shipped via QF-20260716-001');
  });

  it('ALSO records recordSdCompleted when the QF escalated to a real SD, without skipping its own quick_fix_id-linked feedback', async () => {
    // Regression for an adversarial-review finding: routing exclusively to
    // recordSdCompleted (which resolves via feedback.sd_id) would silently skip
    // tagging the feedback rows actually linked to this QF via quick_fix_id --
    // a different linkage. recordQfCompleted must ALWAYS run too.
    const tables = {
      strategic_directives_v2: [{ id: 'SD-ESCALATED-001', status: 'completed', completion_date: null }],
      feedback: [
        { id: 'fb-escalated', quick_fix_id: 'QF-20260716-002', status: 'resolved', metadata: {} },
      ],
      outcome_signals: [],
      sd_effectiveness_metrics: [],
    };
    const supabase = makeFakeSupabase(tables);

    const result = await recordQfOutcomeOnComplete(supabase, { escalated_to_sd_id: 'SD-ESCALATED-001' }, 'QF-20260716-002');

    // The SD-shaped signal still fires for the escalation target.
    expect(result.sd.linkedFeedbackCount).toBe(0);
    expect(tables.outcome_signals.some((s) => s.signal_type === 'sd_completion' && s.sd_id === 'SD-ESCALATED-001')).toBe(true);

    // But the QF's OWN linked feedback is still tagged -- not silently skipped.
    expect(result.qf.taggedCount).toBe(1);
    expect(tables.feedback[0].metadata.outcome_tracked_via).toBe('qf_completion');
  });

  it('regression: coexists with resolve-feedback.js on the same row without conflicting writes', async () => {
    const feedbackId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const tables = {
      feedback: [
        { id: feedbackId, status: 'new', quick_fix_id: null, resolution_notes: null, resolved_at: null, metadata: {} },
      ],
    };
    const supabase = makeFakeSupabase(tables);

    // Step 1: existing resolve-feedback.js path (runs first in the real orchestrator flow).
    const resolveResult = await resolveFeedback({
      supabase,
      feedbackId,
      quickFixId: 'QF-20260716-003',
      notes: 'Shipped via QF-20260716-003',
    });
    expect(resolveResult.updated).toBe(true);

    // Step 2: new, additive outcome-tracker hook (FR-4), same feedback row.
    const outcomeResult = await recordQfOutcomeOnComplete(supabase, { escalated_to_sd_id: null }, 'QF-20260716-003');
    expect(outcomeResult.taggedCount).toBe(1);

    const row = tables.feedback[0];
    // Both writers' fields present, neither clobbered the other.
    expect(row.status).toBe('resolved');
    expect(row.quick_fix_id).toBe('QF-20260716-003');
    expect(row.resolution_notes).toBe('Shipped via QF-20260716-003');
    expect(row.metadata.outcome_tracked_via).toBe('qf_completion');
  });
});
