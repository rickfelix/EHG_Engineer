/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — drive_score leg1: the chairman-ratified A-LOCAL rule.
 *
 * Supersedes lib/drive-loop/score/leg1-landed.js's merge-base-ancestry rule, which
 * SD-LEO-INFRA-DRIVE-SCORE-LEG1-001 measured unearnable in this repo's delete-branch-on-merge
 * flow (evidence ab82da6b: 7/111 = 6.3%). Ratified alternative (chairman "I agree" SMS
 * 2026-08-10T23:26Z, ruling capture c8ad4998): an item is landed iff its SD-key appears,
 * END-ANCHORED, in a merge-commit subject in main's history.
 *
 * ── WHY END-ANCHORED, AND WHY BOTH DIRECTIONS ─────────────────────────────────────────────
 * A naive substring grep reports a PARENT SD as landed off a CHILD's merge, because child keys
 * extend the parent's key as a string (SD-X-001 is a literal prefix of SD-X-001-B). Measured
 * over 5608 real sd_key values in this repo (PLAN-phase TESTING evidence 8606170f): the
 * hyphenated shape ('-001' vs '-001-B') collides 1583 times, but the DOMINANT shape is
 * no-separator ('-001' vs '-001A'), colliding 103 times — both must be guarded, and a rule that
 * only excludes hyphen-suffixed collisions leaves the more common defect live. The trailing
 * boundary is a negative LOOKAHEAD, not a consuming character class, so a key at true line-end
 * and two matches adjacent on one line both resolve correctly.
 *
 * ── AN EMPTY CORPUS IS A MEASUREMENT FAILURE, NEVER "0 LANDED" ────────────────────────────
 * SECURITY review (evidence f84884eb, EXEC-TO-PLAN, FAIL — before this fix) found that GitHub
 * Actions' default `actions/checkout` is a SHALLOW clone (fetch-depth:1): `git log main --merges`
 * then exits 0 with ZERO subject lines — `main` resolves, the command succeeds, it just cannot
 * see any history. That is structurally indistinguishable from "read cleanly, nothing merged"
 * unless it is treated as a measurement failure explicitly. Left unguarded, this leg would have
 * written a hard, silent, append-only FALSE 0/2 on its very first production run — exactly the
 * harm the predecessor SD (LEG1-001) exists to prevent, in a new costume. So the corpus is
 * fetched ONCE (also closes a real N+1 perf issue TESTING measured: 20 keys = 20 unbounded
 * spawns, ~9.9s) and an empty or errored fetch degrades to unavailable(), never a score.
 *
 * ── WHY THE INJECTED RUNNER RETURNS TEXT, NOT A BOOLEAN ───────────────────────────────────
 * The OLD leg1-landed.js's runGit convention returns only {ok:boolean} — sufficient for
 * `merge-base --is-ancestor`, whose exit code IS the answer. A `git log --grep` query's exit
 * code is not: it can succeed with zero matches. The anchor check needs the matched subject
 * TEXT to decide, so this file defines its own seam: runGitLog: (args) => string[].
 */

import { cite } from '../citation.js';
import { unavailable } from '../report-posture.js';

export const LEG_ID = 'leg1_landed';
export const LEG_POINTS = 2;

/** Charset a real SD key is built from — measured, not assumed (TESTING evidence 8606170f). */
const KEY_CHAR = 'A-Za-z0-9._@-';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The end-anchored match pattern for a given SD key: bounded on the left by line-start or a
 * non-key character, and on the right by a negative lookahead against the same charset (never a
 * consuming class — see file header). Exported so tests can assert the boundary directly.
 */
export function anchoredKeyPattern(sdKey) {
  return new RegExp(`(?:^|[^${KEY_CHAR}])${escapeRegExp(sdKey)}(?![${KEY_CHAR}])`);
}

/**
 * The git question this rule asks: merge-commit SUBJECT LINES only, main branch only. Callers
 * construct the real runGitLog around this args shape (see drive-report-sweep.mjs CLI wiring);
 * exported so a test can assert WHICH command was built, matching the old file's ancestryArgs
 * precedent.
 *
 * @param {object} o
 * @param {string} [o.sinceIso] bound the log to commits at/after this ISO timestamp — UNUSED by
 *   any production caller today. SECURITY/TESTING review (evidence 7b22c9ee) found binding this
 *   to the completion-items window would be WRONG, not just unused: an item's completed_at can
 *   postdate its own merge by an arbitrary margin, so a --since tied to the window would MANUFACTURE
 *   false negatives for items that merged before the window opened. Left available for a future
 *   caller with a genuinely different bound; the cost of leaving history unbounded is the N+1 fix
 *   below, not a --since clause.
 */
