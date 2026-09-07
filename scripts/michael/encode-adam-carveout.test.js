// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G / FR-6, TS-6.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { planCarveoutEncode, ADAM_ANCHOR, MICHAEL_ANCHOR } from './encode-adam-carveout.mjs';

describe('FR-6 AC-3: no live chairman_ratifications write in this script (static guard)', () => {
  it('encode-adam-carveout.mjs never calls recordChairmanRatification', () => {
    const src = fs.readFileSync(new URL('./encode-adam-carveout.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/recordChairmanRatification/);
  });
});

const RATIFICATION = {
  id: 'rat-fixture-1',
  quote: 'Personal-day lane (SITE-EDIT, ratification rat-fixture-1, 2026-XX-XX): the fixture clause text.',
  target_contracts: ['adam', 'michael'],
};

function fixtureSections() {
  return {
    adamSection: { id: 601, content: `before. ${ADAM_ANCHOR} after.` },
    michaelSection: { id: 658, content: `before. ${MICHAEL_ANCHOR} after.` },
  };
}

describe('planCarveoutEncode — FR-6 precondition', () => {
  it('refuses NO_RATIFICATION when no ratification row is supplied (the chairman has not ratified yet)', () => {
    const { adamSection, michaelSection } = fixtureSections();
    const plan = planCarveoutEncode({ adamSection, michaelSection, ratification: null });
    expect(plan).toEqual({ ok: false, refusal: 'NO_RATIFICATION', detail: expect.any(String) });
  });

  it('refuses RATIFICATION_WRONG_TARGETS when target_contracts is missing adam or michael', () => {
    const { adamSection, michaelSection } = fixtureSections();
    const plan = planCarveoutEncode({ adamSection, michaelSection, ratification: { ...RATIFICATION, target_contracts: ['adam', 'coordinator'] } });
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toBe('RATIFICATION_WRONG_TARGETS');
  });
});

describe('planCarveoutEncode — dual-target write shape', () => {
  it('produces both adamContent and michaelContent together when both anchors are present exactly once', () => {
    const { adamSection, michaelSection } = fixtureSections();
    const plan = planCarveoutEncode({ adamSection, michaelSection, ratification: RATIFICATION });
    expect(plan.ok).toBe(true);
    expect(plan.adamContent).toContain(RATIFICATION.quote);
    expect(plan.michaelContent).toContain(RATIFICATION.quote);
    expect(plan.adamContent).toContain(`MICHAEL-CARVEOUT-ENCODED ratification=${RATIFICATION.id}`);
    expect(plan.michaelContent).toContain(`MICHAEL-CARVEOUT-ENCODED ratification=${RATIFICATION.id}`);
  });

  it('refuses ANCHOR_NOT_EXACTLY_ONE and returns no content for either target when the adam anchor is missing', () => {
    const { michaelSection } = fixtureSections();
    const adamSection = { id: 601, content: 'no anchor here at all' };
    const plan = planCarveoutEncode({ adamSection, michaelSection, ratification: RATIFICATION });
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toBe('ANCHOR_NOT_EXACTLY_ONE');
    expect(plan.adamContent).toBeUndefined();
    expect(plan.michaelContent).toBeUndefined();
  });

  it('refuses ANCHOR_NOT_EXACTLY_ONE (zero writes to either target) when the michael anchor occurs twice', () => {
    const { adamSection } = fixtureSections();
    const michaelSection = { id: 658, content: `${MICHAEL_ANCHOR} ... ${MICHAEL_ANCHOR}` };
    const plan = planCarveoutEncode({ adamSection, michaelSection, ratification: RATIFICATION });
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toBe('ANCHOR_NOT_EXACTLY_ONE');
    expect(plan.adamContent).toBeUndefined();
    expect(plan.michaelContent).toBeUndefined();
  });
});

describe('planCarveoutEncode — idempotency (TESTING review correction: clean exit, not throw)', () => {
  it('a second run against already-encoded content is a clean no-op, not a refusal', () => {
    const { adamSection, michaelSection } = fixtureSections();
    const first = planCarveoutEncode({ adamSection, michaelSection, ratification: RATIFICATION });
    expect(first.ok).toBe(true);
    const second = planCarveoutEncode({
      adamSection: { id: 601, content: first.adamContent },
      michaelSection: { id: 658, content: first.michaelContent },
      ratification: RATIFICATION,
    });
    expect(second).toEqual({ ok: true, alreadyEncoded: true });
  });

  it('refuses PARTIALLY_ENCODED if only one target already carries the delimiter block', () => {
    const { adamSection, michaelSection } = fixtureSections();
    const first = planCarveoutEncode({ adamSection, michaelSection, ratification: RATIFICATION });
    const plan = planCarveoutEncode({
      adamSection: { id: 601, content: first.adamContent },
      michaelSection, // unchanged, still un-encoded
      ratification: RATIFICATION,
    });
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toBe('PARTIALLY_ENCODED');
  });

  it('a DIFFERENT ratification id against already-encoded (prior ratification) content is not treated as already-encoded, and additively inserts its own block without disturbing the prior one', () => {
    const { adamSection, michaelSection } = fixtureSections();
    const first = planCarveoutEncode({ adamSection, michaelSection, ratification: RATIFICATION });
    const other = { ...RATIFICATION, id: 'rat-fixture-2', quote: 'A different, later-ratified clause text.' };
    const plan = planCarveoutEncode({
      adamSection: { id: 601, content: first.adamContent },
      michaelSection: { id: 658, content: first.michaelContent },
      ratification: other,
    });
    // The bare ANCHOR text is left untouched by the first insertion (only appended-after), so it
    // still occurs exactly once — a second distinct ratification inserts its own new block right
    // after the anchor without deleting or overwriting the first ratification's block.
    expect(plan.ok).toBe(true);
    expect(plan.adamContent).toContain(RATIFICATION.quote);
    expect(plan.adamContent).toContain(other.quote);
    expect(plan.adamContent).toContain(`MICHAEL-CARVEOUT-ENCODED ratification=${RATIFICATION.id}`);
    expect(plan.adamContent).toContain(`MICHAEL-CARVEOUT-ENCODED ratification=${other.id}`);
  });
});
