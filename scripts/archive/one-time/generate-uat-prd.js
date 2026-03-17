#!/usr/bin/env node

/**
 * Generate Comprehensive PRD for SD-UAT-001
 * Creates a detailed PRD with 50+ user stories for deep and broad UAT testing
 *
 * This file is a thin wrapper that re-exports from the modularized version.
 * See scripts/modules/uat-prd/ for the implementation.
 *
 * @module generate-uat-prd
 */

import dotenv from 'dotenv';
dotenv.config();

export {
  authStories,
  dashboardStories,
  ventureStories,
  formStories,
  performanceStories,
  accessibilityStories,
  errorStories,
  generateUserStories,
  generatePRD
} from './modules/uat-prd/index.js';

import { generatePRD } from './modules/uat-prd/index.js';

// Run if executed directly
generatePRD()
  .then(() => {
    console.log('\nNext steps:');
    console.log('1. Create database schema: node scripts/create-uat-database-schema.js');
    console.log('2. Generate test suites: node scripts/generate-test-suites.js');
    console.log('3. Run UAT campaign: node scripts/run-uat-campaign.js');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
