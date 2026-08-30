/**
 * Proves the FR-2 writeArtifact() declination fix has the intended downstream effect
 * on evaluateRealityGate(): a {applies:false, satisfied:true} artifact now carries
 * quality_score=0/validation_status='rejected', so the designated '23->24'
 * (DEDICATED VENTURE UAT -> LAUNCH READINESS GATE) boundary correctly BLOCKS instead
 * of PASSing on a vacuous declination mislabeled as a validated artifact.
 *
 * SD-FDBK-ENH-APPLIES-FALSE-DECLINATION-001
 *
 * @module tests/unit/eva/reality-gates-declination.test
 */

import { describe, it, expect } from 'vitest';
import { evaluateRealityGate } from '../../../lib/eva/reality-gates.js';

const REQUIRED_ARTIFACT_TYPE = 'launch_uat_report';

function createMockDb(artifactRow) {
  return {
    from: () => ({
      select: function select() { return this; },
      eq: function eq() { return this; },
      in: async () => ({ data: artifactRow ? [artifactRow] : [], error: null }),
    }),
  };
}

describe('evaluateRealityGate() at the designated 23->24 boundary — declination fix effect', () => {
  it('BLOCKS when the required artifact is a declination payload (quality_score=0, correctly rejected)', async () => {
    const supabase = createMockDb({
      artifact_type: REQUIRED_ARTIFACT_TYPE,
      quality_score: 0,
      file_url: null,
      is_current: true,
    });

    const result = await evaluateRealityGate({
      ventureId: 'venture-declination-test',
      fromStage: 23,
      toStage: 24,
      supabase,
      requiredArtifacts: [REQUIRED_ARTIFACT_TYPE],
    });

    expect(result.status).not.toBe('PASS');
    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.artifact_type === REQUIRED_ARTIFACT_TYPE)).toBe(true);
  });

  it('PASSes when the required artifact is a genuine validated artifact (quality_score=70)', async () => {
    const supabase = createMockDb({
      artifact_type: REQUIRED_ARTIFACT_TYPE,
      quality_score: 70,
      file_url: null,
      is_current: true,
    });

    const result = await evaluateRealityGate({
      ventureId: 'venture-declination-test',
      fromStage: 23,
      toStage: 24,
      supabase,
      requiredArtifacts: [REQUIRED_ARTIFACT_TYPE],
    });

    expect(result.status).toBe('PASS');
    expect(result.passed).toBe(true);
  });
});
