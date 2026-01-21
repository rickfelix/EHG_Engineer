#!/usr/bin/env node
/**
 * STORIES Sub-Agent - User Story Creation & Context Engineering
 *
 * This file is a thin wrapper that re-exports from the modularized version.
 * See lib/sub-agents/modules/stories/ for the implementation.
 *
 * BMAD Enhancement: Hyper-detailed implementation context for user stories
 *
 * Purpose:
 * - Create user stories from PRD acceptance criteria (if none exist)
 * - Generate comprehensive implementation context for each user story
 * - Provide architecture references, code patterns, and testing scenarios
 * - Reduce EXEC agent confusion by front-loading implementation details
 *
 * Activation: PLAN_PRD phase (after PRD creation, before EXEC)
 * Blocking: No (enhancement only, doesn't block)
 *
 * @module stories
 */

export {
  execute,
  generateQualityStoryContent,
  analyzeCodebasePatterns,
  detectTargetApplication,
  generateImplementationContext,
  generateArchitectureReferences,
  generateCodePatterns,
  generateTestingScenarios
} from './modules/stories/index.js';

import { execute } from './modules/stories/index.js';

// CLI EXECUTION
if (import.meta.url === `file://${process.argv[1]}`) {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node stories.js <SD-ID>');
    console.error('Example: node stories.js SD-EXPORT-001');
    process.exit(1);
  }

  execute(sdId, { code: 'STORIES', name: 'User Story Context Engineering Sub-Agent' })
    .then(results => {
      const exitCode = results.verdict === 'PASS' || results.verdict === 'CONDITIONAL_PASS' ? 0 : 1;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
