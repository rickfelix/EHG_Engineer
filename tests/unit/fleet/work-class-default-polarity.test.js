/**
 * QF-20260807-195 (feedback 8740004e / signal 8cf4545b) — the work-class module stated one
 * policy and implemented its opposite.
 *
 * C-STARVE says creative detection "errs toward ADMITTING plausibly-creative work for Fable;
 * only clearly-general work is hard-denied". But text matching NEITHER regex derived
 * 'unclassified', and workClassIneligibilityReason turned that into a non-null reason — which IS
 * a fence. The default for no-signal text was DENY, and the recall-tuning only ever reached rows
 * that had already matched CREATIVE_RE.
 *
 * The last describe block is the one the fix is really about: it pins the POLICY SENTENCE in the
 * source to the CODE BEHAVIOUR, so the two cannot silently diverge again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const MODULE_PATH = join(process.cwd(), 'lib/fleet/work-class.cjs');
const { deriveWorkClass, workClassIneligibilityReason, workClassAdmissionNote } = require_(MODULE_PATH);

const NO_SIGNAL = { title: 'Core Skills Rebuild', description: 'from-scratch regeneration of the most-used skills' };
const CLEARLY_CREATIVE = { title: 'Design the landing page hero', description: 'brand palette' };
const CLEARLY_GENERAL = { title: 'Fix flaky cron gate', description: 'harness lint' };

describe('QF-20260807-195: no-signal text must not hard-deny the Fable lane', () => {
  it('derives unclassified for text matching neither regex (the classifier is honest)', () => {
    expect(deriveWorkClass(NO_SIGNAL)).toBe('unclassified');
  });

  it('THE FIX: unclassified is ADMISSIBLE for fable — it no longer fences', () => {
    expect(workClassIneligibilityReason(NO_SIGNAL, 'fable')).toBeNull();
  });

  it('SURFACES the admission rather than admitting silently', () => {
    // Trading a silent fence for a silent admission would be no improvement.
    expect(workClassAdmissionNote(NO_SIGNAL, 'fable')).toBe('admitted_unclassified');
    expect(workClassAdmissionNote(CLEARLY_CREATIVE, 'fable')).toBeNull();
  });

  it('the surface note rides a SEPARATE channel from the fence verdict', () => {
    // The fence predicate is first-truthy-wins, so a note returned through it would be
    // indistinguishable from a fence. Both are queried here to prove they are independent.
    expect(workClassIneligibilityReason(NO_SIGNAL, 'fable')).toBeNull();
    expect(workClassAdmissionNote(NO_SIGNAL, 'fable')).toBeTruthy();
  });
});

describe('QF-20260807-195: two-sided — clearly-general is STILL hard-denied', () => {
  it('a clearly-general item still fences for fable (the fence is not gutted)', () => {
    expect(deriveWorkClass(CLEARLY_GENERAL)).toBe('general_harness');
    expect(workClassIneligibilityReason(CLEARLY_GENERAL, 'fable')).toBe('work_class_mismatch');
  });

  it('a clearly-creative item is admissible, as it always was', () => {
    expect(workClassIneligibilityReason(CLEARLY_CREATIVE, 'fable')).toBeNull();
  });

  it('non-fable models are entirely unaffected — the fence stays a no-op for them', () => {
    for (const model of ['sonnet', 'opus', undefined, null, 'unknown-model']) {
      expect(workClassIneligibilityReason(CLEARLY_GENERAL, model)).toBeNull();
      expect(workClassAdmissionNote(NO_SIGNAL, model)).toBeNull();
    }
  });

  it('an explicit override still wins over derivation, in both directions', () => {
    expect(workClassIneligibilityReason({ ...CLEARLY_GENERAL, metadata: { work_class_override: 'creative_design' } }, 'fable')).toBeNull();
    expect(workClassIneligibilityReason({ ...CLEARLY_CREATIVE, metadata: { work_class_override: 'general_harness' } }, 'fable')).toBe('work_class_mismatch');
  });
});

describe('QF-20260807-195: the POLICY SENTENCE is pinned to the CODE BEHAVIOUR', () => {
  const src = readFileSync(MODULE_PATH, 'utf8');

  it('the module still states the C-STARVE admit-toward-creative policy', () => {
    // If someone deletes the policy, this fails and they must decide deliberately.
    expect(src).toMatch(/only clearly-general work is hard-denied/i);
  });

  it('and the code HONOURS it: the only fencing verdict is a positive mismatch', () => {
    // The sentence above is a claim about behaviour. These assertions are that behaviour.
    // Divergence between them is exactly what shipped, so they are asserted together.
    const fenced = [NO_SIGNAL, CLEARLY_CREATIVE, CLEARLY_GENERAL]
      .filter((row) => workClassIneligibilityReason(row, 'fable') !== null);
    expect(fenced).toEqual([CLEARLY_GENERAL]);
  });

  it('the retired fail-closed intent is GONE from the source, not just overridden', () => {
    // Two contradictory policy statements is the condition that let the deny half win silently.
    expect(src).not.toMatch(/fail-closed: unknown class on a restricted model/i);
  });

  it("'work_class_unclassified' is no longer a returnable fence reason", () => {
    for (const row of [NO_SIGNAL, {}, { title: '' }, null]) {
      expect(workClassIneligibilityReason(row, 'fable')).not.toBe('work_class_unclassified');
    }
  });
});
