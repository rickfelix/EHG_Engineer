import boundaries from 'eslint-plugin-boundaries';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import playwright from 'eslint-plugin-playwright';
import playwrightSelectors from './tools/eslint-rules/playwright-selectors/index.js';

export default [
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      boundaries
    },
    settings: {
      'boundaries/elements': [
        {
          type: 'leo-engineering',
          pattern: 'scripts/leo*.js',
          capture: ['leo']
        },
        {
          type: 'leo-engineering',
          pattern: 'lib/leo/**/*.js',
          capture: ['leo']
        },
        {
          type: 'leo-engineering',
          pattern: 'lib/validation/**/*.js',
          capture: ['validation']
        },
        {
          type: 'leo-engineering',
          pattern: 'tools/**/*.{js,ts}',
          capture: ['tools']
        },
        {
          type: 'ehg-app',
          pattern: 'src/**/*.{js,jsx,ts,tsx}',
          capture: ['app']
        },
        {
          type: 'ehg-app',
          pattern: 'lib/venture/**/*.js',
          capture: ['venture']
        },
        {
          type: 'ehg-app',
          pattern: 'lib/portfolio/**/*.js',
          capture: ['portfolio']
        },
        {
          type: 'shared',
          pattern: 'lib/utils/**/*.js',
          capture: ['utils']
        },
        {
          type: 'shared',
          pattern: 'lib/db/**/*.js',
          capture: ['db']
        }
      ]
    },
    rules: {
      'boundaries/element-types': [
        2,
        {
          default: 'allow',
          rules: [
            {
              from: 'leo-engineering',
              disallow: ['ehg-app'],
              message: 'LEO Engineering (${file.type}) cannot import from EHG App modules (${dependency.type}). Keep engineering workflow separate from venture management.'
            },
            {
              from: 'ehg-app',
              disallow: ['leo-engineering'],
              message: 'EHG App (${file.type}) cannot import from LEO Engineering modules (${dependency.type}). Keep venture management separate from engineering workflow.'
            },
            {
              from: ['leo-engineering', 'ehg-app'],
              allow: ['shared']
            }
          ]
        }
      ],
      'boundaries/entry-point': [
        1,
        {
          default: 'disallow',
          rules: [
            {
              target: ['leo-engineering', 'ehg-app', 'shared'],
              allow: 'index.js'
            }
          ]
        }
      ],
      'boundaries/no-private': [
        1,
        {
          allowUncles: false
        }
      ],
      'no-console': 'off',  // Allow console in CLI tools and scripts
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }]
    }
  },
  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': typescriptEslint
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules
    }
  },
  // Special rules for gate tools
  {
    files: ['tools/gates/*.ts'],
    rules: {
      'no-process-exit': 'off'
    }
  },
  // E2E Test files - Playwright selector best practices
  // See tests/e2e/SELECTOR-GUIDELINES.md for documentation
  {
    files: ['tests/e2e/**/*.js', 'tests/e2e/**/*.ts', 'tests/e2e/**/*.spec.js', 'tests/e2e/**/*.spec.ts'],
    languageOptions: {
      globals: {
        test: 'readonly',
        expect: 'readonly',
        page: 'readonly',
        browser: 'readonly',
        context: 'readonly',
        describe: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly'
      }
    },
    plugins: {
      playwright,
      'playwright-selectors': playwrightSelectors
    },
    rules: {
      // eslint-plugin-playwright recommended rules
      ...playwright.configs['flat/recommended'].rules,

      // Additional Playwright rules
      'playwright/no-networkidle': 'warn',              // networkidle is flaky
      'playwright/no-wait-for-timeout': 'warn',         // Prefer explicit waits
      'playwright/no-force-option': 'warn',             // Force clicks hide real issues
      'playwright/prefer-web-first-assertions': 'error', // Use auto-retrying assertions
      'playwright/missing-playwright-await': 'error',    // Must await Playwright methods
      'playwright/no-focused-test': 'error',            // No .only in committed code
      'playwright/no-skipped-test': 'warn',             // Warn about .skip
      'playwright/expect-expect': 'warn',               // Tests should have assertions

      // Custom selector rules - see tests/e2e/SELECTOR-GUIDELINES.md
      'playwright-selectors/no-case-insensitive-regex': 'error',  // Catches /pattern/i
      'playwright-selectors/no-ambiguous-locators': 'warn',       // Catches page.locator('button')
      'playwright-selectors/require-locator-specificity': 'warn'  // Catches compound selectors
    }
  }
];
