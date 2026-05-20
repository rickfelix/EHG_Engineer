/**
 * QF-20260520-358 — PLAN-TO-EXEC / PLAN-TO-LEAD precheck _appPath fallback.
 *
 * Root cause: HandoffOrchestrator.precheckHandoff() calls executor.getRequiredGates()
 * WITHOUT first running setup(), but setup() is the only place options._appPath is set.
 * So in the precheck path appPath was undefined and the branch / git-commit enforcement
 * gates defaulted to EHG_ROOT (often detached HEAD) -> false "Could not determine current
 * branch" on every SD precheck regardless of target_application.
 *
 * Fix: getRequiredGates falls back to `options._appPath || this.determineTargetRepository(sd)`
 * in both executors, so precheck resolves the SD's target repo identically to execute().
 */
import { describe, it, expect, vi } from 'vitest';
import { PlanToExecExecutor } from '../../../../scripts/modules/handoff/executors/plan-to-exec/index.js';
import { PlanToLeadExecutor } from '../../../../scripts/modules/handoff/executors/plan-to-lead/index.js';

const fakeSupabase = {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({}) }) }) }) }) }),
};

// Parent orchestrator (plan-to-exec) / orchestrator child (plan-to-lead) take the lighter
// gate sets — the appPath fallback at the top of getRequiredGates fires for ALL paths, so
// the lighter set is sufficient to exercise the fix with minimal gate-factory surface.
const SD_EXEC = {
  id: 'SD-QF-358-TEST', sd_key: 'SD-QF-358-TEST', sd_type: 'infrastructure',
  target_application: 'EHG_Engineer', title: 'precheck appPath fallback test', metadata: {},
};
const SD_LEAD = { ...SD_EXEC, parent_sd_id: 'SD-PARENT-XYZ', metadata: { parent_orchestrator: 'SD-PARENT-XYZ' } };

describe('QF-20260520-358: precheck _appPath fallback (plan-to-exec)', () => {
  it('resolves appPath via determineTargetRepository when options._appPath is absent (precheck path)', async () => {
    const ex = new PlanToExecExecutor({ supabase: fakeSupabase });
    vi.spyOn(ex, '_loadValidators').mockResolvedValue();
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    await ex.getRequiredGates(SD_EXEC, { _isParentOrchestrator: true });
    expect(spy).toHaveBeenCalledWith(SD_EXEC);
  });

  it('uses the provided options._appPath without calling the resolver (execute path)', async () => {
    const ex = new PlanToExecExecutor({ supabase: fakeSupabase });
    vi.spyOn(ex, '_loadValidators').mockResolvedValue();
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    await ex.getRequiredGates(SD_EXEC, { _appPath: '/already/set', _isParentOrchestrator: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('QF-20260520-358: precheck _appPath fallback (plan-to-lead)', () => {
  it('resolves appPath via determineTargetRepository when options._appPath is absent', () => {
    const ex = new PlanToLeadExecutor({ supabase: fakeSupabase });
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    ex.getRequiredGates(SD_LEAD, {});
    expect(spy).toHaveBeenCalledWith(SD_LEAD);
  });

  it('uses the provided options._appPath without calling the resolver', () => {
    const ex = new PlanToLeadExecutor({ supabase: fakeSupabase });
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    ex.getRequiredGates(SD_LEAD, { _appPath: '/already/set' });
    expect(spy).not.toHaveBeenCalled();
  });
});
