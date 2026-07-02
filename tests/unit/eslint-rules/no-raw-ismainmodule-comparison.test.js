/**
 * Unit tests for ESLint rule `no-raw-ismainmodule-comparison`.
 *
 * SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-CLASSFIX-001-B FR-1/FR-4.
 *
 * Covers: the correct pattern (isMainModule(import.meta.url) call sites), the two
 * banned raw-comparison forms (template-literal + string-concatenation) in both
 * operand orders, non-matching import.meta.url usage, and the escape-hatch pragma
 * contract (mirrors no-realtime-teardown-in-subscribe-callback.test.js).
 *
 * @module tests/unit/eslint-rules/no-raw-ismainmodule-comparison.test.js
 */

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../../eslint-rules/no-raw-ismainmodule-comparison.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const RULE_ID = 'rule-to-test/no-raw-ismainmodule-comparison';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: { process: 'readonly' },
  },
});

ruleTester.run('no-raw-ismainmodule-comparison', rule, {
  valid: [
    // TS-1: the correct pattern — the shared helper, not a raw comparison.
    {
      code: `
        import { isMainModule } from './lib/utils/is-main-module.js';
        if (isMainModule(import.meta.url)) {
          main();
        }
      `,
    },
    // An ALIASED variable (arg), not a bare process.argv[1] MemberExpression, compared
    // against a file:// template literal — structurally different from the banned inline
    // pattern (this was lib/utils/is-main-module.js's own partial-fix-era internal shape).
    {
      code: `
        export function isMainModule(importMetaUrl) {
          const arg = process.argv[1];
          if (!arg) return false;
          return importMetaUrl === \`file://\${arg}\`;
        }
      `,
    },
    // lib/utils/is-main-module.js's CURRENT implementation (post SD-LEO-INFRA-ISMAINMODULE-
    // WINDOWS-GUARD-CLASSFIX-001-A): pathToFileURL(arg).href — a CallExpression chain, not a
    // TemplateLiteral/+-concatenation at all, so trivially out of this rule's match shape.
    {
      code: `
        import { pathToFileURL } from 'node:url';
        export function isMainModule(importMetaUrl) {
          const arg = process.argv[1];
          if (!arg) return false;
          return importMetaUrl === pathToFileURL(arg).href;
        }
      `,
    },
    // Unrelated import.meta.url usage (no comparison to a file://+argv[1] construction).
    {
      code: `const dir = path.dirname(fileURLToPath(import.meta.url));`,
    },
    // import.meta.url compared to something else entirely — not the banned shape.
    {
      code: `if (import.meta.url === someOtherUrl) { doThing(); }`,
    },
    // Pragma with a full REASON — valid suppression.
    {
      code: `
        // eslint-disable-next-line ${RULE_ID} -- deliberately testing the broken legacy behavior
        if (import.meta.url === \`file://\${process.argv[1]}\`) { legacy(); }
      `,
    },
  ],

  invalid: [
    // TS-2: template-literal form, import.meta.url on the left.
    {
      code: `if (import.meta.url === \`file://\${process.argv[1]}\`) { main(); }`,
      errors: [{ messageId: 'noRawComparison' }],
    },
    // Template-literal form, import.meta.url on the right (mirrored operand order).
    {
      code: `if (\`file://\${process.argv[1]}\` === import.meta.url) { main(); }`,
      errors: [{ messageId: 'noRawComparison' }],
    },
    // TS-2b: string-concatenation variant.
    {
      code: `if (import.meta.url === 'file://' + process.argv[1]) { main(); }`,
      errors: [{ messageId: 'noRawComparison' }],
    },
    // String-concatenation variant, mirrored operand order.
    {
      code: `if ('file://' + process.argv[1] === import.meta.url) { main(); }`,
      errors: [{ messageId: 'noRawComparison' }],
    },
    // Loose equality (==) variant — still detected.
    {
      code: `if (import.meta.url == \`file://\${process.argv[1]}\`) { main(); }`,
      errors: [{ messageId: 'noRawComparison' }],
    },
    // Pragma present but missing the `--` REASON marker entirely.
    {
      code: `
        // eslint-disable-next-line ${RULE_ID}
        if (import.meta.url === \`file://\${process.argv[1]}\`) { legacy(); }
      `,
      errors: [{ messageId: 'noRawComparison' }],
    },
    // Pragma present with the `--` marker but a whitespace-only (effectively empty) reason.
    // Trailing spaces after `--` (not a bare `--`) mirrors the sibling rule's TS-9 convention —
    // a bare `--` with nothing after it at all trips ESLint's OWN native directive-comment
    // parser (it fails to split the rule-name from the marker), which is a native-parser
    // artifact unrelated to this rule's own pragmaMissingReason logic.
    {
      code: `// eslint-disable-next-line ${RULE_ID} --   \nif (import.meta.url === \`file://\${process.argv[1]}\`) { legacy(); }`,
      errors: [{ messageId: 'pragmaMissingReason' }],
    },
  ],
});
