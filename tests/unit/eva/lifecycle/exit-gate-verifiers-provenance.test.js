/**
 * Unit tests for exit-gate-verifiers.js's checkGateProvenance() -- the advisory-only
 * machine-provenance re-query dispatched by exit-gate-enforcer.js alongside each verifier call.
 *
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (FR-5)
 *
 * @module tests/unit/eva/lifecycle/exit-gate-verifiers-provenance.test
 */
import { describe, it, expect, vi } from 'vitest';
import { checkGateProvenance, GATE_VERIFIERS } from '../../../../lib/eva/lifecycle/exit-gate-verifiers.js';

function findVerifier(matchSubstring) {
  return GATE_VERIFIERS.find((g) => g.match === matchSubstring).verifier;
}

function mockSupabaseReturning(rows) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              limit: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe('checkGateProvenance()', () => {
  it('returns [] for a verifier not backed by venture_artifacts (e.g. a ventures-table gate)', async () => {
    const verifier = findVerifier('github repo url');
    const result = await checkGateProvenance(mockSupabaseReturning([]), 'v1', verifier);
    expect(result).toEqual([]);
  });

  it('returns the artifact_type for a present, unprovenanced, post-cutover row', async () => {
    const verifier = findVerifier('application deployed');
    const supabase = mockSupabaseReturning([
      { artifact_type: 'build_mvp_build', metadata: null, created_at: '2026-09-14T00:00:00Z' },
    ]);
    const result = await checkGateProvenance(supabase, 'v1', verifier);
    expect(result).toEqual(['build_mvp_build']);
  });

  it('returns [] for a pre-cutover legacy row', async () => {
    const verifier = findVerifier('application deployed');
    const supabase = mockSupabaseReturning([
      { artifact_type: 'build_mvp_build', metadata: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    const result = await checkGateProvenance(supabase, 'v1', verifier);
    expect(result).toEqual([]);
  });

  it('returns [] when supabase or ventureId is missing (defensive)', async () => {
    const verifier = findVerifier('application deployed');
    expect(await checkGateProvenance(null, 'v1', verifier)).toEqual([]);
    expect(await checkGateProvenance(mockSupabaseReturning([]), null, verifier)).toEqual([]);
  });

  it('degrades to [] (never throws) when the query errors or the client lacks a chained method', async () => {
    const verifier = findVerifier('application deployed');
    const throwingSupabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ /* no .in() */ }) }) }) }) };
    await expect(checkGateProvenance(throwingSupabase, 'v1', verifier)).resolves.toEqual([]);
  });

  it('the 3 code_quality_report verifiers (security/secrets/lint) share the same artifact-type mapping', async () => {
    const security = findVerifier('no critical security issues');
    const secrets = findVerifier('no exposed secrets');
    const lint = findVerifier('lint passes');
    const row = { artifact_type: 'code_quality_report', metadata: null, created_at: '2026-09-14T00:00:00Z' };
    for (const verifier of [security, secrets, lint]) {
      const result = await checkGateProvenance(mockSupabaseReturning([row]), 'v1', verifier);
      expect(result).toEqual(['code_quality_report']);
    }
  });
});
