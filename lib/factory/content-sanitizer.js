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
 * SD: SD-FDBK-FIX-LIVE-PROMPT-INJECTION-001 (isUntrustedOrigin + consumer wiring)
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

// feedback.source_type values that indicate PUBLIC, unauthenticated-origin submission
// (e.g. MarketLens's /api/feedback route forwards with source_type='user_feedback').
// SD-FDBK-FIX-SECURITY-ISUNTRUSTEDORIGIN-OMITS-001 (FR-1): 'error_capture' added --
// record_venture_error (live, SECURITY DEFINER, GRANT EXECUTE TO anon) AND
// fn_submit_venture_error (also LIVE, not "pending apply" as an earlier version of this
// comment claimed -- verified directly against pg_proc) both write rows with this
// source_type from a caller-supplied, length-capped-only p_message. fn_submit_error_capture
// does not exist yet (genuinely pending apply) and will arrive pre-mitigated once it lands.
// 'venture_worker' added (EXEC-phase SECURITY sub-agent finding, evidence 37ac0bb7): the
// SAME omission class, found live -- fn_submit_venture_feedback (SECURITY DEFINER, anon
// EXECUTE, gated by a per-venture ingest secret rather than fully open, but the secret-holder
// is an external venture-side worker, not this codebase) inserts an unsanitized, caller-
// supplied p_message under source_type='venture_worker'. Zero rows exist today (zero
// provisioned venture_ingest_keys), so this was a silent, not-yet-armed gap, not an active
// exploit -- same shape as 'error_capture' was before this SD.
const PUBLIC_ORIGIN_SOURCE_TYPES = new Set(['user_feedback', 'error_capture', 'venture_worker']);

/**
 * Classify a feedback row as untrusted-origin (public/venture-submitted) vs
 * trusted-origin (internal/harness-generated).
 *
 * SD-FDBK-FIX-SECURITY-ISUNTRUSTEDORIGIN-OMITS-001 (FR-2): this function has TWO
 * distinct behaviors, previously conflated under one "fails closed" claim:
 *   - Missing or malformed source_type (not a string): FAIL-CLOSED -- always untrusted,
 *     regardless of allowlist contents.
 *   - A well-formed but unrecognized source_type string: FAIL-OPEN BY ALLOWLIST DESIGN --
 *     trusted unless explicitly listed in PUBLIC_ORIGIN_SOURCE_TYPES above. This is an
 *     enumerate-untrusted-by-exception design, not a fail-closed one -- a NEW
 *     CHECK-constrained source_type value added in the future joins "trusted" by
 *     default unless someone remembers to add it here. (This was the exact shape of the
 *     bug this SD fixes for 'error_capture' -- see PUBLIC_ORIGIN_SOURCE_TYPES's own
 *     comment. A genuine fail-closed redesign, inverting to a TRUSTED-allowlist, is a
 *     larger change deliberately out of scope for this SD.)
 *
 * @param {object} feedback - A row (or partial row) from the `feedback` table
 * @param {string} [feedback.source_type] - One of feedback_source_type_check's enum values
 * @returns {boolean} true if the row's text must be sanitized/marked before reaching
 *   an LLM prompt or an autonomous agent's instruction context
 */
export function isUntrustedOrigin(feedback) {
  if (!feedback || typeof feedback.source_type !== 'string') return true;
  return PUBLIC_ORIGIN_SOURCE_TYPES.has(feedback.source_type);
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

export { MAX_MESSAGE_LENGTH, MAX_STACKTRACE_LENGTH, MAX_USER_TEXT_LENGTH, INJECTION_PATTERNS, USER_TEXT_INJECTION_PATTERNS, PUBLIC_ORIGIN_SOURCE_TYPES };
