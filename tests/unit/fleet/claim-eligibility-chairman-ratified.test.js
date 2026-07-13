/**
 * SD-LEO-INFRA-BELT-CLAIM-ELIGIBILITY-001 (FR-1): chairman_ratification_pending axis.
 *
 * Adam stamps metadata.chairman_ratified === false on an SD that sits draft/unfenced/ranked but
 * is awaiting chairman ratification; belt eligibility must key on it. Fail-open on absence: an SD
 * that never carries the field (today's overwhelming majority) must remain claimable unchanged.
 */
import { describe, it, expect } from 'vitest';

const { classifyDispatchIneligibility, classifyAllDispatchIneligibility, CLAIM_WRITE_FENCE_AXES } =
  require('../../../lib/fleet/claim-eligibility.cjs');

describe('SD-LEO-INFRA-BELT-CLAIM-ELIGIBILITY-001: chairman_ratification_pending axis', () => {
  it('blocks an SD explicitly stamped chairman_ratified=false', () => {
    const row = {
      sd_key: 'SD-FIXTURE-CHAIRMAN-RATIFIED-001',
      sd_type: 'feature',
      status: 'draft',
      metadata: { chairman_ratified: false },
    };
    expect(classifyDispatchIneligibility(row)).toBe('chairman_ratification_pending');
  });

  it('is claimable once chairman_ratified flips to true', () => {
    const row = {
      sd_key: 'SD-FIXTURE-CHAIRMAN-RATIFIED-002',
      sd_type: 'feature',
      status: 'draft',
      metadata: { chairman_ratified: true },
    };
    expect(classifyDispatchIneligibility(row)).toBeNull();
  });

  it('fails OPEN when the field is absent (preserves today\'s behavior for the overwhelming majority of SDs)', () => {
    const row = { sd_key: 'SD-FIXTURE-CHAIRMAN-RATIFIED-003', sd_type: 'feature', status: 'draft', metadata: {} };
    expect(classifyDispatchIneligibility(row)).toBeNull();
  });

  it('fails OPEN when metadata itself is absent', () => {
    const row = { sd_key: 'SD-FIXTURE-CHAIRMAN-RATIFIED-004', sd_type: 'feature', status: 'draft' };
    expect(classifyDispatchIneligibility(row)).toBeNull();
  });

  it('classifyAllDispatchIneligibility surfaces chairman_ratification_pending alongside other axes', () => {
    const row = {
      sd_key: 'SD-FIXTURE-CHAIRMAN-RATIFIED-005',
      sd_type: 'feature',
      status: 'draft',
      metadata: { chairman_ratified: false, needs_coordinator_review: true },
    };
    const all = classifyAllDispatchIneligibility(row);
    expect(all).toContain('chairman_ratification_pending');
    expect(all).toContain('needs_coordinator_review');
  });

  it('CLAIM_WRITE_FENCE_AXES includes chairman_ratification_pending', () => {
    expect(CLAIM_WRITE_FENCE_AXES.has('chairman_ratification_pending')).toBe(true);
  });
});
