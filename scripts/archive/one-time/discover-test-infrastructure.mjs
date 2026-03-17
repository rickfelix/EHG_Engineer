#!/usr/bin/env node
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EHG_APP_PATH = join(__dirname, '../../ehg');

console.log('\n🔍 TEST INFRASTRUCTURE DISCOVERY');
console.log('======================================================================\n');
console.log(`Scanning: ${EHG_APP_PATH}\n`);

// Discover test fixtures
async function discoverFixtures() {
  const fixturesPath = join(EHG_APP_PATH, 'tests/fixtures');
  try {
    const files = await readdir(fixturesPath);
    console.log('📁 Test Fixtures Found:');
    for (const file of files) {
      const filePath = join(fixturesPath, file);
      const relativePath = relative(EHG_APP_PATH, filePath);
      console.log(`   ✓ ${relativePath}`);
    }
    console.log();
    return files;
  } catch (error) {
    console.log('   ⚠️  No fixtures directory found\n');
    return [];
  }
}

// Discover test helpers
async function discoverHelpers() {
  const helpersPath = join(EHG_APP_PATH, 'tests/helpers');
  try {
    const files = await readdir(helpersPath);
    console.log('🛠️  Test Helpers Found:');
    for (const file of files) {
      const filePath = join(helpersPath, file);
      const relativePath = relative(EHG_APP_PATH, filePath);
      console.log(`   ✓ ${relativePath}`);
    }
    console.log();
    return files;
  } catch (error) {
    console.log('   ⚠️  No helpers directory found\n');
    return [];
  }
}

// Discover E2E tests
async function discoverE2ETests() {
  const e2ePath = join(EHG_APP_PATH, 'tests/e2e');
  try {
    const files = await readdir(e2ePath);
    const specFiles = files.filter(f => f.endsWith('.spec.ts') || f.endsWith('.spec.js'));
    console.log(`🧪 E2E Tests Found (${specFiles.length}):`);
    for (const file of specFiles.slice(0, 10)) {
      console.log(`   ✓ tests/e2e/${file}`);
    }
    if (specFiles.length > 10) {
      console.log(`   ... and ${specFiles.length - 10} more`);
    }
    console.log();
    return specFiles;
  } catch (error) {
    console.log('   ⚠️  No E2E tests directory found\n');
    return [];
  }
}

// Check for authentication helpers
async function checkAuthHelpers(fixtures) {
  console.log('🔐 Authentication Helpers:');
  const authFiles = fixtures.filter(f => f.toLowerCase().includes('auth'));
  if (authFiles.length > 0) {
    for (const file of authFiles) {
      console.log(`   ✓ ${file} - Use for authenticated tests`);
    }
    console.log('   💡 Import: import { authenticateUser } from "../fixtures/auth"');
  } else {
    console.log('   ⚠️  No authentication helpers found');
    console.log('   💡 Create tests/fixtures/auth.ts for reusable auth logic');
  }
  console.log();
}

// Check for test configurations
async function checkTestConfigs() {
  console.log('⚙️  Test Configurations:');
  const configs = [
    'playwright.config.ts',
    'playwright.config.test.ts',
    'jest.config.js',
    'vitest.config.ts'
  ];

  for (const config of configs) {
    const configPath = join(EHG_APP_PATH, config);
    try {
      await stat(configPath);
      console.log(`   ✓ ${config} - Found`);
    } catch {
      // Config doesn't exist
    }
  }
  console.log();
}

// Check for test environment files
async function checkTestEnv() {
  console.log('🔑 Test Environment Files:');
  const envFiles = [
    '.env.test',
    '.env.test.local',
    '.env.development'
  ];

  for (const envFile of envFiles) {
    const envPath = join(EHG_APP_PATH, envFile);
    try {
      await stat(envPath);
      console.log(`   ✓ ${envFile} - Found (contains test credentials)`);
    } catch {
      // Env file doesn't exist
    }
  }
  console.log();
}

// Generate recommendations
function generateRecommendations(fixtures, helpers, e2eTests) {
  console.log('💡 RECOMMENDATIONS FOR NEW TESTS:\n');

  if (fixtures.length > 0) {
    console.log('1. ✅ USE EXISTING FIXTURES');
    console.log('   - Review tests/fixtures/ before creating new test utilities');
    console.log('   - Import existing helpers instead of duplicating logic\n');
  } else {
    console.log('1. ⚠️  CREATE FIXTURE DIRECTORY');
    console.log('   - mkdir -p tests/fixtures');
    console.log('   - Create reusable test utilities (auth, data, mocks)\n');
  }

  const hasAuth = fixtures.some(f => f.toLowerCase().includes('auth'));
  if (hasAuth) {
    console.log('2. ✅ USE AUTHENTICATION HELPER');
    console.log('   - import { authenticateUser } from "../fixtures/auth"');
    console.log('   - Call authenticateUser(page) before navigating to protected routes\n');
  } else {
    console.log('2. ⚠️  CREATE AUTHENTICATION HELPER');
    console.log('   - Create tests/fixtures/auth.ts');
    console.log('   - Export authenticateUser() function for protected routes\n');
  }

  if (e2eTests.length > 0) {
    console.log('3. ✅ FOLLOW EXISTING E2E PATTERNS');
    console.log(`   - Review ${e2eTests[0]} for test structure`);
    console.log('   - Use consistent naming: feature-name.spec.ts\n');
  }

  console.log('4. 🛡️  BUILD RESILIENCE');
  console.log('   - Primary: Playwright with custom config (skip webServer)');
  console.log('   - Fallback: Puppeteer if Playwright build fails');
  console.log('   - Always use existing dev server (avoid build step)\n');

  console.log('5. 📸 CAPTURE EVIDENCE');
  console.log('   - Screenshots: await page.screenshot({ path: "/tmp/feature-name.png" })');
  console.log('   - Test results: Document pass rate, failures, root causes');
  console.log('   - Required for LEAD approval\n');
}

// Main execution
try {
  const fixtures = await discoverFixtures();
  const helpers = await discoverHelpers();
  const e2eTests = await discoverE2ETests();

  await checkAuthHelpers(fixtures);
  await checkTestConfigs();
  await checkTestEnv();

  generateRecommendations(fixtures, helpers, e2eTests);

  console.log('======================================================================');
  console.log('✅ Test infrastructure discovery complete\n');
} catch (error) {
  console.error('❌ Discovery failed:', error.message);
  process.exit(1);
}
