/**
 * SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-2/FR-6 -- unit coverage for the JS-side
 * artifact-precondition mirror, using injected-stub Supabase clients so the pure decision
 * logic (canonical/legacy/S22-flag precedence + the deviation-valve reuse) is exercised
 * without a live DB.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkStageArtifactPrecondition } from '../../../lib/eva/stage-artifact-precondition.js';

vi.mock('../../../lib/eva/deviation-ledger.js', () => ({
  readDeviations: vi.fn(),
}));
import { readDeviations } from '../../../lib/eva/deviation-ledger.js';

function fakeSupabase({ metadata = {}, flagEnabled = false, canonicalArtifacts = [], legacyArtifacts = [], presentArtifacts = [] } = {}) {
  return {
    from(table) {
      if (table === 'ventures') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { metadata }, error: null }) }) }) };
      }
      if (table === 'leo_feature_flags') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { is_enabled: flagEnabled }, error: null }) }) }) };
      }
      if (table === 'venture_stages') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { required_artifacts: canonicalArtifacts }, error: null }) }) }) };
      }
      if (table === 'stage_artifact_requirements') {
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: legacyArtifacts.map((a) => ({ artifact_type: a })), error: null }) }) }) };
      }
      if (table === 'venture_artifacts') {
        return { select: () => ({ eq: () => ({ eq: () => ({ in: () => Promise.resolve({ data: presentArtifacts.map((a) => ({ artifact_type: a })), error: null }) }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('checkStageArtifactPrecondition: canonical/legacy/S22-flag precedence', () => {
  it('uses canonical artifacts when present, ignoring legacy', async () => {
    const sb = fakeSupabase({ canonicalArtifacts: ['wireframe_screens'], legacyArtifacts: ['unrelated_legacy_type'], presentArtifacts: [] });
    readDeviations.mockResolvedValue([]);
    const result = await checkStageArtifactPrecondition(sb, 'v1', 15);
    expect(result.blocked).toBe(true);
    expect(result.missingArtifacts).toEqual(['wireframe_screens']);
    expect(result.source).toBe('canonical_with_fallback_available');
  });

  it('falls back to legacy artifacts when canonical is empty', async () => {
    const sb = fakeSupabase({ canonicalArtifacts: [], legacyArtifacts: ['legacy_only_type'], presentArtifacts: [] });
    readDeviations.mockResolvedValue([]);
    const result = await checkStageArtifactPrecondition(sb, 'v1', 14);
    expect(result.blocked).toBe(true);
    expect(result.missingArtifacts).toEqual(['legacy_only_type']);
    expect(result.source).toBe('legacy_fallback');
  });

  it('uses canonical-only (ignores legacy fallback nuance) when the S22 flag is enabled', async () => {
    const sb = fakeSupabase({ flagEnabled: true, canonicalArtifacts: ['canonical_a'], legacyArtifacts: [], presentArtifacts: ['canonical_a'] });
    readDeviations.mockResolvedValue([]);
    const result = await checkStageArtifactPrecondition(sb, 'v1', 22);
    expect(result.blocked).toBe(false);
    expect(result.source).toBe('canonical');
  });

  it('bypasses the requirement entirely at stage 22 when s22_legacy_skipped metadata is set', async () => {
    const sb = fakeSupabase({ metadata: { s22_legacy_skipped: true }, canonicalArtifacts: ['should_be_ignored'], presentArtifacts: [] });
    readDeviations.mockResolvedValue([]);
    const result = await checkStageArtifactPrecondition(sb, 'v1', 22);
    expect(result.blocked).toBe(false);
    expect(result.source).toBe('bypass_s22_legacy_skipped');
  });

  it('is not blocked when a stage has no required artifacts at all', async () => {
    const sb = fakeSupabase({ canonicalArtifacts: [], legacyArtifacts: [] });
    const result = await checkStageArtifactPrecondition(sb, 'v1', 1);
    expect(result.blocked).toBe(false);
    expect(result.missingArtifacts).toEqual([]);
  });
});

describe('checkStageArtifactPrecondition: FR-6 deviation valve', () => {
  it('a missing artifact with an existing deviation-ledger record is NOT blocking (documented skip)', async () => {
    const sb = fakeSupabase({ canonicalArtifacts: ['blueprint_erd_diagram'], presentArtifacts: [] });
    readDeviations.mockResolvedValue([{ id: 'd1', why: 'descoped for MVP', weight: 'declared-descope' }]);
    const result = await checkStageArtifactPrecondition(sb, 'v1', 19);
    expect(result.blocked).toBe(false);
    expect(result.deviatedArtifacts).toEqual(['blueprint_erd_diagram']);
    expect(result.missingArtifacts).toEqual([]);
  });

  it('an undocumented missing artifact (no deviation record) is still blocking -- never a silent pass', async () => {
    const sb = fakeSupabase({ canonicalArtifacts: ['blueprint_erd_diagram'], presentArtifacts: [] });
    readDeviations.mockResolvedValue([]);
    const result = await checkStageArtifactPrecondition(sb, 'v1', 19);
    expect(result.blocked).toBe(true);
    expect(result.missingArtifacts).toEqual(['blueprint_erd_diagram']);
  });

  it('with 2 required artifacts, one deviated and one truly missing, the result is still blocked (partial documentation is not enough)', async () => {
    const sb = fakeSupabase({ canonicalArtifacts: ['artifact_a', 'artifact_b'], presentArtifacts: [] });
    readDeviations.mockImplementation((_supabase, { artifactRef }) =>
      Promise.resolve(artifactRef === 'artifact_a' ? [{ id: 'd1', why: 'documented' }] : []));
    const result = await checkStageArtifactPrecondition(sb, 'v1', 19);
    expect(result.blocked).toBe(true);
    expect(result.deviatedArtifacts).toEqual(['artifact_a']);
    expect(result.missingArtifacts).toEqual(['artifact_b']);
  });
});

describe('checkStageArtifactPrecondition: fail-open on transient errors', () => {
  it('fails open (not blocked) when the ventures query errors', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'transient' } }) }) }) }) };
    const result = await checkStageArtifactPrecondition(sb, 'v1', 19);
    expect(result.blocked).toBe(false);
    expect(result.source).toBe('check_error_failopen');
  });
});
