import boundaries from 'eslint-plugin-boundaries';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

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
  }
];
