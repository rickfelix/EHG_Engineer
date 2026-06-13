/**
 * sd-exclusion.mjs — shared SD classifiers for the coordinator dispatch surfaces
 * (SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001).
 *
 * Two witnessed defects in the ranker/forecaster:
 *   1. BARE_SHELL: SD-MAN-INFRA-GATE-BAR-REGIME-001 ranked #3 fleet-wide while its
 *      description was just its title — a stub that cannot pass LEAD-TO-PLAN, so a
 *      self-claiming worker burns LEAD cycles on it.
 *   2. FIXTURE leak (feedback b5f21465): UAT test-run fixtures with epoch-stamped keys
 *      (SD-UAT-FIX-TEST-E2E-1781186358703-001) ranked #1/#2 because the old FIXTURE_RE
 *      only matched the legacy SD-LEO-FEAT-TEST-E2E- prefix.
 *
 * These are PURE classifiers. Both are FAIL-OPEN AGAINST CRASHES: malformed input makes
 * them return false (the SD is treated as a normal item) so a classifier error can never
 * THROW and kill the ranker. They must ALSO avoid the opposite failure — never exclude
 * REAL work — which is why the epoch-stamped key pattern is anchored to a key-segment
 * boundary (see FIXTURE_RE) so it cannot collide mid-word (e.g. the "TEST" tail of
 * LATEST/FASTEST). The DURABLE fixture signal is the metadata.is_fixture marker; the
 * key-shape regex is a secondary heuristic for legacy un-stamped rows.
 *
 * RESERVED FIXTURE PREFIXES: SD-(TEST|DEMO|SWITCH-OLD)-* are reserved for fixtures and
 * MUST NOT be used by real ventures (a real SD keyed SD-DEMO-* is intentionally demoted).
 * SD keys are UPPERCASE by DB convention; the regex is case-sensitive by design.
 */

// Anchored legacy prefixes + a BOUNDARY-ANCHORED epoch-stamped TEST-E2E segment.
// The third alternative is bounded by (?:^|-) on the left and (?:-|$) on the right so it
// fires only on a STANDALONE "TEST-E2E-<10+ digits>" key segment — NOT as the tail of a
// longer word (LATEST/FASTEST/GREATEST-E2E-…) nor mid-key. The 10+ digit floor additionally
// avoids matching a hypothetical real "TEST-E2E-2" feature token. (Adversarial-review fix,
// SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: the original unanchored \bTEST-E2E-\d{10,}\b
// over-excluded real keys whose preceding segment ended in "TEST".)
export const FIXTURE_RE = /^SD-(TEST|DEMO|SWITCH-OLD)\b|^SD-LEO-FEAT-TEST-E2E-|(?:^|-)TEST-E2E-\d{10,}(?:-|$)/;

/**
 * Fixture SDs are seeded by test/UAT runners and must never be dispatched or counted as
 * belt. Matches, in order of preference:
 *   - an explicit metadata.is_fixture === true marker (durable; what UAT runners should
 *     stamp — strict === true so a coincidentally-truthy value never demotes real work), OR
 *   - a fixture KEY SHAPE per FIXTURE_RE (legacy prefixes or a standalone epoch-stamped
 *     TEST-E2E-<epoch> segment, covering the new SD-UAT-FIX-TEST-E2E-<epoch>- keys).
 *
 * @param {string} sdKey
 * @param {object} [metadata]
 * @returns {boolean}
 */
export function isFixtureSd(sdKey, metadata) {
  try {
    if (metadata && typeof metadata === 'object' && metadata.is_fixture === true) return true;
    if (typeof sdKey !== 'string' || !sdKey) return false;
    return FIXTURE_RE.test(sdKey);
  } catch {
    return false; // fail-open: never let a classifier error exclude real work
  }
}

/**
 * A bare-shell SD has no real strategic content: its description is empty/whitespace or
 * is just a copy of the title. Such a stub cannot pass LEAD-TO-PLAN, so the ranker must
 * demote it below every authored SD and the forecaster must not count it as belt.
 *
 * @param {{description?: string, title?: string}} sd
 * @returns {boolean}
 */
export function isBareShell(sd) {
  try {
    if (!sd || typeof sd !== 'object') return false;
    const desc = typeof sd.description === 'string' ? sd.description.trim() : '';
    if (desc === '') return true;
    const title = typeof sd.title === 'string' ? sd.title.trim() : '';
    if (title !== '' && desc === title) return true;
    return false;
  } catch {
    return false; // fail-open: a classifier error ranks the SD normally
  }
}

/**
 * Belt-depth / dispatchability predicate shared by the capacity forecaster: an SD is NOT
 * real, distributable belt if it is a fixture OR a bare-shell stub (neither can pass
 * LEAD-TO-PLAN, so counting them over-reports capacity and masks a forecast deficit).
 * The scripts CALL this exported function so tests exercise the real exclusion logic
 * rather than a re-implementation.
 *
 * @param {{sd_key?: string, metadata?: object, description?: string, title?: string}} sd
 * @returns {boolean} true when the SD must be excluded from belt depth
 */
export function isExcludedFromBelt(sd) {
  if (!sd || typeof sd !== 'object') return false; // fail-open
  return isFixtureSd(sd.sd_key, sd.metadata) || isBareShell(sd);
}

/**
 * An SD is "started / in-flight" once it has advanced past the initial LEAD draft
 * (current_phase is set AND not 'LEAD'). current_phase only advances on an ACCEPTED handoff,
 * so this avoids the rejected-first-handoff false positive that raw handoff-row presence has.
 * The ranker must NOT surface a started SD as a FRESH dispatch candidate: a mid-build SD —
 * even one momentarily unclaimed after a session reap — is resumed via the orphan-adopt path
 * in worker-checkin.cjs (resume_orphan), not re-claimed from the backlog, so ranking it #1
 * invites a fresh worker to duplicate in-flight work. This consolidates the (a) branch of
 * worker-checkin's isSdInFlight started-guard (SD-FDBK-FIX-SELF-CLAIM-DEDUP-001) as the shared
 * classifier (SD-FDBK-INFRA-SHARED-FLEET-WORKER-001, bug d5e59236). FAIL-OPEN: malformed input
 * returns false (rank normally) so a classifier error never drops a real fresh leaf.
 *
 * @param {{current_phase?: string}} sd
 * @returns {boolean} true when the SD is past LEAD (in-flight) and must not be fresh-ranked
 */
export function isStartedSd(sd) {
  try {
    if (!sd || typeof sd !== 'object') return false; // fail-open: rank normally
    const phase = typeof sd.current_phase === 'string' ? sd.current_phase.trim() : '';
    return phase !== '' && phase !== 'LEAD';
  } catch {
    return false; // fail-open: a classifier error ranks the SD normally
  }
}

/**
 * Dominant ranking comparator key used by coordinator-backlog-rank.mjs: bare-shell SDs
 * sort AFTER every authored SD (returns >0 when only `a` is bare-shell). Exported and
 * called by the ranker so a test of this function exercises the real demotion logic.
 * Returns 0 when both sides have equal bare-shell status (caller falls through to its
 * secondary keys: quarantine → unlock → priority → age).
 *
 * @returns {number} -1 | 0 | 1
 */
export function bareShellLastCompare(a, b) {
  const ba = isBareShell(a) ? 1 : 0;
  const bb = isBareShell(b) ? 1 : 0;
  return ba - bb; // authored (0) before bare-shell (1)
}
