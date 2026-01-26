/**
 * SD-Type-Aware Post-Completion Requirements
 *
 * Purpose: Return different post-completion command sequences based on SD type.
 *
 * Code SDs (feature, bugfix, security, refactor, enhancement):
 *   Full sequence: restart -> document -> ship -> learn
 *
 * Non-code SDs (documentation, orchestrator, infrastructure):
 *   Minimal sequence: ship only
 *
 * Created: 2026-01-22
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-A
 * Part of: AUTO-PROCEED Intelligence Enhancements
 */

/**
 * SD types that require full post-completion sequence
 * (restart -> document -> ship -> learn)
 *
 * These are CODE_PRODUCING types from sd-type-checker.js
 */
const FULL_SEQUENCE_TYPES = [
  'feature',
  'bugfix',
  'security',
  'refactor',
  'enhancement',
  'performance'
];

/**
 * SD types that require minimal post-completion sequence
 * (ship only)
 *
 * These are NON_CODE types from sd-type-checker.js
 */
const MINIMAL_SEQUENCE_TYPES = [
  'documentation',
  'docs',
  'orchestrator',
  'infrastructure',
  'database',
  'process',
  'qa',
  'api',
  'backend'
];

/**
 * SD source values that should skip /learn to prevent infinite recursion
 */
const LEARN_SKIP_SOURCES = [
  'learn',           // Created by /learn command
  'quick-fix',       // Created by /quick-fix command
  'rca',             // Created by /rca command
  'escalation',      // Legacy: Created by old /escalate command (backward compat)
  'auto-generated',  // Auto-generated SDs
  'pattern-derived'  // SDs derived from patterns
];

/**
 * Get post-completion requirements for an SD based on its type.
 *
 * Returns an object indicating which post-completion commands should run:
 * - restart: Restart servers before shipping (for UI verification)
 * - ship: Commit, PR, merge workflow (always true for completed SDs)
 * - document: Update documentation (for feature/API changes)
 * - learn: Capture learnings (conditional based on source)
 *
 * @param {string} sdType - The SD type (e.g., 'feature', 'infrastructure')
 * @param {Object} options - Optional configuration
 * @param {string} options.source - SD source (e.g., 'learn', 'quick-fix')
 * @param {boolean} options.hasUIChanges - Whether SD has UI changes
 * @returns {Object} Post-completion requirements
 */
export function getPostCompletionRequirements(sdType, options = {}) {
  const normalizedType = (sdType || 'feature').toLowerCase();
  const source = (options.source || '').toLowerCase();
  const hasUIChanges = options.hasUIChanges ?? false;

  // Determine if this is a full-sequence or minimal-sequence SD
  const isFullSequence = FULL_SEQUENCE_TYPES.includes(normalizedType);
  const isMinimalSequence = MINIMAL_SEQUENCE_TYPES.includes(normalizedType);

  // /learn should be skipped for certain source types to prevent infinite loops
  const skipLearn = LEARN_SKIP_SOURCES.includes(source);

  // Base requirements
  const requirements = {
    // Restart: Only for code SDs with UI changes
    restart: isFullSequence && (hasUIChanges || normalizedType === 'feature'),

    // Ship: Always required for completed SDs
    ship: true,

    // Document: Only for code SDs that may have user-facing changes
    document: isFullSequence && ['feature', 'enhancement', 'security'].includes(normalizedType),

    // Learn: For code SDs, unless source indicates skip
    learn: isFullSequence && !skipLearn,

    // Metadata
    sdType: normalizedType,
    sequenceType: isMinimalSequence ? 'minimal' : 'full',
    skipLearnReason: skipLearn ? `Source '${source}' skips /learn to prevent recursion` : null
  };

  return requirements;
}

/**
 * Get the ordered command sequence for post-completion.
 *
 * Returns an array of command names in the order they should be executed.
 *
 * @param {string} sdType - The SD type
 * @param {Object} options - Same options as getPostCompletionRequirements
 * @returns {string[]} Ordered array of commands to execute
 */
