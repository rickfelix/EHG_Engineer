/**
 * Safe string truncation that prevents splitting Unicode surrogate pairs.
 *
 * UTF-16 encodes characters outside the Basic Multilingual Plane as two
 * code units (a high surrogate 0xD800-0xDBFF followed by a low surrogate
 * 0xDC00-0xDFFF). Naive `.substring(0, n)` can split between the two,
 * producing an unpaired surrogate that corrupts JSON serialisation and
 * database storage.
 *
 * This helper checks whether the last code unit at the truncation boundary
 * is a high surrogate and, if so, backs off by one so the pair stays intact.
 *
 * @module safe-truncate
 */

/**
 * Truncate a string to at most `maxLength` characters without splitting
 * a surrogate pair.
 *
 * @param {string} str - The string to truncate (null/undefined safe).
 * @param {number} maxLength - Maximum length of the returned string.
 * @returns {string} The (possibly shortened) string.
 */
export function safeTruncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str || '';
  let end = maxLength;
  // If the character just before the cut is a high surrogate, back off by one.
  const code = str.charCodeAt(end - 1);
  if (code >= 0xD800 && code <= 0xDBFF) {
    end--;
  }
  return str.substring(0, end);
}

export default safeTruncate;
