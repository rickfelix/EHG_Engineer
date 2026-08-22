/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-6/FR-7) — behavioral test for
 * verifySyntheticActorFencingConfigured, the defense-in-depth exit_observe
 * registration backing gate string "synthetic-actor-fencing-configured".
 * Mirrors exit-gate-verifiers-fr1.test.js's pattern: resolve via the EXACT
 * gate string it documents backing (so a `match` key typo fails this suite),
 * then exercise both branches against a mocked checkSyntheticActorFencing
 * (its own internal logic is covered by synthetic-actor-guard.test.js).
 */
import { describe, it, expect, vi } from 'vitest';

let mockResult = { applies: false, satisfied: true, reason: '' };
vi.mock('../../../../lib/eva/synthetic-actor-guard.js', () => ({
  checkSyntheticActorFencing: vi.fn(async () => mockResult),
}));

import { resolveVerifier } from '../../../../lib/eva/lifecycle/exit-gate-verifiers.js';

describe('verifySyntheticActorFencingConfigured (gate string: "synthetic-actor-fencing-configured")', () => {
  const verifier = resolveVerifier('synthetic-actor-fencing-configured');

  it('resolves to a registered verifier', () => {
    expect(verifier).toBeTypeOf('function');
  });

  it('satisfied when the venture has not opted in (applies:false)', async () => {
    mockResult = { applies: false, satisfied: true, reason: '' };
    const r = await verifier({ supabase: {}, ventureId: 'v-1' });
    expect(r.satisfied).toBe(true);
  });

  it('satisfied when the guard is satisfied', async () => {
    mockResult = { applies: true, satisfied: true, reason: '' };
    const r = await verifier({ supabase: {}, ventureId: 'v-1' });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied, with the guard\'s reason surfaced, when the guard is not satisfied', async () => {
    mockResult = { applies: true, satisfied: false, reason: 'exclusion_predicate_ref is a placeholder' };
    const r = await verifier({ supabase: {}, ventureId: 'v-1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toBe('exclusion_predicate_ref is a placeholder');
  });
});
