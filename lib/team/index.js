/**
 * Team Module - Public API
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
 *
 * Provides database-driven team creation, knowledge enrichment,
 * dynamic agent creation, and findings extraction.
 */

export { enrichTeammatePrompt } from './knowledge-enricher.js';
export { buildTeamFromTemplate, listTemplates } from './team-spawner.js';
export { createDynamicAgent } from './agent-creator.js';
export { extractTeamFindings } from './findings-extractor.js';
