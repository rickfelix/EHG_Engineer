/**
 * Input Sanitization Primitive for LLM Data Flows
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-A
 *
 * Detects injection patterns and strips unsafe characters from text before
 * passing to LLM-mediated data flows.
 *
 * Returns { clean: string, warnings: string[] } — always non-blocking.
 *
 * IMPORTANT: `clean` has control characters and Unicode invisibles stripped,
 * but injection payload TEXT is preserved (not redacted). Warnings signal the
 * caller that suspicious content was detected. Callers should log warnings and
 * decide whether to block — this module does not block automatically.
 *
 * `maxLength` is measured in UTF-16 code units (JS string length), not bytes.
 * Multi-byte Unicode (emoji, CJK) may produce `clean` strings with higher byte
 * counts than `maxLength` suggests. Guard byte limits at the API call site.
 */

const DEFAULT_MAX_LENGTH = 4096;

// OWASP LLM Top 10 injection patterns.
// NOTE: `i` flag only (no `g`) — stateless, safe for concurrent calls.
// Each regex is tested once per input; `g` provides no benefit here.
const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(previous|prior|all\s+previous)\s+instructions/i, warning: 'INJECTION_IGNORE_PREVIOUS' },
  { pattern: /disregard\s+(previous|prior|all|your)\s+(instructions|prompt|rules)/i, warning: 'INJECTION_DISREGARD' },
  { pattern: /you\s+are\s+now\s+(DAN|unrestricted|jailbroken)/i, warning: 'INJECTION_ROLE_SWITCH' },
  { pattern: /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+(unrestricted|jailbroken|DAN)/i, warning: 'INJECTION_ACT_AS' },
  { pattern: /system\s*:\s*(you\s+are|ignore|forget|disregard)/i, warning: 'INJECTION_SYSTEM_PROMPT' },
  { pattern: /\[INST]|\[\/INST]|<\|im_start\|>|<\|im_end\|>|<\|system\|>/i, warning: 'INJECTION_DELIMITER' },
  { pattern: /do\s+not\s+follow\s+(your\s+)?(previous\s+)?(instructions|guidelines|rules|constraints)/i, warning: 'INJECTION_BYPASS_RULES' },
  { pattern: /pretend\s+(you\s+)?(are|have\s+no|don't\s+have|without)\s+.{0,30}(restriction|filter|rule|guideline|limit|constraint)/i, warning: 'INJECTION_PRETEND' },
  { pattern: /reveal\s+(your\s+)?(system\s+prompt|instructions|configuration|context)/i, warning: 'INJECTION_PROMPT_EXTRACTION' },
  { pattern: /jailbreak|dan\s+mode|developer\s+mode\s+enabled|prompt\s+injection/i, warning: 'INJECTION_JAILBREAK' },
  { pattern: /forget\s+everything\s+(above|before|previously|you\s+were\s+told)/i, warning: 'INJECTION_FORGET' },
  { pattern: /translate\s+the\s+above\s+(text|instructions|prompt)\s+to/i, warning: 'INJECTION_EXTRACTION_TRANSLATE' },
  // XML-style role tags (Claude, GPT-4 formats)
  { pattern: /<(system|user|assistant)\s*>/i, warning: 'INJECTION_XML_ROLE_TAG' },
  // Alpaca/instruction-tuned model delimiters
  { pattern: /###\s*(instruction|system|prompt|response)\s*:/i, warning: 'INJECTION_ALPACA_DELIMITER' },
  // Legacy Claude plaintext role prefix
  { pattern: /^(human|assistant|system)\s*:/im, warning: 'INJECTION_ROLE_PREFIX' },
];

// Matches control characters U+0000-U+001F except tab (U+0009) and newline (U+000A)
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

// Unicode invisible/formatting characters that can bypass pattern detection
// Soft hyphen, zero-width chars, line/paragraph separators, BOM
const UNICODE_INVISIBLE_PATTERN = /[\u00AD\u200B-\u200F\u2028\u2029\uFEFF]/g;

/**
 * Sanitize text before passing to an LLM endpoint.
 *
 * Injection detection runs on the full input before truncation to prevent
 * boundary-split bypass (attacker padding to place payload just past maxLength).
 *
 * @param {string} text - Raw input text
 * @param {object} [options]
 * @param {number} [options.maxLength=4096] - Max character length (UTF-16 code units)
 * @returns {{ clean: string, warnings: string[] }}
 */
export function sanitizeLLMInput(text, options = {}) {
  if (typeof text !== 'string') {
    return { clean: '', warnings: ['INVALID_INPUT'] };
  }

  const maxLength = typeof options.maxLength === 'number' ? options.maxLength : DEFAULT_MAX_LENGTH;
  const warnings = [];

  // 1. Strip Unicode invisibles first (prevents homoglyph/zero-width bypass of injection patterns)
  let clean = text.replace(UNICODE_INVISIBLE_PATTERN, '');

  // 2. Injection pattern detection — runs on FULL input before truncation
  //    to prevent boundary-split bypass attacks
  for (const { pattern, warning } of INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      warnings.push(warning);
    }
  }

  // 3. Strip control characters (preserve tab U+0009 and newline U+000A)
  clean = clean.replace(CONTROL_CHAR_PATTERN, '');

  // 4. Max length enforcement — runs after detection to avoid truncation bypass
  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
    warnings.push('TRUNCATED');
  }

  return { clean, warnings };
}
