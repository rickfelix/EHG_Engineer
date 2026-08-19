/**
 * QF-20260727-876 (adversarial review, PR #7298): the pre-existing SD branch/PR
 * pattern match (`name.includes(pattern)`) has no boundary check, so a shorter SD
 * ID that is a literal character-prefix of a longer one's numeric suffix can
 * phantom-match an unrelated PR (e.g. pattern `feat/SD-X-1` matches branch
 * `feat/SD-X-10-description`). Before this fix's stacked-landing detection existed,
 * that collision could only ever cause an extra false-positive BLOCK (safe
 * direction). With stacking recognized, a phantom match can instead inflate N and
 * cause isStackedLanding to demote a genuinely lone, blocking PR to non-blocking
 * "stack" context -- the unsafe direction. This boundary-aware matcher closes the
 * root cause: a match only counts if the pattern ends exactly where the string
 * ends, or is immediately followed by `-` or `/` (SD-ID branch names are always
 * `<type>/<sdId>` or `<type>/<sdId>-<description>` -- never glued directly onto
 * more identifier characters without one of those separators).
 *
 * @module shipping/branch-pattern-match
 */

/**
 * @param {string} name - a branch name or PR headRefName (any case).
 * @param {string} pattern - an SD branch pattern, e.g. `feat/SD-X-001`.
 * @returns {boolean}
 */
export function matchesSdBranchPattern(name, pattern) {
  const lname = String(name).toLowerCase();
  const lpattern = String(pattern).toLowerCase();
  if (!lpattern) return false;
  // Round-2 adversarial review (PR #7298): indexOf() alone only inspects the FIRST
  // occurrence -- a string like "chore/SD-X-10-fix-SD-X-1" has an earlier
  // boundary-failing occurrence ("SD-X-10") before a later boundary-passing one
  // ("...-SD-X-1" at the string's end), and bailing out on the first miss produced
  // a false negative (a genuinely matching branch silently omitted from every
  // caller's results). Scan every occurrence instead of stopping at the first.
  let idx = lname.indexOf(lpattern);
  while (idx !== -1) {
    const after = lname[idx + lpattern.length];
    if (after === undefined || after === '-' || after === '/') return true;
    idx = lname.indexOf(lpattern, idx + 1);
  }
  return false;
}

export default matchesSdBranchPattern;
