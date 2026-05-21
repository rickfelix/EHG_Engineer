/**
 * Regression test for QF-20260521-259 (closes feedback 02431bca + edb8fc43).
 *
 * computeMissingArtifacts counts a required artifact_type as delivered when it appears in a
 * worker-source row OR an advisory-SUFFIX (-post-hook / -analysis) row — several required
 * deliverables are legitimately emitted that way (wireframe_screens via stage-15-post-hook;
 * identity_brand_guidelines via stage-10-analysis at lifecycle_stage=12), and were previously
 * reported as false missing_artifact positives. Pure ADVISORY_SOURCES (devils-advocate, etc.)
 * still do not satisfy a required type. No DB dependency — pure logic over in-memory data.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { computeMissingArtifacts } = require('../../scripts/monitor-venture-run.cjs');

describe('computeMissingArtifacts — required-deliverable presence', () => {
  it('a -post-hook-sourced required deliverable counts as present (edb8fc43: wireframe_screens)', () => {
    const arts = [{ artifact_type: 'wireframe_screens', source: 'stage-15-post-hook' }];
    expect(computeMissingArtifacts(15, arts, ['wireframe_screens'])).toEqual([]);
  });

  it('a -analysis-sourced required deliverable counts as present (02431bca: identity_brand_guidelines at S12)', () => {
    const arts = [{ artifact_type: 'identity_brand_guidelines', source: 'stage-10-analysis' }];
    expect(computeMissingArtifacts(12, arts, ['identity_brand_guidelines'])).toEqual([]);
  });

  it('a normal worker-source required deliverable still counts as present', () => {
    const arts = [{ artifact_type: 'financial_projections', source: 'stage-16' }];
    expect(computeMissingArtifacts(16, arts, ['financial_projections'])).toEqual([]);
  });

  it('a genuinely absent required deliverable is still reported missing', () => {
    const arts = [{ artifact_type: 'something_else', source: 'stage-16' }];
    expect(computeMissingArtifacts(16, arts, ['financial_projections'])).toEqual(['financial_projections']);
  });

  it('a pure ADVISORY_SOURCE (devils-advocate) does NOT satisfy a required type', () => {
    const arts = [{ artifact_type: 'financial_projections', source: 'devils-advocate' }];
    expect(computeMissingArtifacts(16, arts, ['financial_projections'])).toEqual(['financial_projections']);
  });

  it('no artifacts → all expected reported missing; empty expected → nothing missing', () => {
    expect(computeMissingArtifacts(16, [], ['financial_projections'])).toEqual(['financial_projections']);
    expect(computeMissingArtifacts(16, [{ artifact_type: 'x', source: 'stage-16' }], [])).toEqual([]);
  });
});
