/**
 * scope-similarity.js — Shared keyword extraction & similarity computation
 * SD: SD-MAN-INFRA-SEMANTIC-VALIDATION-GATES-002
 *
 * Extracted from overlapping-scope-detection.js to eliminate duplication
 * across gates that need scope analysis.
 */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'will',
  'has', 'have', 'been', 'not', 'but', 'all', 'can', 'had', 'her', 'one',
  'our', 'out', 'use', 'add', 'new', 'now', 'old', 'see', 'way', 'may',
  'each', 'make', 'like', 'than', 'them', 'then', 'into', 'some', 'when'
]);

const MIN_WORD_LENGTH = 4;

/**
 * Extract meaningful keywords from text.
 * Removes stop words and short words, normalizes to lowercase.
 *
 * @param {string|object} text - Text to extract keywords from
 * @returns {Set<string>} Set of extracted keywords
 */
export function extractKeywords(text) {
  if (!text) return new Set();
  const normalized = typeof text === 'string' ? text : JSON.stringify(text);
  return new Set(
    normalized.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w))
  );
}

/**
 * Calculate Jaccard similarity between two keyword sets.
 * Returns 0 for empty sets, 1 for identical sets.
 *
 * @param {Set<string>} setA - First keyword set
 * @param {Set<string>} setB - Second keyword set
 * @returns {number} Similarity score between 0 and 1
 */
export function calculateSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Build a combined keyword set from SD fields.
 *
 * @param {object} sd - SD record with title, scope, description, key_changes
 * @returns {Set<string>} Combined keyword set
 */
export function extractSDKeywords(sd) {
  if (!sd) return new Set();
  const combined = [
    sd.title || '',
    sd.scope || '',
    sd.description || '',
    JSON.stringify(sd.key_changes || [])
  ].join(' ');
  return extractKeywords(combined);
}

/**
 * Convert keyword set to array for database storage (scope_keywords TEXT[]).
 *
 * @param {Set<string>} keywords - Keyword set
 * @returns {string[]} Array of keywords
 */
export function keywordsToArray(keywords) {
  return [...keywords].sort();
}

export { STOP_WORDS, MIN_WORD_LENGTH };
