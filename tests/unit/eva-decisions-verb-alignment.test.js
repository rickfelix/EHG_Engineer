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

  // SECURITY EXEC-TO-PLAN finding SEC-PATH-002: distribution_skip is ALSO unmapped live; its
  // S21 consumer (stage-22-distribution-setup.js's APPROVED_DECISIONS allowlist) accepts
  // 'proceed', matching its already-mapped sibling 'distribution_block'.
  it('distribution_skip is bridged JS-side to proceed/kill WITHOUT calling the RPC (pending the staged migration)', async () => {
    let rpcCalled = false;
    const supabase = { rpc: async () => { rpcCalled = true; return { data: null, error: null }; } };

    expect(await resolveDecisionVerb(supabase, 'distribution_skip', 'approved')).toBe('proceed');
    expect(await resolveDecisionVerb(supabase, 'distribution_skip', 'rejected')).toBe('kill');
    expect(rpcCalled).toBe(false);
  });

  // SEC-PATH-002 drift-prevention: JS_SIDE_VERB_BRIDGE is consulted BEFORE the RPC, so if the
  // staged migration is ever edited (verb pair changed, or a bridged type removed from its
  // IN-list) without updating the bridge, the bridge would silently shadow the SQL mapping
  // forever. Pin both against each other so an out-of-sync edit fails a test, not a live
  // divergence.
  //
  // SECURITY EXEC-TO-PLAN round-2 finding SEC-PATH-006: the original version of this test
  // matched a bridged type's name against the WHOLE migration file, and both names also appear
  // quoted in the file's header/prose comments -- so removing either from the actual IN-list
  // would still pass. Extract the VENTURE-SCOPED CASE branch's own IN(...) clause specifically
  // (the only place membership is semantically meaningful) and assert within THAT substring.
  it('the JS bridge and the staged migration agree on every bridged type\'s verb pair', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), 'database/migrations/20260823_add_thesis_kill_tier_b_to_decision_value.sql'),
      'utf8'
    );
    // Isolate the VENTURE-SCOPED branch's IN (...) list -- the actual executable membership set,
    // not prose. Anchored on the branch's own distinguishing comment + its CASE p_action pair, so
    // an edit elsewhere in the file can't accidentally satisfy this extraction.
    const branchMatch = migration.match(
      /-- VENTURE-SCOPED types:[\s\S]*?WHEN p_decision_type IN \(([\s\S]*?)\)\s*THEN CASE p_action WHEN 'approved' THEN 'proceed' ELSE 'kill' END/
    );
    expect(branchMatch, 'VENTURE-SCOPED IN(...) clause not found in migration -- extraction regex is stale').toBeTruthy();
    const inListText = branchMatch[1];

    const supabase = { rpc: async () => ({ data: null, error: null }) }; // must never be reached
    const bridgedTypes = ['thesis_kill_tier_b', 'distribution_skip'];
    for (const decisionType of bridgedTypes) {
      // Both bridged types are VENTURE-SCOPED (proceed/kill) and must appear in THIS IN-list
      // specifically -- not merely somewhere in the file.
      expect(inListText).toMatch(new RegExp(`'${decisionType}'`));
      expect(await resolveDecisionVerb(supabase, decisionType, 'approved')).toBe('proceed');
      expect(await resolveDecisionVerb(supabase, decisionType, 'rejected')).toBe('kill');
    }
  });
});
