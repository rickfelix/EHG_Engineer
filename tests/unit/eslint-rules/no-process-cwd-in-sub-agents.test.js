/**
 * Unit tests for ESLint rule `no-process-cwd-in-sub-agents`.
 *
 * SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-4 — covers the behaviour cells:
 *   - Valid: no process.cwd() at all
 *   - Valid: process.cwd() with full pragma + non-empty REASON
 *   - Valid: process.cwd() outside lib/sub-agents/** (rule does not apply)
 *   - Invalid: process.cwd() with no pragma
 *   - Invalid: pragma without `--` REASON marker
 *   - Invalid: pragma with `--` marker but empty REASON body
 *
 * The rule self-gates by filename (only applies under lib/sub-agents/**),
 * so every test fixture uses a synthetic filename that matches that path.
 *
 * RuleTester (ESLint v9) expects `describe`/`it` to be available globally; we
 * bind vitest's exports onto RuleTester's static hooks so each fixture renders
 * as its own vitest test case.
 *
 * Note on pragma syntax in fixtures: ESLint's native pragma parser is sensitive
 * to the exact `// eslint-disable-next-line <ruleName> -- <description>` form.
 * Using just `--\n` (no trailing whitespace or content) confuses ESLint into
 * parsing `<ruleName> --` as one composite rule name. We therefore use the
 * trailing-whitespace form (`--   \n`) to exercise the empty-REASON code path
 * without tripping ESLint's unknown-rule diagnostic.
 *
 * @module tests/unit/eslint-rules/no-process-cwd-in-sub-agents.test.js
 */

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../../eslint-rules/no-process-cwd-in-sub-agents.js';

// Bind RuleTester's static describe/it to vitest's globals so cases register as
// individual vitest tests rather than nested calls inside an enclosing it().
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// Use a synthetic absolute filename inside lib/sub-agents/ so the rule's
// filename gate activates. POSIX separator works on Windows + *nix because the
// rule's regex matches `[\\/]lib[\\/]sub-agents[\\/]`.
const SUB_AGENT_FILENAME = '/project/lib/sub-agents/github.js';
const NON_SUB_AGENT_FILENAME = '/project/lib/utils/helpers.js';
const RULE_ID = 'rule-to-test/no-process-cwd-in-sub-agents';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: { process: 'readonly' },
  },
});

ruleTester.run('no-process-cwd-in-sub-agents', rule, {
  valid: [
    // 1a. No process.cwd() at all
    {
      code: "const path = require('path');\nconst here = path.resolve('.');",
      filename: SUB_AGENT_FILENAME,
    },
    // 1b. process.cwd() with full pragma + REASON (uses RuleTester prefix)
    {
      code:
        `// eslint-disable-next-line ${RULE_ID} -- ENGINEER_ROOT required for migration temp dir\n` +
        'const p = process.cwd();',
      filename: SUB_AGENT_FILENAME,
    },
    // 1c. process.cwd() outside lib/sub-agents/** — rule does not apply
    {
      code: 'const p = process.cwd();',
      filename: NON_SUB_AGENT_FILENAME,
    },
    // 1d. Resolver helper usage — what sub-agents should be doing
    {
      code:
        "import { resolveSubAgentRepo } from './resolve-repo.js';\n" +
        "const repo = await resolveSubAgentRepo({ targetApp: 'ehg' });",
      filename: SUB_AGENT_FILENAME,
    },
    // 1e. Pragma with multi-word REASON containing punctuation
    {
      code:
        `// eslint-disable-next-line ${RULE_ID} -- snapshot for CWD_LEAK detection (gate-facing, must be runtime cwd)\n` +
        'const cwdSnap = process.cwd();',
      filename: SUB_AGENT_FILENAME,
    },
  ],

  invalid: [
    // 2a. process.cwd() with no pragma
    {
      code: 'const p = process.cwd();',
      filename: SUB_AGENT_FILENAME,
      errors: [{ messageId: 'noProcessCwd' }],
    },
    // 2b. Pragma targets the rule but is missing the `--` REASON marker entirely.
    // The rule reports on the comment line so ESLint's disable-next-line
    // suppression (which covers the call line below) cannot hide it.
    {
      code:
        `// eslint-disable-next-line ${RULE_ID}\n` +
        'const p = process.cwd();',
      filename: SUB_AGENT_FILENAME,
      errors: [{ messageId: 'noProcessCwd', line: 1 }],
    },
    // 2c. Pragma has `--` marker followed only by whitespace → empty REASON body.
    // (Trailing whitespace after `--` keeps ESLint's pragma parser happy; the
    // bare `--\n` form would make ESLint treat `<ruleName> --` as a composite
    // rule name and emit an unrelated unknown-rule diagnostic.)
    {
      code:
        `// eslint-disable-next-line ${RULE_ID} --   \n` +
        'const p = process.cwd();',
      filename: SUB_AGENT_FILENAME,
      errors: [{ messageId: 'pragmaMissingReason', line: 1 }],
    },
    // 2d. process.cwd() inside a nested expression (path.join argument)
    {
      code: "const path = require('path');\nconst tmp = path.join(process.cwd(), '.temp');",
      filename: SUB_AGENT_FILENAME,
      errors: [{ messageId: 'noProcessCwd' }],
    },
    // 2e. Multiple process.cwd() calls — each one reports independently
    {
      code: 'const a = process.cwd();\nconst b = process.cwd();',
      filename: SUB_AGENT_FILENAME,
      errors: [{ messageId: 'noProcessCwd' }, { messageId: 'noProcessCwd' }],
    },
  ],
});
