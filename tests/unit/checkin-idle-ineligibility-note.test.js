import { describe, it, expect } from 'vitest';
import { formatIdleIneligibilityNote } from '../../lib/checkin/steps/idle.cjs';

// QF-20260719-144: the idle "nothing claimable" note must report the ACTUAL ineligibility
// breakdown (from classifyDispatchIneligibility), not blame TIER whenever tiering is active.
// Regression: a worker saw "0 claimable at your tier — all above your rung" while the ground
// truth was 12x human_action_required / 5x orchestrator_parent / 1x test_fixture_key, 0 tier.

describe('formatIdleIneligibilityNote (QF-20260719-144)', () => {
  it('names real non-tier blockers instead of blaming the rung', () => {
    const note = formatIdleIneligibilityNote(18, 0,
      { human_action_required: 12, orchestrator_parent: 5, test_fixture_key: 1 }, true);
    expect(note).toContain('NONE tier-blocked');
    expect(note).toContain('12x human_action_required');
    expect(note).toContain('5x orchestrator_parent');
    expect(note).not.toContain('above your rung');
  });

  it('blames the rung ONLY for items actually in the tier family', () => {
    const note = formatIdleIneligibilityNote(4, 0,
      { above_worker_tier: 3, human_action_required: 1 }, true);
    expect(note).toContain('3 above your rung');
    expect(note).toContain('1x human_action_required');
  });

  it('falls back to the prior tiering-aware wording when no breakdown is available', () => {
    expect(formatIdleIneligibilityNote(5, 0, null, true)).toContain('all above your rung');
    expect(formatIdleIneligibilityNote(5, 0, undefined, false)).toContain('0 claimable by any worker');
  });

  it('returns empty when work IS claimable at this tier (or nothing is ranked)', () => {
    expect(formatIdleIneligibilityNote(5, 2, { orchestrator_parent: 3 }, true)).toBe('');
    expect(formatIdleIneligibilityNote(0, 0, {}, true)).toBe('');
  });

  it('sorts reasons by descending count (dominant blocker first)', () => {
    const note = formatIdleIneligibilityNote(10, 0,
      { needs_coordinator_review: 2, human_action_required: 8 }, true);
    expect(note.indexOf('8x human_action_required')).toBeLessThan(note.indexOf('2x needs_coordinator_review'));
  });
});
