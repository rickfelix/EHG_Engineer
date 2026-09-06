/**
 * QF-20260903-137 — GATE_PERFORMANCE_CRITICAL must read findings from a column that EXISTS.
 *
 * The gate selected `findings` from sub_agent_execution_results. That column does not exist (only
 * verdict, critical_issues, warnings and metadata do), so every call returned Postgres 42703,
 * perfError was always truthy, and the gate returned skip=true with skipReason
 * 'PERFORMANCE sub-agent not run' — while 44 real PERFORMANCE rows sat in the table. Dead by
 * construction, with a skip message that blamed a missing sub-agent run rather than its own query.
 *
 * These tests pin BOTH halves independently, because either alone can pass while the gate is broken:
 *   1. the COLUMN SET actually requested is a subset of the columns that exist, and
 *   2. the gate REACHES its violation logic on a realistic row instead of skipping.
 *
 * No DB access: supabase is injected, so this is a pure unit test.
 */
import { describe, it, expect } from 'vitest';
import { createPerformanceCriticalGate } from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/performance-critical-gate.js';

// The columns that genuinely exist on sub_agent_execution_results, verified live 2026-09-03.
// `findings` and `results` are NOT among them — selecting either yields 42703.
const REAL_COLUMNS = ['id', 'sd_id', 'sub_agent_code', 'verdict', 'critical_issues', 'warnings', 'metadata', 'created_at', 'confidence', 'recommendations', 'detailed_analysis'];

const SD_UUID = '00000000-0000-4000-8000-0000000000aa';

/** Chainable supabase stub that records every select() string per table. */
function makeSupabase({ perfRow, selects }) {
  return {
    from(table) {
      const chain = {
        select(cols) { (selects[table] ||= []).push(cols); return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        async single() {
          if (table === 'strategic_directives_v2') {
            return { data: { id: SD_UUID, sd_type: 'feature', title: 'test SD' }, error: null };
          }
          if (table === 'product_requirements_v2') {
            return { data: { performance_requirements: null }, error: null };
          }
          if (table === 'sub_agent_execution_results') {
            return { data: perfRow, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

const ctx = { sd: { id: SD_UUID, sd_type: 'feature', success_metrics: [] }, sdId: SD_UUID };

describe('QF-20260903-137: PERFORMANCE gate reads an existing column', () => {
  it('requests only columns that exist on sub_agent_execution_results', async () => {
    const selects = {};
    const gate = createPerformanceCriticalGate(makeSupabase({ perfRow: { verdict: 'PASS', metadata: {}, critical_issues: [], warnings: [] }, selects }));
    await gate.validator(ctx);

    const requested = (selects['sub_agent_execution_results'] || []).join(',');
    expect(requested).not.toBe('');
    for (const col of requested.split(',').map((c) => c.trim()).filter(Boolean)) {
      expect(REAL_COLUMNS, `gate selected "${col}", which is not a real column -> Postgres 42703 -> gate skips forever`).toContain(col);
    }
    // Explicit, so a future edit reintroducing the exact original bug names itself in the diff.
    expect(requested).not.toMatch(/\bfindings\b/);
  });

  it('reaches barrel-violation logic on a realistic row instead of skipping', async () => {
    const selects = {};
    const perfRow = {
      verdict: 'FAIL',
      critical_issues: [],
      warnings: [],
      // Real shape, confirmed on live row 3dda18ad: findings are nested UNDER metadata.
      metadata: { findings: { barrel_import_audit: { new_barrels: 2, critical_violations: ['src/a/index.ts'] } } },
    };
    const gate = createPerformanceCriticalGate(makeSupabase({ perfRow, selects }));
    const result = await gate.validator(ctx);

    // The dead-by-construction signature: skipping while claiming the sub-agent never ran.
    expect(result.skip).toBe(false);
    expect(result.skipReason).not.toBe('PERFORMANCE sub-agent not run');
    // sd_type 'feature' => REQUIRED => a barrel violation must block.
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => i.severity === 'CRITICAL' && /barrel import/i.test(i.issue))).toBe(true);
  });

  it('does not raise a violation when findings are present but clean', async () => {
    const selects = {};
    const perfRow = {
      verdict: 'PASS',
      critical_issues: [],
      warnings: [],
      metadata: { findings: { barrel_import_audit: { new_barrels: 0, grandfathered_count: 3 } } },
    };
    const gate = createPerformanceCriticalGate(makeSupabase({ perfRow, selects }));
    const result = await gate.validator(ctx);

    expect(result.skip).toBe(false);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
