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
 *
 * Processing order (each step feeds into the next):
 *   1. Pre-cap (DoS guard: absolute max before any regex)
 *   2. NFKC normalize (maps homoglyphs/lookalikes to canonical forms)
 *   3. Strip Unicode invisibles (zero-width, soft hyphen, BOM)
 *   4. Strip control characters (U+0000-U+001F minus tab/newline)
 *   5. Injection pattern detection (on clean text, before truncation)
 *   6. Truncate to maxLength
 */

const DEFAULT_MAX_LENGTH = 4096;
// Hard ceiling applied before regex processing to bound CPU/memory cost.
// Set to 10x default — enough headroom for custom maxLength, blocks DoS.
const ABSOLUTE_PRE_CAP = DEFAULT_MAX_LENGTH * 10; // 40 960 chars

// OWASP LLM Top 10 injection patterns.
// `i` flag only (no `g`) — stateless, safe for concurrent async calls.
// `g` flag is NOT used: .test() with global regex advances lastIndex and
// causes false negatives in concurrent callers sharing module-level objects.
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
  // Legacy Claude plaintext role prefixes (matches at line start or after newline, with optional leading whitespace)
  { pattern: /(?:^|\n)\s*(human|assistant|system)\s*:/i, warning: 'INJECTION_ROLE_PREFIX' },
];

// Used only in String.prototype.replace() — `g` flag is safe here because
// replace() always resets lastIndex after completion (no .test()/.exec() usage).
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const UNICODE_INVISIBLE_PATTERN = /[\u00AD\u200B-\u200F\u2028\u2029\uFEFF]/g;

/**
 * Sanitize text before passing to an LLM endpoint.
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

  // 1. Pre-cap: bound CPU/memory before any regex pass (DoS protection)
  let clean = text.length > ABSOLUTE_PRE_CAP ? text.slice(0, ABSOLUTE_PRE_CAP) : text;

  // 2. NFKC normalization: maps homoglyphs and lookalike Unicode characters
  //    (Cyrillic/Greek substitutes for Latin) to canonical ASCII-equivalent forms,
  //    preventing keyword bypass via lookalike characters (e.g., 'IgnОrе').
  clean = clean.normalize('NFKC');

  // 3. Strip Unicode invisibles (prevents zero-width / soft-hyphen insertion bypass)
  clean = clean.replace(UNICODE_INVISIBLE_PATTERN, '');

  // 4. Strip control characters BEFORE injection detection.
  //    Control chars interleaved in keywords (e.g., 'ignore\x01 previous') would
  //    defeat regex patterns if stripping happened after detection.
  clean = clean.replace(CONTROL_CHAR_PATTERN, '');

  // 5. Injection pattern detection — runs on full sanitized input BEFORE truncation.
  //    Scanning before truncation prevents boundary-split bypass (attacker pads to
  //    maxLength to push payload past the truncation boundary).
  for (const { pattern, warning } of INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      warnings.push(warning);
    }
  }

  // 6. Truncate to maxLength after detection
  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
    warnings.push('TRUNCATED');
  }

  return { clean, warnings };
}
