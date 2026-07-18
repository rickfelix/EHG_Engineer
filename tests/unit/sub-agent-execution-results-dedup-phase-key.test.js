/**
 * SD-LEO-INFRA-EVIDENCE-DEDUP-PHASE-KEY-001
 *
 * Reproduces and pins the fix for fb 0b12ca77: the TR-003 dedup check in
 * results-storage.js was phase-blind, so a multi-phase SD's second-phase call
 * (e.g. EXEC after PLAN) matched the first phase's row and overwrote it in
 * place -- corrupting created_at (frozen at the earlier phase's time) and
 * making the row invisible to GATE_SUBAGENT_EVIDENCE's freshness check for the
 * later phase. The fix scopes the dedup match to the SAME phase (or both null).
 *
 * SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 extends this: the phase-scoped
 * dedup above was a no-op for the majority of real callers, which never
 * supply a phase at all (phaseValue stayed null on both sides, colliding via
 * .is('phase', null) exactly like the original bug). The tests below default
 * `sdTable` to EMPTY so every pre-existing test case keeps exercising the
 * "SD lookup finds nothing -> phaseValue stays null" graceful-degradation
 * path unchanged; new test cases populate `sdTable` explicitly to exercise
 * the new never-null derivation path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Stateful mock covering two tables:
 *  - sub_agent_execution_results (subAgentRows): the existing dedup-fixture
 *    behavior, unchanged from the pre-derivation test file.
 *  - strategic_directives_v2 (sdTable): a plain object keyed by SD id,
 *    supporting the FR-1 fallback's `.select('current_phase').eq('id', X)
 *    .maybeSingle()` call. Empty by default (SD-not-found), populate a key to
 *    simulate an SD whose current_phase the derivation can find.
 */
function makeStatefulMockSupabase(subAgentRows, sdTable) {
  let nextId = 1;
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        const filters = {};
        const sdBuilder = {
          select() { return sdBuilder; },
          eq(col, val) { filters[col] = val; return sdBuilder; },
          maybeSingle: async () => {
            const match = Object.values(sdTable).find((sd) =>
              Object.entries(filters).every(([col, val]) => sd[col] === val)
            );
            return { data: match ? { current_phase: match.current_phase } : null, error: null };
          },
        };
        return sdBuilder;
      }

      const filters = {};
      const builder = {
        select() { return builder; },
        eq(col, val) { filters[col] = { op: 'eq', val }; return builder; },
        is(col, val) { filters[col] = { op: 'is', val }; return builder; },
        gte(col, val) { filters[col] = { ...(filters[col] || {}), gte: val }; return builder; },
        order() { return builder; },
        limit() {
          const matches = subAgentRows.filter((r) => {
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
          subAgentRows.push(row);
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
                      const row = subAgentRows.find((r) => r.id === id);
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
  let sdTable;

  beforeEach(() => {
    rows = [];
    sdTable = {}; // SD-not-found by default -- preserves pre-derivation null-phase behavior
    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeStatefulMockSupabase(rows, sdTable),
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

  it('TS-4: two null-phase calls (legacy caller, SD lookup finds nothing) still dedup against each other', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 80 });
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 95 });

    expect(rows).toHaveLength(1);
    expect(rows[0].phase).toBeNull();
  });

  it('a null-phase call and a non-null-phase call never dedup against each other', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 80 });
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 }, { phase: 'PLAN' });

    expect(rows).toHaveLength(2);
  });

  describe('SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 (FR-1): never-null phase derivation', () => {
    it('derives phase from the SD current_phase when no phase is supplied anywhere', async () => {
      sdTable['SD-TEST-002'] = { id: 'SD-TEST-002', current_phase: 'EXEC' };
      const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

      await storeSubAgentResults('VALIDATION', 'SD-TEST-002', null, { verdict: 'PASS', confidence: 90 });

      expect(rows).toHaveLength(1);
      expect(rows[0].phase).toBe('EXEC');
    });

    it('two omitted-phase calls straddling a real phase boundary (current_phase changes between calls) produce TWO distinct rows, not one overwritten row', async () => {
      sdTable['SD-TEST-003'] = { id: 'SD-TEST-003', current_phase: 'PLAN' };
      const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

      const planId = await storeSubAgentResults('TESTING', 'SD-TEST-003', null, { verdict: 'PASS', confidence: 85 });

      // Simulate the SD progressing from PLAN to EXEC between the two calls --
      // this is the exact scenario that reproduced fb 0b12ca77 on the majority
      // (phase-omitting) invocation path even after the phase-scoped dedup shipped.
      sdTable['SD-TEST-003'].current_phase = 'EXEC';

      const execId = await storeSubAgentResults('TESTING', 'SD-TEST-003', null, { verdict: 'PASS', confidence: 88 });

      expect(rows).toHaveLength(2);
      expect(execId).not.toBe(planId);
      const planRow = rows.find((r) => r.phase === 'PLAN');
      const execRow = rows.find((r) => r.phase === 'EXEC');
      expect(planRow).toBeDefined();
      expect(execRow).toBeDefined();
      expect(planRow.confidence ?? planRow.confidence_score).not.toBe(88);
    });

    it('two omitted-phase calls with an UNCHANGED current_phase still dedup to one row (derivation does not break same-phase collapsing)', async () => {
      sdTable['SD-TEST-004'] = { id: 'SD-TEST-004', current_phase: 'PLAN_VERIFICATION' };
      const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

      const firstId = await storeSubAgentResults('REGRESSION', 'SD-TEST-004', null, { verdict: 'PASS', confidence: 70 });
      const secondId = await storeSubAgentResults('REGRESSION', 'SD-TEST-004', null, { verdict: 'PASS', confidence: 99 });

      expect(rows).toHaveLength(1);
      expect(secondId).toBe(firstId);
      expect(rows[0].phase).toBe('PLAN_VERIFICATION');
      expect(rows[0].confidence ?? rows[0].confidence_score).toBe(99);
    });

    it('explicit options.phase still wins over derivation (options.phase takes priority)', async () => {
      sdTable['SD-TEST-005'] = { id: 'SD-TEST-005', current_phase: 'EXEC' };
      const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

      await storeSubAgentResults('VALIDATION', 'SD-TEST-005', null, { verdict: 'PASS', confidence: 90 }, { phase: 'LEAD_FINAL_APPROVAL' });

      expect(rows).toHaveLength(1);
      expect(rows[0].phase).toBe('LEAD_FINAL_APPROVAL');
    });

    it('a derived phase (FR-1 fallback) is format-normalized, but an explicitly-supplied phase is left byte-identical', async () => {
      // Derived path: current_phase has mixed casing/hyphens -> normalized on the way in.
      sdTable['SD-TEST-006'] = { id: 'SD-TEST-006', current_phase: 'plan-verification' };
      const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

      await storeSubAgentResults('VALIDATION', 'SD-TEST-006', null, { verdict: 'PASS', confidence: 90 });
      expect(rows[0].phase).toBe('PLAN_VERIFICATION');

      // Explicit path: many real writers intentionally use a hyphenated convention
      // (e.g. handoff executors writing 'PLAN-TO-EXEC') and HandoffRepository does an
      // exact .eq('phase', phase) lookup against it -- this must NOT be rewritten.
      await storeSubAgentResults('TESTING', 'SD-TEST-007', null, { verdict: 'PASS', confidence: 91 }, { phase: 'PLAN-TO-EXEC' });
      const explicitRow = rows.find((r) => r.sub_agent_code === 'TESTING');
      expect(explicitRow.phase).toBe('PLAN-TO-EXEC');
    });
  });
});

