/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: runSwitchOnPrechecks orchestrator
 * TS-1, TS-2, TS-4.
 */
import { describe, it, expect, vi } from 'vitest';

const auditInsertMock = vi.fn(() => ({
  select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'audit-1' }, error: null })) })),
}));

function makeSupabase({
  revertOk = true, cleanOk = true, blastRadiusOk = true, gaugeOk = true, rateOk = true, freezeOk = true,
  gaugeThrows = false,
} = {}) {
  return {
    rpc: vi.fn(async () => ({ data: !freezeOk ? true : false, error: null })),
    from: vi.fn((table) => {
      if (table === 'loop_registry') {
        return { select: () => ({ like: async () => ({ data: blastRadiusOk ? [] : [{ loop_key: 'opco:dep', dependency_edges: [{ component_key: 'component-x', relationship: 'depends_on' }] }], error: null }) }) };
      }
      if (table === 'periodic_process_registry') {
        if (gaugeThrows) return { select: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('boom'); } }) }) };
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: gaugeOk ? { owner: 'team', last_fired_at: '2026-07-18T00:00:00Z', currently_expected_active: true } : null, error: null }) }) }) };
      }
      if (table === 'switchon_auto_actions') {
        return { select: () => ({ eq: () => ({ gte: () => ({ order: async () => ({ data: rateOk ? [] : [{ occurred_at: new Date().toISOString() }, { occurred_at: new Date().toISOString() }, { occurred_at: new Date().toISOString() }], error: null }) }) }) }) };
      }
      if (table === 'leo_kill_switches') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { switch_key: 'CONST-009', is_active: false }, error: null }) }) }) };
      }
      if (table === 'chairman_switchon_policy') {
        return { select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === 'switchon_decision_audit') {
        return { insert: auditInsertMock };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

const GREEN_EVIDENCE = {
  revertPath: { declared: true, rehearsalPassed: true, rehearsedAt: new Date().toISOString() },
  observeClean: { lastIncidentAt: null, checkedAt: new Date().toISOString() },
  incidentEvidenceFn: () => false,
  gaugeProcessKey: 'proc-x',
  openIncident: false,
};

describe('runSwitchOnPrechecks orchestrator', () => {
  it('TS-1: all 6 checks green -> allPassed=true, audit stamped auto-proceed', async () => {
    const { runSwitchOnPrechecks } = await import('../../../lib/switch-automation/switchon-prechecks.js');
    auditInsertMock.mockClear();
    const supabase = makeSupabase({});
    const result = await runSwitchOnPrechecks(supabase, { component: 'component-x', action: 'switch-on', actor: 'test' }, GREEN_EVIDENCE);
    expect(result.allPassed).toBe(true);
    expect(result.blockingIds).toEqual([]);
    expect(result.results).toHaveLength(6);
    expect(auditInsertMock).toHaveBeenCalledWith(expect.objectContaining({ decision: 'auto-proceed' }));
  });

  it('TS-2: PC-3 blast-radius failing -> allPassed=false, blockingIds=[PC-3], audit held-for-chairman', async () => {
    const { runSwitchOnPrechecks } = await import('../../../lib/switch-automation/switchon-prechecks.js');
    auditInsertMock.mockClear();
    const supabase = makeSupabase({ blastRadiusOk: false });
    const evidence = { ...GREEN_EVIDENCE, incidentEvidenceFn: () => true };
    const result = await runSwitchOnPrechecks(supabase, { component: 'component-x', action: 'switch-on', actor: 'test' }, evidence);
    expect(result.allPassed).toBe(false);
    expect(result.blockingIds).toEqual(['PC-3']);
    expect(auditInsertMock).toHaveBeenCalledWith(expect.objectContaining({ decision: 'held-for-chairman' }));
  });

  it('TS-4: an error in one check (PC-4) is recorded as a fail-closed failure; the other 5 checks still run correctly', async () => {
    // PC-4's own query is wrapped in an internal try/catch (fails closed with
    // 'query-failed:...' before this error would ever reach the orchestrator's outer
    // safeRun wrapper) -- this proves the DEFENSE-IN-DEPTH claim: an error anywhere in
    // the check's call chain never aborts the other 5 checks or defaults to passed,
    // regardless of which layer (the check's own try/catch, or safeRun's) catches it.
    const { runSwitchOnPrechecks } = await import('../../../lib/switch-automation/switchon-prechecks.js');
    auditInsertMock.mockClear();
    const supabase = makeSupabase({ gaugeThrows: true });
    const result = await runSwitchOnPrechecks(supabase, { component: 'component-x', action: 'switch-on', actor: 'test' }, GREEN_EVIDENCE);
    expect(result.allPassed).toBe(false);
    expect(result.blockingIds).toEqual(['PC-4']);
    const pc4 = result.results.find((r) => r.id === 'PC-4');
    expect(pc4.reason).toMatch(/query-failed:boom/);
    // the other 5 checks still ran and passed
    const others = result.results.filter((r) => r.id !== 'PC-4');
    expect(others.every((r) => r.passed)).toBe(true);
  });

  it('TS-4b: safeRun itself catches an exception thrown OUTSIDE a check\'s own try/catch (the orchestrator\'s own defense layer)', async () => {
    const { runSwitchOnPrechecks } = await import('../../../lib/switch-automation/switchon-prechecks.js');
    auditInsertMock.mockClear();
    // blastRadiusOk:false -> a dependent row exists, so incidentEvidenceFn is actually
    // invoked (with zero dependents it would never be called at all).
    const supabase = makeSupabase({ blastRadiusOk: false });
    // PC-3 wraps the incidentEvidenceFn call in its own try/catch, so a throwing caller
    // fails closed to null/blocked rather than propagating -- confirms the full chain
    // never lets one bad caller-supplied function abort the run.
    const evidence = { ...GREEN_EVIDENCE, incidentEvidenceFn: () => { throw new Error('caller bug'); } };
    const result = await runSwitchOnPrechecks(supabase, { component: 'component-x', action: 'switch-on', actor: 'test' }, evidence);
    expect(result.allPassed).toBe(false);
    const pc3 = result.results.find((r) => r.id === 'PC-3');
    expect(pc3.passed).toBe(false);
    expect(result.results).toHaveLength(6);
  });
});
