/**
 * Fixture Generator Module
 * Handles test fixture and test data generation
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Generate test fixtures
 * @param {object} supabase - Supabase client
 * @param {object} prd - PRD data
 * @param {object} config - Configuration options
 * @returns {Promise<Array>} Generated fixtures
 */
export async function generateTestFixtures(supabase, prd, config) {
  const fixtures = [];

  const userFixture = {
    prd_id: prd.id,
    fixture_name: 'test-users',
    fixture_type: 'user',
    fixture_data: {
      validUser: {
        email: 'test@example.com',
        password: 'Test123!',
        name: 'Test User'
      },
      adminUser: {
        email: 'admin@example.com',
        password: 'Admin123!',
        name: 'Admin User',
        role: 'admin'
      }
    },
    description: 'Test user accounts for authentication testing'
  };

  const dataFixtures = generateDataFixtures(prd);

  fixtures.push(userFixture, ...dataFixtures);

  if (fixtures.length > 0) {
    const { error } = await supabase
      .from('prd_test_fixtures')
      .upsert(fixtures, { onConflict: 'prd_id,fixture_name' });

    if (error) {
      console.error('Error storing fixtures:', error);
    }
  }

  const fixturesDir = path.join(process.cwd(), config.outputDir, 'fixtures');
  await fs.mkdir(fixturesDir, { recursive: true });

  const fixturesContent = `// Test Fixtures for ${prd.title}
export const fixtures = ${JSON.stringify(fixtures.reduce((acc, f) => {
    acc[f.fixture_name] = f.fixture_data;
    return acc;
  }, {}), null, 2)};`;

  await fs.writeFile(path.join(fixturesDir, 'test-data.js'), fixturesContent);

  return fixtures;
}

/**
 * Generate data fixtures for requirements
 * @param {object} prd - PRD data
 * @returns {Array} Data fixtures
 */
export function generateDataFixtures(prd) {
  const fixtures = [];

  for (const req of prd.functional_requirements || []) {
    fixtures.push({
      prd_id: prd.id,
      fixture_name: `${req.id}-test-data`,
      fixture_type: 'data',
      fixture_data: {
        valid: generateValidData(),
        invalid: generateInvalidData(),
        edge: generateEdgeData()
      },
      description: `Test data for ${req.name}`
    });
  }

  return fixtures;
}

/**
 * Generate valid test data
 * @returns {object} Valid test data
 */
export function generateValidData() {
  return {
    input: 'Valid input',
    expected: 'Success'
  };
}

/**
 * Generate invalid test data
 * @returns {object} Invalid test data
 */
export function generateInvalidData() {
  return {
    input: '',
    expected: 'Validation error'
  };
}

/**
 * Generate edge case test data
 * @returns {object} Edge case test data
 */
export function generateEdgeData() {
  return {
    veryLong: 'x'.repeat(10000),
    specialChars: '!@#$%^&*()',
    unicode: '你好世界'
  };
}