describe('normalizePhaseToken (SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 FR-3)', () => {
  it('collapses casing/separator variants of the SAME phase to one canonical token', async () => {
    const { normalizePhaseToken } = await import('../../lib/sub-agent-executor/phase-token.js');
    expect(normalizePhaseToken('PLAN-VERIFICATION')).toBe(normalizePhaseToken('PLAN_VERIFICATION'));
    expect(normalizePhaseToken('plan verification')).toBe(normalizePhaseToken('PLAN_VERIFICATION'));
    expect(normalizePhaseToken('exec-to-plan')).toBe('EXEC_TO_PLAN');
  });

  it('never collapses genuinely distinct sub-phases (no coarse LEAD/PLAN/EXEC bucketing)', async () => {
    const { normalizePhaseToken } = await import('../../lib/sub-agent-executor/phase-token.js');
    expect(normalizePhaseToken('PLAN_PRD')).not.toBe(normalizePhaseToken('PLAN_VERIFICATION'));
    expect(normalizePhaseToken('PLAN_PRD')).toBe('PLAN_PRD');
    expect(normalizePhaseToken('EXEC_TO_PLAN')).not.toBe(normalizePhaseToken('PLAN_TO_LEAD'));
  });

  it('is a format-only, non-throwing, idempotent function', async () => {
    const { normalizePhaseToken } = await import('../../lib/sub-agent-executor/phase-token.js');
    expect(normalizePhaseToken(null)).toBeNull();
    expect(normalizePhaseToken(undefined)).toBeNull();
    expect(normalizePhaseToken('')).toBeNull();
    expect(normalizePhaseToken('   ')).toBeNull();
    expect(normalizePhaseToken(123)).toBeNull();
    const once = normalizePhaseToken('Exec-To-Plan');
    expect(normalizePhaseToken(once)).toBe(once);
  });
});
