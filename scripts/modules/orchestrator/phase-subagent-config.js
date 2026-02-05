/**
 * Phase Sub-Agent Configuration
 *
 * Defines mappings between LEO Protocol phases and required sub-agents.
 * Includes SD type-specific configurations and intensity-aware mappings.
 *
 * Extracted from orchestrate-phase-subagents.js for maintainability.
 * Part of SD-LEO-REFACTOR-ORCH-001
 */

/**
 * Phase to sub-agent mapping (loaded from database, this is fallback)
 * NOTE: PLAN_PRD and PLAN_VERIFY are now DYNAMIC based on sd_type - see getPhaseSubAgentsForSd()
 */
export const PHASE_SUBAGENT_MAP = {
  LEAD_PRE_APPROVAL: ['VALIDATION', 'DATABASE', 'SECURITY', 'DESIGN', 'RISK'],
  PLAN_PRD: ['DATABASE', 'STORIES', 'RISK', 'TESTING'],  // LEO v4.4.1: Added TESTING for test plan creation
  EXEC_IMPL: [], // EXEC does the work, no sub-agents
  PLAN_VERIFY: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
  LEAD_FINAL: ['RETRO']
};

/**
 * LEO Protocol v4.4.1: SD type-aware PLAN_PRD mapping
 * ROOT CAUSE FIX: TESTING was only running during PLAN_VERIFY (after implementation)
 * This caused SDs to be implemented without test plans, then blocked when TESTING
 * found no tests during verification. Now TESTING runs during PLAN_PRD for
 * feature/api SDs to generate test requirements BEFORE implementation.
 */
export const PLAN_PRD_BY_SD_TYPE = {
  // Feature/API SDs need test requirements created during planning
  feature: ['DATABASE', 'STORIES', 'RISK', 'TESTING', 'API'],
  api: ['DATABASE', 'STORIES', 'RISK', 'TESTING', 'API'],

  // Database SDs focus on schema validation
  database: ['DATABASE', 'STORIES', 'RISK'],

  // Security SDs need security review during planning
  security: ['DATABASE', 'STORIES', 'RISK', 'SECURITY'],

  // Documentation/infrastructure don't need testing during planning
  documentation: ['STORIES', 'DOCMON'],
  infrastructure: ['DATABASE', 'STORIES', 'RISK'],

  // Refactor uses standard planning
  refactor: ['DATABASE', 'STORIES', 'RISK']
};

/**
 * SD type-aware PLAN_VERIFY mapping (SD-TECH-DEBT-DOCS-001 resilience improvement)
 * LEO Protocol v4.3.4: SECURITY + PERFORMANCE now MANDATORY for code-impacting SDs
 * Rationale: SD-HARDENING-V1 revealed that optional SECURITY/PERFORMANCE sub-agents
 * allowed RLS gaps and N+1 queries to slip through. Making them mandatory prevents this.
 */
export const PLAN_VERIFY_BY_SD_TYPE = {
  // Full validation for code-impacting SDs - SECURITY + PERFORMANCE are MANDATORY
  // LEO Protocol v4.4.1: Added UAT for user-facing SDs (feature, api) to ensure human verification
  // ROOT CAUSE: UAT sub-agent had 0% invocation rate because it was keyword-only, not phase-mandatory
  feature: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY', 'UAT'],
  // LEO Protocol v4.4.1: Enhancement - improvements to existing features (UAT optional, not mandatory)
  // Use this type for minor improvements that don't warrant full UAT validation
  enhancement: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
  database: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE'],  // Added PERFORMANCE for N+1 detection
  security: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE'],  // Added PERFORMANCE
  api: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'API', 'UAT'],  // Added UAT for API verification

  // Reduced validation for non-code SDs (skip TESTING, GITHUB)
  documentation: ['DOCMON', 'STORIES'],
  infrastructure: ['DOCMON', 'STORIES', 'GITHUB', 'SECURITY'],  // Infrastructure keeps SECURITY for RLS validation

  // LEO Protocol v4.3.3: Refactor SD type with intensity-aware validation
  // Default refactor uses standard validation; intensity overrides below
  // LEO Protocol v4.4.1: Added REGRESSION for backward compatibility validation
  refactor: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'REGRESSION']
};

