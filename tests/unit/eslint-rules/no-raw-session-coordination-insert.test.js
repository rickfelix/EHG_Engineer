/**
 * Unit tests for ESLint rule `no-raw-session-coordination-insert`.
 *
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-3b).
 *
 * Covers: the anti-pattern (raw .from('session_coordination').insert(...)), the correct pattern
 * (insertCoordinationRow(...) call, or .from() on a different table), and the escape-hatch
 * pragma contract (mirrors no-count-delta-gate-assertion.js / no-realtime-teardown-in-
 * subscribe-callback.js).
 *
 * @module tests/unit/eslint-rules/no-raw-session-coordination-insert.test.js
 */

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../../eslint-rules/no-raw-session-coordination-insert.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const RULE_ID = 'rule-to-test/no-raw-session-coordination-insert';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-raw-session-coordination-insert', rule, {
  valid: [
    // TS-1: routed through the canonical choke point.
    {
      code: `await insertCoordinationRow(supabase, { target_session: 'x', subject: 'y' });`,
    },
    // TS-2: .insert() on a different table entirely.
    {
      code: `await supabase.from('feedback').insert({ category: 'harness_backlog' });`,
    },
    // TS-3: .from('session_coordination') without a chained .insert() (e.g. a .select() read).
    {
      code: `await supabase.from('session_coordination').select('*').eq('target_session', sid);`,
    },
    // TS-4: escape-hatch pragma with a non-empty reason.
    {
      code: `
        // eslint-disable-next-line ${RULE_ID} -- test fixture seed, not a real producer
        await supabase.from('session_coordination').insert(row);
      `,
    },
  ],
  invalid: [
    // TS-5: the raw anti-pattern this rule exists to catch.
    {
      code: `await supabase.from('session_coordination').insert(row);`,
      errors: [{ messageId: 'noRawInsert' }],
    },
    // TS-6: same anti-pattern via a differently-named client variable.
    {
      code: `await sb.from('session_coordination').insert({ target_sd: sdKey, subject: 'x' });`,
      errors: [{ messageId: 'noRawInsert' }],
    },
    // TS-7: pragma present but missing the `--` REASON marker entirely -- ESLint's native
    // directive parser still suppresses the CallExpression's own report (no `--` required for a
    // directive to be syntactically valid), so only this rule's OWN Program-level pragma check
    // fires (mirrors the no-raw-ismainmodule-comparison.js sibling's identical TS).
    {
      code: `
        // eslint-disable-next-line ${RULE_ID}
        await supabase.from('session_coordination').insert(row);
      `,
      errors: [{ messageId: 'noRawInsert' }],
    },
    // TS-8: pragma present with the `--` marker but a whitespace-only (effectively empty) reason.
    {
      code: `// eslint-disable-next-line ${RULE_ID} --   \nawait supabase.from('session_coordination').insert(row);`,
      errors: [{ messageId: 'pragmaMissingReason' }],
    },
  ],
});
