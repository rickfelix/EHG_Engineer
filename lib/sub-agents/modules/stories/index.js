/**
 * STORIES Sub-Agent - User Story Creation & Context Engineering
 *
 * BMAD Enhancement: Hyper-detailed implementation context for user stories
 *
 * Purpose:
 * - Create user stories from PRD acceptance criteria (if none exist)
 * - Generate comprehensive implementation context for each user story
 * - Provide architecture references, code patterns, and testing scenarios
 * - Reduce EXEC agent confusion by front-loading implementation details
 *
 * @module stories
 */

export { execute } from './execute.js';
export { generateQualityStoryContent } from './quality-generation.js';
export { analyzeCodebasePatterns, detectTargetApplication } from './codebase-analysis.js';
export {
  generateImplementationContext,
  generateArchitectureReferences,
  generateCodePatterns,
  generateTestingScenarios
} from './context-generation.js';
