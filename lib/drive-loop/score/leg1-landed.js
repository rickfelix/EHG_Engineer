/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — drive_score leg 1: chain items actually LANDED.
 *
 * 2 of 8 points. A chain item counts as landed when its own branch is an ANCESTOR of main.
 *
 * ── THE EXCLUSION IS THE REQUIREMENT, NOT A DETAIL (FR-6) ─────────────────────────────────
 * Two merge-ish primitives exist in this repo and they answer DIFFERENT questions:
 *
 *   lib/multi-repo/index.js:546-557  isMerged            → git merge-base --is-ancestor   ✅ THIS
 *   lib/worktree-reaper/detectors.js:219+ isPatchEquivalentToMain → git cherry -v          ❌ NOT THIS
 *
 * Patch-equivalence asks "has equivalent CONTENT reached main?" — it is the landed-PR proxy, and
 * it answers TRUE for a branch whose commits were cherry-picked, rebased, squashed or retyped by
 * someone else. Ancestry asks "is THIS branch in main's history?" The leg means the second.
 *
 * The PRD names this as a trap rather than a preference, and the reason is worth keeping: the
 * patch-equivalence helper is the NEARER reach — it is purpose-built, well-tested, and its own
 * fixtures literally call its output `merged_pr_count`. A builder grabbing the closest merge-ish
 * function satisfies the leg's letter while violating its stated exclusion, and every test written
 * against the happy path passes, because the two primitives AGREE on ordinary merges. They diverge
 * exactly on cherry-picked and squashed work — which is most of what a busy repo does.
 *
 * So `runGit` is INJECTED. That is not a testing nicety: it is the only way a test can demonstrate
 * WHICH question was asked, rather than trusting that the right one was. See
 * tests/unit/drive-loop/score/leg1-landed.test.js — it asserts the divergent case, where
 * patch-equivalent-but-not-an-ancestor must score ZERO.
 */

import { cite } from '../citation.js';

export const LEG_ID = 'leg1_landed';
export const LEG_POINTS = 2;

/** The one git question this leg is permitted to ask. */
export function ancestryArgs(branch) {
  return ['merge-base', '--is-ancestor', branch, 'main'];
}

/**
 * @param {object} o
 * @param {Array<{id:string, branch?:string}>} o.items chain items, each with the branch it owns
 * @param {(args:string[]) => {ok:boolean}} o.runGit injected; ok=true means exit 0
 */
export function scoreLeg1({ items = [], runGit } = {}) {
  if (typeof runGit !== 'function') {
    // Fail loudly rather than defaulting to a real shell: a leg that silently shells out cannot be
    // tested for WHICH command it ran, which is the entire point of this leg.
    throw new Error('scoreLeg1(): runGit must be injected — this leg is defined by which git question it asks');
  }

  const withBranch = items.filter((i) => typeof i.branch === 'string' && i.branch.length > 0);

  const landed = withBranch.filter((i) => {
    const { ok } = runGit(ancestryArgs(i.branch)) || {};
    return ok === true;
  });

  // An item with no branch is NOT landed and NOT a measurement failure — it is an item that never
  // had a branch. Counting it either way would be a false reading, so it is excluded from the
  // denominator and the exclusion is stated in the predicate rather than left for a reader to infer.
  const denominator = withBranch.length;
  const earned = denominator > 0 && landed.length === denominator ? LEG_POINTS : 0;

  return {
    leg: LEG_ID,
    points: cite({
      value: earned,
      table: 'roadmap_wave_items',
      row_ids: landed.map((i) => i.id),
      predicate: `${LEG_POINTS} points iff EVERY chain item with a branch is an ANCESTOR of main `
        + '(git merge-base --is-ancestor). Deliberately NOT patch-equivalence (git cherry): that answers '
        + '"equivalent content reached main", which is true for cherry-picked, rebased and squashed work '
        + `whose own branch never landed. Items without a branch (${items.length - denominator} here) are `
        + 'excluded from the denominator rather than counted as failures',
      source: 'lib/drive-loop/score/leg1-landed.js scoreLeg1',
    }),
    landed_count: cite({
      value: landed.length,
      table: 'roadmap_wave_items',
      row_ids: landed.map((i) => i.id),
      predicate: 'chain items whose own branch is an ancestor of main',
      source: 'lib/drive-loop/score/leg1-landed.js scoreLeg1',
    }),
  };
}
