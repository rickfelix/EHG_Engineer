/**
 * PRD Playwright Generator - Documentation Generation
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

export async function generateTestDocumentation(prd, scenarios, config, outputDir) {
  const docPath = path.join(process.cwd(), outputDir, 'TEST_PLAN.md');

  const documentation = `# Test Plan for ${prd.title}

## PRD ID: ${prd.id}

## Overview
This document outlines the automated Playwright test coverage for the PRD requirements.

## Test Configuration
- Base URL: ${config.baseUrl}
- Browsers: Chromium, Firefox, WebKit
- Viewports: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)

## Test Scenarios

${scenarios.map(scenario => `### ${scenario.scenario_name}
- **ID**: ${scenario.scenario_id}
- **Requirement**: ${scenario.requirement_id}
- **Priority**: ${scenario.priority}
- **Type**: ${scenario.test_type}
- **Test Steps**: ${scenario.test_steps?.length || 0} steps
- **Assertions**: ${scenario.assertions?.length || 0} assertions

`).join('')}

## Coverage Summary
- Total Requirements: ${prd.functional_requirements?.length || 0}
- Total Scenarios: ${scenarios.length}
- Automated Tests: ${scenarios.filter(s => s.auto_generated).length}
- Manual Tests: ${scenarios.filter(s => !s.auto_generated).length}

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

  await fs.writeFile(docPath, documentation);

  return docPath;
}
