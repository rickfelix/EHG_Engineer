/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D (C3.2) — behavioral test for
 * verifyDesignFidelityReviewed, the observe-only Stage 15 exit-gate verifier backing gate
 * string "design fidelity reviewed". Mirrors exit-gate-verifiers-synthetic-actor.test.js's
 * pattern: resolve via the EXACT gate string it documents backing, then exercise every
 * fail-closed branch plus the satisfied path against a mocked Supabase client.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveVerifier } from '../../../../lib/eva/lifecycle/exit-gate-verifiers.js';

function makeSupabase(row, error = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
  };
  return { from: vi.fn(() => query) };
}

describe('verifyDesignFidelityReviewed (gate string: "design fidelity reviewed")', () => {
  const verifier = resolveVerifier('design fidelity reviewed');

  it('resolves to a registered verifier', () => {
    expect(verifier).toBeTypeOf('function');
  });

  it('fail-closed on a query error', async () => {
    const supabase = makeSupabase(null, { message: 'connection reset' });
    const r = await verifier({ supabase, ventureId: 'v-1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/fail-closed/);
  });

  it('fail-closed when stitch_qa_report is missing', async () => {
    const supabase = makeSupabase(null);
    const r = await verifier({ supabase, ventureId: 'v-1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/missing or not is_current/);
  });

  it('fail-closed when metadata.wireframe_fidelity is absent', async () => {
    const supabase = makeSupabase({ metadata: {} });
    const r = await verifier({ supabase, ventureId: 'v-1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/wireframe_fidelity missing/);
  });

  it("fail-closed when status is 'no_screens' (the expected outcome today -- no venture fleet-wide has a stitch_design_export artifact)", async () => {
    const supabase = makeSupabase({ metadata: { wireframe_fidelity: { status: 'no_screens' } } });
    const r = await verifier({ supabase, ventureId: 'v-1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/not 'completed'/);
  });

  it('fail-closed when completed but aggregate.fail_count is missing', async () => {
    const supabase = makeSupabase({ metadata: { wireframe_fidelity: { status: 'completed', aggregate: {} } } });
    const r = await verifier({ supabase, ventureId: 'v-1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/fail_count missing/);
  });

  it('unsatisfied when completed but at least one screen failed', async () => {
    const supabase = makeSupabase({ metadata: { wireframe_fidelity: { status: 'completed', aggregate: { fail_count: 2 } } } });
    const r = await verifier({ supabase, ventureId: 'v-1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/2 screen/);
  });

  it('satisfied when completed with zero failing screens', async () => {
    const supabase = makeSupabase({ metadata: { wireframe_fidelity: { status: 'completed', aggregate: { fail_count: 0 } } } });
    const r = await verifier({ supabase, ventureId: 'v-1' });
    expect(r.satisfied).toBe(true);
  });
});
