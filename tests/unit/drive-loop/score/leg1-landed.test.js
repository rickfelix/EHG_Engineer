/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — leg 1 (FR-6): ancestry, demonstrably NOT patch-equivalence.
 *
 * THE ONLY TEST HERE THAT PROVES ANYTHING IS THE DIVERGENT ONE.
 *
 * merge-base --is-ancestor and git cherry AGREE on an ordinary merge. Every happy-path test passes
 * under either primitive, so a suite built from happy paths certifies nothing about the exclusion
 * the leg is defined by. They disagree in exactly one place — work whose CONTENT reached main
 * (cherry-picked, rebased, squashed) while its own branch never became an ancestor. That case is
 * the discriminator, and it is the reason this file exists.
 *
 * Two levels, deliberately, because either alone is weak:
 *   BEHAVIOURAL — patch-equivalent-but-not-ancestor must score ZERO. This is the real proof; it
 *                 holds no matter how the leg is implemented.
 *   COMMAND     — the leg must never issue `cherry`. Cheaper and more brittle, but it names the
 *                 violation directly, so a future edit that reaches for the nearer helper fails
 *                 with a message saying WHY rather than an arithmetic mismatch.
 */

import { describe, it, expect } from 'vitest';
import { scoreLeg1, ancestryArgs, LEG_POINTS } from '../../../../lib/drive-loop/score/leg1-landed.js';

/**
 * A git double that models BOTH primitives honestly, so the divergent case is real rather than
 * asserted. `ancestors` are branches genuinely in main's history; `patchEquivalent` are branches
 * whose content reached main by some other route. The overlap is empty ON PURPOSE — that is the
 * whole experiment.
 */
function gitDouble({ ancestors = [], patchEquivalent = [] } = {}) {
  const calls = [];
  const runGit = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      return { ok: ancestors.includes(args[2]) };
    }
    if (args[0] === 'cherry') {
      // Present so a leg that reaches for the WRONG primitive still "works" — otherwise the test
      // would fail on a thrown error and look like a pass for the right reason.
      return { ok: patchEquivalent.includes(args[args.length - 1]) };
    }
    return { ok: false };
  };
  return { runGit, calls };
}

const ITEM = (id, branch) => ({ id, branch });

describe('leg1 — landed means ANCESTOR of main, not patch-equivalent to it', () => {
  it('[DISCRIMINATOR, behavioural] patch-equivalent but NOT an ancestor scores ZERO', () => {
    // The case the two primitives answer differently. Under `git cherry` this branch reads as
    // merged and the leg would award 2. Under ancestry it has not landed and the leg awards 0.
    // If this ever goes green with points === LEG_POINTS, the leg is using the excluded primitive.
    const { runGit } = gitDouble({ ancestors: [], patchEquivalent: ['feat/cherry-picked'] });
    const r = scoreLeg1({ items: [ITEM('i1', 'feat/cherry-picked')], runGit });
    expect(r.points.value, 'content reaching main by cherry-pick is NOT this branch landing — '
      + 'awarding points here means the leg asked the patch-equivalence question').toBe(0);
    expect(r.landed_count.value).toBe(0);
  });

  it('[DISCRIMINATOR, command] the leg never issues `cherry`', () => {
    const { runGit, calls } = gitDouble({ ancestors: [], patchEquivalent: ['feat/x'] });
    scoreLeg1({ items: [ITEM('i1', 'feat/x')], runGit });
    expect(calls.some((c) => c.startsWith('cherry')), 'reaching for isPatchEquivalentToMain-style '
      + '`git cherry` satisfies the leg\'s letter while violating its stated exclusion').toBe(false);
    expect(calls).toEqual(['merge-base --is-ancestor feat/x main']);
  });

  it('awards the full 2 points only when EVERY branched item is an ancestor', () => {
    const { runGit } = gitDouble({ ancestors: ['a', 'b'] });
    const all = scoreLeg1({ items: [ITEM('i1', 'a'), ITEM('i2', 'b')], runGit });
    expect(all.points.value).toBe(LEG_POINTS);
    expect(all.landed_count.value).toBe(2);

    const partial = scoreLeg1({ items: [ITEM('i1', 'a'), ITEM('i2', 'not-landed')], runGit });
    expect(partial.points.value, 'partial landing is not landing — this REFERENCE implementation is all-or-nothing (the LIVE leg1 rule, A-LOCAL, scores proportionally instead — see leg1-landed-alocal.js)').toBe(0);
    expect(partial.landed_count.value).toBe(1);
  });

  it('an item with NO branch is excluded from the denominator, not counted as a failure', () => {
    // Counting it as failed would make an unbranched item indistinguishable from an unlanded one,
    // and counting it as landed would be a false reading. Neither is honest, so it is excluded and
    // the exclusion is stated in the predicate.
    const { runGit, calls } = gitDouble({ ancestors: ['a'] });
    const r = scoreLeg1({ items: [ITEM('i1', 'a'), ITEM('i2', undefined)], runGit });
    expect(r.points.value).toBe(LEG_POINTS);
    expect(calls).toHaveLength(1);
    expect(r.points.predicate).toMatch(/excluded from the denominator/);
  });

  it('an EMPTY chain scores zero, not full marks on a vacuous all-of-nothing', () => {
    // "every item landed" is trivially true of no items. Awarding 2 there would report a cleared
    // gate as a perfect score — the same vacuity as a count assertion that passes at zero.
    const { runGit } = gitDouble({ ancestors: [] });
    expect(scoreLeg1({ items: [], runGit }).points.value).toBe(0);
  });

  it('refuses to run without an injected runGit rather than shelling out silently', () => {
    // A leg that quietly shells out cannot be tested for WHICH question it asked, which is the one
    // property this leg is defined by.
    expect(() => scoreLeg1({ items: [ITEM('i1', 'a')] })).toThrow(/runGit must be injected/);
  });

  it('the permitted git question is fixed and inspectable', () => {
    expect(ancestryArgs('feat/x')).toEqual(['merge-base', '--is-ancestor', 'feat/x', 'main']);
  });
});
