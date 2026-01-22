/**
 * PRD Playwright Generator - Fixture Generation
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

export async function generateTestFixtures(supabase, prd, outputDir) {
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

  const fixturesDir = path.join(process.cwd(), outputDir, 'fixtures');
  await fs.mkdir(fixturesDir, { recursive: true });

  const fixturesContent = `// Test Fixtures for ${prd.title}
export const fixtures = ${JSON.stringify(fixtures.reduce((acc, f) => {
    acc[f.fixture_name] = f.fixture_data;
    return acc;
  }, {}), null, 2)};`;

  await fs.writeFile(path.join(fixturesDir, 'test-data.js'), fixturesContent);

  return fixtures;
}

function generateDataFixtures(prd) {
  const fixtures = [];

  for (const req of (prd.functional_requirements || [])) {
    fixtures.push({
      prd_id: prd.id,
      fixture_name: `${req.id}-test-data`,
      fixture_type: 'data',
      fixture_data: {
        valid: { input: 'Valid input', expected: 'Success' },
        invalid: { input: '', expected: 'Validation error' },
        edge: {
          veryLong: 'x'.repeat(10000),
          specialChars: '!@#$%^&*()',
          unicode: '\u4F60\u597D\u4E16\u754C \u{1F30D}'
        }
      },
      description: `Test data for ${req.name}`
    });
  }

  return fixtures;
}
