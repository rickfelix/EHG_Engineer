/**
 * ESLint Plugin: playwright-selectors
 *
 * Custom rules for enforcing Playwright selector best practices
 * in E2E tests. These rules complement eslint-plugin-playwright
 * by catching patterns specific to this codebase.
 *
 * @see tests/e2e/SELECTOR-GUIDELINES.md for full documentation
 */

import noCaseInsensitiveRegex from './rules/no-case-insensitive-regex.js';
import noAmbiguousLocators from './rules/no-ambiguous-locators.js';
import requireLocatorSpecificity from './rules/require-locator-specificity.js';

export default {
  meta: {
    name: 'eslint-plugin-playwright-selectors',
    version: '1.0.0'
  },
  rules: {
    'no-case-insensitive-regex': noCaseInsensitiveRegex,
    'no-ambiguous-locators': noAmbiguousLocators,
    'require-locator-specificity': requireLocatorSpecificity
  },
  configs: {
    recommended: {
      plugins: ['playwright-selectors'],
      rules: {
        'playwright-selectors/no-case-insensitive-regex': 'error',
        'playwright-selectors/no-ambiguous-locators': 'warn',
        'playwright-selectors/require-locator-specificity': 'warn'
      }
    }
  }
};
