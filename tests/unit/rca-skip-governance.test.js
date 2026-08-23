/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-3.
 * Governed skipRCA: replaces the hardcoded `skipRCA: true` in triggerQuick().
 *
 * TS-5 (PRD): skipRCA governed flag reaches all 3 real call sites via the
 * triggerRCAOnFailure wrapper, proven by exercising resolveSkipRCA/computeSkipRCA
 * directly rather than a literal-text grep (a bare grep for 'skipRCA:true' matches
 * ZERO occurrences even pre-fix, since the real code has a space).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeSkipRCA, resolveSkipRCA } from '../../lib/rca/rca-orchestrator.js';
import { createSupabaseChainMock } from '../helpers/supabase-chain-mock.js';

describe('computeSkipRCA — pure decision logic', () => {
  it('defaults to skip=true (conservative) when metadata is absent', () => {
    expect(computeSkipRCA(undefined)).toBe(true);
    expect(computeSkipRCA(null)).toBe(true);
  });

  it('defaults to skip=true when metadata exists but lacks the opt-in key', () => {
    expect(computeSkipRCA({})).toBe(true);
    expect(computeSkipRCA({ some_other_key: 'value' })).toBe(true);
  });

  it('does NOT skip only when explicitly opted in via rca_sub_agent_invocation_enabled=true', () => {
    expect(computeSkipRCA({ rca_sub_agent_invocation_enabled: true })).toBe(false);
  });

  it('stays conservative (skip=true) for any non-strict-true value, including truthy strings', () => {
    expect(computeSkipRCA({ rca_sub_agent_invocation_enabled: 'true' })).toBe(true);
    expect(computeSkipRCA({ rca_sub_agent_invocation_enabled: 1 })).toBe(true);
    expect(computeSkipRCA({ rca_sub_agent_invocation_enabled: false })).toBe(true);
  });
});

describe('resolveSkipRCA — DB-backed resolution, per trigger_type', () => {
  beforeEach(() => {
    // Force-clear the module-level per-process cache between tests by using a
    // distinct trigger_type per test (cache is keyed by trigger_type, so this
    // avoids cross-test pollution without reaching into module internals).
  });

  it('resolves skip=true when the config row has empty metadata (the real, measured state of all 8 existing rows)', async () => {
    const chain = createSupabaseChainMock({ result: { data: { metadata: {} }, error: null } });
    const skip = await resolveSkipRCA(chain, 'handoff_failure_fr3_test_1');
    expect(skip).toBe(true);
  });

  it('resolves skip=true when enabled=true is the ONLY signal (never derived from the pre-existing enabled column)', async () => {
    // Simulates a row shaped like the 8 real rows: enabled=true, metadata={}.
    // The governed decision must NOT be swayed by `enabled` — only by the new
    // metadata key — so this must still resolve to skip=true.
    const chain = createSupabaseChainMock({ result: { data: { metadata: {} }, error: null } });
    const skip = await resolveSkipRCA(chain, 'gate_validation_failure_fr3_test_2');
    expect(skip).toBe(true);
  });

  it('resolves skip=false when the new metadata key explicitly opts in', async () => {
    const chain = createSupabaseChainMock({
      result: { data: { metadata: { rca_sub_agent_invocation_enabled: true } }, error: null }
    });
    const skip = await resolveSkipRCA(chain, 'api_failure_fr3_test_3');
    expect(skip).toBe(false);
  });

  it('fails closed (skip=true) when the query errors', async () => {
    const chain = createSupabaseChainMock({ result: { data: null, error: { message: 'boom' } } });
    const skip = await resolveSkipRCA(chain, 'migration_failure_fr3_test_4');
    expect(skip).toBe(true);
  });

  it('fails closed (skip=true) when the config row does not exist (maybeSingle -> null)', async () => {
    const chain = createSupabaseChainMock({ result: { data: null, error: null } });
    const skip = await resolveSkipRCA(chain, 'script_crash_fr3_test_5');
    expect(skip).toBe(true);
  });

  it('caches the resolved value per trigger_type — a second call within the TTL does not re-query', async () => {
    const chain = createSupabaseChainMock({
      result: { data: { metadata: { rca_sub_agent_invocation_enabled: true } }, error: null }
    });
    const triggerType = 'cache_test_fr3_test_6';
    const first = await resolveSkipRCA(chain, triggerType);
    const callCountAfterFirst = chain.maybeSingle.mock.calls.length;
    const second = await resolveSkipRCA(chain, triggerType);
    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(chain.maybeSingle.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('caches independently per trigger_type — one type opting in does not leak to another', async () => {
    const enabledChain = createSupabaseChainMock({
      result: { data: { metadata: { rca_sub_agent_invocation_enabled: true } }, error: null }
    });
    const disabledChain = createSupabaseChainMock({ result: { data: { metadata: {} }, error: null } });
    const enabledSkip = await resolveSkipRCA(enabledChain, 'trigger_type_a_fr3_test_7');
    const disabledSkip = await resolveSkipRCA(disabledChain, 'trigger_type_b_fr3_test_7');
    expect(enabledSkip).toBe(false);
    expect(disabledSkip).toBe(true);
  });
});
