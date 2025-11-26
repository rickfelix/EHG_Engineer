/**
 * Rule: require-locator-specificity
 *
 * Ensures compound selectors (with comma) have .first() or similar specificity
 * methods to make the selection deterministic.
 *
 * BAD:  page.locator('button:has-text("New"), button:has-text("Create")')
 * GOOD: page.locator('button:has-text("New"), button:has-text("Create")').first()
 * GOOD: page.locator('[data-testid="create-btn"]')  // No compound needed
 *
 * @see tests/e2e/SELECTOR-GUIDELINES.md
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require specificity method on compound selectors',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/anthropics/ehg_engineer/blob/main/tests/e2e/SELECTOR-GUIDELINES.md'
    },
    messages: {
      requireSpecificity:
        'Compound selector may match multiple elements. ' +
        'Add .first(), .last(), or .nth(n) to make selection deterministic, ' +
        'or use a more specific selector like data-testid. ' +
        'See tests/e2e/SELECTOR-GUIDELINES.md'
    },
    fixable: 'code',
    schema: []
  },

  create(context) {
    /**
     * Check if a selector is a compound selector (contains comma)
     * Ignore commas inside attribute selectors [attr="a,b"]
     */
    function isCompoundSelector(selector) {
      if (typeof selector !== 'string') return false;

      // Simple heuristic: check for comma outside of brackets
      let depth = 0;
      for (let i = 0; i < selector.length; i++) {
        const char = selector[i];
        if (char === '[' || char === '(') {
          depth++;
        } else if (char === ']' || char === ')') {
          depth--;
        } else if (char === ',' && depth === 0) {
          return true;
        }
      }

      return false;
    }

    /**
     * Check if the locator chain has a specificity method
     */
    function hasSpecificityMethod(callExpression) {
      let current = callExpression;

      // Walk up the AST to check for chained method calls
      while (current.parent) {
        const parent = current.parent;

        // Check for method chaining: locator(...).first()
        if (parent.type === 'MemberExpression' && parent.object === current) {
          const methodName = parent.property && parent.property.name;

          // These methods provide specificity
          if (['first', 'last', 'nth'].includes(methodName)) {
            return true;
          }

          // Continue walking for chained calls like .filter(...).first()
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
     * Get the end position of the complete locator call chain
     */
    function getChainEndPosition(callExpression) {
      let current = callExpression;
      let lastEnd = callExpression.range[1];

      while (current.parent) {
        const parent = current.parent;

        if (parent.type === 'MemberExpression' && parent.object === current) {
          if (parent.parent && parent.parent.type === 'CallExpression') {
            current = parent.parent;
            lastEnd = current.range[1];
            continue;
          }
        }

        break;
      }

      return lastEnd;
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

        // Only flag compound selectors
        if (!isCompoundSelector(selector)) {
          return;
        }

        // Allow if already has specificity method
        if (hasSpecificityMethod(node)) {
          return;
        }

        context.report({
          node: firstArg,
          messageId: 'requireSpecificity',
          fix(fixer) {
            // Find the end of the locator call chain
            const endPos = getChainEndPosition(node);
            return fixer.insertTextAfterRange([0, endPos], '.first()');
          }
        });
      }
    };
  }
};
