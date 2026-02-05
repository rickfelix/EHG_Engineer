/**
 * Phase Configuration for Sub-Agent Orchestrator
 * Contains phase-to-sub-agent mappings and mandatory agent definitions
 *
 * SD-LEO-INFRA-SUBAGENT-ORCHESTRATION-001: These are FALLBACK configurations.
 * The primary source of truth is now sd_type_validation_profiles.required_sub_agents
 * in the database. See sd-queries.js:getRequiredSubAgentsFromProfile()
 *
 * Fallback is used when:
 * - SD type has no validation profile in database
 * - required_sub_agents column is empty for the SD type
 * - Database query fails (graceful degradation)
 */

// Phase to sub-agent mapping (FALLBACK - database takes precedence)
const PHASE_SUBAGENT_MAP = {
  LEAD_PRE_APPROVAL: ['VALIDATION', 'DATABASE', 'SECURITY', 'DESIGN', 'RISK'],
  PLAN_PRD: ['DATABASE', 'STORIES', 'RISK', 'TESTING'],
  EXEC_IMPL: [],
  PLAN_VERIFY: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
  LEAD_FINAL: ['RETRO']
};

// LEO Protocol v4.4.1: SD type-aware PLAN_PRD mapping
const PLAN_PRD_BY_SD_TYPE = {
  feature: ['DATABASE', 'STORIES', 'RISK', 'TESTING', 'API'],
  api: ['DATABASE', 'STORIES', 'RISK', 'TESTING', 'API'],
  database: ['DATABASE', 'STORIES', 'RISK'],
  security: ['DATABASE', 'STORIES', 'RISK', 'SECURITY'],
  documentation: ['STORIES', 'DOCMON'],
  infrastructure: ['DATABASE', 'STORIES', 'RISK'],
  refactor: ['DATABASE', 'STORIES', 'RISK']
};

// SD type-aware PLAN_VERIFY mapping
const PLAN_VERIFY_BY_SD_TYPE = {
  feature: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY', 'UAT'],
  enhancement: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
  database: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY'],  // PERFORMANCE removed - not applicable for schema/migration work
  security: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE'],
  api: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'API', 'UAT'],
  documentation: ['DOCMON', 'STORIES'],
  infrastructure: ['DOCMON', 'STORIES', 'GITHUB', 'SECURITY'],
  refactor: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'REGRESSION']
};

// LEO Protocol v4.3.3: Intensity-specific PLAN_VERIFY overrides for refactor SDs
const REFACTOR_INTENSITY_SUBAGENTS = {
  cosmetic: ['GITHUB', 'DOCMON', 'STORIES'],
  structural: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'REGRESSION'],
  architectural: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'REGRESSION']
};

// MANDATORY sub-agents that ALWAYS run regardless of keyword matching
const MANDATORY_SUBAGENTS_BY_PHASE = {
  LEAD_PRE_APPROVAL: ['VALIDATION', 'RISK'],
  PLAN_PRD: {
    feature: ['DATABASE', 'STORIES', 'TESTING'],
    api: ['DATABASE', 'STORIES', 'TESTING', 'API'],
    database: ['DATABASE', 'STORIES'],
    security: ['DATABASE', 'STORIES', 'SECURITY'],
    documentation: ['STORIES'],
    infrastructure: ['DATABASE', 'STORIES'],
    refactor: ['DATABASE', 'STORIES'],
    default: ['DATABASE', 'STORIES']
  },
  PLAN_VERIFY: {
    feature: ['TESTING', 'SECURITY', 'PERFORMANCE', 'UAT'],
    enhancement: ['TESTING', 'SECURITY', 'PERFORMANCE'],
    database: ['DATABASE', 'SECURITY'],  // PERFORMANCE removed - not applicable for schema/migration work
    security: ['TESTING', 'SECURITY'],
    api: ['TESTING', 'SECURITY', 'PERFORMANCE', 'API', 'UAT'],
    documentation: ['DOCMON'],
    infrastructure: ['GITHUB', 'SECURITY'],
    refactor: ['GITHUB', 'DOCMON', 'REGRESSION']
  },
  LEAD_FINAL: ['RETRO']
};

// LEO Protocol v4.3.3: Intensity-specific MANDATORY sub-agents for refactor
const REFACTOR_INTENSITY_MANDATORY = {
  cosmetic: ['GITHUB', 'DOCMON'],
  structural: ['GITHUB', 'DOCMON', 'SECURITY', 'PERFORMANCE', 'REGRESSION'],
  architectural: ['TESTING', 'GITHUB', 'DOCMON', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'REGRESSION']
};

// Valid phases for CLI validation
const VALID_PHASES = ['LEAD_PRE_APPROVAL', 'PLAN_PRD', 'EXEC_IMPL', 'PLAN_VERIFY', 'LEAD_FINAL'];

// Schema keywords for DATABASE auto-invocation
const SCHEMA_KEYWORDS = [
  'schema', 'migration', 'table', 'column', 'constraint', 'index',
  'foreign key', 'rls', 'row level security', 'trigger', 'function',
  'alter table', 'create table', 'drop table', 'database'
];

export {
  PHASE_SUBAGENT_MAP,
  PLAN_PRD_BY_SD_TYPE,
  PLAN_VERIFY_BY_SD_TYPE,
  REFACTOR_INTENSITY_SUBAGENTS,
  MANDATORY_SUBAGENTS_BY_PHASE,
  REFACTOR_INTENSITY_MANDATORY,
  VALID_PHASES,
  SCHEMA_KEYWORDS
};
