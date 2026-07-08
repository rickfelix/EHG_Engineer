// QF-20260705-585 — generalize the not_before + door_class holds to SD self-claim eligibility.
// Harness gap (feedback b0ac7ba1): classifyDispatchIneligibility had no axis for a future-dated
// metadata.not_before SD-level hold or a metadata.door_class_note='one_way' (Fable-tier-supervised
// re-architecture) SD, so the un-baselined-draft self-claim tier let a Sonnet worker self-claim
// SD-ARCH-HOTSPOT-STAGE-WORKER-001 despite both being set. classifyDispatchIneligibility is the
// shared SSOT for both the worker self-claim path and the coordinator/sweep-PUSH path.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility } = require('../../lib/fleet/claim-eligibility.cjs');

describe('classifyDispatchIneligibility — not_before axis (QF-20260705-585)', () => {
  it('a future not_before is NOT self-claimable (not_before_hold)', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { not_before: future } })).toBe('not_before_hold');
  });
  it('a past not_before falls through unchanged (hold has elapsed)', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { not_before: past } })).toBeNull();
  });
  it('no not_before field is byte-identical to today (unaffected)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: {} })).toBeNull();
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X' })).toBeNull();
  });
  it('an unparseable not_before fails open (never blocks on a malformed timestamp)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { not_before: 'not-a-date' } })).toBeNull();
  });
});

describe('classifyDispatchIneligibility — door_class_note axis (QF-20260705-585)', () => {
  it('door_class_note "one_way" is NOT self-claimable (one_way_door_requires_supervision)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { door_class_note: 'one_way' } }))
      .toBe('one_way_door_requires_supervision');
  });
  it('any other door_class_note value (e.g. two_way) falls through unchanged', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { door_class_note: 'two_way' } })).toBeNull();
  });
  it('no door_class_note field is byte-identical to today (unaffected)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: {} })).toBeNull();
  });
});

describe('classifyDispatchIneligibility — hold-axis composition (QF-20260705-585)', () => {
  it('prior axes (orchestrator/fixture/human-action) still win over the new holds', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', sd_type: 'orchestrator', metadata: { not_before: future } }))
      .toBe('orchestrator_parent');
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { requires_human_action: true, not_before: future } }))
      .toBe('human_action_required');
  });
  it('the SD-ARCH-HOTSPOT-STAGE-WORKER-001 specimen (both fields set) is refused on not_before first', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const specimen = { sd_key: 'SD-ARCH-HOTSPOT-STAGE-WORKER-001', metadata: { not_before: future, door_class_note: 'one_way' } };
    expect(classifyDispatchIneligibility(specimen)).toBe('not_before_hold');
  });
});
