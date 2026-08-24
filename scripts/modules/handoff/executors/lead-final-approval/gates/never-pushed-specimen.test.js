import { describe, it, expect } from 'vitest';
import { isNeverPushedSpecimen } from '../gates.js';

/**
 * SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-4, TR-8, TS-8).
 *
 * Pure unit test, no DB. TS-8 was flagged UNWRITABLE-AS-SPECIFIED by the TESTING sub-agent's
 * PLAN-phase review: a DB-backed fixture would file under the vitest `db` project, which runs
 * ZERO files when no non-production target is designated (gates.js:629-632 documents the same
 * trap for this gate's own key-set loader). Because isNeverPushedSpecimen is a pure classifier
 * shared by the live gate and the retro census script, this suite exercises the exact same logic
 * both callers use — with no I/O.
 */
describe('isNeverPushedSpecimen', () => {
  it('flags a code-implying SD with zero evidence anywhere', () => {
    expect(isNeverPushedSpecimen({
      sd: { sd_type: 'infrastructure' },
      shipReviewFindings: [],
      metadata: { openPRs: 0, unmergedBranches: 0 },
    })).toBe(true);
  });

  it('does NOT flag a documentation-type SD, even with zero evidence (exemption)', () => {
    expect(isNeverPushedSpecimen({
      sd: { sd_type: 'documentation' },
      shipReviewFindings: [],
      metadata: { openPRs: 0, unmergedBranches: 0 },
    })).toBe(false);
  });

  it('does NOT flag a code-implying SD with an open PR', () => {
    expect(isNeverPushedSpecimen({
      sd: { sd_type: 'infrastructure' },
      shipReviewFindings: [],
      metadata: { openPRs: 1, unmergedBranches: 0 },
    })).toBe(false);
  });

  it('does NOT flag a code-implying SD with merge evidence in metadata', () => {
    expect(isNeverPushedSpecimen({
      sd: { sd_type: 'infrastructure' },
      shipReviewFindings: [],
      metadata: { openPRs: 0, unmergedBranches: 0, hasMergeEvidence: true },
    })).toBe(false);
  });

  it('does NOT flag a code-implying SD with a ship_review_findings row (pr_number present)', () => {
    expect(isNeverPushedSpecimen({
      sd: { sd_type: 'infrastructure' },
      shipReviewFindings: [{ pr_number: 1234, sd_key: 'SD-X-001' }],
      metadata: { openPRs: 0, unmergedBranches: 0 },
    })).toBe(false);
  });

  it('does NOT flag a code-implying SD with an unmerged branch (a different, already-covered failure mode)', () => {
    expect(isNeverPushedSpecimen({
      sd: { sd_type: 'infrastructure' },
      shipReviewFindings: [],
      metadata: { openPRs: 0, unmergedBranches: 2 },
    })).toBe(false);
  });

  it('handles missing metadata/findings gracefully (still flags a bare code-implying SD)', () => {
    expect(isNeverPushedSpecimen({ sd: { sd_type: 'api' } })).toBe(true);
  });
});
