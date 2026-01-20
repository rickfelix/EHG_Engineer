/**
 * CLAUDE.md Generation Modules - Entry Point
 *
 * Re-exports all modules for convenient importing.
 * Part of SD-LEO-REFACTOR-QUEUE-001 refactoring.
 */

// Data fetching functions
export {
  supabase,
  getActiveProtocol,
  getAgents,
  getSubAgents,
  getHandoffTemplates,
  getValidationRules,
  getSchemaConstraints,
  getProcessScripts,
  getHotPatterns,
  getRecentRetrospectives,
  getGateHealth,
  getPendingProposals,
  getAutonomousDirectives
} from './data-fetchers.js';

// Section generation functions
export {
  generateSchemaConstraintsSection,
  generateProcessScriptsSection,
  generateHotPatternsSection,
  generateRecentLessonsSection,
  generateGateHealthSection,
  generateProposalsSection,
  generateAutonomousDirectivesSection,
  generateAgentSection,
  generateSubAgentSection,
  generateTriggerQuickReference,
  generateHandoffTemplates,
  generateValidationRules
} from './section-generators.js';
