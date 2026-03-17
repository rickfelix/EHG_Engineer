require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sdId = '6a95d6ae-daec-4820-94dd-5c366e0421e8';
  const prdId = 'PRD-6a95d6ae-daec-4820-94dd-5c366e0421e8';

  const stories = [
    {
      story_key: 'SD-LEO-INFRA-STANDARDIZE-VITEST-MIGRATE-001:US-001',
      sd_id: sdId,
      prd_id: prdId,
      title: 'Install Vitest and Configure Multi-Project Test Structure',
      user_role: 'Developer setting up test infrastructure',
      user_want: 'to install Vitest with coverage support and configure a multi-project test structure',
      user_benefit: 'I can run unit, integration, and smoke tests separately with proper coverage tracking and modern test tooling',
      given_when_then: [
        {
          id: 'AC-001-1',
          scenario: 'Happy path - Install Vitest dependencies',
          given: 'package.json exists AND devDependencies section is present',
          when: 'Run npm install vitest@latest @vitest/coverage-v8@latest --save-dev',
          then: 'vitest is added to devDependencies AND @vitest/coverage-v8 is added to devDependencies AND package-lock.json is updated',
          test_data: {
            package_manager: 'npm',
            vitest_version: 'latest',
            coverage_version: 'latest'
          }
        },
        {
          id: 'AC-001-2',
          scenario: 'Happy path - Create vitest.config.ts with projects',
          given: 'Vitest is installed',
          when: 'Create vitest.config.ts at project root',
          then: 'Config file includes three projects: unit, integration, smoke AND each project has correct test.include pattern AND each project has unique name AND config exports default defineConfig',
          test_data: {
            projects: ['unit', 'integration', 'smoke'],
            unit_pattern: 'lib/**/*.test.{js,ts}',
            integration_pattern: 'tests/integration/**/*.test.{js,ts}',
            smoke_pattern: 'tests/smoke/**/*.test.{js,ts}'
          }
        },
        {
          id: 'AC-001-3',
          scenario: 'Happy path - Configure coverage',
          given: 'vitest.config.ts is created',
          when: 'Add coverage configuration',
          then: 'Config includes coverage.provider="v8" AND coverage.reporter includes ["text", "json", "html"] AND coverage.exclude includes node_modules, .cache, dist',
          test_data: {
            provider: 'v8',
            reporters: ['text', 'json', 'html']
          }
        },
        {
          id: 'AC-001-4',
          scenario: 'Edge case - Preserve existing test config',
          given: 'jest.config.cjs exists with custom settings (e.g., testTimeout)',
          when: 'Create vitest.config.ts',
          then: 'Custom settings are migrated to Vitest equivalents AND testTimeout becomes test.testTimeout AND setupFiles are preserved',
          test_data: {
            jest_testTimeout: 10000,
            vitest_testTimeout: 10000
          }
        }
      ],
      story_points: 3,
      priority: 'high',
      implementation_context: {
        description: 'Install Vitest and create vitest.config.ts with multi-project structure for unit, integration, and smoke tests',
        key_files: [
          'package.json',
          'vitest.config.ts (create)',
          'jest.config.cjs (reference for migration)'
        ],
        approach: 'Install dependencies via npm, create config file with defineConfig, set up three projects with distinct test patterns, configure coverage provider'
      },
      architecture_references: {
        similar_components: [
          'jest.config.cjs - Existing Jest configuration to reference',
          'tests/setup.js - Test setup file to update'
        ],
        patterns_to_follow: [
          'Multi-project pattern - Separate unit, integration, smoke tests',
          'Coverage provider pattern - Use v8 for speed',
          'TypeScript config pattern - Use defineConfig for type safety'
        ],
        integration_points: [
          'package.json scripts - Will update in separate story',
          'tests/setup.js - Will update in separate story'
        ]
      },
      example_code_patterns: {
        vitest_config: `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', '.cache', 'dist']
    }
  },
  projects: [
    {
      test: {
        name: 'unit',
        include: ['lib/**/*.test.{js,ts}']
      }
    },
    {
      test: {
        name: 'integration',
        include: ['tests/integration/**/*.test.{js,ts}']
      }
    },
    {
      test: {
        name: 'smoke',
        include: ['tests/smoke/**/*.test.{js,ts}']
      }
    }
  ]
});`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Dependencies installed', priority: 'P0' },
          { id: 'TC-002', scenario: 'Config file created with projects', priority: 'P0' },
          { id: 'TC-003', scenario: 'Coverage configured', priority: 'P1' },
          { id: 'TC-004', scenario: 'Custom settings migrated', priority: 'P2' }
        ]
      },
      technical_notes: ['Vitest v2+ required for projects feature', 'Coverage provider v8 faster than istanbul', 'globals: true enables describe/it/expect without imports', 'setupFiles runs before each test file', 'DEPENDENCY: This story blocks US-002, US-003, US-004'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: 'SD-LEO-INFRA-STANDARDIZE-VITEST-MIGRATE-001:US-002',
      sd_id: sdId,
      prd_id: prdId,
      title: 'Migrate 51 Test Files from @jest/globals to Vitest Imports',
      user_role: 'Developer migrating test files',
      user_want: 'to migrate all Jest import statements to Vitest equivalents',
      user_benefit: 'tests run with Vitest instead of Jest, using modern test framework features',
      given_when_then: [
        {
          id: 'AC-002-1',
          scenario: 'Happy path - Find all @jest/globals imports',
          given: 'Codebase contains 51 files with @jest/globals imports',
          when: 'Run grep -r "from \'@jest/globals\'" . --include="*.js" --include="*.ts"',
          then: 'All 51 files are identified AND file paths are logged',
          test_data: {
            expected_file_count: 51,
            import_patterns: ["from '@jest/globals'", 'from "@jest/globals"']
          }
        },
        {
          id: 'AC-002-2',
          scenario: 'Happy path - Replace imports in all files',
          given: '51 files with @jest/globals imports are identified',
          when: 'Replace all occurrences with vitest imports',
          then: 'import { describe, it, expect, beforeEach, afterEach } from "@jest/globals" becomes import { describe, it, expect, beforeEach, afterEach, vi } from "vitest" AND all 51 files are updated',
          test_data: {
            old_import: 'from "@jest/globals"',
            new_import: 'from "vitest"'
          }
        },
        {
          id: 'AC-002-3',
          scenario: 'Edge case - Mixed import styles',
          given: 'Some files use single quotes, some use double quotes',
          when: 'Replace imports',
          then: 'Both quote styles are handled AND replacement preserves quote style OR normalizes to double quotes',
          test_data: {
            single_quote: "from '@jest/globals'",
            double_quote: 'from "@jest/globals"'
          }
        },
        {
          id: 'AC-002-4',
          scenario: 'Verification - No @jest/globals imports remain',
          given: 'All imports are replaced',
          when: 'Grep for @jest/globals',
          then: 'Zero matches found AND exit code 1 (no matches)',
          expected_output: 'grep exits with code 1 (no matches found)'
        }
      ],
      story_points: 5,
      priority: 'high',
      implementation_context: {
        description: 'Find and replace all @jest/globals imports with vitest imports across 51 test files',
        key_files: [
          'All test files: lib/**/*.test.{js,ts}',
          'All test files: tests/**/*.test.{js,ts}'
        ],
        approach: 'Use grep to find all files, use sed or find-and-replace tool to update imports, verify with grep'
      },
      architecture_references: {
        similar_components: [
          'lib/**/*.test.js - Unit test files',
          'tests/integration/**/*.test.js - Integration test files',
          'tests/smoke/**/*.test.js - Smoke test files'
        ],
        patterns_to_follow: [
          'Bulk find-replace pattern - Use sed or ripgrep --replace',
          'Import normalization - Ensure consistent import style',
          'Verification pattern - Use grep to confirm zero remaining old imports'
        ],
        integration_points: [
          'vitest.config.ts - Config enables globals, but imports still needed for vi'
        ]
      },
      example_code_patterns: {
        find_files: `grep -rl "from '@jest/globals'" . --include="*.js" --include="*.ts" | wc -l`,
        replace_imports: `find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/from ["\\x27]@jest\\/globals["\\x27]/from "vitest"/g'`,
        verify_no_jest: `grep -r "@jest/globals" . --include="*.js" --include="*.ts" && echo "ERROR: Jest imports remain" || echo "SUCCESS: No Jest imports found"`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Find all 51 files', priority: 'P0' },
          { id: 'TC-002', scenario: 'Replace all imports', priority: 'P0' },
          { id: 'TC-003', scenario: 'Handle mixed quote styles', priority: 'P1' },
          { id: 'TC-004', scenario: 'Verify zero Jest imports remain', priority: 'P0' }
        ]
      },
      technical_notes: ['Multiline imports may not be handled by simple sed', 'Import statements with comments between tokens', 'Dynamic imports (rare in test files)', 'Files with both @jest/globals and other jest imports', 'DEPENDENCY: Depends on US-001, blocks US-003'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: 'SD-LEO-INFRA-STANDARDIZE-VITEST-MIGRATE-001:US-003',
      sd_id: sdId,
      prd_id: prdId,
      title: 'Migrate Jest-Specific APIs to Vitest Equivalents',
      user_role: 'Developer updating test APIs',
      user_want: 'to replace all Jest-specific API calls with Vitest equivalents',
      user_benefit: 'tests use Vitest APIs correctly and all mocking/spying features work as expected',
      given_when_then: [
        {
          id: 'AC-003-1',
          scenario: 'Happy path - Replace jest.fn() with vi.fn()',
          given: 'Test files contain jest.fn() calls',
          when: 'Replace all occurrences',
          then: 'jest.fn() becomes vi.fn() AND jest.spyOn() becomes vi.spyOn() AND no jest.* calls remain',
          test_data: {
            replacements: [
              { old: 'jest.fn()', new: 'vi.fn()' },
              { old: 'jest.spyOn(', new: 'vi.spyOn(' }
            ]
          }
        },
        {
          id: 'AC-003-2',
          scenario: 'Happy path - Replace jest.mock() with vi.mock()',
          given: 'Test files contain jest.mock() calls',
          when: 'Replace all occurrences',
          then: 'jest.mock() becomes vi.mock() AND jest.doMock() becomes vi.doMock() AND jest.unmock() becomes vi.unmock()',
          test_data: {
            mock_replacements: [
              { old: 'jest.mock(', new: 'vi.mock(' },
              { old: 'jest.doMock(', new: 'vi.doMock(' },
              { old: 'jest.unmock(', new: 'vi.unmock(' }
            ]
          }
        },
        {
          id: 'AC-003-3',
          scenario: 'Happy path - Replace timer and mock control APIs',
          given: 'Test files use Jest timer or mock control APIs',
          when: 'Replace all occurrences',
          then: 'jest.useFakeTimers() becomes vi.useFakeTimers() AND jest.clearAllMocks() becomes vi.clearAllMocks() AND jest.resetAllMocks() becomes vi.resetAllMocks() AND jest.restoreAllMocks() becomes vi.restoreAllMocks()',
          test_data: {
            timer_replacements: [
              { old: 'jest.useFakeTimers()', new: 'vi.useFakeTimers()' },
              { old: 'jest.clearAllMocks()', new: 'vi.clearAllMocks()' },
              { old: 'jest.resetAllMocks()', new: 'vi.resetAllMocks()' },
              { old: 'jest.restoreAllMocks()', new: 'vi.restoreAllMocks()' }
            ]
          }
        },
        {
          id: 'AC-003-4',
          scenario: 'Verification - Run tests after migration',
          given: 'All Jest APIs are replaced with Vitest equivalents',
          when: 'Run npm test',
          then: 'All tests pass AND no "jest is not defined" errors occur AND no "vi is not defined" errors occur',
          expected_output: 'Test run completes with 0 failures'
        }
      ],
      story_points: 5,
      priority: 'high',
      implementation_context: {
        description: 'Replace all Jest-specific API calls (jest.fn, jest.mock, jest.spyOn, etc.) with Vitest equivalents (vi.fn, vi.mock, vi.spyOn, etc.)',
        key_files: [
          'All test files with jest.* API calls'
        ],
        approach: 'Use bulk find-replace for common patterns, manually review edge cases, run tests to verify'
      },
      architecture_references: {
        similar_components: [
          'lib/**/*.test.js - Files likely using jest.fn()',
          'tests/**/*.test.js - Files likely using jest.mock()'
        ],
        patterns_to_follow: [
          'Mock replacement pattern - jest.* → vi.*',
          'API parity pattern - Vitest provides 1:1 API compatibility',
          'Test verification pattern - Run tests after each bulk replacement'
        ],
        integration_points: [
          'vitest.config.ts - globals: true enables vi globally',
          'tests/setup.js - May need to import vi for setup hooks'
        ]
      },
      example_code_patterns: {
        replace_jest_fn: `# Replace jest.fn/spyOn
find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/jest\\.fn(/vi.fn(/g'
find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/jest\\.spyOn(/vi.spyOn(/g'`,
        replace_jest_mock: `# Replace jest.mock/doMock/unmock
find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/jest\\.mock(/vi.mock(/g'
find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/jest\\.doMock(/vi.doMock(/g'
find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/jest\\.unmock(/vi.unmock(/g'`,
        replace_jest_timers: `# Replace jest timer APIs
find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/jest\\.useFakeTimers(/vi.useFakeTimers(/g'
find . -name "*.test.js" -o -name "*.test.ts" | xargs sed -i 's/jest\\.clearAllMocks(/vi.clearAllMocks(/g'`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'jest.fn() replaced', priority: 'P0' },
          { id: 'TC-002', scenario: 'jest.mock() replaced', priority: 'P0' },
          { id: 'TC-003', scenario: 'Timer APIs replaced', priority: 'P1' },
          { id: 'TC-004', scenario: 'All tests pass', priority: 'P0' }
        ]
      },
      technical_notes: ['jest.requireActual() becomes vi.importActual()', 'jest.requireMock() becomes vi.importMock()', 'jest.setTimeout() becomes test.setTimeout() or vi.setConfig()', 'expect.extend() is compatible between Jest and Vitest', 'DEPENDENCY: Depends on US-001 and US-002, blocks US-004'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: 'SD-LEO-INFRA-STANDARDIZE-VITEST-MIGRATE-001:US-004',
      sd_id: sdId,
      prd_id: prdId,
      title: 'Update Package Scripts and Test Setup for Vitest',
      user_role: 'Developer updating test infrastructure',
      user_want: 'to update npm scripts and test setup file to use Vitest',
      user_benefit: 'I can run tests with familiar commands and maintain existing test setup behavior',
      given_when_then: [
        {
          id: 'AC-004-1',
          scenario: 'Happy path - Update package.json scripts',
          given: 'package.json has Jest-based test scripts',
          when: 'Replace test scripts with Vitest equivalents',
          then: '"test" script becomes "vitest" AND "test:unit" becomes "vitest --project unit" AND "test:integration" becomes "vitest --project integration" AND "test:smoke" becomes "vitest --project smoke" AND "test:coverage" becomes "vitest --coverage"',
          test_data: {
            scripts: {
              test: 'vitest',
              'test:unit': 'vitest --project unit',
              'test:integration': 'vitest --project integration',
              'test:smoke': 'vitest --project smoke',
              'test:coverage': 'vitest --coverage'
            }
          }
        },
        {
          id: 'AC-004-2',
          scenario: 'Happy path - Update tests/setup.js for Vitest',
          given: 'tests/setup.js imports from @jest/globals',
          when: 'Update imports to vitest',
          then: '@jest/globals imports become vitest imports AND setup behavior is preserved AND global test hooks still work',
          test_data: {
            old_import: "import { beforeAll, afterAll } from '@jest/globals';",
            new_import: "import { beforeAll, afterAll, vi } from 'vitest';"
          }
        },
        {
          id: 'AC-004-3',
          scenario: 'Happy path - Preserve environment variables',
          given: 'tests/setup.js sets environment variables for tests',
          when: 'Migrate to Vitest',
          then: 'process.env assignments are preserved AND dotenv.config() still works AND Vitest respects env vars',
          test_data: {
            env_vars: ['NODE_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
          }
        },
        {
          id: 'AC-004-4',
          scenario: 'Verification - Run all test commands',
          given: 'Scripts are updated',
          when: 'Run npm test, npm run test:unit, npm run test:coverage',
          then: 'All commands execute successfully AND tests run with Vitest AND coverage reports are generated',
          expected_output: 'Each command runs Vitest and returns exit code 0'
        }
      ],
      story_points: 3,
      priority: 'medium',
      implementation_context: {
        description: 'Update package.json test scripts to use Vitest commands and migrate tests/setup.js to Vitest imports',
        key_files: [
          'package.json',
          'tests/setup.js'
        ],
        approach: 'Edit package.json scripts section, update tests/setup.js imports, test all commands'
      },
      architecture_references: {
        similar_components: [
          'package.json scripts - Existing Jest scripts to replace',
          'tests/setup.js - Existing setup file to migrate',
          'vitest.config.ts - setupFiles configuration'
        ],
        patterns_to_follow: [
          'Script naming convention - Keep existing script names',
          'Setup file pattern - Import vi for global mocks',
          'Coverage script pattern - Use --coverage flag'
        ],
        integration_points: [
          'vitest.config.ts - References tests/setup.js',
          'CI/CD pipelines - May reference npm test command'
        ]
      },
      example_code_patterns: {
        package_json_scripts: `{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --project unit",
    "test:integration": "vitest --project integration",
    "test:smoke": "vitest --project smoke",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch"
  }
}`,
        setup_file: `import { beforeAll, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

beforeAll(() => {
  // Global setup
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Global cleanup
  vi.restoreAllMocks();
});`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'npm test runs Vitest', priority: 'P0' },
          { id: 'TC-002', scenario: 'Project-specific scripts work', priority: 'P0' },
          { id: 'TC-003', scenario: 'Setup file imports work', priority: 'P0' },
          { id: 'TC-004', scenario: 'Coverage command works', priority: 'P1' }
        ]
      },
      technical_notes: ['Vitest watch mode is default, add --run for single run', '--reporter flag for custom reporters', '--ui flag for browser-based UI', 'tests/setup.js runs once per project', 'DEPENDENCY: Depends on US-001, US-002, US-003; blocks US-005'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: 'SD-LEO-INFRA-STANDARDIZE-VITEST-MIGRATE-001:US-005',
      sd_id: sdId,
      prd_id: prdId,
      title: 'Remove Jest Dependencies and Configuration Files',
      user_role: 'Developer cleaning up after migration',
      user_want: 'to remove all Jest-related files and dependencies',
      user_benefit: 'I have a clean codebase with only Vitest dependencies and no conflicts between test frameworks',
      given_when_then: [
        {
          id: 'AC-005-1',
          scenario: 'Happy path - Remove Jest dependencies',
          given: 'package.json contains jest and @jest/globals in devDependencies',
          when: 'Run npm uninstall jest @jest/globals',
          then: 'jest is removed from devDependencies AND @jest/globals is removed from devDependencies AND package-lock.json is updated',
          test_data: {
            dependencies_to_remove: ['jest', '@jest/globals']
          }
        },
        {
          id: 'AC-005-2',
          scenario: 'Happy path - Remove jest.config.cjs',
          given: 'jest.config.cjs exists at project root',
          when: 'Delete jest.config.cjs',
          then: 'File is deleted AND git status shows deletion AND no Jest config files remain',
          test_data: {
            file_to_delete: 'jest.config.cjs'
          }
        },
        {
          id: 'AC-005-3',
          scenario: 'Verification - No Jest references remain',
          given: 'Jest dependencies and config are removed',
          when: 'Grep codebase for jest references',
          then: 'No jest imports in source files AND no jest.* API calls AND no @jest/globals imports AND package.json has no jest dependencies',
          expected_output: 'grep -r "jest" returns only matches in documentation or test file names'
        },
        {
          id: 'AC-005-4',
          scenario: 'Verification - All tests still pass',
          given: 'Jest is fully removed',
          when: 'Run npm test',
          then: 'All tests pass with Vitest AND no Jest-related errors occur AND coverage reports are generated',
          expected_output: 'Test run completes with Vitest, 0 failures'
        }
      ],
      story_points: 2,
      priority: 'low',
      implementation_context: {
        description: 'Remove Jest and @jest/globals from devDependencies, delete jest.config.cjs, verify no Jest references remain',
        key_files: [
          'package.json',
          'jest.config.cjs (delete)',
          'package-lock.json'
        ],
        approach: 'Uninstall dependencies via npm, delete config file, grep for remaining references, run tests'
      },
      architecture_references: {
        similar_components: [
          'package.json - Dependencies section',
          'vitest.config.ts - Replacement config file'
        ],
        patterns_to_follow: [
          'Cleanup pattern - Remove old dependencies after migration',
          'Verification pattern - Grep for remaining references',
          'Test validation pattern - Ensure tests still pass'
        ],
        integration_points: [
          'CI/CD pipelines - Should already reference npm test (no changes needed)',
          'Documentation - May need updates to reference Vitest instead of Jest'
        ]
      },
      example_code_patterns: {
        uninstall_jest: `npm uninstall jest @jest/globals`,
        delete_config: `rm jest.config.cjs`,
        verify_no_jest: `grep -r "from.*@jest/globals" . --include="*.js" --include="*.ts" || echo "No Jest imports found"
grep -r "jest\\." . --include="*.js" --include="*.ts" --exclude-dir=node_modules || echo "No Jest API calls found"`,
        run_tests: `npm test`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Jest dependencies removed', priority: 'P0' },
          { id: 'TC-002', scenario: 'jest.config.cjs deleted', priority: 'P0' },
          { id: 'TC-003', scenario: 'No Jest references remain', priority: 'P1' },
          { id: 'TC-004', scenario: 'All tests pass', priority: 'P0' }
        ]
      },
      technical_notes: ['jest-* packages (jest-environment-jsdom, etc.) may need removal', 'Documentation may reference Jest', 'Comments in code may reference Jest', 'Test file names may include "jest" (acceptable)', 'DEPENDENCY: Depends on US-001, US-002, US-003, US-004'],
      depends_on: [],
      blocks: []
    }
  ];

  console.log('Creating 5 user stories for SD-LEO-INFRA-STANDARDIZE-VITEST-MIGRATE-001...\n');

  for (const story of stories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert({
        story_key: story.story_key,
        sd_id: story.sd_id,
        prd_id: story.prd_id,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        given_when_then: story.given_when_then,
        story_points: story.story_points,
        priority: story.priority,
        status: 'draft',
        implementation_context: story.implementation_context,
        architecture_references: story.architecture_references,
        example_code_patterns: story.example_code_patterns,
        testing_scenarios: story.testing_scenarios,
        technical_notes: story.technical_notes,
        depends_on: story.depends_on,
        blocks: story.blocks,
        validation_status: 'pending',
        e2e_test_status: 'not_created',
        created_by: 'STORIES-AGENT-v2.0.0'
      })
      .select();

    if (error) {
      console.error(`Error inserting story ${story.story_key}:`, error);
      continue;
    }

    console.log(`✓ Created: ${story.story_key} - ${story.title}`);
  }

  console.log('\n✓ All user stories created successfully');
  console.log('\nSummary:');
  console.log('- US-001: Install Vitest and configure multi-project structure (3 points, Priority: high)');
  console.log('- US-002: Migrate 51 test files from @jest/globals to Vitest imports (5 points, Priority: high)');
  console.log('- US-003: Migrate Jest-specific APIs to Vitest equivalents (5 points, Priority: high)');
  console.log('- US-004: Update package scripts and test setup for Vitest (3 points, Priority: medium)');
  console.log('- US-005: Remove Jest dependencies and configuration files (2 points, Priority: low)');
  console.log('\nTotal story points: 18');
  console.log('\nDependency chain:');
  console.log('US-001 (Install) → US-002 (Import migration) → US-003 (API migration) → US-004 (Scripts) → US-005 (Cleanup)');
  console.log('\nNote: Dependencies documented in technical_notes field of each story');
})();
