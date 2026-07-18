/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: PC-3 dependency-blast-radius
 */
import { describe, it, expect, vi } from 'vitest';
import { checkDependencyBlastRadius } from '../../../../lib/switch-automation/prechecks/blast-radius.js';

function fakeSupabase(rows, { error = null } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        like: vi.fn(async () => ({ data: rows, error })),
      })),
    })),
  };
}

describe('PC-3: checkDependencyBlastRadius', () => {
  it('passes when no row lists componentKey as a dependency (no known dependents)', async () => {
    const supabase = fakeSupabase([{ loop_key: 'opco:other', dependency_edges: [] }]);
    const result = await checkDependencyBlastRadius(supabase, 'component-x', () => false);
    expect(result).toEqual({ id: 'PC-3', name: 'dependency-blast-radius', passed: true, reason: 'no-known-dependents' });
  });

  it('fails when a dependent is mid-incident', async () => {
    const rows = [
      { loop_key: 'opco:component-x', dependency_edges: [] },
      { loop_key: 'opco:dependent-y', dependency_edges: [{ component_key: 'component-x', relationship: 'depends_on' }] },
    ];
    const supabase = fakeSupabase(rows);
    const incidentFn = (key) => key === 'dependent-y';
    const result = await checkDependencyBlastRadius(supabase, 'component-x', incidentFn);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('dependent-mid-incident:dependent-y');
  });

  it('passes when all dependents are explicitly clear (incidentEvidenceFn returns false)', async () => {
    const rows = [
      { loop_key: 'opco:dependent-y', dependency_edges: [{ component_key: 'component-x', relationship: 'depends_on' }] },
    ];
    const supabase = fakeSupabase(rows);
    const result = await checkDependencyBlastRadius(supabase, 'component-x', () => false);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('all-dependents-clear');
  });

  it('fails closed when a dependent incident status is unknown (null)', async () => {
    const rows = [
      { loop_key: 'opco:dependent-y', dependency_edges: [{ component_key: 'component-x', relationship: 'depends_on' }] },
    ];
    const supabase = fakeSupabase(rows);
    const result = await checkDependencyBlastRadius(supabase, 'component-x', () => null);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('dependent-mid-incident:dependent-y');
  });

  it('fails closed on a query error', async () => {
    const supabase = fakeSupabase(null, { error: { message: 'db down' } });
    const result = await checkDependencyBlastRadius(supabase, 'component-x', () => false);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/query-failed/);
  });
});
