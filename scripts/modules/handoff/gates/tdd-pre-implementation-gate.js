/**
 * TDD Pre-Implementation Gate
 * SD-LEO-INFRA-PLAN-MODE-TDD-001, FR-6
 *
 * Optional, opt-in validator that checks for evidence of pre-implementation
 * tests when the SD type requires TDD (per the SD-type-to-TDD mapping).
 *
 * DISABLED BY DEFAULT. Enable via:
 *   - Environment variable: TDD_PRE_IMPL_GATE_ENABLED=true
 *   - Or SD metadata: tdd_required=true (overrides type-based exemption)
 *
 * When enabled, this gate checks EXEC→PLAN handoffs for:
 *   1. New/modified test files added before production code
 *   2. A referenced pre-implementation test run (in handoff notes or metadata)
 *
 * Returns standard gate result: { passed, score, max_score, issues, warnings, details }
 */

// TDD level by SD type (matches CLAUDE_EXEC.md "TDD Applicability by SD Type" table)
const TDD_LEVEL_BY_TYPE = {
  feature: 'mandatory',
  enhancement: 'recommended',
  bugfix: 'recommended',
  fix: 'exempt',
  documentation: 'exempt',
  infrastructure: 'exempt',
  refactor: 'recommended',
  security: 'recommended',
  uat: 'exempt',
  qa: 'exempt'
};

/**
 * Check if the TDD gate is enabled globally
 * @returns {boolean}
 */
function isGateEnabled() {
  const envFlag = process.env.TDD_PRE_IMPL_GATE_ENABLED;
  return envFlag === 'true' || envFlag === '1';
}

/**
 * Get TDD requirement level for an SD type
 * @param {string} sdType - The SD type (feature, enhancement, etc.)
 * @param {Object} [metadata] - SD metadata (may contain tdd_required override)
 * @returns {'mandatory'|'recommended'|'exempt'}
 */
function getTddLevel(sdType, metadata) {
  // SD-level override: tdd_required=true forces mandatory
  if (metadata?.tdd_required === true) {
    return 'mandatory';
  }
  return TDD_LEVEL_BY_TYPE[sdType] || 'exempt';
}

/**
 * Validate pre-implementation test evidence for a handoff
 *
 * @param {Object} context - Validation context
 * @param {string} context.sd_id - The SD key
 * @param {Object} context.supabase - Supabase client
 * @param {Object} [context.handoff] - Handoff data (if available)
 * @returns {Promise<Object>} Gate result
 */
export async function validateTddPreImplementation(context) {
  const { sd_id, supabase, handoff } = context;

  // Gate disabled globally → auto-pass
  if (!isGateEnabled()) {
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: {
        status: 'skipped',
        reason: 'TDD pre-implementation gate is disabled (TDD_PRE_IMPL_GATE_ENABLED not set)'
      }
    };
  }

  // Fetch SD to get type and metadata
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('sd_type, metadata')
    .eq('id', sd_id)
    .single();

  if (sdError || !sd) {
    return {
      passed: true,
      score: 80,
      max_score: 100,
      issues: [],
      warnings: [`Could not fetch SD ${sd_id} for TDD check: ${sdError?.message || 'not found'}`],
      details: { status: 'warn', reason: 'SD lookup failed, defaulting to pass' }
    };
  }

  const tddLevel = getTddLevel(sd.sd_type, sd.metadata);

  // Exempt types → auto-pass with reason
  if (tddLevel === 'exempt') {
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: {
        status: 'exempt',
        reason: `Exempt for ${sd.sd_type}`,
        sd_type: sd.sd_type,
        tdd_level: tddLevel
      }
    };
  }

  // Check for test evidence in handoff data
  const issues = [];
  const warnings = [];
  let testFilesFound = false;
  let preImplRunFound = false;

  // Check handoff notes/deliverables for TDD evidence
  const handoffNotes = handoff?.notes || handoff?.deliverables_manifest || '';
  const handoffStr = typeof handoffNotes === 'string'
    ? handoffNotes
    : JSON.stringify(handoffNotes);

  // Look for test file references
  const testFilePatterns = [
    /tests?\/(unit|e2e|integration)\/.*\.(test|spec)\.(js|ts|jsx|tsx)/i,
    /\.test\.(js|ts|jsx|tsx)/i,
    /\.spec\.(js|ts|jsx|tsx)/i
  ];

  for (const pattern of testFilePatterns) {
    if (pattern.test(handoffStr)) {
      testFilesFound = true;
      break;
    }
  }

  // Look for pre-implementation test run evidence
  const preImplPatterns = [
    /pre-implementation.*test.*run/i,
    /TDD.*evidence/i,
    /tests?\s+fail(ed|ing)/i,
    /\d+\s+(tests?\s+)?failed,\s*0\s+passed/i,
    /before.*implementation.*test/i
  ];

  for (const pattern of preImplPatterns) {
    if (pattern.test(handoffStr)) {
      preImplRunFound = true;
      break;
    }
  }

  // Also check SD metadata for TDD evidence
  if (sd.metadata?.tdd_evidence) {
    testFilesFound = true;
    preImplRunFound = true;
  }

  // Build result
  if (!testFilesFound) {
    issues.push(
      `No test files found in handoff deliverables. ` +
      `Expected: test files matching *.test.{js,ts} or *.spec.{js,ts}. ` +
      `Fix: Invoke TESTING sub-agent with "Mode: pre-implementation" before writing code, ` +
      `then include test file paths in the handoff deliverables manifest.`
    );
  }

  if (!preImplRunFound) {
    issues.push(
      `No pre-implementation test run reference found. ` +
      `Expected: Evidence of tests failing before implementation (e.g., "3 failed, 0 passed"). ` +
      `Fix: Run tests after generating skeletons but before writing production code, ` +
      `and include the output in the handoff notes under "TDD Evidence".`
    );
  }

  const isMandatory = tddLevel === 'mandatory';
  const hasIssues = issues.length > 0;
  // Mandatory: fail on missing evidence. Recommended: warn only.
  const passed = isMandatory ? !hasIssues : true;

  // Score: 100 if all evidence, 50 if partial, 0 if none
  let score = 100;
  if (!testFilesFound && !preImplRunFound) score = 0;
  else if (!testFilesFound || !preImplRunFound) score = 50;

  // For recommended level, move issues to warnings
  if (!isMandatory && hasIssues) {
    warnings.push(...issues.map(i => `[Recommended] ${i}`));
    issues.length = 0;
  }

  return {
    passed,
    score,
    max_score: 100,
    issues,
    warnings,
    details: {
      status: passed ? 'pass' : 'fail',
      sd_type: sd.sd_type,
      tdd_level: tddLevel,
      test_files_found: testFilesFound,
      pre_impl_run_found: preImplRunFound,
      gate_enabled: true
    }
  };
}

/**
 * Create TDD gate factory for use in handoff executors
 * @returns {Object} Gate configuration
 */
export function createTddPreImplementationGate() {
  return {
    name: 'GATE_TDD_PRE_IMPLEMENTATION',
    description: 'Checks for pre-implementation test evidence (opt-in)',
    validate: validateTddPreImplementation,
    enabled: isGateEnabled,
    blocking: false // Non-blocking by default; only blocks when mandatory + enabled
  };
}
