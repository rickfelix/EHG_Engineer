/**
 * SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001 -- TS-1 (migration-apply-time block).
 *
 * checkPendingMigrations()'s full pipeline (git status, the DATABASE sub-agent, tier
 * classification) has no existing mockable test harness in this repo -- driving it
 * end-to-end for this one branch would mean inventing a disproportionate mock surface for
 * a single new call site. Instead this test exercises applyContinuousSurfaceVerdict(), the
 * exact pure branch pending-migrations-check.js's post-recheck-success path calls with the
 * checker's real verdict shape -- proving the load-bearing contract directly: a FINDINGS
 * verdict pushes a BLOCKING entry to result.errors (which checkPendingMigrations already
 * treats as `result.blocking = result.hasPendingMigrations` further down -- unchanged,
 * pre-existing code this SD does not touch), an ERROR verdict degrades to a warning (never
 * blocks unrelated handoffs), and PASS touches neither array.
 */
import { describe, it, expect } from 'vitest';
import { applyContinuousSurfaceVerdict } from '../../scripts/modules/handoff/pre-checks/pending-migrations-check.js';

function freshResult() {
  return { errors: [], warnings: [] };
}

describe('applyContinuousSurfaceVerdict (TS-1)', () => {
  it('a FINDINGS verdict pushes a BLOCKING entry naming the table(s) to result.errors', () => {
    const result = freshResult();
    applyContinuousSurfaceVerdict(result, {
      verdict: 'FINDINGS',
      findings: [{ table: 'newly_exposed_table' }],
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/BLOCKING/);
    expect(result.errors[0]).toMatch(/newly_exposed_table/);
    expect(result.warnings).toHaveLength(0);
  });

  it('an ERROR verdict degrades to a non-blocking warning, never result.errors', () => {
    const result = freshResult();
    applyContinuousSurfaceVerdict(result, {
      verdict: 'ERROR',
      reason: 'allowlist table unreadable: relation does not exist',
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/allowlist table unreadable/);
  });

  it('a PASS verdict touches neither errors nor warnings', () => {
    const result = freshResult();
    applyContinuousSurfaceVerdict(result, { verdict: 'PASS', findings: [] });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('multiple findings are joined by name into a single error entry', () => {
    const result = freshResult();
    applyContinuousSurfaceVerdict(result, {
      verdict: 'FINDINGS',
      findings: [{ table: 'table_a' }, { table: 'table_b' }],
    });
    expect(result.errors[0]).toMatch(/table_a, table_b/);
  });
});
