/**
 * Bracket-class-only regex patterns for the stage 21-26 census (FR-3, TR-1).
 *
 * MANDATE: every pattern here uses POSIX bracket classes ([0-9]) exclusively -- \d, \w, \s, \m,
 * \M are forbidden anywhere in this file (and enforced project-wide across this instrument's own
 * source by tests/unit/stage-census-forbidden-escapes.test.js, TS-9). This is not a style
 * preference: a naive regexp_match(text, 'Stage(\\d+)') was independently reproduced live on this
 * SD's own VALIDATION gate, silently returning 0 rows on a corpus known to contain 2 matches,
 * while the identical query with [0-9] correctly matched. The mechanism is undetermined; the
 * reproducible failure is not, so the constraint applies even to JS-side patterns that do not
 * exhibit the bug themselves -- consistency keeps the self-check (TS-9) a simple, unambiguous
 * zero-occurrence grep rather than a "was this string SQL or not" judgment call.
 */

// Matches "Stage22DistributionSetup.tsx", "Stage21VisualAssets.tsx"-style component filenames.
export const STAGE_COMPONENT_FILENAME_RE = /Stage(2[1-6])[A-Za-z]*\.(tsx|ts|jsx|js)/g;

// Matches "stage_number = 22", "stage-number: 21"-style assignments/declarations.
// [ \t]* (not \s*) is the bracket-class-safe whitespace matcher per this file's mandate.
export const STAGE_NUMBER_ASSIGNMENT_RE = /stage[-_]?number['"]?[ \t]*[:=][ \t]*['"]?(2[1-6])\b/gi;

// Matches "Stage 22", "stage22"-style prose/identifier mentions.
export const STAGE_PROSE_MENTION_RE = /\bstage[ _-]?(2[1-6])\b/gi;

/** SQL bracket-class fragment for stage 21-26, embeddable in a Postgres regexp/~ pattern. */
export const SQL_STAGE_NUMBER_FRAGMENT = '2[1-6]';

/**
 * Run all filesystem-facing patterns against a text blob and collect distinct matches.
 * @param {string} text
 * @returns {Array<{match: string, stageNumber: string, index: number}>}
 */
export function findStageLiterals(text) {
  const out = [];
  for (const re of [STAGE_COMPONENT_FILENAME_RE, STAGE_NUMBER_ASSIGNMENT_RE, STAGE_PROSE_MENTION_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      out.push({ match: m[0], stageNumber: m[1], index: m.index });
    }
  }
  return out;
}
