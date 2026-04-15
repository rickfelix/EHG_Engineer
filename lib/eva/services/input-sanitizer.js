/**
 * Input Sanitization Primitive for LLM Data Flows
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-A
 *
 * Sanitizes text before passing to LLM-mediated data flows.
 * Returns { clean: string, warnings: string[] } — always non-blocking.
 */

const DEFAULT_MAX_LENGTH = 4096;

// OWASP LLM Top 10 injection patterns
const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(previous|prior|all\s+previous)\s+instructions/gi, warning: 'INJECTION_IGNORE_PREVIOUS' },
  { pattern: /disregard\s+(previous|prior|all|your)\s+(instructions|prompt|rules)/gi, warning: 'INJECTION_DISREGARD' },
  { pattern: /you\s+are\s+now\s+(a|an|DAN|unrestricted|jailbroken)/gi, warning: 'INJECTION_ROLE_SWITCH' },
  { pattern: /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+(unrestricted|jailbroken|DAN)/gi, warning: 'INJECTION_ACT_AS' },
  { pattern: /system\s*:\s*(you\s+are|ignore|forget|disregard)/gi, warning: 'INJECTION_SYSTEM_PROMPT' },
  { pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|<\|system\|>/g, warning: 'INJECTION_DELIMITER' },
  { pattern: /do\s+not\s+follow\s+(your\s+)?(previous\s+)?(instructions|guidelines|rules|constraints)/gi, warning: 'INJECTION_BYPASS_RULES' },
  { pattern: /pretend\s+(you\s+)?(are|have\s+no|don't\s+have|without)\s+.{0,30}(restriction|filter|rule|guideline|limit|constraint)/gi, warning: 'INJECTION_PRETEND' },
  { pattern: /reveal\s+(your\s+)?(system\s+prompt|instructions|configuration|context)/gi, warning: 'INJECTION_PROMPT_EXTRACTION' },
  { pattern: /jailbreak|dan\s+mode|developer\s+mode\s+enabled|prompt\s+injection/gi, warning: 'INJECTION_JAILBREAK' },
  { pattern: /forget\s+everything\s+(above|before|previously|you\s+were\s+told)/gi, warning: 'INJECTION_FORGET' },
  { pattern: /translate\s+the\s+above\s+(text|instructions|prompt)\s+to/gi, warning: 'INJECTION_EXTRACTION_TRANSLATE' },
];

// Matches control characters U+0000-U+001F except tab (U+0009) and newline (U+000A)
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * Sanitize text before passing to an LLM endpoint.
 *
 * @param {string} text - Raw input text
 * @param {object} [options]
 * @param {number} [options.maxLength=4096] - Max allowed character length
 * @returns {{ clean: string, warnings: string[] }}
 */
export function sanitizeLLMInput(text, options = {}) {
  if (typeof text !== 'string') {
    return { clean: '', warnings: ['INVALID_INPUT'] };
  }

  const maxLength = typeof options.maxLength === 'number' ? options.maxLength : DEFAULT_MAX_LENGTH;
  const warnings = [];
  let clean = text;

  // 1. Max length enforcement
  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
    warnings.push('TRUNCATED');
  }

  // 2. Strip control characters (preserve tab and newline)
  clean = clean.replace(CONTROL_CHAR_PATTERN, '');

  // 3. Injection pattern detection
  for (const { pattern, warning } of INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      warnings.push(warning);
    }
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
  }

  return { clean, warnings };
}
