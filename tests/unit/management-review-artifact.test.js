import { describe, it, expect } from 'vitest';
import { buildReviewArtifact, MANAGEMENT_REVIEWS_COLUMNS } from '../../lib/pipeline/management-review-artifact.mjs';

// SD-LEO-FEAT-PRE-EXISTING-BUG-001: the generator must NOT write the non-existent capability_gaps column
// (which 42703-errored every live run). These tests guard the payload shape against a non-existent column.

const sampleParts = {
  reviewDate: '2026-06-20',
  baselineData: { version: 3, totalItems: 12 },
  sdData: { completed: 7 },
  ventureData: { activeCount: 4, ventures: [{ stage: 6 }, { stage: 2 }, { stage: 9 }] },
  okrData: { snapshot: { objectives: 3 } },
  riskData: { hasForecasts: true, totalForecasts: 5 },
  pipelineData: { stages: 40 },
  narrative: 'Weekly review narrative.',
};

describe('buildReviewArtifact (management_reviews payload)', () => {
  it('does NOT include the non-existent capability_gaps column', () => {
    const review = buildReviewArtifact(sampleParts);
    expect(review).not.toHaveProperty('capability_gaps');
  });

  it('writes ONLY real management_reviews columns (allowlist enforced)', () => {
    const review = buildReviewArtifact(sampleParts);
    for (const key of Object.keys(review)) {
      expect(MANAGEMENT_REVIEWS_COLUMNS).toContain(key);
    }
  });

  it('maps the gathered data onto the expected real columns', () => {
    const review = buildReviewArtifact(sampleParts);
    expect(review.review_date).toBe('2026-06-20');
    expect(review.review_type).toBe('weekly');
    expect(review.baseline_version_from).toBe(3);
    expect(review.actual_sds).toBe(7);
    expect(review.planned_ventures).toBe(4);
    expect(review.actual_ventures).toBe(2); // stages 6 and 9 are >= 5
    expect(review.okr_snapshot).toEqual({ objectives: 3 });
    expect(review.risk_snapshot).toEqual(sampleParts.riskData); // hasForecasts -> the forecast object
    expect(review.eva_narrative).toBe('Weekly review narrative.');
  });

  it('null risk_snapshot when there are no forecasts', () => {
    const review = buildReviewArtifact({ ...sampleParts, riskData: { hasForecasts: false } });
    expect(review.risk_snapshot).toBeNull();
  });

  it('tolerates sparse/empty inputs without throwing or inventing columns', () => {
    const review = buildReviewArtifact({ reviewDate: '2026-06-20' });
    expect(review).not.toHaveProperty('capability_gaps');
    for (const key of Object.keys(review)) {
      expect(MANAGEMENT_REVIEWS_COLUMNS).toContain(key);
    }
    expect(review.actual_ventures).toBe(0); // no ventures -> 0
    expect(review.baseline_version_from).toBe(1); // default
  });

  it('the allowlist itself excludes capability_gaps (defense in depth)', () => {
    expect(MANAGEMENT_REVIEWS_COLUMNS).not.toContain('capability_gaps');
  });
});
