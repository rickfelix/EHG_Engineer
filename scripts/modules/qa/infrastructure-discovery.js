#!/usr/bin/env node
/**
 * Infrastructure Discovery Module
 * Enhanced QA Engineering Director v2.0
 *
 * Discovers existing test infrastructure and recommends reuse.
 * Impact: Saves 30-60 minutes by preventing helper recreation.
 */

import { readdir, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EHG_ENGINEER_ROOT = resolve(__dirname, '../../..');
const EHG_ROOT = resolve(__dirname, '../../../../ehg');

/**
 * Discover test infrastructure and generate recommendations
 * @param {string} targetApp - 'ehg' or 'EHG_Engineer'
 * @returns {Promise<Object>} Infrastructure discovery results
 */
export async function discoverAndRecommend(targetApp = 'ehg') {
  const appPath = targetApp === 'ehg'
    ? EHG_ROOT
    : EHG_ENGINEER_ROOT;

  console.log(`🔍 Infrastructure Discovery: Scanning ${targetApp} test infrastructure...`);

  const infrastructure = {
    auth_helpers: await findAuthHelpers(appPath),
    test_helpers: await findTestHelpers(appPath),
    fixtures: await findFixtures(appPath),
    configs: await findConfigs(appPath),
    e2e_patterns: await analyzeE2EPatterns(appPath)
  };

  const recommendations = generateRecommendations(infrastructure);

  const summary = {
    auth_available: infrastructure.auth_helpers.length > 0,
    helpers_count: infrastructure.test_helpers.length,
    fixtures_count: infrastructure.fixtures.length,
    e2e_examples: infrastructure.e2e_patterns.length,
    configs_found: infrastructure.configs.length
  };

  return {
    verdict: 'DISCOVERED',
    infrastructure,
    recommendations,
    summary,
    app: targetApp
  };
}

/**
 * Find authentication helpers
 */
async function findAuthHelpers(appPath) {
  const helpers = [];
  const fixturesPath = join(appPath, 'tests/fixtures');

  try {
    const files = await readdir(fixturesPath);
    const authFiles = files.filter(f => f.toLowerCase().includes('auth'));

    for (const file of authFiles) {
      helpers.push({
        name: file,
        path: join('tests/fixtures', file),
        fullPath: join(fixturesPath, file)
      });
    }
  } catch (_error) {
    // fixtures directory doesn't exist
  }

  return helpers;
}

/**
 * Find test helpers
 */
async function findTestHelpers(appPath) {
  const helpers = [];
  const helpersPath = join(appPath, 'tests/helpers');

  try {
    const files = await readdir(helpersPath);

    for (const file of files) {
      helpers.push({
        name: file,
        path: join('tests/helpers', file),
        fullPath: join(helpersPath, file)
      });
    }
  } catch (_error) {
    // helpers directory doesn't exist
  }

  return helpers;
}

/**
 * Find test fixtures
 */
async function findFixtures(appPath) {
  const fixtures = [];
  const fixturesPath = join(appPath, 'tests/fixtures');

  try {
    const files = await readdir(fixturesPath);

    for (const file of files) {
      if (!file.toLowerCase().includes('auth')) {
        fixtures.push({
          name: file,
          path: join('tests/fixtures', file),
          fullPath: join(fixturesPath, file)
        });
      }
    }
  } catch (_error) {
    // fixtures directory doesn't exist
  }

  return fixtures;
}

/**
 * Find test configurations
 */
async function findConfigs(appPath) {
  const configs = [];
  const configNames = [
    'playwright.config.ts',
    'playwright.config.test.ts',
    'jest.config.js',
    'vitest.config.ts',
    'vitest.config.integration.ts'
  ];

  for (const configName of configNames) {
    const configPath = join(appPath, configName);
    try {
      await stat(configPath);
      configs.push({
        name: configName,
        path: configPath
      });
    } catch (_error) {
      // config doesn't exist
    }
  }

  return configs;
}

/**
 * Analyze E2E test patterns
 */
async function analyzeE2EPatterns(appPath) {
  const patterns = [];
  const e2ePath = join(appPath, 'tests/e2e');

  try {
    const files = await readdir(e2ePath);
    const specFiles = files.filter(f => f.endsWith('.spec.ts') || f.endsWith('.spec.js'));

    for (const file of specFiles.slice(0, 5)) {
      patterns.push({
        name: file,
        path: join('tests/e2e', file),
        fullPath: join(e2ePath, file)
      });
    }
  } catch (_error) {
    // e2e directory doesn't exist
  }

  return patterns;
}

/**
 * Generate recommendations based on discovered infrastructure
 */
function generateRecommendations(infra) {
  const recommendations = [];

  // Auth helpers
  if (infra.auth_helpers.length > 0) {
    recommendations.push({
      type: 'REUSE',
      priority: 'CRITICAL',
      category: 'Authentication',
      message: `✅ Use existing authenticateUser() from ${infra.auth_helpers[0].path}`,
      anti_pattern: '❌ DO NOT write custom auth logic',
      example: 'import { authenticateUser } from \'../fixtures/auth\';'
    });
  } else {
    recommendations.push({
      type: 'CREATE',
      priority: 'HIGH',
      category: 'Authentication',
      message: '⚠️  No auth helpers found - create tests/fixtures/auth.ts',
      example: 'export async function authenticateUser(page) { ... }'
    });
  }

  // E2E patterns
  if (infra.e2e_patterns.length > 0) {
    recommendations.push({
      type: 'PATTERN',
      priority: 'HIGH',
      category: 'E2E Testing',
      message: `📋 Follow pattern from ${infra.e2e_patterns[0].path}`,
      example: 'Use test.beforeEach() for auth, await page.waitForLoadState() for stability'
    });
  }

  // Test helpers
  if (infra.test_helpers.length > 0) {
    recommendations.push({
      type: 'REUSE',
      priority: 'MEDIUM',
      category: 'Test Helpers',
      message: `✅ ${infra.test_helpers.length} helper(s) available in tests/helpers/`,
      list: infra.test_helpers.map(h => h.name)
    });
  }

  // Fixtures
  if (infra.fixtures.length > 0) {
    recommendations.push({
      type: 'REUSE',
      priority: 'MEDIUM',
      category: 'Fixtures',
      message: `✅ ${infra.fixtures.length} fixture(s) available`,
      list: infra.fixtures.map(f => f.name)
    });
  }

  return recommendations;
}
