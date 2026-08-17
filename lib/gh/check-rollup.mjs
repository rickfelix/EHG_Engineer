/**
 * QF-20260816-043: a follow-up PR pushed to a branch whose base commit was already
 * squash-merged registers ZERO GitHub check-suites -- no CI ever ran, but every
 * wait-for-CI gate reads "nothing pending" as vacuously green. Pure predicate, kept
 * in its own module (rather than inline in gh-merge-safe.mjs, which runs main()
 * unconditionally at import time) so it is safely importable for unit tests.
 */
export function isEmptyCheckRollup(rollup) {
  return !Array.isArray(rollup) || rollup.length === 0;
}
