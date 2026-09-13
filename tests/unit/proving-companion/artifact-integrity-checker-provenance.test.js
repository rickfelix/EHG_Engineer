/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (FR-5): advisory-only machine-provenance grading in
 * artifact-integrity-checker.js -- provenance_warnings never affects checks/pass_count/fail_count.
 *
 * @module tests/unit/proving-companion/artifact-integrity-checker-provenance.test
 */
import { describe, it, expect, vi } from 'vitest';

let queryResult = { data: [], error: null };
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => Promise.resolve(queryResult),
        }),
      }),
    }),
  }),
}));

import { checkArtifactIntegrity } from '../../../lib/proving-companion/artifact-integrity-checker.js';
import { VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT } from '../../../lib/eva/artifact-persistence-service.js';

// Computed relative to the live cutover constant (not a hardcoded literal) so this suite
// never silently drifts pre/post when that constant moves (VALIDATION, PLAN-VERIFY).
const POST_CUTOVER = new Date(Date.parse(VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT) + 60_000).toISOString();

describe('checkArtifactIntegrity() machine provenance (advisory-only)', () => {
  it('records a present, unprovenanced, post-cutover artifact in provenance_warnings without touching checks/pass_count/fail_count', async () => {
    queryResult = {
      data: [{
        artifact_type: 'truth_idea_brief',
        content: 'x'.repeat(150),
        artifact_data: null,
        metadata: null,
        quality_score: 80,
        validation_status: 'validated',
        created_at: POST_CUTOVER,
      }],
      error: null,
    };
    const results = await checkArtifactIntegrity('venture-1', 1, 1);
    const stage1 = results['1'];
    expect(stage1.provenance_warnings).toEqual(['truth_idea_brief']);
    // The substance/quality checks are unaffected by the provenance finding.
    expect(stage1.checks.every((c) => c.pass)).toBe(true);
    expect(stage1.fail_count).toBe(0);
  });

  it('does not record a provenance warning for a pre-cutover legacy artifact', async () => {
    queryResult = {
      data: [{
        artifact_type: 'truth_idea_brief',
        content: 'x'.repeat(150),
        artifact_data: null,
        metadata: null,
        quality_score: 80,
        validation_status: 'validated',
        created_at: '2026-01-01T00:00:00Z',
      }],
      error: null,
    };
    const results = await checkArtifactIntegrity('venture-1', 1, 1);
    expect(results['1'].provenance_warnings).toEqual([]);
  });

  it('does not record a provenance warning when the artifact is genuinely missing (nothing to grade)', async () => {
    queryResult = { data: [], error: null };
    const results = await checkArtifactIntegrity('venture-1', 1, 1);
    expect(results['1'].provenance_warnings).toEqual([]);
    expect(results['1'].fail_count).toBeGreaterThan(0);
  });
});