/**
 * LEO Protocol v4.3.3: Intensity-specific PLAN_VERIFY overrides for refactor SDs
 * LEO Protocol v4.4.1: Added REGRESSION for structural/architectural (backward compatibility)
 */
export const REFACTOR_INTENSITY_SUBAGENTS = {
  cosmetic: ['GITHUB', 'DOCMON', 'STORIES'],  // No TESTING/SECURITY/PERFORMANCE/REGRESSION - cosmetic is low risk
  structural: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'REGRESSION'],
  architectural: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'REGRESSION']
};

/**
 * MANDATORY sub-agents that ALWAYS run regardless of keyword matching
 * LEO Protocol v4.3.4: Ensures critical validations can't be skipped
 * LEO Protocol v4.4.1: PLAN_PRD now SD-type aware to require TESTING for feature/api SDs
 */
export const MANDATORY_SUBAGENTS_BY_PHASE = {
  LEAD_PRE_APPROVAL: ['VALIDATION', 'RISK'],  // Always check for duplicates and risks
  PLAN_PRD: {
    // LEO v4.4.1: SD-type specific mandatory agents for PLAN_PRD
    // ROOT CAUSE FIX: Feature/API SDs must have TESTING during planning to create test requirements
    feature: ['DATABASE', 'STORIES', 'TESTING'],
    api: ['DATABASE', 'STORIES', 'TESTING', 'API'],
    database: ['DATABASE', 'STORIES'],
    security: ['DATABASE', 'STORIES', 'SECURITY'],
    documentation: ['STORIES'],
    infrastructure: ['DATABASE', 'STORIES'],
    refactor: ['DATABASE', 'STORIES'],
    // Default fallback for unknown types
    default: ['DATABASE', 'STORIES']
  },
  PLAN_VERIFY: {
    // SD-type specific mandatory agents
    // LEO Protocol v4.4.1: Added UAT to feature/api mandatory lists
    // ROOT CAUSE: UAT had 0% invocation - now mandatory for user-facing SDs
    feature: ['TESTING', 'SECURITY', 'PERFORMANCE', 'UAT'],
    // LEO Protocol v4.4.1: Enhancement - same as feature but UAT NOT mandatory (optional via keyword)
    enhancement: ['TESTING', 'SECURITY', 'PERFORMANCE'],
    // ROOT CAUSE FIX (2026-01-01): Removed TESTING from database mandatory list
    // Database SDs focus on schema/migrations, not user-facing code. TESTING exemption
    // is configured in sd_type_validation_profiles table. Step 3D was overriding this
    // exemption by hardcoding TESTING as mandatory here. Now database SDs correctly
    // use DATABASE agent for schema validation instead of TESTING agent.
    // ROOT CAUSE FIX (2026-02-05): Removed PERFORMANCE from database mandatory list
    // SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B: PERFORMANCE is not applicable for
    // database SDs without runtime code to benchmark. Performance testing applies
    // to application code with queries, not schema migrations or config changes.
    database: ['DATABASE', 'SECURITY'],
    security: ['TESTING', 'SECURITY'],
    api: ['TESTING', 'SECURITY', 'PERFORMANCE', 'API', 'UAT'],
    documentation: ['DOCMON'],
    infrastructure: ['GITHUB', 'SECURITY'],
    // LEO Protocol v4.3.3: Refactor mandatory agents (intensity-aware)
    // LEO Protocol v4.4.1: Added REGRESSION - backward compatibility is core to refactoring
    refactor: ['GITHUB', 'DOCMON', 'REGRESSION']  // Base requirement; TESTING mandatory only for structural/architectural
  },
  LEAD_FINAL: ['RETRO']  // Always generate retrospective
};

/**
 * LEO Protocol v4.3.3: Intensity-specific MANDATORY sub-agents for refactor
 * LEO Protocol v4.4.1: Added REGRESSION for structural/architectural (backward compatibility)
 */
