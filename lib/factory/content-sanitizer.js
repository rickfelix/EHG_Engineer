/**
 * Content Sanitizer
 *
 * Security boundary between raw content (Sentry errors and user-submitted
 * feedback) and LLM consumption. Prevents prompt injection via crafted
 * exceptions or malicious user input by stripping control characters,
 * truncating to safe length, and wrapping in XML tags.
 *
 * SD: SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001 (original)
 * SD: SD-LEO-INFRA-VENTURE-USER-FEEDBACK-001 (user feedback extension)
 */

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACKTRACE_LENGTH = 1000;
const MAX_USER_TEXT_LENGTH = 500;

// Control characters that could be used for prompt injection
// Includes zero-width chars, RTL/LTR marks, and escape sequences
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u2028-\u202F\uFEFF]/g;

// Patterns that look like prompt boundaries or instructions
const INJECTION_PATTERNS = [
  /\bsystem\s*:/gi,
  /\bassistant\s*:/gi,
  /\buser\s*:/gi,
  /\b(ignore|forget|disregard)\s+(previous|above|prior)\s+(instructions?|context|rules?)/gi,
  /<\/?(?:system|prompt|instruction|context|role)>/gi,
  /```\s*(?:system|prompt)/gi
];

// Additional patterns for user-submitted text
const USER_TEXT_INJECTION_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<\/?(?:script|iframe|object|embed|form|input|button|link|meta|style)\b[^>]*>/gi,
  /on(?:click|load|error|mouseover|focus|blur|submit|change)\s*=/gi,
  /javascript\s*:/gi,
  /data\s*:\s*text\/html/gi,
  /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION)\s+(?:FROM|INTO|TABLE|ALL)\b/gi,
];

/**
 * Sanitize a raw error for safe LLM consumption.
 *
 * @param {object} rawError - Raw error from Sentry
 * @param {string} rawError.title - Error title/type
 * @param {string} rawError.value - Error message
 * @param {string} [rawError.stacktrace] - Stack trace
 * @param {object} [rawError.metadata] - Additional metadata
 * @returns {object} Sanitized error safe for LLM consumption
 */
export function sanitize(rawError) {
  if (!rawError) return { title: '', value: '', stacktrace: '', safe: true, injectionDetected: false };

  const title = stripControlChars(String(rawError.title || ''));
  const value = truncate(stripControlChars(String(rawError.value || '')), MAX_MESSAGE_LENGTH);
  const stacktrace = truncate(stripControlChars(String(rawError.stacktrace || '')), MAX_STACKTRACE_LENGTH);

  const injectionDetected = detectInjection(rawError.title) ||
    detectInjection(rawError.value) ||
    detectInjection(rawError.stacktrace);

  return {
    title: wrapXml('error-title', title),
    value: wrapXml('error-message', value),
    stacktrace: stacktrace ? wrapXml('error-stacktrace', stacktrace) : '',
    safe: !injectionDetected,
    injectionDetected,
    originalLength: {
      title: String(rawError.title || '').length,
      value: String(rawError.value || '').length,
      stacktrace: String(rawError.stacktrace || '').length
    }
  };
}

/**
 * Sanitize user-submitted text for safe LLM consumption.
 * Strips HTML tags, script injection, SQL fragments, and prompt injection patterns.
 *
 * @param {string} text - Raw user input
 * @returns {object} Sanitized result
 */
export function sanitizeUserText(text) {
  if (!text) return { content: '', safe: true, injectionDetected: false, originalLength: 0 };

  const raw = String(text);
  let cleaned = stripControlChars(raw);

  // Strip all HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Truncate
  cleaned = truncate(cleaned, MAX_USER_TEXT_LENGTH);

  const injectionDetected = detectInjection(raw) || detectUserTextInjection(raw);

  return {
    content: wrapXml('user-feedback', cleaned),
    safe: !injectionDetected,
    injectionDetected,
    originalLength: raw.length
  };
}

/**
 * Strip control characters from text.
 */
function stripControlChars(text) {
  return text.replace(CONTROL_CHAR_REGEX, '');
}

/**
 * Truncate text to max length, preserving word boundaries.
 */
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.8 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

/**
 * Wrap text in XML tags for clear boundary delineation.
 */
function wrapXml(tag, content) {
  return `<${tag}>${content}</${tag}>`;
}

/**
 * Detect potential prompt injection patterns.
 */
function detectInjection(text) {
  if (!text) return false;
  return INJECTION_PATTERNS.some(pattern => pattern.test(String(text)));
}

/**
 * Detect user-text-specific injection patterns (HTML, script, SQL).
 */
function detectUserTextInjection(text) {
  if (!text) return false;
  return USER_TEXT_INJECTION_PATTERNS.some(pattern => pattern.test(String(text)));
}

export { MAX_MESSAGE_LENGTH, MAX_STACKTRACE_LENGTH, MAX_USER_TEXT_LENGTH, INJECTION_PATTERNS, USER_TEXT_INJECTION_PATTERNS };
