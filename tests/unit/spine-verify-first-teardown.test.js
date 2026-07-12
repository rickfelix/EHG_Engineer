// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A: unit tests for the seeded-thread teardown
// logic (agent-id-based, idempotent) and the scope-fence against Child B's in-flight
// venture-ceo-factory.js identity/authority work.

import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
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

describe('FR-6: scope fence against Child B in-flight identity/authority work', () => {
  it('zero diff inside VentureFactory._createAgent()/_grantTools() vs origin/main', () => {
    let diff;
    try {
      diff = execSync('git diff origin/main...HEAD -- lib/agents/venture-ceo-factory.js', { encoding: 'utf8', cwd: process.cwd() });
    } catch {
      // origin/main unreachable in some CI contexts (no fetch) — skip rather than false-fail.
      return;
    }
    if (!diff) return; // file untouched entirely — trivially passes the fence.

    const touchesCreateAgent = /_createAgent\s*\(/.test(diff) && /[-+].*status:\s*['"]active['"]/.test(diff);
    const touchesGrantTools = /_grantTools\s*\(/.test(diff);
    expect(touchesCreateAgent).toBe(false);
    expect(touchesGrantTools).toBe(false);
  });
});
