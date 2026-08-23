/**
 * SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 (FR-3) — pins eva-decisions.js's decision-verb
 * resolution against the canonical SQL mapping (fn_chairman_decision_value) instead of the
 * old hardcoded 'proceed'/'kill' pair. Pure logic test against a mocked supabase.rpc (no live
 * DB write) — verb membership and the p_action domain were measured live 2026-08-23.
 */
import { describe, it, expect } from 'vitest';
import { resolveDecisionVerb } from '../../scripts/eva-decisions.js';

function mockSupabaseRpc(responses) {
  return {
    rpc: async (fnName, args) => {
      const key = `${args.p_decision_type}:${args.p_action}`;
      if (!(key in responses)) throw new Error(`mockSupabaseRpc: no response configured for ${key}`);
      return responses[key];
    },
  };
}

describe('resolveDecisionVerb — FR-3 canonical verb mapping', () => {
  it('TS-5: gate_override + approved resolves to \'override\' (not the old hardcoded \'proceed\')', async () => {
    const supabase = mockSupabaseRpc({ 'gate_override:approved': { data: 'override', error: null } });
    const verb = await resolveDecisionVerb(supabase, 'gate_override', 'approved');
    expect(verb).toBe('override');
  });

  it('TS-6: stage_gate + approved still resolves to \'proceed\' (regression, no silent change)', async () => {
    const supabase = mockSupabaseRpc({ 'stage_gate:approved': { data: 'proceed', error: null } });
    const verb = await resolveDecisionVerb(supabase, 'stage_gate', 'approved');
    expect(verb).toBe('proceed');
  });

  it('TS-6: stage_gate + rejected still resolves to \'kill\' (regression, no silent change)', async () => {
    const supabase = mockSupabaseRpc({ 'stage_gate:rejected': { data: 'kill', error: null } });
    const verb = await resolveDecisionVerb(supabase, 'stage_gate', 'rejected');
    expect(verb).toBe('kill');
  });

  it('TS-13: an unmapped decision_type (NULL result, no RPC error) throws loudly naming the type -- never returns null', async () => {
    const supabase = mockSupabaseRpc({ 'plan_go:approved': { data: null, error: null } });
    await expect(resolveDecisionVerb(supabase, 'plan_go', 'approved')).rejects.toThrow(/plan_go/);
  });

  it('TS-13: security_ratification and platform_ruling (other live unmapped types) also throw, never resolve to null/undefined', async () => {
    const supabase = mockSupabaseRpc({
      'security_ratification:approved': { data: null, error: null },
      'platform_ruling:rejected': { data: null, error: null },
    });
    await expect(resolveDecisionVerb(supabase, 'security_ratification', 'approved')).rejects.toThrow(/security_ratification/);
    await expect(resolveDecisionVerb(supabase, 'platform_ruling', 'rejected')).rejects.toThrow(/platform_ruling/);
  });

  it('D4: an RPC error (e.g. wrong-form action) is surfaced, never silently swallowed into a default verb', async () => {
    const supabase = mockSupabaseRpc({
      'stage_gate:approve': { data: null, error: { message: 'fn_chairman_decision_value: invalid action approve', code: '22023' } },
    });
    await expect(resolveDecisionVerb(supabase, 'stage_gate', 'approve')).rejects.toThrow(/invalid action approve/);
  });

  it('D4: calls the RPC with the past-tense action form (\'approved\'/\'rejected\'), never \'approve\'/\'reject\'', async () => {
    let capturedArgs = null;
    const supabase = {
      rpc: async (fnName, args) => { capturedArgs = args; return { data: 'proceed', error: null }; },
    };
    await resolveDecisionVerb(supabase, 'stage_gate', 'approved');
    expect(capturedArgs.p_action).toBe('approved');
    expect(capturedArgs.p_decision_type).toBe('stage_gate');
  });

  // EXEC-discovered gap (2026-08-23): thesis_kill_tier_b is ALSO outside fn_chairman_decision_
  // value's live mapping (confirmed via direct RPC probe -- returns NULL for both actions),
  // independent of the 3 types the PLAN-phase review measured. Bridged JS-side (matching the
  // pre-fix proceed/kill pair every type got unconditionally) until the staged migration
  // (database/migrations/20260823_add_thesis_kill_tier_b_to_decision_value.sql) is chairman-
  // applied -- without this, FR-3's fail-loud-on-unmapped behavior would regress the live,
  // tested exit-wiring capability (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-H).
  it('thesis_kill_tier_b is bridged JS-side to proceed/kill WITHOUT calling the RPC (pending the staged migration)', async () => {
    let rpcCalled = false;
    const supabase = { rpc: async () => { rpcCalled = true; return { data: null, error: null }; } };

    expect(await resolveDecisionVerb(supabase, 'thesis_kill_tier_b', 'approved')).toBe('proceed');
    expect(await resolveDecisionVerb(supabase, 'thesis_kill_tier_b', 'rejected')).toBe('kill');
    expect(rpcCalled).toBe(false);
  });
});