export const REFACTOR_INTENSITY_MANDATORY = {
  cosmetic: ['GITHUB', 'DOCMON'],  // Minimal - just git and docs (no REGRESSION for cosmetic)
  structural: ['GITHUB', 'DOCMON', 'SECURITY', 'PERFORMANCE', 'REGRESSION'],  // + backward compatibility
  architectural: ['TESTING', 'GITHUB', 'DOCMON', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'REGRESSION']  // Full validation
};

/**
 * Always required sub-agents per phase (legacy, used by isSubAgentRequired)
 */
export const ALWAYS_REQUIRED_BY_PHASE = {
  LEAD_PRE_APPROVAL: ['RISK', 'VALIDATION', 'SECURITY', 'DATABASE', 'DESIGN'],
  PLAN_PRD: ['DATABASE', 'STORIES', 'RISK'],
  PLAN_VERIFY: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE'], // Default for non-documentation SDs
  LEAD_FINAL: ['RETRO']
};

/**
 * Schema-related keywords for auto-detecting DATABASE sub-agent need
 */
export const SCHEMA_KEYWORDS = [
  'schema', 'migration', 'table', 'column', 'constraint', 'index',
  'foreign key', 'rls', 'row level security', 'trigger', 'function',
  'alter table', 'create table', 'drop table', 'database'
];

/**
 * Infrastructure keywords for COST agent triggering
 */
export const INFRASTRUCTURE_KEYWORDS = [
  'database migration',
  'scaling',
  'infrastructure',
  'cloud',
  'serverless',
  'deployment',
  'instances',
  'storage',
  'bandwidth',
  'compute',
  'load balancer',
  'CDN',
  'cache',
  'Redis',
  'Elasticsearch',
  'S3',
  'CloudFront',
  'Lambda',
  'EC2',
  'RDS',
  'DynamoDB'
];

/**
 * Conditional requirements for legacy fallback matching
 */
export const CONDITIONAL_REQUIREMENTS = {
  DATABASE: ['database', 'migration', 'schema', 'table'],
  DESIGN: ['ui', 'component', 'design', 'interface', 'page', 'view'],
  SECURITY: ['auth', 'security', 'permission', 'rls', 'encryption'],
  PERFORMANCE: ['performance', 'optimization', 'load', 'scale'],
  VALIDATION: ['integration', 'existing', 'refactor']
};

/**
 * Get the phase sub-agent codes for a given phase and SD type
 *
 * @param {string} phase - Phase name
 * @param {Object} sd - Strategic Directive object
 * @returns {string[]} - Array of sub-agent codes
 */
export function getPhaseSubAgentCodes(phase, sd) {
  const sdType = sd.sd_type || 'feature';

  if (phase === 'PLAN_VERIFY') {
    // Check for intensity-aware refactor
    if (sdType === 'refactor' && sd.intensity_level) {
      return REFACTOR_INTENSITY_SUBAGENTS[sd.intensity_level] || PLAN_VERIFY_BY_SD_TYPE.refactor;
    }
    return PLAN_VERIFY_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];
  }

  if (phase === 'PLAN_PRD') {
    return PLAN_PRD_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];
  }

  return PHASE_SUBAGENT_MAP[phase] || [];
}

/**
 * Get mandatory sub-agents for a given phase and SD type
 *
 * @param {string} phase - Phase name
 * @param {Object} sd - Strategic Directive object
 * @returns {string[]} - Array of mandatory sub-agent codes
 */
export function getMandatorySubAgents(phase, sd) {
  const sdType = sd.sd_type || 'feature';
  const mandatoryForPhase = MANDATORY_SUBAGENTS_BY_PHASE[phase];

  // Check for intensity-aware refactor
  if (sdType === 'refactor' && sd.intensity_level && REFACTOR_INTENSITY_MANDATORY[sd.intensity_level]) {
    return REFACTOR_INTENSITY_MANDATORY[sd.intensity_level];
  }

  // Handle object-based mandatory mappings (PLAN_PRD, PLAN_VERIFY)
  if (typeof mandatoryForPhase === 'object' && !Array.isArray(mandatoryForPhase)) {
    return mandatoryForPhase[sdType] || mandatoryForPhase.feature || mandatoryForPhase.default || [];
  }

  return mandatoryForPhase || [];
}
