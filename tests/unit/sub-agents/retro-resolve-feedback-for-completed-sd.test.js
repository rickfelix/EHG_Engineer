/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-F
 *
 * lib/sub-agents/retro/db-operations.js's resolveFeedbackForCompletedSD() writes only
 * lifecycle columns (status, resolution_notes, updated_at) to `feedback` -- confirmed against
 * database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql's WHEN-clause
 * census, already exempted from the append-only trigger with no code change needed. This is a
 * verification-only regression test proving the lifecycle UPDATE actually lands.
 */
import { describe, it, expect } from 'vitest';
import { resolveFeedbackForCompletedSD } from '../../../lib/sub-agents/retro/db-operations.js';

function makeFakeSupabase(feedbackRows) {
  const rows = feedbackRows.map((r) => ({ ...r }));
  return {
    _rows: rows,
    from(table) {
      if (table !== 'feedback') throw new Error(`unexpected table: ${table}`);
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(col, val) { filters.push((r) => r[col] === val); return builder; },
        in(col, vals) {
          if (Array.isArray(vals)) filters.push((r) => vals.includes(r[col]));
          return builder;
        },
        update(patch) {
          return {
            in(col, ids) {
              let count = 0;
              for (const r of rows) {
                if (ids.includes(r[col])) { Object.assign(r, patch); count++; }
              }
              return Promise.resolve({ error: null, count });
            },
          };
        },
        then(resolve, reject) {
          const matched = rows.filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

describe('resolveFeedbackForCompletedSD (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-F, verification-only)', () => {
  it('resolves retrospective-sourced feedback for a completed SD via a lifecycle-only update', async () => {
    const sb = makeFakeSupabase([
      { id: 'fb-1', sd_id: 'SD-DONE-001', source_type: 'retrospective', status: 'new' },
      { id: 'fb-2', sd_id: 'SD-DONE-001', source_type: 'retrospective', status: 'triaged' },
      { id: 'fb-3', sd_id: 'SD-DONE-001', source_type: 'retrospective', status: 'acknowledged' }, // already terminal, excluded by the query
      { id: 'fb-other', sd_id: 'SD-OTHER-002', source_type: 'retrospective', status: 'new' },
    ]);

    const result = await resolveFeedbackForCompletedSD(sb, 'SD-DONE-001');

    expect(result.resolved).toBe(2);
    expect(result.error).toBeUndefined();
    expect(sb._rows.find((r) => r.id === 'fb-1').status).toBe('acknowledged');
    expect(sb._rows.find((r) => r.id === 'fb-2').status).toBe('acknowledged');
    expect(sb._rows.find((r) => r.id === 'fb-3').status).toBe('acknowledged'); // untouched, already terminal
    expect(sb._rows.find((r) => r.id === 'fb-other').status).toBe('new'); // untouched, different SD
  });

  it('returns resolved:0 with no items to resolve', async () => {
    const sb = makeFakeSupabase([]);
    const result = await resolveFeedbackForCompletedSD(sb, 'SD-EMPTY-001');
    expect(result.resolved).toBe(0);
  });
});