export function mergeLogArgs({ sinceIso } = {}) {
  const args = ['log', 'main', '--merges', '--format=%s'];
  if (sinceIso) args.push(`--since=${sinceIso}`);
  return args;
}

/**
 * Pure match: does ANY of the given already-fetched subject lines end-anchor-match this SD key?
 * Takes the corpus rather than fetching it — a caller checking MANY keys (scoreLeg1ALocal) fetches
 * once and reuses it, rather than re-shelling out per key.
 *
 * @param {string} sdKey
 * @param {string[]} subjects merge-commit subject lines, already fetched
 */
export function isSdLandedInMainHistory(sdKey, subjects) {
  if (typeof sdKey !== 'string' || sdKey.length === 0) return false;
  if (!Array.isArray(subjects)) {
    throw new Error(
      'isSdLandedInMainHistory(): subjects must be an array of merge-commit subject lines — '
      + 'fetch via fetchMergeSubjects({runGitLog}) at the caller; this function is pure',
    );
  }
  const pattern = anchoredKeyPattern(sdKey);
  return subjects.some((s) => typeof s === 'string' && pattern.test(s));
}

/**
 * Fetch the merge-subject corpus via the injected runner. Separated from
 * isSdLandedInMainHistory so a caller checking many keys fetches once — see scoreLeg1ALocal,
 * which is the only production caller.
 *
 * @param {object} o
 * @param {(args:string[]) => string[]} o.runGitLog injected; returns raw subject lines
 */
export function fetchMergeSubjects({ runGitLog } = {}) {
  if (typeof runGitLog !== 'function') {
    throw new Error(
      'fetchMergeSubjects(): runGitLog must be injected — this predicate is defined by which git '
      + 'question it asks and needs the matched TEXT, not just an exit code',
    );
  }
  const raw = runGitLog(mergeLogArgs());
  if (!Array.isArray(raw)) return [];
  // VALIDATION evidence dbc5d211 (V2): a genuinely empty `git log` stdout is the STRING '', and
  // ''.split('\n') is ['''] — LENGTH 1, not 0. Without filtering here, scoreLeg1ALocal's
  // subjects.length===0 guard would silently NOT fire on the exact shallow-clone case it exists
  // to catch, and safety would depend entirely on the CALLER already having filtered blanks (as
  // the CLI wiring happens to today, with zero test coverage of that fact). The empty-corpus
  // invariant must be self-contained here, not an accident of a caller's .filter(Boolean).
  return raw.filter((s) => typeof s === 'string' && s.length > 0);
}

/**
 * Scores leg1 over an ALREADY-WINDOWED completed-items population (the caller decides the
 * window and the empty-population unavailable() branch — see drive-report-sweep.mjs; this
 * function is only invoked when the caller believes it has real items to score).
 *
 * Deduplicates sd_key (duplicate promotions across waves are real, measured) and excludes any
 * item with a null/undefined sd_key from the denominator — mirrors the old leg's no-branch
 * exclusion: an item that never had a resolvable key is not a measurement failure, it is an
 * item that was never in scope.
 *
 * Scores PROPORTIONALLY, never all-or-nothing: LEAD/PLAN research measured a real false-negative
 * tail (squash-merged PRs with no merge commit; keys landed under a renamed/abbreviated form)
 * that an all-or-nothing rule would zero even when most of the population honestly measures.
 * points.value is rounded to 2 decimals — drive_score is append-only (no UPDATE/DELETE), and an
 * unrounded float already reaches a chairman-facing SMS elsewhere in this pipeline with no
 * existing guard; this leg does not add a second unrounded source into a table that cannot be
 * corrected after the fact.
 *
 * NEVER THROWS. Every failure mode this function can encounter (the injected runner throwing —
 * e.g. `main` genuinely unresolvable; a shallow clone returning zero subjects; a pathological
 * sd_key blowing V8's regex-compile limit) degrades to the unavailable() shape rather than
 * propagating — a leg whose entire premise is fail-loud-never-false-zero must not itself crash
 * the report and take every OTHER section/leg down with it (SECURITY/TESTING evidence
 * f84884eb / 7b22c9ee).
 *
 * @param {object} o
 * @param {Array<{item_id?:string, sd_key?:string}>} o.items done[]-shaped rows — see
 *   lib/roadmap/plan-check-status.js computePlanCheckStatus's done[] output (sd_key sourced
 *   from item.promoted_to_sd_key)
 * @param {(args:string[]) => string[]} o.runGitLog injected git-log runner
 */
