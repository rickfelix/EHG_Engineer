import { describe, it, expect } from 'vitest';
import { buildOrchestratorPromotion, ACTOR_ROLE, DEFAULT_REASON } from './promote-parent-to-orchestrator.js';

describe('buildOrchestratorPromotion — SD-FDBK-INFRA-DECOMPOSE-PLAN-DEADLOCK-001', () => {
  it('emits sd_type=orchestrator', () => {
    const patch = buildOrchestratorPromotion();
    expect(patch.sd_type).toBe('orchestrator');
  });

  it('emits BOTH bypass dialects (the empirically-verified combo that passes both triggers)', () => {
    const patch = buildOrchestratorPromotion({}, { reason: 'A sufficiently long governance reason for promotion.' });
    // Dialect 1: trg_enforce_type_change_timing reads automation_context.
    expect(patch.governance_metadata.automation_context).toEqual({
      bypass_governance: true,
      actor_role: ACTOR_ROLE,
      bypass_reason: 'A sufficiently long governance reason for promotion.',
    });
    // Dialect 2: trg_enforce_sd_type_change_governance reads type_change_reason (does NOT honor automation_context).
    expect(patch.governance_metadata.type_change_reason).toBe('A sufficiently long governance reason for promotion.');
  });

  it('preserves existing governance_metadata', () => {
    const existing = { foo: 'bar', nested: { a: 1 }, type_reclassification: { from: 'infrastructure', to: 'orchestrator' } };
    const patch = buildOrchestratorPromotion(existing, { reason: 'A sufficiently long governance reason here.' });
    expect(patch.governance_metadata.foo).toBe('bar');
    expect(patch.governance_metadata.nested).toEqual({ a: 1 });
    expect(patch.governance_metadata.type_reclassification).toEqual({ from: 'infrastructure', to: 'orchestrator' });
  });

  it('clamps a too-short reason to DEFAULT_REASON (>=20 chars, the governance floor)', () => {
    const patch = buildOrchestratorPromotion({}, { reason: 'too short' });
    expect(patch.governance_metadata.type_change_reason).toBe(DEFAULT_REASON);
    expect(patch.governance_metadata.automation_context.bypass_reason).toBe(DEFAULT_REASON);
    expect(DEFAULT_REASON.length).toBeGreaterThanOrEqual(20);
  });

  it('falls back to DEFAULT_REASON when reason is empty/whitespace/undefined', () => {
    expect(buildOrchestratorPromotion().governance_metadata.type_change_reason).toBe(DEFAULT_REASON);
    expect(buildOrchestratorPromotion({}, { reason: '   ' }).governance_metadata.type_change_reason).toBe(DEFAULT_REASON);
    expect(buildOrchestratorPromotion({}, {}).governance_metadata.type_change_reason).toBe(DEFAULT_REASON);
  });

  it('tolerates a non-object existingMeta without throwing', () => {
    expect(() => buildOrchestratorPromotion(null)).not.toThrow();
    expect(() => buildOrchestratorPromotion('garbage')).not.toThrow();
    expect(buildOrchestratorPromotion(null).governance_metadata.automation_context.actor_role).toBe(ACTOR_ROLE);
  });

  it('trims a valid reason at the boundary (exactly 20 chars passes)', () => {
    const twenty = 'x'.repeat(20);
    const patch = buildOrchestratorPromotion({}, { reason: twenty });
    expect(patch.governance_metadata.type_change_reason).toBe(twenty);
  });
});
