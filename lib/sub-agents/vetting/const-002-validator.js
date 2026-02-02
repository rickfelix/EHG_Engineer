/**
 * CONST-002 Family Separation Validator
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (FR-3, TR-3)
 *
 * Enforces constitutional requirement for AI model family separation:
 * - Evaluator models must be from different families than the proposer
 * - At least 2 distinct evaluator families required
 * - No cross-contamination of persona contexts
 */

// Model family detection patterns
const FAMILY_PATTERNS = {
  anthropic: [
    /^claude[-:/_]/i,
    /^anthropic[-:/_]/i,
    /^claude\b/i
  ],
  openai: [
    /^gpt[-:/_]/i,
    /^o\d[-:/_]/i,
    /^openai[-:/_]/i,
    /^text-embedding-/i,
    /^gpt\b/i
  ],
  google: [
    /^gemini[-:/_]/i,
    /^palm[-:/_]/i,
    /^google[-:/_]/i,
    /^gemini\b/i
  ],
  meta: [
    /^llama[-:/_]/i,
    /^meta[-:/_]/i,
    /^llama\b/i
  ],
  mistral: [
    /^mistral[-:/_]/i,
    /^mixtral[-:/_]/i,
    /^mixtral\b/i,
    /^mistral\b/i
  ]
};

// Forbidden context markers that indicate cross-contamination
const FORBIDDEN_CONTEXT_MARKERS = [
  // Other persona's raw outputs
  /__PERSONA_OUTPUT_START__/,
  /__PERSONA_OUTPUT_END__/,
  // Direct persona transcript references
  /\[SAFETY_TRANSCRIPT\]/,
  /\[VALUE_TRANSCRIPT\]/,
  /\[RISK_TRANSCRIPT\]/,
  // Internal state markers
  /__INTERNAL_STATE__/,
  /__RAW_SCORE__/
];

/**
 * Detect model family from model identifier
 * @param {string} modelId - Model identifier (e.g., "claude-3-sonnet", "gpt-4")
 * @returns {string} Family name or 'unknown'
 */
export function detectModelFamily(modelId) {
  if (!modelId) return 'unknown';

  const normalizedId = modelId.toLowerCase();

  for (const [family, patterns] of Object.entries(FAMILY_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(normalizedId))) {
      return family;
    }
  }

  return 'unknown';
}

/**
 * Validate CONST-002 family separation for a debate configuration
 * @param {Object} config - Debate configuration
 * @param {string} config.proposerModel - Model used for proposal generation
 * @param {Array<{persona: string, model: string}>} config.evaluators - Evaluator models
 * @returns {Object} Validation result
 */
export function validateFamilySeparation(config) {
  const { proposerModel, evaluators } = config;

  const result = {
    passed: false,
    violations: [],
    warnings: [],
    families: {},
    reason_code: null
  };

  // Get proposer family
  const proposerFamily = detectModelFamily(proposerModel);
  result.families.proposer = {
    model: proposerModel,
    family: proposerFamily
  };

  // Check proposer family is known
  if (proposerFamily === 'unknown') {
    result.violations.push({
      code: 'CONST_002_UNKNOWN_PROPOSER',
      message: `Proposer model '${proposerModel}' has unknown family`
    });
  }

  // Analyze evaluators
  const evaluatorFamilies = new Set();
  result.families.evaluators = [];

  for (const evaluator of evaluators) {
    const family = detectModelFamily(evaluator.model);

    result.families.evaluators.push({
      persona: evaluator.persona,
      model: evaluator.model,
      family
    });

    if (family === 'unknown') {
      result.warnings.push({
        code: 'CONST_002_UNKNOWN_EVALUATOR',
        message: `Evaluator '${evaluator.persona}' uses unknown family model '${evaluator.model}'`
      });
    } else {
      evaluatorFamilies.add(family);
    }

    // Check evaluator doesn't share family with proposer
    if (family === proposerFamily && proposerFamily !== 'unknown') {
      result.violations.push({
        code: 'CONST_002_FAMILY_COLLISION',
        message: `Evaluator '${evaluator.persona}' (${evaluator.model}) shares family '${family}' with proposer`
      });
    }
  }

  // Check at least 2 distinct evaluator families
  if (evaluatorFamilies.size < 2) {
    result.violations.push({
      code: 'CONST_002_INSUFFICIENT_DIVERSITY',
      message: `Need at least 2 distinct evaluator families, found ${evaluatorFamilies.size}: ${Array.from(evaluatorFamilies).join(', ')}`
    });
  }

  // Check all 3 evaluators use different families from each other
  const evaluatorFamilyList = result.families.evaluators.map(e => e.family);
  const uniqueEvaluatorFamilies = new Set(evaluatorFamilyList.filter(f => f !== 'unknown'));

  if (uniqueEvaluatorFamilies.size < evaluatorFamilyList.filter(f => f !== 'unknown').length) {
    const duplicates = evaluatorFamilyList.filter((f, i) =>
      f !== 'unknown' && evaluatorFamilyList.indexOf(f) !== i
    );
    result.warnings.push({
      code: 'CONST_002_EVALUATOR_DUPLICATION',
      message: `Multiple evaluators share the same family: ${duplicates.join(', ')}`
    });
  }

  // Determine final result
  result.passed = result.violations.length === 0;
  result.reason_code = result.passed
    ? 'CONST_002_PASS'
    : result.violations[0]?.code || 'CONST_002_FAIL';

  return result;
}

