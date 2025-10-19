/**
 * SD Pattern Detector
 *
 * Detects Strategic Directive patterns in user messages and determines
 * appropriate orchestration phase for Pattern 3 (Automatic SD Detection & Execution).
 *
 * Part of LEO Protocol Pattern 3 implementation.
 *
 * @module lib/sd-pattern-detector
 */

/**
 * Regular expressions for pattern detection
 */
const PATTERNS = {
  // SD-ID formats: SD-XXX, SD-XXX-XXX, SD-XXX-XXX-XXX
  sdId: /SD-[A-Z0-9]+(?:-[A-Z0-9-]+)?/gi,

  // Validation keywords (secondary trigger)
  validationKeywords: /\b(validate|check|verify|review|assess|evaluate|test|run|execute|ready|status)\b/i,

  // Phase keywords (context qualifiers)
  phaseKeywords: {
    leadPreApproval: /\b(pre-approval|LEAD_PRE_APPROVAL|lead.*approval|initial.*approval)\b/i,
    planPrd: /\b(PRD|PLAN_PRD|product.*requirement|requirements.*document)\b/i,
    execImpl: /\b(EXEC_IMPL|exec.*implementation|implementation.*phase|implement)\b/i,
    planVerify: /\b(verify|verification|PLAN_VERIFY|plan.*verify|verification.*phase)\b/i,
    leadFinal: /\b(final|LEAD_FINAL|final.*approval|completion|complete)\b/i
  }
};

/**
 * Phase constants matching orchestrate-phase-subagents.js
 */
const PHASES = {
  LEAD_PRE_APPROVAL: 'LEAD_PRE_APPROVAL',
  PLAN_PRD: 'PLAN_PRD',
  EXEC_IMPL: 'EXEC_IMPL',
  PLAN_VERIFY: 'PLAN_VERIFY',
  LEAD_FINAL: 'LEAD_FINAL'
};

/**
 * Detects SD-IDs in a message
 *
 * @param {string} message - User message to analyze
 * @returns {Array<string>} - Array of detected SD-IDs (unique, uppercase)
 *
 * @example
 * detectSdIds("Check SD-MONITORING-001 and SD-UAT-020")
 * // Returns: ["SD-MONITORING-001", "SD-UAT-020"]
 */
function detectSdIds(message) {
  if (!message || typeof message !== 'string') {
    return [];
  }

  const matches = message.match(PATTERNS.sdId);
  if (!matches) {
    return [];
  }

  // Remove duplicates and normalize to uppercase
  return [...new Set(matches.map(id => id.toUpperCase()))];
}

/**
 * Checks if message contains validation keywords
 * (excluding matches within SD-IDs themselves)
 *
 * @param {string} message - User message to analyze
 * @returns {boolean} - True if validation keywords found
 *
 * @example
 * hasValidationKeyword("validate SD-XXX")  // true
 * hasValidationKeyword("What is SD-XXX?")  // false
 * hasValidationKeyword("What is SD-TEST-001 about?")  // false (test is in SD-ID)
 */
function hasValidationKeyword(message) {
  if (!message || typeof message !== 'string') {
    return false;
  }

  // Remove SD-IDs from message before checking validation keywords
  // This prevents false positives like "SD-TEST-001" matching "test" keyword
  const messageWithoutSdIds = message.replace(PATTERNS.sdId, '');

  return PATTERNS.validationKeywords.test(messageWithoutSdIds);
}

/**
 * Determines the appropriate phase based on message content
 *
 * Priority order (highest to lowest):
 * 1. LEAD_PRE_APPROVAL (pre-approval)
 * 2. PLAN_PRD (PRD creation)
 * 3. LEAD_FINAL (final approval, completion)
 * 4. EXEC_IMPL (implementation)
 * 5. PLAN_VERIFY (default - most common)
 *
 * @param {string} message - User message to analyze
 * @returns {string} - Phase constant (e.g., 'PLAN_VERIFY')
 *
 * @example
 * determinePhase("Run pre-approval for SD-XXX")  // 'LEAD_PRE_APPROVAL'
 * determinePhase("Verify SD-XXX")                 // 'PLAN_VERIFY'
 * determinePhase("Check SD-XXX")                  // 'PLAN_VERIFY' (default)
 */
