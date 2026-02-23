/**
 * SD-Type-Aware Post-Completion Requirements
 *
 * Purpose: Return different post-completion command sequences based on SD type.
 *
 * Code SDs (feature, bugfix, security, refactor, enhancement):
 *   Full sequence: restart -> [vision-qa] -> document -> ship -> learn
 *   (vision-qa runs only for UI-touching SDs when AUTO-PROCEED is active)
 *
 * Non-code SDs (documentation, orchestrator, infrastructure):
 *   Minimal sequence: ship only
 *
 * Created: 2026-01-22
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-A
 * Updated: 2026-02-06 (SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001)
 * Part of: AUTO-PROCEED Intelligence Enhancements + Three-Tier Testing Architecture
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
  'uat',  // Renamed from qa: UAT campaigns don't require full sequence
  'api',
  'backend'
];

/**
 * Relevant documentation directories by SD type.
 * Used by /document skill to scope existing-doc scanning per SD type.
 */
const SD_TYPE_DOC_DIRECTORIES = {
  feature: ['docs/04_features/', 'docs/02_api/', 'docs/reference/'],
  enhancement: ['docs/04_features/', 'docs/reference/'],
  security: ['docs/reference/', 'docs/03_protocols_and_standards/'],
  bugfix: ['docs/troubleshooting/', 'docs/reference/'],
  refactor: ['docs/01_architecture/', 'docs/reference/'],
  performance: ['docs/reference/', 'docs/01_architecture/'],
  database: ['docs/database/', 'docs/reference/'],
  infrastructure: ['docs/06_deployment/', 'docs/infrastructure/', 'docs/operations/'],
  api: ['docs/02_api/', 'docs/reference/'],
  backend: ['docs/02_api/', 'docs/reference/'],
  process: ['docs/03_protocols_and_standards/', 'docs/workflow/', 'docs/governance/'],
  documentation: ['docs/'],
  docs: ['docs/'],
  uat: ['docs/05_testing/'],
};

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
 * SD source values that should skip /heal to prevent infinite loops.
 * Heal creates corrective SDs — those shouldn't re-trigger heal.
 */
const HEAL_SKIP_SOURCES = [
  'heal',        // Created by /heal command
  'corrective'   // Corrective SDs created by heal shouldn't re-trigger heal
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

  // /heal should be skipped for heal/corrective sources to prevent infinite loops
  const skipHeal = HEAL_SKIP_SOURCES.includes(source);

  // Vision QA: For full-sequence SDs with UI changes, when AUTO-PROCEED is active
  const autoProceedActive = options.autoProceed ?? false;
  const visionQA = isFullSequence && hasUIChanges && autoProceedActive;

  // Base requirements
  const requirements = {
    // Restart: Only for code SDs with UI changes
    restart: isFullSequence && (hasUIChanges || normalizedType === 'feature'),

    // Vision QA: Inline visual testing for UI-touching SDs (Three-Tier Architecture Tier 2)
    visionQA,

    // Ship: Always required for completed SDs
    ship: true,

    // Document: All SD types except orchestrator (orchestrators don't do direct work)
    document: normalizedType !== 'orchestrator',

    // Heal: Verify SD promises for code SDs, unless source indicates skip
    heal: isFullSequence && !skipHeal,

    // Learn: For code SDs, unless source indicates skip
    learn: isFullSequence && !skipLearn,

    // Metadata
    sdType: normalizedType,
    sequenceType: isMinimalSequence ? 'minimal' : 'full',
    skipHealReason: skipHeal ? `Source '${source}' skips /heal to prevent recursion` : null,
    skipLearnReason: skipLearn ? `Source '${source}' skips /learn to prevent recursion` : null,
    visionQASkipReason: !visionQA ? (
      !isFullSequence ? 'minimal sequence SD' :
      !hasUIChanges ? 'no UI changes detected' :
      !autoProceedActive ? 'AUTO-PROCEED not active' : null
    ) : null
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

  // Vision QA: after restart, before document (Three-Tier Architecture)
  if (requirements.visionQA) {
    sequence.push('vision-qa');
  }

  // Document before ship - docs should be part of the PR
  if (requirements.document) {
    sequence.push('document');
  }

  // Ship is always included
  sequence.push('ship');

  // Heal: verify SD promises after ship, before learn
  if (requirements.heal) {
    sequence.push('heal');
  }

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
  console.log(`      /restart:    ${requirements.restart ? 'YES' : 'SKIP'}`);
  console.log(`      /vision-qa:  ${requirements.visionQA ? 'YES' : 'SKIP'}${requirements.visionQASkipReason ? ` (${requirements.visionQASkipReason})` : ''}`);
  console.log(`      /ship:       ${requirements.ship ? 'YES' : 'SKIP'}`);
  console.log(`      /document:   ${requirements.document ? 'YES' : 'SKIP'}`);
  console.log(`      /heal:       ${requirements.heal ? 'YES' : 'SKIP'}${requirements.skipHealReason ? ` (${requirements.skipHealReason})` : ''}`);
  console.log(`      /learn:      ${requirements.learn ? 'YES' : 'SKIP'}${requirements.skipLearnReason ? ` (${requirements.skipLearnReason})` : ''}`);
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
export { FULL_SEQUENCE_TYPES, MINIMAL_SEQUENCE_TYPES, LEARN_SKIP_SOURCES, HEAL_SKIP_SOURCES, SD_TYPE_DOC_DIRECTORIES };

// Export all functions and constants as default
export default {
  getPostCompletionRequirements,
  getPostCompletionSequence,
  shouldSkipLearn,
  displayPostCompletionSummary,
  getPostCompletionRequirementsFromSD,
  FULL_SEQUENCE_TYPES,
  MINIMAL_SEQUENCE_TYPES,
  LEARN_SKIP_SOURCES,
  HEAL_SKIP_SOURCES,
  SD_TYPE_DOC_DIRECTORIES
};
