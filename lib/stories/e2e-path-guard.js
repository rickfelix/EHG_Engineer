/**
 * SD-LEO-INFRA-STORY-E2E-AUTO-001 FR-1 — map to an existing exercising spec, or emit NULL.
 *
 * MEASURED over the full population (1390 rows with a non-null e2e_test_path; exact
 * head-count, pagination verified 1390 collected = 1390 counted): 234 of 338 distinct paths
 * name a file that DOES NOT EXIST, and 641 rows (46.1%) claim e2e_test_status='passing' for
 * one of them. Sixteen distinct generators write this field, so the rule lives here once
 * rather than sixteen times.
 *
 * THE TWO ARMS ARE DELIBERATELY SEPARATE AND ARE NEVER MERGED:
 *   - specFileExists  — DECIDABLE. A file is there or it is not. Alone it accounts for
 *                       1016 of the 1390 bad rows, and it cannot produce a false negative.
 *   - specReferencesStory — HEURISTIC. It reads text and guesses. It can be wrong.
 * Collapsing them into one "isValid" would let the heuristic's false negatives null out real
 * coverage under cover of the arm that is actually sound. If the heuristic proves noisy, the
 * honest move is to run existence-only and record relevance as unimplemented — never to keep
 * a check that quietly discards true mappings.
 *
 * NULL is the honest "no mapping" and is a legitimate output, not a failure: 76 rows already
 * model it (a missing file stamped 'not_created' — they point at nothing and say so).
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

/**
 * ARM 1 — EXISTENCE (decidable).
 * Rejects sentinels ('N/A - documentation SD (no E2E required)'), absolute paths and any
 * path containing '..' — a mapping must be a repo-relative path to a real file, and a
 * traversal escaping the repo is not a coverage claim we can stand behind.
 * @returns {boolean}
 */
export function specFileExists(repoRoot, candidatePath, deps = {}) {
  const exists = deps.existsSync || existsSync;
  if (typeof candidatePath !== 'string') return false;
  const p = candidatePath.trim();
  if (p === '' || !p.includes('/')) return false;
  if (path.isAbsolute(p) || p.split(/[\\/]/).includes('..')) return false;
  return exists(path.join(repoRoot, p));
}

/**
 * ARM 2 — RELEVANCE (heuristic, and labelled as one).
 * A spec exercises a story if its text names the story_key, the story's US-NNN token, the SD
 * key, or the basename of one of the story's changed files. This is a text search, not proof:
 * a spec can exercise a story without naming it, and can name it without exercising it. It is
 * reported separately from existence so a caller can decline to rely on it.
 * @returns {boolean}
 */
export function specReferencesStory(repoRoot, candidatePath, story = {}, deps = {}) {
  const read = deps.readFileSync || readFileSync;
  if (!specFileExists(repoRoot, candidatePath, deps)) return false;

  let text;
  try {
    text = String(read(path.join(repoRoot, candidatePath.trim()), 'utf8'));
  } catch {
    // Unreadable is not "relevant". Fail closed on the heuristic arm too.
    return false;
  }

  const needles = [];
  if (story.story_key) {
    needles.push(story.story_key);
    const [sdPart, usPart] = String(story.story_key).split(':');
    if (sdPart) needles.push(sdPart);
    if (usPart) needles.push(usPart);
  }
  if (story.sd_key) needles.push(story.sd_key);
  for (const f of story.changed_files || []) needles.push(path.basename(String(f)));

  const hay = text.toLowerCase();
  return needles.filter(Boolean).some((n) => hay.includes(String(n).toLowerCase()));
}

/**
 * The choke-point: resolve a candidate mapping to itself or to NULL.
 *
 * @param {object} args
 * @param {string} args.repoRoot
 * @param {string|null} args.candidatePath
 * @param {object} [args.story]
 * @param {boolean} [args.requireRelevance=true] — set false to run existence-only, which is
 *   the documented fallback if the heuristic arm proves noisy in practice.
 * @returns {string|null} the path when it can be stood behind, else NULL
 */
export function resolveE2ePath({ repoRoot, candidatePath, story = {}, requireRelevance = true, deps = {} }) {
  if (!specFileExists(repoRoot, candidatePath, deps)) return null;
  if (requireRelevance && !specReferencesStory(repoRoot, candidatePath, story, deps)) return null;
  return candidatePath.trim();
}

export default { specFileExists, specReferencesStory, resolveE2ePath };