function determinePhase(message) {
  if (!message || typeof message !== 'string') {
    return PHASES.PLAN_VERIFY; // Default
  }

  // Check phase keywords in priority order
  if (PATTERNS.phaseKeywords.leadPreApproval.test(message)) {
    return PHASES.LEAD_PRE_APPROVAL;
  }

  if (PATTERNS.phaseKeywords.planPrd.test(message)) {
    return PHASES.PLAN_PRD;
  }

  if (PATTERNS.phaseKeywords.leadFinal.test(message)) {
    return PHASES.LEAD_FINAL;
  }

  if (PATTERNS.phaseKeywords.execImpl.test(message)) {
    return PHASES.EXEC_IMPL;
  }

  if (PATTERNS.phaseKeywords.planVerify.test(message)) {
    return PHASES.PLAN_VERIFY;
  }

  // Default: PLAN_VERIFY (most common verification phase)
  return PHASES.PLAN_VERIFY;
}

/**
 * Main detection function - determines if message should trigger Pattern 3
 *
 * Pattern 3 triggers when:
 * - Message contains SD-ID pattern (SD-XXX)
 * - AND (validation keyword OR phase keyword)
 *
 * @param {string} message - User message to analyze
 * @returns {Object|null} - Detection result or null if no pattern detected
 *
 * @typedef {Object} DetectionResult
 * @property {boolean} shouldExecute - Whether to execute orchestration
 * @property {Array<string>} sdIds - Array of detected SD-IDs
 * @property {string} phase - Determined phase (e.g., 'PLAN_VERIFY')
 * @property {string} command - Full command to execute
 * @property {Object} context - Additional context about detection
 * @property {boolean} context.hasValidationKeyword - Validation keyword found
 * @property {boolean} context.hasPhaseKeyword - Phase keyword found
 *
 * @example
 * detectPattern("Validate SD-MONITORING-001")
 * // Returns: {
 * //   shouldExecute: true,
 * //   sdIds: ["SD-MONITORING-001"],
 * //   phase: "PLAN_VERIFY",
 * //   command: "node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-MONITORING-001",
 * //   context: { hasValidationKeyword: true, hasPhaseKeyword: true }
 * // }
 *
 * @example
 * detectPattern("What is SD-XXX about?")
 * // Returns: null (no validation/phase keyword)
 */
function detectPattern(message) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  // Step 1: Detect SD-IDs
  const sdIds = detectSdIds(message);
  if (sdIds.length === 0) {
    return null; // No SD-ID found
  }

  // Step 2: Check for validation or phase keywords
  const hasValidation = hasValidationKeyword(message);
  const phase = determinePhase(message);
  const hasPhase = phase !== PHASES.PLAN_VERIFY || PATTERNS.phaseKeywords.planVerify.test(message);

  // Pattern 3 requires SD-ID + (validation keyword OR phase keyword)
  if (!hasValidation && !hasPhase) {
    return null; // No trigger - just informational query about SD
  }

  // Step 3: Build execution context
  // For multiple SD-IDs, execute on the first one (or handle separately)
  const primarySdId = sdIds[0];

  return {
    shouldExecute: true,
    sdIds: sdIds,
    phase: phase,
    command: `node scripts/orchestrate-phase-subagents.js ${phase} ${primarySdId}`,
    context: {
      hasValidationKeyword: hasValidation,
      hasPhaseKeyword: hasPhase,
      totalSdIds: sdIds.length
    }
  };
}

