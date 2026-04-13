/**
 * Input Sanitizer for LLM Vision Scorer
 * SD: SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001-B
 *
 * Sanitizes SD descriptions and scope text before they are sent to the LLM
 * for vision scoring. Prevents prompt injection attacks that could manipulate
 * dimension scores.
 */

/** Maximum content length for LLM input (matches vision-scorer.js MAX_CONTENT_CHARS). */
const MAX_CONTENT_CHARS = 8000;

/**
 * Injection patterns to detect and strip.
 * Each pattern has a regex and a description for logging.
 */
const INJECTION_PATTERNS = [
  {
    name: 'system_prompt_override',
    pattern: /(?:^|\n)\s*(?:system|system\s*prompt|<\|system\|>)\s*[:>]/gi,
    description: 'Attempts to inject a system prompt',
  },
  {
    name: 'role_override',
    pattern: /(?:you\s+are\s+(?:now|a)|act\s+as|pretend\s+to\s+be|ignore\s+(?:all\s+)?previous\s+instructions?)/gi,
    description: 'Attempts to override the LLM role',
  },
  {
    name: 'score_manipulation',
    pattern: /(?:score\s+(?:this|the\s+SD)\s+(?:at\s+)?(?:100|maximum|highest|perfect)|give\s+(?:a\s+)?(?:perfect|maximum|100)\s+score|all\s+dimensions?\s+(?:should\s+)?(?:score|get|receive)\s+(?:100|maximum))/gi,
    description: 'Attempts to directly manipulate scores',
  },
  {
    name: 'instruction_injection',
    pattern: /(?:---\s*(?:END|BEGIN)\s*---|\[\[(?:SYSTEM|INST|END)\]\]|<\/?(?:s|system|inst|user|assistant)>)/gi,
    description: 'Delimiter-based instruction injection',
  },
  {
    name: 'evaluation_override',
    pattern: /(?:override\s+(?:the\s+)?evaluation|bypass\s+(?:the\s+)?(?:gate|scoring|threshold)|skip\s+(?:the\s+)?validation)/gi,
    description: 'Attempts to bypass evaluation logic',
  },
  {
    name: 'json_injection',
    pattern: /(?:"(?:score|total_score|dimension_scores|threshold_action)"\s*:\s*(?:100|"accept"|true))/gi,
    description: 'Attempts to inject JSON score values',
  },
];

/**
 * Sanitize text input before sending to LLM for vision scoring.
 *
 * @param {string} text - Raw input text (SD description, scope, etc.)
 * @param {Object} [options] - Options
 * @param {boolean} [options.logWarnings=true] - Log warnings for sanitized content
 * @returns {{ text: string, sanitized: boolean, modifications: string[] }}
 */
export function sanitizeInput(text, options = {}) {
  const { logWarnings = true } = options;

  if (!text || typeof text !== 'string') {
    return { text: '', sanitized: false, modifications: [] };
  }

  const modifications = [];
  let result = text;

  // Check each injection pattern
  for (const { name, pattern, description } of INJECTION_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, '[REDACTED]');
      modifications.push(`${name}: ${description}`);
      if (logWarnings) {
        console.warn(`[InputSanitizer] Stripped ${name}: ${description}`);
      }
    }
  }

  // Enforce content length limit
  if (result.length > MAX_CONTENT_CHARS) {
    result = result.slice(0, MAX_CONTENT_CHARS);
    modifications.push(`content_truncated: Exceeded ${MAX_CONTENT_CHARS} chars`);
    if (logWarnings) {
      console.warn(`[InputSanitizer] Content truncated to ${MAX_CONTENT_CHARS} chars`);
    }
  }

  return {
    text: result,
    sanitized: modifications.length > 0,
    modifications,
  };
}

/**
 * Sanitize multiple fields of an SD object for LLM input.
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} [options]
 * @returns {{ sd: Object, totalModifications: string[] }}
 */
export function sanitizeSDForScoring(sd, options = {}) {
  if (!sd) return { sd: {}, totalModifications: [] };

  const totalModifications = [];
  const sanitized = { ...sd };

  for (const field of ['description', 'scope', 'rationale', 'title']) {
    if (sanitized[field] && typeof sanitized[field] === 'string') {
      const result = sanitizeInput(sanitized[field], options);
      sanitized[field] = result.text;
      if (result.sanitized) {
        totalModifications.push(...result.modifications.map(m => `${field}: ${m}`));
      }
    }
  }

  return { sd: sanitized, totalModifications };
}
