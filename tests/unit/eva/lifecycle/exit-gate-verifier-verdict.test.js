/**
 * SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-4): verifyBuildMvpBuildPresent rejects a PRESENT failing
 * build verdict. DataDistill's build_mvp_build artifact carried artifact_data.verdict='FAIL' yet
 * passed the S19->S20 exit gate because normalizeBuildTaskCompletion has no verdict field and the
 * artifact had no build_tasks_total (so the completion check was a no-op). TS-9 / TS-10.
 */
import { describe, it, expect } from 'vitest';
import { resolveVerifier } from '../../../../lib/eva/lifecycle/exit-gate-verifiers.js';

function mockSupabase({ data = null, error = null } = {}) {
  const chain = {
    from() { return chain; },
    select() { return chain; },
    eq() { return chain; },
    limit() { return chain; },
    async maybeSingle() { return { data, error }; },
  };
  return chain;
}

const VID = '11111111-2222-3333-4444-555555555555';
const verifier = resolveVerifier('Application deployed');

describe('verifyBuildMvpBuildPresent — present-failing-verdict reject (FR-4)', () => {
  it('TS-9: rejects an artifact carrying artifact_data.verdict=FAIL (mirrors DataDistill)', async () => {
    const supabase = mockSupabase({
      data: { id: 'a1', artifact_data: { verdict: 'FAIL', checks_run: 0, findings: [{ severity: 'critical' }] }, content: null },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/verdict=FAIL/i);
  });

  it('TS-9b: rejects when the FAIL verdict is only in the (string) content mirror', async () => {
    const supabase = mockSupabase({
      data: { id: 'a2', artifact_data: null, content: JSON.stringify({ verdict: 'FAIL' }) },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/verdict=FAIL/i);
  });

  it('TS-10: does NOT reject an advisory artifact with no verdict and no completion ledger', async () => {
    const supabase = mockSupabase({
      data: { id: 'a3', artifact_data: { awaiting_replit_sync: true }, content: null },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(true);
  });

  it('does NOT reject a passing verdict', async () => {
    const supabase = mockSupabase({
      data: { id: 'a4', artifact_data: { verdict: 'PASS', build_tasks_total: 3, build_tasks_complete: 3 }, content: null },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(true);
  });

  it('still rejects the pre-existing complete<total incomplete-ledger case (no regression)', async () => {
    const supabase = mockSupabase({
      data: { id: 'a5', artifact_data: { build_tasks_total: 7, build_tasks_complete: 3 }, content: null },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/incomplete: 3\/7/);
  });
});
