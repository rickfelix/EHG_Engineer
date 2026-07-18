/**
 * SD-LEO-INFRA-EVIDENCE-DEDUP-PHASE-KEY-001
 *
 * Reproduces and pins the fix for fb 0b12ca77: the TR-003 dedup check in
 * results-storage.js was phase-blind, so a multi-phase SD's second-phase call
 * (e.g. EXEC after PLAN) matched the first phase's row and overwrote it in
 * place -- corrupting created_at (frozen at the earlier phase's time) and
 * making the row invisible to GATE_SUBAGENT_EVIDENCE's freshness check for the
 * later phase. The fix scopes the dedup match to the SAME phase (or both null).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Stateful mock: tracks inserted/updated rows in a simple array so the dedup
 * query's .eq('sd_id')/.eq('sub_agent_code')/.eq('phase') or .is('phase', null)
 * filters can be honored against genuinely distinct simulated rows -- unlike a
 * mock that always returns an empty existing-rows array, this can prove the
 * fix actually discriminates by phase.
 */
function makeStatefulMockSupabase(rows) {
  let nextId = 1;
  return {
    from(table) {
      const filters = {};
      const builder = {
        select() { return builder; },
        eq(col, val) { filters[col] = { op: 'eq', val }; return builder; },
        is(col, val) { filters[col] = { op: 'is', val }; return builder; },
        gte(col, val) { filters[col] = { ...(filters[col] || {}), gte: val }; return builder; },
        order() { return builder; },
        limit() {
          const matches = rows.filter((r) => {
            return Object.entries(filters).every(([col, f]) => {
              if (f.op === 'is') return r[col] === null || r[col] === undefined;
              if (f.op === 'eq') return r[col] === f.val;
              return true;
            });
          });
          return Promise.resolve({ data: matches.map((r) => ({ id: r.id })), error: null });
        },
        insert(record) {
          const row = { id: `row-${nextId++}`, ...record };
          rows.push(row);
          return {
            select() {
              return { single: async () => ({ data: row, error: null }) };
            },
          };
        },
        update(fields) {
          return {
            eq(_col, id) {
              return {
                select() {
                  return {
                    single: async () => {
                      const row = rows.find((r) => r.id === id);
                      Object.assign(row, fields);
                      return { data: row, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
      return builder;
    },
  };
}

describe('storeSubAgentResults: phase-scoped dedup (SD-LEO-INFRA-EVIDENCE-DEDUP-PHASE-KEY-001)', () => {
  let rows;

  beforeEach(() => {
    rows = [];
    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeStatefulMockSupabase(rows),
    }));
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v,
    }));
    vi.doMock('../../lib/artifact-tools.js', () => ({
      createArtifact: async () => ({ artifact_id: 'a', token_count: 0, summary: '' }),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../lib/artifact-tools.js');
  });

  it('TS-2: cross-phase calls within the dedup window produce TWO distinct rows, not one overwritten row', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    const planId = await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
    }, { phase: 'PLAN' });

    const execId = await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 92,
    }, { phase: 'EXEC' });

    expect(rows).toHaveLength(2);
    expect(execId).not.toBe(planId);

    const planRow = rows.find((r) => r.phase === 'PLAN');
    const execRow = rows.find((r) => r.phase === 'EXEC');
    expect(planRow).toBeDefined();
    expect(execRow).toBeDefined();
    // The PLAN row must be untouched by the EXEC call -- confidence proves no cross-phase overwrite.
    expect(planRow.confidence ?? planRow.confidence_score).not.toBe(92);
  });

  it('TS-1: same-phase duplicate call within the dedup window updates the existing row in place (pre-fix behavior preserved)', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    const firstId = await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 80,
    }, { phase: 'PLAN' });

    const secondId = await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 95,
    }, { phase: 'PLAN' });

    expect(rows).toHaveLength(1);
    expect(secondId).toBe(firstId);
    const row = rows[0];
    expect(row.confidence ?? row.confidence_score).toBe(95);
  });

  it('TS-4: two null-phase calls (legacy caller) still dedup against each other', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 80 });
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 95 });

    expect(rows).toHaveLength(1);
  });

  it('a null-phase call and a non-null-phase call never dedup against each other', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 80 });
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 }, { phase: 'PLAN' });

    expect(rows).toHaveLength(2);
  });
});