/**
 * Validate prompt context for cross-contamination
 * @param {string} promptContext - The constructed prompt to validate
 * @param {string} currentPersona - The persona this prompt is for
 * @returns {Object} Validation result
 */
export function validatePromptContext(promptContext, currentPersona) {
  const result = {
    passed: true,
    violations: [],
    scanned_length: promptContext.length
  };

  // Check for forbidden markers
  for (const marker of FORBIDDEN_CONTEXT_MARKERS) {
    if (marker.test(promptContext)) {
      result.passed = false;
      result.violations.push({
        code: 'CONST_002_CONTEXT_CONTAMINATION',
        message: `Forbidden marker found in ${currentPersona} context`,
        marker: marker.toString()
      });
    }
  }

  // Check for other personas' raw transcripts
  const otherPersonas = ['safety', 'value', 'risk'].filter(p => p !== currentPersona);
  for (const persona of otherPersonas) {
    // Look for patterns that suggest raw persona output
    const rawOutputPattern = new RegExp(`"persona"\\s*:\\s*"${persona}".*?"rationale"\\s*:`, 's');
    if (rawOutputPattern.test(promptContext)) {
      result.passed = false;
      result.violations.push({
        code: 'CONST_002_RAW_TRANSCRIPT_LEAK',
        message: `Raw '${persona}' persona output detected in ${currentPersona} context`,
        persona: persona
      });
    }
  }

  return result;
}

/**
 * Create a validated debate configuration
 * Ensures CONST-002 compliance at configuration time
 * @param {string} proposerModel - Model used for proposal
 * @param {Object} options - Configuration options
 * @returns {Object} Validated configuration or throws on violation
 */
export function createValidatedDebateConfig(proposerModel, options = {}) {
  // Default evaluator configuration (3 distinct families)
  const defaultEvaluators = [
    { persona: 'safety', model: 'claude-sonnet-4-20250514' },
    { persona: 'value', model: 'gpt-4o' },
    { persona: 'risk', model: 'gemini-1.5-pro' }
  ];

  const evaluators = options.evaluators || defaultEvaluators;

  // Validate configuration
  const validation = validateFamilySeparation({
    proposerModel: proposerModel || 'unknown',
    evaluators
  });

  if (!validation.passed) {
    const error = new Error(`CONST-002 validation failed: ${validation.violations.map(v => v.message).join('; ')}`);
    error.code = validation.reason_code;
    error.violations = validation.violations;
    throw error;
  }

  return {
    proposerModel,
    evaluators,
    validation,
    const_002_passed: true,
    validated_at: new Date().toISOString()
  };
}

/**
 * Get a summary of CONST-002 compliance for logging
 * @param {Object} validation - Validation result from validateFamilySeparation
 * @returns {string} Human-readable summary
 */
export function getComplianceSummary(validation) {
  const lines = [];

  lines.push(`CONST-002 Compliance: ${validation.passed ? '✅ PASS' : '❌ FAIL'}`);
  lines.push(`Reason: ${validation.reason_code}`);

  if (validation.families.proposer) {
    lines.push(`Proposer: ${validation.families.proposer.model} (${validation.families.proposer.family})`);
  }

  if (validation.families.evaluators) {
    lines.push('Evaluators:');
    for (const e of validation.families.evaluators) {
      lines.push(`  - ${e.persona}: ${e.model} (${e.family})`);
    }
  }

  if (validation.violations.length > 0) {
    lines.push('Violations:');
    for (const v of validation.violations) {
      lines.push(`  - [${v.code}] ${v.message}`);
    }
  }

  if (validation.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of validation.warnings) {
      lines.push(`  - [${w.code}] ${w.message}`);
    }
  }

  return lines.join('\n');
}

export default {
  detectModelFamily,
  validateFamilySeparation,
  validatePromptContext,
  createValidatedDebateConfig,
  getComplianceSummary
};