export function getPostCompletionSequence(sdType, options = {}) {
  const requirements = getPostCompletionRequirements(sdType, options);
  const sequence = [];

  // Build sequence in correct order
  if (requirements.restart) {
    sequence.push('restart');
  }

  // Document before ship - docs should be part of the PR
  if (requirements.document) {
    sequence.push('document');
  }

  // Ship is always included
  sequence.push('ship');

  if (requirements.learn) {
    sequence.push('learn');
  }

  return sequence;
}

/**
 * Check if an SD should skip /learn invocation.
 *
 * @param {Object} sd - The Strategic Directive object
 * @returns {Object} { skip: boolean, reason: string }
 */
export function shouldSkipLearn(sd) {
  const source = (sd.source || '').toLowerCase();
  const sdType = (sd.sd_type || 'feature').toLowerCase();

  // Check source-based exclusions
  if (LEARN_SKIP_SOURCES.includes(source)) {
    return {
      skip: true,
      reason: `SD source '${source}' excludes /learn invocation to prevent recursion`
    };
  }

  // Check type-based exclusions (non-code SDs)
  if (MINIMAL_SEQUENCE_TYPES.includes(sdType)) {
    return {
      skip: true,
      reason: `SD type '${sdType}' uses minimal post-completion sequence (no /learn)`
    };
  }

  return {
    skip: false,
    reason: null
  };
}

/**
 * Display post-completion requirements summary.
 *
 * @param {string} sdType - The SD type
 * @param {Object} options - Options for requirements
 */
export function displayPostCompletionSummary(sdType, options = {}) {
  const requirements = getPostCompletionRequirements(sdType, options);
  const sequence = getPostCompletionSequence(sdType, options);

  console.log('\n');
  console.log('POST-COMPLETION REQUIREMENTS');
  console.log('================================================');
  console.log(`   SD Type: ${requirements.sdType}`);
  console.log(`   Sequence Type: ${requirements.sequenceType.toUpperCase()}`);
  console.log('');
  console.log('   Commands:');
  console.log(`      /restart:  ${requirements.restart ? 'YES' : 'SKIP'}`);
  console.log(`      /ship:     ${requirements.ship ? 'YES' : 'SKIP'}`);
  console.log(`      /document: ${requirements.document ? 'YES' : 'SKIP'}`);
  console.log(`      /learn:    ${requirements.learn ? 'YES' : 'SKIP'}${requirements.skipLearnReason ? ` (${requirements.skipLearnReason})` : ''}`);
  console.log('');
  console.log(`   Sequence: ${sequence.join(' -> ')}`);
  console.log('================================================');
}

/**
 * Integration helper: Get requirements from SD object.
 *
 * @param {Object} sd - The Strategic Directive object
 * @returns {Object} Post-completion requirements
 */
export function getPostCompletionRequirementsFromSD(sd) {
  if (!sd) {
    throw new Error('SD object is required');
  }

  const sdType = sd.sd_type || 'feature';
  const source = sd.source || '';

  // Detect if SD has UI changes from scope/description
  const scope = (sd.scope || '').toLowerCase();
  const hasUIChanges = scope.includes('ui') ||
    scope.includes('component') ||
    scope.includes('page') ||
    scope.includes('dashboard') ||
    scope.includes('form') ||
    scope.includes('modal');

  return getPostCompletionRequirements(sdType, {
    source,
    hasUIChanges
  });
}

// Export constants for direct import
export { FULL_SEQUENCE_TYPES, MINIMAL_SEQUENCE_TYPES, LEARN_SKIP_SOURCES };

// Export all functions and constants as default
export default {
  getPostCompletionRequirements,
  getPostCompletionSequence,
  shouldSkipLearn,
  displayPostCompletionSummary,
  getPostCompletionRequirementsFromSD,
  FULL_SEQUENCE_TYPES,
  MINIMAL_SEQUENCE_TYPES,
  LEARN_SKIP_SOURCES
};
