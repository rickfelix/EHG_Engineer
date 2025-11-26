/**
 * Rule: no-ambiguous-locators
 *
 * Detects overly broad CSS selectors that may match multiple elements,
 * causing strict mode violations or flaky tests.
 *
 * BAD:  page.locator('button')
 * BAD:  page.locator('h1')
 * BAD:  page.locator('input, textarea, select')
 * GOOD: page.locator('[data-testid="submit-btn"]')
 * GOOD: page.locator('button:has-text("Submit")').first()  // explicit .first()
 *
 * @see tests/e2e/SELECTOR-GUIDELINES.md
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn about overly broad Playwright locators',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/anthropics/ehg_engineer/blob/main/tests/e2e/SELECTOR-GUIDELINES.md'
    },
    messages: {
      ambiguousLocator:
        'Generic locator "{{selector}}" may match multiple elements. ' +
        'Add specificity with data-testid, text content, or use .first()/.nth(). ' +
        'See tests/e2e/SELECTOR-GUIDELINES.md'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedGenericTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags that are allowed to be used without specificity'
          }
        },
        additionalProperties: false
      }
    ]
  },

  create(context) {
    const options = context.options[0] || {};
    const allowedTags = options.allowedGenericTags || [];

    // Generic tag patterns that are too broad
    const GENERIC_TAG_PATTERN = /^(button|input|select|textarea|a|div|span|p|h[1-6]|table|tr|td|th|ul|li|nav|form|label)$/i;

    // Compound generic patterns (multiple generic tags)
    const COMPOUND_GENERIC_PATTERN = /^(button|input|select|textarea|a|div|span|h[1-6]),\s*(button|input|select|textarea|a|div|span|h[1-6])/i;

    /**
     * Check if a selector is too generic
     */
    function isGenericSelector(selector) {
      if (typeof selector !== 'string') return false;

      const trimmed = selector.trim();

      // Check for single generic tag
      if (GENERIC_TAG_PATTERN.test(trimmed)) {
        return !allowedTags.some(tag => trimmed.toLowerCase() === tag.toLowerCase());
      }

      // Check for compound generic selectors
      if (COMPOUND_GENERIC_PATTERN.test(trimmed)) {
        return true;
      }

      return false;
    }

    /**
     * Check if the locator call is followed by .first(), .last(), or .nth()
     */
    function hasSpecificityMethod(callExpression) {
      let current = callExpression;

      // Walk up the AST to check for chained method calls
      while (current.parent) {
        const parent = current.parent;

        // Check for method chaining: locator(...).first()
        if (parent.type === 'MemberExpression' && parent.object === current) {
          const methodName = parent.property && parent.property.name;
          if (['first', 'last', 'nth'].includes(methodName)) {
            return true;
          }

          // Check if this member expression is called
          if (parent.parent && parent.parent.type === 'CallExpression') {
            current = parent.parent;
            continue;
          }
        }

        break;
      }

      return false;
    }

    /**
     * Check if the locator has additional filtering (hasText, has, etc.)
     */
    function hasAdditionalFiltering(callExpression) {
      // Check if locator has options object with hasText, has, etc.
      const args = callExpression.arguments;
      if (args.length >= 2 && args[1] && args[1].type === 'ObjectExpression') {
        const hasFiltering = args[1].properties.some(prop => {
          const key = prop.key && (prop.key.name || prop.key.value);
          return ['hasText', 'has', 'hasNot', 'hasNotText'].includes(key);
        });
        if (hasFiltering) return true;
      }

      // Check for chained .filter() calls
      let current = callExpression;
      while (current.parent) {
        if (current.parent.type === 'MemberExpression' &&
            current.parent.parent &&
            current.parent.parent.type === 'CallExpression') {
          const methodName = current.parent.property && current.parent.property.name;
          if (methodName === 'filter') {
            return true;
          }
          current = current.parent.parent;
        } else {
          break;
        }
      }

      return false;
    }

    return {
      'CallExpression[callee.property.name="locator"]'(node) {
        const args = node.arguments;
        if (!args.length) return;

        const firstArg = args[0];

        // Only check string literal selectors
        if (firstArg.type !== 'Literal' || typeof firstArg.value !== 'string') {
          return;
        }

        const selector = firstArg.value;

        if (!isGenericSelector(selector)) {
          return;
        }

        // Allow if followed by .first(), .last(), .nth()
        if (hasSpecificityMethod(node)) {
          return;
        }

        // Allow if has additional filtering
        if (hasAdditionalFiltering(node)) {
          return;
        }

        context.report({
          node: firstArg,
          messageId: 'ambiguousLocator',
          data: {
            selector: selector.length > 30 ? selector.substring(0, 30) + '...' : selector
          }
        });
      }
    };
  }
};
