#!/usr/bin/env node

/**
 * Generate User Stories for SD-VISION-TRANSITION-001D6
 * Stages 21-25: LAUNCH & LEARN
 *
 * This file is a thin wrapper that re-exports from the modularized version.
 * See scripts/modules/user-stories-d6/ for the implementation.
 *
 * Following STORIES v2.0.0 guidelines:
 * - INVEST criteria enforcement
 * - Given-When-Then acceptance criteria
 * - Rich implementation context
 * - E2E test planning
 *
 * @module generate-user-stories-d6
 */

export {
  stage21Stories,
  stage22Stories,
  stage23Stories,
  SD_ID,
  PRD_ID,
  getAllStories,
  insertUserStories,
  printSummary
} from './modules/user-stories-d6/index.js';

import { insertUserStories, printSummary } from './modules/user-stories-d6/index.js';

// Execute
insertUserStories()
  .then(results => {
    printSummary(results);
    if (results.failed.length > 0) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
