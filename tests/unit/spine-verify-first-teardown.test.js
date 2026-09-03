// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A: unit tests for the seeded-thread teardown
// logic (agent-id-based, idempotent). The FR-6 scope fence that used to live here was
// retired by QF-20260903-616 — see the note at the foot of this file.

import { describe, it, expect, vi } from 'vitest';
import { teardownRun } from '../../scripts/harness/spine-verify-first-run.mjs';

// ---------------------------------------------------------------------------
// Chainable Supabase mock: .from(table).delete().in(col, ids) -> { error }
// ---------------------------------------------------------------------------
function createSupabaseMock(deleteResults = {}) {
  const calls = [];
  const supabase = {
    from(table) {
      return {
        delete() {
          return {
            in(col, ids) {
              calls.push({ table, col, ids });
              const result = deleteResults[table] ?? { error: null };
              return Promise.resolve(result);
            },
            eq(col, id) {
              calls.push({ table, col, ids: [id] });
              const result = deleteResults[table] ?? { error: null };
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  };
  return { supabase, calls };
}

describe('FR-5: teardownRun (agent-id-based, idempotent)', () => {
  it('deletes children before parents, keyed by the manifest agent ids, plus the venture row', async () => {
    const { supabase, calls } = createSupabaseMock();
    const manifest = {
      runId: 'test-run-1',
      ceoAgentId: 'ceo-1',
      vpAgentIds: { VP_STRATEGY: 'vp-1', VP_PRODUCT: 'vp-2' },
      crewAgentIds: ['crew-1', 'crew-2'],
      ventureId: 'venture-1',
    };

    const result = await teardownRun(supabase, manifest);

    expect(result.agentIdsRemoved).toBe(5);
    expect(result.ventureRemoved).toBe(true);

    const tables = calls.map((c) => c.table);
    expect(tables).toContain('tool_access_grants');
    expect(tables).toContain('agent_relationships');
    expect(tables).toContain('agent_messages');
    expect(tables).toContain('agent_budgets');
    expect(tables).toContain('agent_budget_logs');
    expect(tables).toContain('agent_predictions');
    expect(tables).toContain('agent_registry');
    expect(tables).toContain('ventures');

    // agent_registry (the parent row) is deleted AFTER its dependents.
    const registryIndex = tables.indexOf('agent_registry');
    const grantsIndex = tables.indexOf('tool_access_grants');
    expect(grantsIndex).toBeLessThan(registryIndex);

    // Every agent-scoped delete is keyed by the manifest's captured ids, not venture_id.
    const registryCall = calls.find((c) => c.table === 'agent_registry');
    expect(registryCall.ids.sort()).toEqual(['ceo-1', 'crew-1', 'crew-2', 'vp-1', 'vp-2'].sort());
  });

  it('is idempotent: a second run against the same manifest is a clean no-op', async () => {
    const { supabase } = createSupabaseMock();
    const manifest = {
      runId: 'test-run-2',
      ceoAgentId: 'ceo-1',
      vpAgentIds: {},
      crewAgentIds: [],
      ventureId: 'venture-1',
    };

    const first = await teardownRun(supabase, manifest);
    const second = await teardownRun(supabase, manifest);

    expect(first).toEqual(second);
  });

  it('surfaces aggregated errors instead of swallowing a partial failure', async () => {
    const { supabase } = createSupabaseMock({
      agent_registry: { error: { message: 'simulated FK violation' } },
    });
    const manifest = { runId: 'test-run-3', ceoAgentId: 'ceo-1', vpAgentIds: {}, crewAgentIds: [], ventureId: 'venture-1' };

    await expect(teardownRun(supabase, manifest)).rejects.toThrow(/agent_registry/);
  });

  it('handles an empty manifest (no agents created) without throwing', async () => {
    const { supabase } = createSupabaseMock();
    const manifest = { runId: 'test-run-4', ceoAgentId: null, vpAgentIds: {}, crewAgentIds: [], ventureId: null };

    const result = await teardownRun(supabase, manifest);
    expect(result.agentIdsRemoved).toBe(0);
    expect(result.ventureRemoved).toBe(false);
  });
});

// FR-6 (RETIRED 2026-09-03 by QF-20260903-616): the scope fence against Child B's in-flight
// venture-ceo-factory.js work is lifted. Its named justification,
// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B, completed 2026-07-12, so the fence outlived its
// cause by ~2 months while still blocking every touch of the file. Four sessions
// (QF-20260804-647, SD-ALTIFYAI-FDBK-FIX-HOUSEKEEPING-WEEKLY-REPORT-001, QF-20260901-018,
// QF-20260902-444) each correctly declined to cross it and deferred the CRLF renormalization
// of that file instead, while four unrelated completed SDs edited it with no incident — the
// fence was protecting nothing real. It was also blind by construction: an unreachable
// origin/main was swallowed into a silent pass, so it could report green having compared
// nothing. The renormalization ships in this same commit; the recurrence class is now held
// by tests/unit/gitattributes-eol-normalization.test.js.
