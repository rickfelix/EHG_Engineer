/**
 * Agent Code Mappings - Shared Constants
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
 *
 * Maps agent filenames to LEO sub-agent codes.
 * Used by: prompt compiler, knowledge enricher, team spawner.
 *
 * NOTE: Dynamic agents (created at runtime via agent-creator.js) are NOT
 * listed here — they are resolved from the database at compile time.
 * This map covers only the static agents that have .partial files.
 */

export const AGENT_CODE_MAP = {
  'api-agent': 'API',
  'database-agent': 'DATABASE',
  'dependency-agent': 'DEPENDENCY',
  'design-agent': 'DESIGN',
  'docmon-agent': 'DOCMON',
  'github-agent': 'GITHUB',
  'orchestrator-child-agent': 'ORCHESTRATOR_CHILD',
  'performance-agent': 'PERFORMANCE',
  'rca-agent': 'RCA',
  'regression-agent': 'REGRESSION',
  'retro-agent': 'RETRO',
  'risk-agent': 'RISK',
  'security-agent': 'SECURITY',
  'stories-agent': 'STORIES',
  'testing-agent': 'TESTING',
  'uat-agent': 'UAT',
  'validation-agent': 'VALIDATION',
};

/** Reverse map: agent code → filename (without extension) */
export const CODE_TO_AGENT_NAME = Object.fromEntries(
  Object.entries(AGENT_CODE_MAP).map(([name, code]) => [code, name])
);
