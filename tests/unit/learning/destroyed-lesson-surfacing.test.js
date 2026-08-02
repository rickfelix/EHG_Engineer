// SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 / FR-3 — regression test for a bug I SHIPPED.
//
// The SD is about a learning loop that destroys lessons while reporting success. My first fix for
// the reporting half attached the failure list as a property on the returned ARRAY:
//
//     patterns.destroyed = failures;        // set on the array
//     return { all_patterns: [...improvementPatterns, ...successPatterns] };   // spread drops it
//
// Spreading an array copies its ELEMENTS, not its custom properties. So the field vanished at the
// return statement, and a retrospective in which every lesson was destroyed exited 0 and printed
// output byte-identical to a healthy run with nothing to do. My fix for "destruction is
// indistinguishable from nothing-to-create" was itself indistinguishable from nothing-to-create.
//
// It survived because I verified it by READING the code. TESTING caught it by RUNNING it. These
// tests exist so the next person gets the running version for free.
//
// They deliberately test the SHAPE CONTRACT rather than the whole function: the defect lived
// entirely in how the return value was assembled, so that is where the guard belongs. Testing it
// through a live DB call would couple the guard to Supabase and, per tests/helpers/db-target.js,
// would not execute at all in the gated db project.

import { describe, it, expect } from 'vitest';
// Imported from PRODUCTION, not re-implemented here. A test that copies the logic it checks can
// only confirm its author's belief; this one fails if the real assembly drifts.
import { assembleExtractionResult } from '../../../scripts/auto-extract-patterns-from-retro.js';
const assembleResult = (imp, suc) => assembleExtractionResult(imp, suc, imp.filter((p) => p.action === 'created').length);

/** The shape the loop produces: an array of results carrying failures as a side property. */
function withDestroyed(items, failures) {
  const a = [...items];
  if (failures.length) a.destroyed = failures;
  return a;
}

describe('FR-3: a destroyed lesson must be distinguishable from nothing-to-create', () => {
  it('surfaces destruction when EVERY lesson was lost', () => {
    // The exact scenario that exited 0 with an empty, healthy-looking payload.
    const improvements = withDestroyed([], [
      { improvement: 'lesson A', code: '23505', message: 'duplicate key' },
      { improvement: 'lesson B', code: '23514', message: 'check constraint' },
    ]);
    const r = assembleResult(improvements, []);

    expect(r.lessons_destroyed).toBe(2);
    expect(r.destroyed).toHaveLength(2);
    expect(r.success).toBe(false);           // drives a non-zero exit code
    expect(r.destroyed[0].code).toBe('23505');
  });

  it('THE ACTUAL BUG: destruction must not vanish through the array spread', () => {
    const improvements = withDestroyed([], [{ improvement: 'lost', code: '23505' }]);

    // What shipped: spreading only. The property is gone and nothing downstream can see it.
    const shipped = { all_patterns: [...improvements] };
    expect('destroyed' in shipped).toBe(false);        // reproduces the defect
    expect(shipped.all_patterns).toHaveLength(0);      // ...and looks exactly like a healthy no-op

    // What is correct: collect BEFORE spreading.
    const fixed = assembleResult(improvements, []);
    expect(fixed.lessons_destroyed).toBe(1);
    expect(fixed.success).toBe(false);
  });

  it('CONTROL: a healthy run still reports clean, so the guard is not just failing everything', () => {
    // Without this, every assertion above would also pass against code that reported failure
    // unconditionally — which would be a different way of saying nothing true.
    const r = assembleResult([{ action: 'created' }, { action: 'updated' }], []);
    expect(r.lessons_destroyed).toBe(0);
    expect(r.destroyed).toEqual([]);
    expect(r.success).toBe(true);
    expect(r.patterns_created).toBe(1);
  });

  it('CONTROL: an empty run is distinguishable from a destroyed run', () => {
    // This pair is the whole point of FR-3. Both produce zero patterns; only one is a failure.
    const nothingToDo = assembleResult([], []);
    const everythingLost = assembleResult(withDestroyed([], [{ improvement: 'x', code: '23505' }]), []);

    expect(nothingToDo.patterns_created).toBe(everythingLost.patterns_created); // both 0 — indistinguishable BEFORE
    expect(nothingToDo.success).not.toBe(everythingLost.success);               // distinguishable AFTER
    expect(nothingToDo.lessons_destroyed).not.toBe(everythingLost.lessons_destroyed);
  });

  it('collects destruction from BOTH loops, not just the first', () => {
    // extractPatternsFromRetrospective merges two sources; an early version of the fix would have
    // read the property off only one of them.
    const r = assembleResult(
      withDestroyed([], [{ improvement: 'from improvements', code: '23505' }]),
      withDestroyed([], [{ improvement: 'from successes', code: '23514' }]),
    );
    expect(r.lessons_destroyed).toBe(2);
    expect(r.destroyed.map((d) => d.code).sort()).toEqual(['23505', '23514']);
  });
});
