// SD-FDBK-INFRA-STALE-SESSION-SWEEP-001 — a DEFERRED SD must be uniformly NON-dispatchable so the
// stale-session-sweep CLAIM_FIX bilateral-clears (not re-asserts) a worker whose live worktree still
// points at a deferred SD, and the worker self-claim path refuses it too. classifyDispatchIneligibility
// is the shared SSOT for both paths.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility, evaluateDispatchEligibility } = require('../../lib/fleet/claim-eligibility.cjs');

describe('classifyDispatchIneligibility — status axis (deferred/terminal)', () => {
  it('classifies a deferred SD as ineligible (sd_deferred)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', status: 'deferred' })).toBe('sd_deferred');
  });
  it('classifies completed/cancelled as ineligible (sd_terminal)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', status: 'completed' })).toBe('sd_terminal');
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', status: 'cancelled' })).toBe('sd_terminal');
  });
  it('leaves active/claimable statuses eligible (null) — no regression to mid-build claims', () => {
    for (const s of ['draft', 'ready', 'in_progress', 'active', 'pending_approval', undefined]) {
      expect(classifyDispatchIneligibility({ sd_key: 'SD-X', status: s })).toBeNull();
    }
  });
  it('still prioritizes the prior axes (orchestrator/fixture/human-action) over status', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', sd_type: 'orchestrator', status: 'deferred' })).toBe('orchestrator_parent');
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { requires_human_action: true }, status: 'in_progress' })).toBe('human_action_required');
  });
});

// Minimal stub: .from().select().eq().maybeSingle() returns the configured row.
function makeSb(row) {
  return {
    from() {
      return {
        select() {
          return {
            eq() { return { maybeSingle: async () => ({ data: row, error: null }) }; },
            in: async () => ({ data: [], error: null }),
          };
        },
      };
    },
  };
}

describe('evaluateDispatchEligibility — deferred SD', () => {
  it('resolves { eligible:false, reason:sd_deferred } for a deferred SD', async () => {
    const sb = makeSb({ sd_key: 'SD-X', sd_type: 'feature', status: 'deferred', dependencies: [] });
    await expect(evaluateDispatchEligibility(sb, 'SD-X')).resolves.toEqual({ eligible: false, reason: 'sd_deferred' });
  });
  it('still resolves eligible:true for an active draft with no deps', async () => {
    const sb = makeSb({ sd_key: 'SD-X', sd_type: 'feature', status: 'draft', dependencies: [] });
    await expect(evaluateDispatchEligibility(sb, 'SD-X')).resolves.toEqual({ eligible: true });
  });
});
