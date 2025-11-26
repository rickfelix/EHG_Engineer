/**
 * Rule: no-case-insensitive-regex
 *
 * Detects case-insensitive regex patterns in Playwright locator filter methods.
 * These patterns are fragile and often cause strict mode violations when
 * multiple elements match.
 *
 * BAD:  page.locator('h1').filter({ hasText: /create|new venture/i })
 * BAD:  page.locator('*', { hasText: /directive/i })
 * GOOD: page.locator('[data-testid="page-heading"]')
 * GOOD: page.getByRole('heading', { name: 'Create Venture' })
 *
 * @see tests/e2e/SELECTOR-GUIDELINES.md
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow case-insensitive regex in Playwright selectors',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/anthropics/ehg_engineer/blob/main/tests/e2e/SELECTOR-GUIDELINES.md'
    },
    messages: {
      noCaseInsensitiveRegex:
        'Avoid case-insensitive regex ({{regex}}) in selectors. ' +
        'Use exact text matching or data-testid attributes for reliable tests. ' +
        'See tests/e2e/SELECTOR-GUIDELINES.md'
    },
    schema: []
  },

  create(context) {
    /**
     * Check if a node is a regex literal with case-insensitive flag
     */
    function isCaseInsensitiveRegex(node) {
      return node && node.type === 'Literal' && node.regex && node.regex.flags.includes('i');
    }

    /**
     * Report a case-insensitive regex violation
     */
    function reportRegex(node) {
      context.report({
        node,
        messageId: 'noCaseInsensitiveRegex',
        data: {
          regex: `/${node.regex.pattern}/${node.regex.flags}`
        }
      });
    }

    /**
     * Check if we're inside a Playwright locator chain
     * Note: Currently unused but kept for potential future enhancements
     */
    function _isPlaywrightLocatorContext(node) {
      let current = node;
      while (current) {
        if (current.type === 'CallExpression' && current.callee) {
          const callee = current.callee;
          // Check for page.locator, locator.filter, etc.
          if (callee.type === 'MemberExpression') {
            const methodName = callee.property && callee.property.name;
            if (['locator', 'filter', 'getByRole', 'getByText', 'getByLabel'].includes(methodName)) {
              return true;
            }
          }
        }
        current = current.parent;
      }
      return false;
    }

    return {
      // Match: filter({ hasText: /pattern/i })
      'CallExpression[callee.property.name="filter"] Property[key.name="hasText"] Literal'(node) {
        if (isCaseInsensitiveRegex(node)) {
          reportRegex(node);
        }
      },

      // Match: locator('...', { hasText: /pattern/i })
      'CallExpression[callee.property.name="locator"] Property[key.name="hasText"] Literal'(node) {
        if (isCaseInsensitiveRegex(node)) {
          reportRegex(node);
        }
      },

      // Match: getByRole('...', { name: /pattern/i })
      'CallExpression[callee.property.name="getByRole"] Property[key.name="name"] Literal'(node) {
        if (isCaseInsensitiveRegex(node)) {
          reportRegex(node);
        }
      },

      // Match: getByText(/pattern/i)
      'CallExpression[callee.property.name="getByText"] Literal:first-child'(node) {
        if (isCaseInsensitiveRegex(node)) {
          reportRegex(node);
        }
      },

      // Match: getByLabel(/pattern/i)
      'CallExpression[callee.property.name="getByLabel"] Literal:first-child'(node) {
        if (isCaseInsensitiveRegex(node)) {
          reportRegex(node);
        }
      }
    };
  }
};
