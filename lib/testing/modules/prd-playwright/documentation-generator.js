/**
 * Documentation Generator Module
 * Handles test plan and documentation generation
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Generate test documentation
 * @param {object} prd - PRD data
 * @param {Array} scenarios - Test scenarios
 * @param {object} config - Configuration options
 * @returns {Promise<string>} Documentation file path
 */
export async function generateTestDocumentation(prd, scenarios, config) {
  const docPath = path.join(process.cwd(), config.outputDir, 'TEST_PLAN.md');

  const documentation = buildTestPlanContent(prd, scenarios, config);

  await fs.writeFile(docPath, documentation);

  return docPath;
}

/**
 * Build test plan content
 * @param {object} prd - PRD data
 * @param {Array} scenarios - Test scenarios
 * @param {object} config - Configuration options
 * @returns {string} Test plan markdown content
 */
export function buildTestPlanContent(prd, scenarios, config) {
  const scenarioSections = scenarios.map(scenario => `### ${scenario.scenario_name}
- **ID**: ${scenario.scenario_id}
- **Requirement**: ${scenario.requirement_id}
- **Priority**: ${scenario.priority}
- **Type**: ${scenario.test_type}
- **Test Steps**: ${scenario.test_steps?.length || 0} steps
- **Assertions**: ${scenario.assertions?.length || 0} assertions

`).join('');

  const automatedCount = scenarios.filter(s => s.auto_generated).length;
  const manualCount = scenarios.filter(s => !s.auto_generated).length;

  return `# Test Plan for ${prd.title}

## PRD ID: ${prd.id}

## Overview
This document outlines the automated Playwright test coverage for the PRD requirements.

## Test Configuration
- Base URL: ${config.baseUrl}
- Browsers: Chromium, Firefox, WebKit
- Viewports: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)

## Test Scenarios

${scenarioSections}

## Coverage Summary
- Total Requirements: ${prd.functional_requirements?.length || 0}
- Total Scenarios: ${scenarios.length}
- Automated Tests: ${automatedCount}
- Manual Tests: ${manualCount}

## Running the Tests

\`\`\`bash
# Run all tests
npm run test:e2e

# Run specific requirement tests
npm run test:e2e -- ${prd.id.toLowerCase()}

# Run with specific browser
npm run test:e2e -- --project=chromium

# Run in headed mode
npm run test:e2e -- --headed

# Generate HTML report
npm run test:report
\`\`\`

## Test Data
Test fixtures are located in \`tests/e2e/generated/fixtures/test-data.js\`

## Page Objects
Page object models are located in \`tests/e2e/generated/pages/\`

## Visual Testing
Baseline screenshots are stored in \`tests/e2e/generated/screenshots/\`

## Continuous Integration
These tests are automatically executed on:
- Pull requests
- Main branch commits
- Nightly builds

## Maintenance
Tests are auto-generated from PRD specifications. To update:
1. Update PRD requirements in the database
2. Run: \`npm run generate:tests -- --prd=${prd.id}\`
3. Review and commit generated changes

---
*Generated: ${new Date().toISOString()}*
*Generator Version: 1.0.0*
`;
}

/**
 * Update test mappings in database
 * @param {object} supabase - Supabase client
 * @param {string} prdId - PRD identifier
 * @param {Array} generatedFiles - Generated file information
 * @returns {Promise<void>}
 */
export async function updateTestMappings(supabase, prdId, generatedFiles) {
  const mappings = [];

  for (const file of generatedFiles) {
    mappings.push({
      prd_id: prdId,
      requirement_id: file.requirement_id,
      scenario_id: `${file.requirement_id}-TEST-MAIN`,
      verification_type: 'automated',
      verification_status: 'pending',
      test_file_path: file.file_path,
      test_function_name: `test('${file.requirement_id}')`,
      created_at: new Date().toISOString()
    });
  }

  if (mappings.length > 0) {
    const { error } = await supabase
      .from('prd_test_verification_mapping')
      .upsert(mappings, { onConflict: 'prd_id,requirement_id,scenario_id' });

    if (error) {
      console.error('Error updating test mappings:', error);
    }
  }
}
