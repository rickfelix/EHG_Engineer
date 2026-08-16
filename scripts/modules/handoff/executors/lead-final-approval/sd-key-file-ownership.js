/**
 * Boundary-anchored SD-key-in-filename ownership predicate.
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-6, coordinator rulings #6/#7).
 *
 * gates.js's CHAIRMAN_APPLY_VERIFICATION gate falls back to a bare substring match
 * (`f.file.includes(sdKey)`) when a migration is not explicitly declared. Because an
 * orchestrator PARENT's sd_key is a strict PREFIX of its CHILDREN's sd_keys (e.g.
 * 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-H' is a literal substring of
 * '...-H1'), the parent's own gate run incorrectly "owns" -- and therefore blocks on --
 * its child's staged, chairman-gated migration file. Measured live on TWO specimens by
 * the coordinator (gates.js:1408): -H inheriting H1's DDL, -C inheriting C1..C4's.
 *
 * FIX: require a token boundary immediately after the matched sdKey -- the character that
 * follows (if any) must NOT be alphanumeric. This still matches every genuine same-key
 * substring occurrence (e.g. a filename containing the key followed by '_', '.', '-', or
 * end-of-string) while rejecting a PREFIX-of-a-longer-key false positive.
 *
 * Declarations (metadata.migration_files) are UNCHANGED by this fix -- they remain an exact
 * membership check and may only ever ADD to what is checked, never subtract (see gates.js's
 * own comment above the `owned` filter). This module touches ONLY the substring-fallback half.
 */

/**
 * @param {string} sdKey - the SD's own sd_key (e.g. 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-H')
 * @param {string} filename - a migration filename to test
 * @returns {boolean} true iff sdKey appears in filename at a genuine token boundary
 */
export function sdKeyOwnsFile(sdKey, filename) {
  if (!sdKey || !filename) return false;
  let fromIndex = 0;
  while (true) {
    const idx = filename.indexOf(sdKey, fromIndex);
    if (idx === -1) return false;
    const nextChar = filename[idx + sdKey.length];
    if (!nextChar || !/[A-Za-z0-9]/.test(nextChar)) return true;
    // Matched, but it's a prefix of a longer token (e.g. parent key inside a child key) --
    // keep scanning in case sdKey ALSO appears elsewhere in the same filename at a real boundary.
    fromIndex = idx + 1;
  }
}
