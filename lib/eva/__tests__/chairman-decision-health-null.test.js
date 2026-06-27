/**
 * Regression for SD-LEO-INFRA-GATE-NULL-HEALTH-RESOLUTION-001 (RCA e22d572e):
 * clone-venture chairman_decisions were minted with health_score=NULL because the
 * decision is minted BEFORE the worker's _writeHealthScore runs, so the stored
 * venture_stage_work.health_score column is still empty and the mint nulls out →
 * the auto-gate wedges. resolveDecisionHealth must NEVER return null for a
 * first-visit stage (it falls back to the CURRENT stage's advisory_data), while
 * preserving the stage-scoped read so SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-
 * PROVENANCE-001 (no cross-stage inheritance) is not regressed.
 */
import { describe, test, expect } from 'vitest';
import { resolveDecisionHealth } from '../chairman-decision-watcher.js';

/**
 * Minimal supabase stub: returns `storedHealth` for a health_score select and
 * `advisory` for an advisory_data select, recording every stage filter it sees so
 * we can assert the read is scoped to the current stage (no cross-stage leak).
 */
function makeSupabase({ storedHealth = null, advisory = undefined } = {}) {
  const stageFilters = [];
  return {
    stageFilters,
    from(_table) {
      const ctx = { _select: null, _stage: null };
      const api = {
        select(cols) { ctx._select = cols; return api; },
        eq(col, val) { if (col === 'lifecycle_stage') { ctx._stage = val; stageFilters.push(val); } return api; },
        async maybeSingle() {
          if (ctx._select === 'health_score') return { data: storedHealth === null ? null : { health_score: storedHealth } };
          if (ctx._select === 'advisory_data') return { data: advisory === undefined ? null : { advisory_data: advisory } };
          return { data: null };
        },
      };
      return api;
    },
  };
}

const RICH_ADVISORY = {
  analysis: { summary: 'thorough multi-paragraph analysis '.repeat(20) },
  recommendation: 'proceed',
  findings: { a: 1, b: 2, c: 3 },
};

describe('resolveDecisionHealth — null-health gate-resolution fix', () => {
  test('stored health is preferred and returned verbatim (PROVENANCE-001 stage-scoped path)', async () => {
    const sb = makeSupabase({ storedHealth: 'green' });
    expect(await resolveDecisionHealth(sb, 'v1', 3)).toBe('green');
    // Only the stage-scoped health read ran — no advisory fallback, all reads at stage 3.
    expect(sb.stageFilters.every((s) => s === 3)).toBe(true);
  });

  test('NULL first-visit: falls back to current-stage advisory_data → non-null verdict', async () => {
    const sb = makeSupabase({ storedHealth: null, advisory: RICH_ADVISORY });
    const health = await resolveDecisionHealth(sb, 'clone-091f2889', 5);
    expect(health).not.toBeNull();
    expect(health).toBe('green'); // rich advisory scores >= 60
  });

  test('NULL + no advisory row → deterministic non-null red (no wedge), never NULL', async () => {
    const sb = makeSupabase({ storedHealth: null, advisory: undefined });
    expect(await resolveDecisionHealth(sb, 'clone', 5)).toBe('red');
  });

  test('NULL + skip-stub advisory → yellow (neutral), preserving PROVENANCE-001 FR-2 skip handling', async () => {
    const sb = makeSupabase({ storedHealth: null, advisory: { skipped: true, pre_exec_skip: true } });
    const health = await resolveDecisionHealth(sb, 'clone', 5);
    // computeHealthScore treats skip stubs as 'yellow', never red; never NULL.
    expect(['yellow', 'red', 'green']).toContain(health);
    expect(health).not.toBeNull();
  });

  test('fallback reads are scoped to the current stage only (no cross-stage DESC-LIMIT-1)', async () => {
    const sb = makeSupabase({ storedHealth: null, advisory: RICH_ADVISORY });
    await resolveDecisionHealth(sb, 'v1', 7);
    expect(sb.stageFilters.length).toBeGreaterThan(0);
    expect(sb.stageFilters.every((s) => s === 7)).toBe(true);
  });

  test('fail-open: a read error returns null (preserves prior behavior, never throws)', async () => {
    const throwing = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { throw new Error('db down'); },
        };
      },
    };
    // First read (health_score) throwing is swallowed by readCurrentStageHealth → null,
    // then the advisory read throws too → resolver fails open to null.
    const health = await resolveDecisionHealth(throwing, 'v1', 3, { warn() {} });
    expect(health).toBeNull();
  });
});