export function scoreLeg1ALocal({ items = [], runGitLog } = {}) {
  if (typeof runGitLog !== 'function') {
    throw new Error('scoreLeg1ALocal(): runGitLog must be injected');
  }

  const withKey = items.filter((i) => typeof i.sd_key === 'string' && i.sd_key.length > 0);
  const uniqueKeys = [...new Set(withKey.map((i) => i.sd_key))];
  const denominator = uniqueKeys.length;

  if (denominator === 0) {
    // Defensive: the caller's own empty-window branch is the PRIMARY path for an empty
    // population (see drive-report-sweep.mjs), but a non-empty items array whose entries all
    // lack a resolvable sd_key must not fall through to a 0/0 = NaN — same fail-loud posture,
    // named for what it actually is (a resolvable-key gap, not an empty window).
    return {
      leg: LEG_ID,
      unavailable: unavailable(
        `scoreLeg1ALocal received ${items.length} item(s) but none had a resolvable sd_key — `
        + 'no measurement to make (this is distinct from the empty-window case, which the caller '
        + 'handles separately).',
      ),
    };
  }

  let subjects;
  try {
    subjects = fetchMergeSubjects({ runGitLog });
  } catch (err) {
    return {
      leg: LEG_ID,
      unavailable: unavailable(
        `scoreLeg1ALocal: git log failed — ${err?.message || String(err)} — treated as a `
        + 'measurement failure, never a false zero.',
      ),
    };
  }

  if (!Array.isArray(subjects) || subjects.length === 0) {
    // THE FIX for the shallow-clone false-zero (see file header). A shallow checkout
    // (fetch-depth:1, GitHub Actions' default) makes `git log main --merges` exit 0 with ZERO
    // subjects — indistinguishable from "read cleanly, nothing merged" unless treated as a
    // measurement failure explicitly. Never scored as "0 landed".
    return {
      leg: LEG_ID,
      unavailable: unavailable(
        'scoreLeg1ALocal: git log main --merges returned zero subject lines — this is '
        + 'indistinguishable from a shallow clone that cannot see merge history and is never '
        + 'read as "0 landed". Treated as a measurement failure.',
      ),
    };
  }

  let landedKeys;
  try {
    landedKeys = uniqueKeys.filter((k) => isSdLandedInMainHistory(k, subjects));
  } catch (err) {
    // Defense in depth: a pathological sd_key (very long, adversarial characters) could exceed
    // V8's regex-compile limits. Requires a service-role DB write to plant, but this function's
    // whole premise is that it must not crash the report over it.
    return {
      leg: LEG_ID,
      unavailable: unavailable(
        `scoreLeg1ALocal: pattern match failed — ${err?.message || String(err)} — treated as a `
        + 'measurement failure.',
      ),
    };
  }

  const rawValue = (LEG_POINTS * landedKeys.length) / denominator;
  const roundedValue = Math.round(rawValue * 100) / 100;
  const landedItemIds = withKey
    .filter((i) => landedKeys.includes(i.sd_key))
    .map((i) => i.item_id)
    .filter(Boolean);

  return {
    leg: LEG_ID,
    points: cite({
      value: roundedValue,
      table: 'roadmap_wave_items',
      row_ids: landedItemIds,
      predicate: `${LEG_POINTS} points * (landed/denominator), where landed = unique sd_key values `
        + '(deduplicated, null-excluded) whose merge-commit subject in main\'s history end-anchor-matches '
        + 'the key (git log main --merges, fetched once, JS-side anchor check — see anchoredKeyPattern). '
        + `Rounded to 2 decimals. ${items.length - denominator} item(s) excluded from the denominator for `
        + 'lacking a resolvable sd_key (not counted as failures). Deliberately proportional, not '
        + 'all-or-nothing: a known false-negative tail (squash-merges with no merge commit; '
        + 'renamed/abbreviated landed keys) would otherwise zero the whole leg even when most of the '
        + 'population honestly measures.',
      limitation: 'The predicate can also register a FALSE POSITIVE: a revert-shaped merge subject '
        + '(e.g. \'Revert "feat(<KEY>): ..."\') or a merge whose subject merely MENTIONS the key in '
        + "prose — not necessarily the key's own feature branch landing — also end-anchor-matches. "
        + 'The chairman-ratified rule (c8ad4998) measures merge-subject PRESENCE, not verified '
        + 'code-level landing; this is a disclosed limitation, not silently absorbed (SECURITY '
        + 'evidence f84884eb).',
      source: 'lib/drive-loop/score/leg1-landed-alocal.js scoreLeg1ALocal',
    }),
    landed_count: cite({
      value: landedKeys.length,
      table: 'roadmap_wave_items',
      row_ids: landedItemIds,
      predicate: 'unique sd_key values whose merge-commit subject end-anchor-matches, out of the '
        + `deduplicated, null-excluded denominator of ${denominator}`,
      source: 'lib/drive-loop/score/leg1-landed-alocal.js scoreLeg1ALocal',
    }),
  };
}
