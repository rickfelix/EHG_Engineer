/**
 * SD-LEO-INFRA-ROADMAP-LINK-COUNTED-EXCEPTION-001 (FR-2) — the roadmap-link reason must reach
 * createSD from the PROPOSAL lane, not only from the direct lane.
 *
 * WHY THIS TEST EXISTS: the first cut of this SD wired --roadmap-link-reason into direct-lane.js
 * only. --from-proposal / --proposal-b64 / --proposal-stdin share mapProposalToCreateArgs and are
 * the CANONICAL Adam sourcing routes — i.e. where unlinked SDs are actually born at volume — so
 * every SD created there recorded NO_REASON_MARKER with no shipped way to supply a reason. The
 * drive-to-zero target could not be moved by the route that produces most of the gap: the exact
 * "recorded but unmovable" defect this SD exists to close, reproduced inside its own fix.
 *
 * PURE: exercises the exported mapper directly. ZERO live DB access.
 */
import { describe, it, expect } from 'vitest';
import { mapProposalToCreateArgs } from '../../scripts/leo-create-sd.js';

const NORMALIZED = {
  sdKey: 'SD-LEO-INFRA-UNLINKED-001',
  title: 'An unlinked SD',
  type: 'infrastructure',
  priority: 'medium',
  rawType: 'infrastructure',
};

function proposal(extra = {}) {
  return {
    PROPOSAL: true,
    status_intended: 'draft',
    proposed_sd_key: 'SD-LEO-INFRA-UNLINKED-001',
    title: 'An unlinked SD',
    sd_type: 'infrastructure',
    priority: 'medium',
    rationale: 'sourced without a preceding roadmap registration',
    scope: 'DOES: x. DOES NOT: y.',
    metadata: {},
    ...extra,
  };
}

describe('mapProposalToCreateArgs — roadmap_link_reason passthrough (FR-2)', () => {
  it('passes a declared reason through to createSD args', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: 'harness upkeep, no wave exists yet' }));
    expect(args.roadmap_link_reason).toBe('harness upkeep, no wave exists yet');
  });

  it('omits the key entirely when the proposal declares no reason (closed-whitelist invariant)', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal());
    expect(Object.prototype.hasOwnProperty.call(args, 'roadmap_link_reason')).toBe(false);
  });

  it('treats an empty or whitespace-only reason as absent rather than as a supplied reason', () => {
    for (const blank of ['', '   ']) {
      const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: blank }));
      expect(Object.prototype.hasOwnProperty.call(args, 'roadmap_link_reason')).toBe(false);
    }
  });

  it('ignores a non-string reason instead of coercing it', () => {
    for (const junk of [42, true, {}, [], null]) {
      const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: junk }));
      expect(Object.prototype.hasOwnProperty.call(args, 'roadmap_link_reason')).toBe(false);
    }
  });

  it('NO-REGRESSION: adding the key does not disturb the other mapped args', () => {
    const withReason = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: 'a reason' }));
    const without = mapProposalToCreateArgs(NORMALIZED, proposal());
    expect(withReason.sdKey).toBe(without.sdKey);
    expect(withReason.title).toBe(without.title);
    expect(withReason.type).toBe(without.type);
    expect(withReason.metadata).toEqual(without.metadata);
  });
});
