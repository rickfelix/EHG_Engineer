/**
 * SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-1) — runEnforcement's new `tables` scoping option.
 * eva_scheduler_metrics needs a cadence more frequent than the shared weekly cron; the --table
 * flag lets a workflow scope a run to one (or a few) registered table(s) without touching the
 * other 15+ tables' shared weekly behavior. These tests pin that the scoping is real (only the
 * requested table's policy is processed) and that omitting `tables` stays byte-identical to the
 * full-registry behavior that existed before this SD.
 */
import { describe, it, expect, vi } from 'vitest';

const { stampLastFired } = vi.hoisted(() => ({ stampLastFired: vi.fn(async () => {}) }));
vi.mock('../../../lib/periodic-liveness/stamp-last-fired.js', () => ({ stampLastFired }));

let insertedRunPayload = null;
const processedTables = [];

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from(table) {
      if (table === 'retention_runs') {
        return { insert: async (row) => { insertedRunPayload = row; return { data: null, error: null }; } };
      }
      processedTables.push(table);
      const chain = {
        select: () => chain,
        lt: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve) => resolve({ count: 0, data: [], error: null }),
      };
      return chain;
    },
  }),
}));

import { runEnforcement } from '../../../scripts/retention-enforce.js';
import { RETENTION_POLICIES } from '../../../lib/retention/policies.js';

describe('runEnforcement table scoping (FR-1)', () => {
  it('tables: ["eva_scheduler_metrics"] processes ONLY that table', async () => {
    processedTables.length = 0;
    insertedRunPayload = null;
    await runEnforcement({ apply: false, tables: ['eva_scheduler_metrics'] });
    expect(processedTables).toEqual(['eva_scheduler_metrics']);
    expect(insertedRunPayload.per_table).toHaveLength(1);
    expect(insertedRunPayload.per_table[0].table).toBe('eva_scheduler_metrics');
    expect(Object.keys(insertedRunPayload.caps.perRunCaps)).toEqual(['eva_scheduler_metrics']);
  });

  it('omitting tables processes the full registry, unchanged from pre-FR-1 behavior', async () => {
    processedTables.length = 0;
    insertedRunPayload = null;
    await runEnforcement({ apply: false });
    expect(processedTables).toEqual(RETENTION_POLICIES.map((p) => p.table));
    expect(insertedRunPayload.per_table).toHaveLength(RETENTION_POLICIES.length);
  });

  it('an unknown table name in the filter is ignored, never invented as a phantom policy', async () => {
    processedTables.length = 0;
    insertedRunPayload = null;
    await runEnforcement({ apply: false, tables: ['not_a_real_table', 'eva_scheduler_metrics'] });
    expect(processedTables).toEqual(['eva_scheduler_metrics']);
  });

  it('tables: [] (empty array) falls back to the full registry, not zero tables', async () => {
    processedTables.length = 0;
    insertedRunPayload = null;
    await runEnforcement({ apply: false, tables: [] });
    expect(processedTables).toEqual(RETENTION_POLICIES.map((p) => p.table));
  });
});
