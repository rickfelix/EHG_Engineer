/**
 * Sanitize untrusted user input before interpolation into LLM prompts.
 *
 * Strips control characters, common prompt-injection patterns, and
 * truncates to a safe length.  Wraps the result in [USER_INPUT] delimiters
 * so the LLM can clearly distinguish trusted instructions from user data.
 *
 * SD-LEO-FIX-EVA-PROMPT-INJECTION-001
 * @module lib/eva/utils/sanitize-for-prompt
 */

// Characters that should never appear in LLM prompt interpolations
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Common prompt injection patterns — case-insensitive
const INJECTION_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)\b/gi,
  /\byou\s+are\s+now\b/gi,
  /\bsystem\s*:\s*/gi,
  /\bassistant\s*:\s*/gi,
  /\b(forget|disregard|override)\s+(everything|all|your)\b/gi,
  /```\s*(system|assistant|user)\b/gi,
];

/**
 * Sanitize a string for safe inclusion in an LLM prompt.
 *
 * @param {string|null|undefined} text  - Raw user-supplied text
 * @param {number} [maxLen=500]         - Maximum character length after sanitization
 * @returns {string} Sanitized, delimited string (empty string for falsy input)
 */
export function sanitizeForPrompt(text, maxLen = 500) {
  if (text == null || text === '') return '';

  let safe = String(text);

  // 1. Strip control characters
  safe = safe.replace(CONTROL_CHAR_RE, '');

  // 2. Neutralise injection patterns by inserting a zero-width space
  for (const pattern of INJECTION_PATTERNS) {
    safe = safe.replace(pattern, (match) => match[0] + '\u200B' + match.slice(1));
  }

  // 3. Truncate
  if (safe.length > maxLen) {
    safe = safe.substring(0, maxLen);
  }

  // 4. Wrap in delimiters
  return `[USER_INPUT]${safe}[/USER_INPUT]`;
}
