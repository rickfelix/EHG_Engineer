/**
 * @ehg/lint-config - EHG ESLint Configuration
 * Extracted from EHG app eslint.config.js
 *
 * Usage in consuming project's eslint.config.js:
 *   import ehgLintConfig from '@ehg/lint-config';
 *   export default [...ehgLintConfig, { files: [...], rules: { ... } }];
 *
 * This exports the base configuration. Projects should add their own
 * file-specific overrides (legacy exceptions, test relaxations).
 */

const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const jsxA11y = require('eslint-plugin-jsx-a11y');

module.exports = tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'build',
      'coverage/**/*',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // TypeScript strictness
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',

      // Anti-patterns
      'no-case-declarations': 'warn',
      'no-empty': 'warn',
      'no-cond-assign': 'warn',
      'no-useless-catch': 'warn',

      // Component size limit
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],

      // Complexity
      complexity: ['warn', { max: 20 }],
      'max-params': ['warn', { max: 5 }],

      // Console
      'no-console': [
        process.env.NODE_ENV === 'production' ? 'error' : 'warn',
        { allow: ['info', 'warn', 'error', 'time', 'timeEnd'] },
      ],

      // Accessibility
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/no-redundant-roles': 'warn',

      // XSS prevention
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'XSS risk: dangerouslySetInnerHTML must use DOMPurify.sanitize().',
        },
      ],
    },
  },
  // Relaxed rules for test files
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/tests/**/*.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': 'off',
      'no-console': 'off',
      'no-restricted-globals': 'off',
      'max-lines': 'off',
      complexity: 'off',
      'max-params': 'off',
    },
  },
  // Generated files
  {
    files: ['**/types.ts', '**/*.generated.ts', '**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines': 'off',
    },
  }
);
