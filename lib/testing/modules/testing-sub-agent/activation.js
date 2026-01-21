#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Testing Sub-Agent Activation Module
 * Handles activation criteria checking for automated testing
 */

import fsModule from 'fs';
import path from 'path';

const fs = fsModule.promises;

/**
 * Check coverage requirement from package.json
 * @returns {Promise<boolean>}
 */
async function checkCoverageRequirement() {
  try {
    const packageJson = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(packageJson);

    return Boolean(pkg.scripts && pkg.scripts['test:coverage']);
  } catch {
    return false;
  }
}

/**
 * Check E2E testing requirement from package.json
 * @returns {Promise<boolean>}
 */
async function checkE2ERequirement() {
  try {
    const packageJson = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const content = packageJson.toLowerCase();

    return content.includes('e2e') || content.includes('playwright') || content.includes('cypress');
  } catch {
    return false;
  }
}

/**
 * Check for complex test scenarios (>10 test files)
 * @returns {Promise<boolean>}
 */
async function checkComplexScenarios() {
  try {
    const testDir = path.join(process.cwd(), 'tests');
    const files = await fs.readdir(testDir, { recursive: true });
    const testFiles = files.filter(file =>
      file.endsWith('.spec.js') || file.endsWith('.test.js')
    );
    return testFiles.length >= 10;
  } catch {
    return false;
  }
}

/**
 * Check all activation criteria and determine if testing should run
 * @param {object} _activationTriggers - Configuration for activation triggers
 * @returns {Promise<boolean>}
 */
async function checkActivationCriteria(_activationTriggers) {
  console.log('LEO Protocol v4.1 - Checking Testing Sub-Agent activation criteria...');

  const criteria = {
    coverageRequired: await checkCoverageRequirement(),
    e2eTestingMentioned: await checkE2ERequirement(),
    complexScenarios: await checkComplexScenarios(),
    visualTestingNeeded: true // Always true for this implementation
  };

  const shouldActivate = criteria.coverageRequired ||
                        criteria.e2eTestingMentioned ||
                        criteria.complexScenarios ||
                        criteria.visualTestingNeeded;

  if (shouldActivate) {
    console.log('Testing Sub-Agent activation criteria met');
    console.log('Criteria:', JSON.stringify(criteria, null, 2));
    return true;
  }

  console.log('Testing Sub-Agent activation criteria not met');
  return false;
}

export {
  checkCoverageRequirement,
  checkE2ERequirement,
  checkComplexScenarios,
  checkActivationCriteria
};