/**
 * Formats detection result for user display
 *
 * @param {DetectionResult} result - Detection result from detectPattern()
 * @returns {string} - Formatted message for user
 *
 * @example
 * const result = detectPattern("Validate SD-MONITORING-001");
 * console.log(formatDetectionResult(result));
 * // Output:
 * // ✅ Pattern 3 Auto-Detection Triggered
 * //
 * // Detected: SD-MONITORING-001
 * // Phase: PLAN_VERIFY
 * // Command: node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-MONITORING-001
 * //
 * // Executing orchestration...
 */
function formatDetectionResult(result) {
  if (!result || !result.shouldExecute) {
    return '❌ No Pattern 3 trigger detected';
  }

  return `✅ Pattern 3 Auto-Detection Triggered

Detected: ${result.sdIds.join(', ')}
Phase: ${result.phase}
Command: ${result.command}

Executing orchestration...`;
}

/**
 * Test cases for validation
 *
 * @private
 */
function runTests() {
  const testCases = [
    {
      message: "Validate SD-MONITORING-001",
      expected: { shouldExecute: true, phase: PHASES.PLAN_VERIFY }
    },
    {
      message: "Run pre-approval for SD-AUTH-003",
      expected: { shouldExecute: true, phase: PHASES.LEAD_PRE_APPROVAL }
    },
    {
      message: "Check SD-EXPORT-001 status",
      expected: { shouldExecute: true, phase: PHASES.PLAN_VERIFY }
    },
    {
      message: "PLAN_VERIFY SD-UAT-020",
      expected: { shouldExecute: true, phase: PHASES.PLAN_VERIFY }
    },
    {
      message: "Is SD-TEST-001 ready?",
      expected: { shouldExecute: true, phase: PHASES.PLAN_VERIFY }
    },
    {
      message: "What is SD-XXX about?",
      expected: { shouldExecute: false }
    },
    {
      message: "Create PRD for SD-NEW-FEATURE-001",
      expected: { shouldExecute: true, phase: PHASES.PLAN_PRD }
    },
    {
      message: "Final approval for SD-COMPLETE-001",
      expected: { shouldExecute: true, phase: PHASES.LEAD_FINAL }
    }
  ];

  console.log('Running Pattern 3 Detection Tests...\n');

  let passed = 0;
  let failed = 0;

  testCases.forEach((test, index) => {
    const result = detectPattern(test.message);
    const shouldExecute = result ? result.shouldExecute : false;
    const phase = result ? result.phase : null;

    const passedExecution = shouldExecute === test.expected.shouldExecute;
    const passedPhase = !test.expected.phase || phase === test.expected.phase;

    if (passedExecution && passedPhase) {
      console.log(`✅ Test ${index + 1}: PASS`);
      console.log(`   Message: "${test.message}"`);
      if (result) {
        console.log(`   Result: ${result.phase} for ${result.sdIds.join(', ')}`);
      }
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: FAIL`);
      console.log(`   Message: "${test.message}"`);
      console.log(`   Expected: execute=${test.expected.shouldExecute}, phase=${test.expected.phase}`);
      console.log(`   Got: execute=${shouldExecute}, phase=${phase}`);
      failed++;
    }
    console.log('');
  });

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Export functions (ES module syntax)
export {
  detectSdIds,
  hasValidationKeyword,
  determinePhase,
  detectPattern,
  formatDetectionResult,
  runTests,
  PHASES
};

// CLI execution for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--test') {
    runTests();
  } else {
    const message = args.join(' ');
    const result = detectPattern(message);

    if (result) {
      console.log(formatDetectionResult(result));
    } else {
      console.log('❌ No Pattern 3 trigger detected');
      console.log('\nTo trigger Pattern 3:');
      console.log('- Include SD-ID (e.g., SD-XXX-XXX)');
      console.log('- Include validation keyword (validate, check, verify, etc.)');
      console.log('- OR include phase keyword (PLAN_VERIFY, LEAD_PRE_APPROVAL, etc.)');
    }
  }
}
