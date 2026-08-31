/**
 * QF-20260831-936: metadata.blocked === true is a chairman-lane hold with no axis reader --
 * resume_orphan adopted a held SD past the adoption gate and generic handoff gates (94% pass),
 * because a chairman-lane block is invisible to generic gates and this shared classifier
 * (consumed by self_claim, orphan-adoption, directed-assign, and stale-session-sweep) was the
 * one place that could have stopped it.
 */
import { describe, it, expect } from 'vitest';

const { classifyDispatchIneligibility, classifyAllDispatchIneligibility, CLAIM_WRITE_FENCE_AXES } =
  require('../../../lib/fleet/claim-eligibility.cjs');

describe('QF-20260831-936: claim-eligibility blocked axis', () => {
  it('classifyDispatchIneligibility returns "blocked" for metadata.blocked === true', () => {
    const row = {
      sd_key: 'SD-FIXTURE-BLOCKED-001',
      sd_type: 'feature',
      status: 'in_progress',
      metadata: { blocked: true },
    };
    expect(classifyDispatchIneligibility(row)).toBe('blocked');
  });

  it('falls through cleanly when metadata.blocked is absent/false', () => {
    const row = { sd_key: 'SD-FIXTURE-BLOCKED-002', sd_type: 'feature', status: 'in_progress', metadata: {} };
    expect(classifyDispatchIneligibility(row)).toBeNull();
    const rowFalse = { sd_key: 'SD-FIXTURE-BLOCKED-003', sd_type: 'feature', status: 'in_progress', metadata: { blocked: false } };
    expect(classifyDispatchIneligibility(rowFalse)).toBeNull();
  });

  it('classifyAllDispatchIneligibility surfaces "blocked" alongside other axes', () => {
    const row = {
      sd_key: 'SD-FIXTURE-BLOCKED-004',
      sd_type: 'feature',
      status: 'in_progress',
      metadata: { blocked: true, needs_coordinator_review: true },
    };
    const all = classifyAllDispatchIneligibility(row);
    expect(all).toContain('blocked');
    expect(all).toContain('needs_coordinator_review');
  });

  it('CLAIM_WRITE_FENCE_AXES includes "blocked" (chairman/coordinator-clearable, binds at claim-write boundary)', () => {
    expect(CLAIM_WRITE_FENCE_AXES.has('blocked')).toBe(true);
  });
});
