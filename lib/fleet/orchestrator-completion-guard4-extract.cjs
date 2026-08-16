'use strict';
/**
 * Pure extraction helper for the FR-3 guard-4 cross-check (SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-
 * LANES-001). Separated from the db-tier test itself so a PURE unit test can feed it a doctored
 * function-def string and prove the comparator actually rejects a mismatch -- a cross-check that
 * always matches whatever it's given is not a cross-check.
 *
 * ANCHORED, NOT BLIND: searches only within a window around the 'completed_children' variable
 * (the guard-4 anchor identified in database/migrations/20260329_pcvp_phase1_close_bypass_holes.sql),
 * not the whole function body -- a bare IN(...) search anywhere in a large function risks matching
 * an unrelated clause. Throws (never silently returns an empty/wrong set) when the anchor or the
 * IN-list cannot be found, so a future rewrite of guard 4's SQL shape fails loudly in the db-tier
 * test rather than silently comparing against nothing.
 */

const ANCHOR = 'completed_children';
const ANCHOR_WINDOW = 400; // chars scanned after the anchor for the terminal-status IN-list

/**
 * @param {string} functionDefText - full pg_get_functiondef() output for complete_orchestrator_sd
 * @returns {string[]} sorted, lowercased terminal-status literals found in guard 4's IN-list
 * @throws {Error} if the anchor or a well-formed IN-list cannot be found
 */
function extractGuard4StatusSet(functionDefText) {
  const text = String(functionDefText || '');
  const anchorIdx = text.indexOf(ANCHOR);
  if (anchorIdx === -1) {
    throw new Error(`orchestrator-completion-guard4-extract: anchor "${ANCHOR}" not found in function definition -- guard 4's SQL shape may have changed; update the anchor, do not silently skip this check`);
  }
  const window = text.slice(anchorIdx, anchorIdx + ANCHOR_WINDOW);
  const inListMatch = window.match(/\bstatus\s+IN\s*\(([^)]+)\)/i);
  if (!inListMatch) {
    throw new Error(`orchestrator-completion-guard4-extract: no "status IN (...)" clause found within ${ANCHOR_WINDOW} chars of "${ANCHOR}" -- window was: ${JSON.stringify(window)}`);
  }
  const literals = inListMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, '').toLowerCase())
    .filter(Boolean);
  if (literals.length === 0) {
    throw new Error('orchestrator-completion-guard4-extract: IN-list matched but yielded zero literals');
  }
  return [...literals].sort();
}

module.exports = { extractGuard4StatusSet, ANCHOR, ANCHOR_WINDOW };
