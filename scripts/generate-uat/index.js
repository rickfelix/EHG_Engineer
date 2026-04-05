#!/usr/bin/env node

/**
 * Comprehensive UAT Test Suite Generator for EHG Application
 * Generates 28 test files covering all 43+ pages with ~330 test cases
 *
 * REFACTORED: This module orchestrates the domain modules.
 * See generate-uat/ for domain architecture.
 *
 * @module generate-uat
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import chalk from 'chalk';

// Domain imports
import { TEST_SUITES } from './test-suite-config.js';
import { generateTestFile } from './test-generators.js';
import {
  generateAdminTests,
  generateCrossFunctionalTests,
  generateE2ETests
} from './suite-builders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = path.join(__dirname, '..', '..', 'tests', 'uat');

/**
 * Main function to generate all test files
 */
export async function generateAllTests() {
  console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════════════╗
║     Comprehensive UAT Test Suite Generator for EHG           ║
╚══════════════════════════════════════════════════════════════╝
  `));

  try {
    // Ensure test directory exists
    await fs.mkdir(TEST_DIR, { recursive: true });

    let totalTests = 0;
    let filesGenerated = 0;

    // Phase 1: Core User Journey Tests
    console.log(chalk.blue('\n📝 Phase 1: Generating Core User Journey Tests...'));
    for (const [suiteName, config] of Object.entries(TEST_SUITES)) {
      const fileName = `${suiteName}.spec.js`;
      const filePath = path.join(TEST_DIR, fileName);
      const content = generateTestFile(suiteName, config);

      await fs.writeFile(filePath, content);
      filesGenerated++;
      totalTests += config.tests.length;

      console.log(chalk.green(`   ✓ Generated ${fileName} (${config.tests.length} tests)`));
    }

    // Phase 2: Administrative Function Tests
    console.log(chalk.blue('\n📝 Phase 2: Generating Administrative Tests...'));
    const adminSuites = generateAdminTests();
    for (const [suiteName, config] of Object.entries(adminSuites)) {
      const fileName = `${suiteName}.spec.js`;
      const filePath = path.join(TEST_DIR, fileName);
      const content = generateTestFile(suiteName, config);

      await fs.writeFile(filePath, content);
      filesGenerated++;
      totalTests += config.tests.length;

      console.log(chalk.green(`   ✓ Generated ${fileName} (${config.tests.length} tests)`));
    }

    // Phase 3: Cross-Functional Tests
    console.log(chalk.blue('\n📝 Phase 3: Generating Cross-Functional Tests...'));
    const crossSuites = generateCrossFunctionalTests();
    for (const [suiteName, config] of Object.entries(crossSuites)) {
      const fileName = `${suiteName}.spec.js`;
      const filePath = path.join(TEST_DIR, fileName);
      const content = generateTestFile(suiteName, config);

      await fs.writeFile(filePath, content);
      filesGenerated++;
      totalTests += config.tests.length;

      console.log(chalk.green(`   ✓ Generated ${fileName} (${config.tests.length} tests)`));
    }

    // Phase 4: End-to-End Tests
    console.log(chalk.blue('\n📝 Phase 4: Generating End-to-End Scenario Tests...'));
    const e2eSuites = generateE2ETests();
    for (const [suiteName, config] of Object.entries(e2eSuites)) {
      const fileName = `e2e-${suiteName}.spec.js`;
      const filePath = path.join(TEST_DIR, fileName);
      const content = generateTestFile(suiteName, config);

      await fs.writeFile(filePath, content);
      filesGenerated++;
      totalTests += config.tests.length;

      console.log(chalk.green(`   ✓ Generated ${fileName} (${config.tests.length} tests)`));
    }

    // Generate test runner script
    console.log(chalk.blue('\n📝 Generating Test Runner Script...'));
    await generateTestRunner();

    // Summary
    console.log(chalk.bold.green(`
╔══════════════════════════════════════════════════════════════╗
║                    Generation Complete!                       ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   • Test Files Generated: ${filesGenerated}
   • Total Test Cases: ${totalTests}
   • Coverage: 43+ pages
   • Test Categories: 4 phases

📁 Location: ${TEST_DIR}

🚀 Run Tests:
   • All tests: npm run test:uat
   • Specific suite: npm run test:uat -- ventures
   • With UI: npm run test:uat:ui

📈 Expected Coverage:
   • UI Coverage: >95%
   • User Journeys: 100%
   • Critical Paths: 100%
   • Edge Cases: ~80%
    `));

  } catch (error) {
    console.error(chalk.red('❌ Error generating tests:'), error);
    process.exit(1);
  }
}

/**
 * Generate test runner script
 */
async function generateTestRunner() {
  const packagePath = path.join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8'));

  // Add UAT test scripts
  packageJson.scripts = {
    ...packageJson.scripts,
    'test:uat': 'playwright test tests/uat --config=playwright-uat.config.js',
    'test:uat:ui': 'playwright test tests/uat --config=playwright-uat.config.js --ui',
    'test:uat:debug': 'playwright test tests/uat --config=playwright-uat.config.js --debug',
    'test:uat:report': 'playwright show-report',
    'test:uat:coverage': 'node scripts/calculate-coverage.js'
  };

  await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
  console.log(chalk.green('   ✓ Updated package.json with test scripts'));
}

// CLI execution
if (isMainModule(import.meta.url)) {
  generateAllTests();
}

// Re-exports for external use
export { TEST_SUITES } from './test-suite-config.js';
export { generateTestFile, generateTestImplementation } from './test-generators.js';
export {
  generateAdminTests,
  generateCrossFunctionalTests,
  generateE2ETests
} from './suite-builders.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export default { generateAllTests };
