/**
 * Sanitize design reference text for safe inclusion in LLM prompts.
 *
 * Strips HTML tags, neutralises injection patterns, and preserves
 * legitimate design terminology. Based on sanitizeForPrompt pattern.
 *
 * SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-A
 * @module lib/eva/utils/sanitize-design-reference
 */

const HTML_TAG_RE = /<\/?[^>]+(>|$)/g;
const SCRIPT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_RE = /\bon\w+\s*=\s*["'][^"']*["']/gi;
const SQL_INJECTION_RE = /(['";]|--).*?(DROP|ALTER|DELETE|INSERT|UPDATE|UNION|SELECT)\b/gi;
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitize design reference text for safe LLM prompt inclusion.
 *
 * @param {string|null|undefined} text - Raw reference text (may contain HTML)
 * @param {number} [maxLen=2000] - Maximum output length
 * @returns {string} Sanitized text safe for prompt interpolation
 */
export function sanitizeDesignReference(text, maxLen = 2000) {
  if (text == null || text === '') return '';

  let safe = String(text);

  // 1. Remove script tags and their content first
  safe = safe.replace(SCRIPT_RE, '');

  // 2. Remove event handlers (onclick, onerror, etc.)
  safe = safe.replace(EVENT_HANDLER_RE, '');

  // 3. Strip all remaining HTML tags
  safe = safe.replace(HTML_TAG_RE, '');

  // 4. Neutralise SQL injection patterns
  safe = safe.replace(SQL_INJECTION_RE, '');

  // 5. Strip control characters
  safe = safe.replace(CONTROL_CHAR_RE, '');

  // 6. Collapse whitespace
  safe = safe.replace(/\s+/g, ' ').trim();

  // 7. Truncate
  if (safe.length > maxLen) {
    safe = safe.substring(0, maxLen);
  }

  return safe;
}
