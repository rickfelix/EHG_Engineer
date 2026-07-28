/**
 * The shared vocabulary for "what is this verdict a claim ABOUT".
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-2/FR-3.
 *
 *   DUTY    — "the duty is wired" (a set-membership / presence check)
 *   CONDUCT — "behaviour complied" (a check that read live behaviour)
 *
 * It lives in governance/ rather than in either role's module because BOTH roles must use the same
 * two words for the distinction to be comparable across them — and comparability is the point. If
 * Solomon imported this from lib/adam/, the shared contract would be an accident of who wrote it
 * first, and the next role would have three plausible places to look.
 *
 * WHY THIS DISTINCTION EXISTS AT ALL. A role-session adherence review returned CLEAN on the night
 * of a self-reported execution breach. Its green was honest and IRRELEVANT: it had only ever
 * checked that duties were LISTED, never that behaviour complied. The two greens render
 * identically, and the weaker one is the one that reassures.
 */
'use strict';

export const CHECK_CLASS = Object.freeze({ DUTY: 'duty', CONDUCT: 'conduct' });
const CHECK_CLASSES = Object.freeze(new Set(Object.values(CHECK_CLASS)));

/**
 * Refuse an unlabelled or unrecognised class. Throws — deliberately.
 *
 * No default is provided on purpose. Defaulting to 'conduct' would inflate every unlabelled claim;
 * defaulting to 'duty' would deflate it and systematically understate conduct coverage — the mirror
 * image of the inflated coverage denominator FR-1 fixes. Neither silence is safe, so silence is
 * refused rather than resolved.
 *
 * Call this at VERDICT CONSTRUCTION, never at the DB writer: both role review scripts are fail-open
 * by construction (they warn and return null on a write error), so a throw down there would become
 * a MISSING ROW — silent coverage loss, which is the very defect this SD removes.
 */
export function assertCheckClass(probeName, checkClass) {
  if (!CHECK_CLASSES.has(checkClass)) {
    throw new Error(
      `[check-class] probe "${probeName}" produced a verdict with no valid check_class ` +
      `(got ${JSON.stringify(checkClass)}). Every verdict must declare whether it is a DUTY claim ` +
      '("the duty is wired") or a CONDUCT claim ("behaviour complied") — an unlabelled green is ' +
      'indistinguishable from the stronger one.',
    );
  }
  return checkClass;
}

export function isCheckClass(value) {
  return CHECK_CLASSES.has(value);
}
