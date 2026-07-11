/**
 * Unit tests for ESLint rule `no-echoed-session-coordination-target`.
 *
 * SD-LEO-INFRA-SESSION-COORDINATION-LANE-001 (clause (a): resolver-only role-addressing).
 *
 * Covers: the anti-pattern (target_session echoed from a prior row's field), the correct
 * pattern (resolver-sourced or worker-loop-sourced target_session), and the escape-hatch
 * pragma contract (mirrors no-raw-session-coordination-insert.js's identical shape).
 *
 * @module tests/unit/eslint-rules/no-echoed-session-coordination-target.test.js
 */

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../../eslint-rules/no-echoed-session-coordination-target.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const RULE_ID = 'rule-to-test/no-echoed-session-coordination-target';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-echoed-session-coordination-target', rule, {
  valid: [
    // TS-1: resolver-sourced target (a CallExpression, not an echoed MemberExpression).
    {
      code: 'await insertCoordinationRow(supabase, { target_session: await getActiveAdamId(supabase, {}), subject: \'x\' });',
    },
    // TS-2: worker-addressed, loop-sourced target (a MemberExpression, but not one of the
    // echo property names -- worker addressing is out of clause (a)'s role-addressing scope).
    {
      code: 'for (const w of workers) { await insertCoordinationRow(supabase, { target_session: w.session_id }); }',
    },
    // TS-3: a plain identifier (already-resolved local variable), not a member expression at all.
    {
      code: 'await insertCoordinationRow(supabase, { target_session: coordinatorId, subject: \'x\' });',
    },
    // TS-4: escape-hatch pragma with a non-empty reason.
    {
      code: `
        // eslint-disable-next-line ${RULE_ID} -- worker-addressed, not role mail
        await insertCoordinationRow(supabase, { target_session: row.target_session });
      `,
    },
  ],
  invalid: [
    // TS-5: the echoed-target anti-pattern this rule exists to catch.
    {
      code: 'await insertCoordinationRow(supabase, { target_session: row.target_session, subject: \'x\' });',
      errors: [{ messageId: 'noEchoedTarget' }],
    },
    // TS-6: echoed sender_session field (relay-confirm-to-asker pattern).
    {
      code: 'await insertCoordinationRow(supabase, { target_session: row.sender_session, subject: \'x\' });',
      errors: [{ messageId: 'noEchoedTarget' }],
    },
    // TS-7: same anti-pattern on a raw insert (not just the choke point) via a differently-named object.
    {
      code: 'await supabase.from(\'session_coordination\').insert({ target_session: msg.target_session });',
      errors: [{ messageId: 'noEchoedTarget' }],
    },
    // TS-8: pragma present but missing the `--` REASON marker entirely.
    {
      code: `
        // eslint-disable-next-line ${RULE_ID}
        await insertCoordinationRow(supabase, { target_session: row.target_session });
      `,
      errors: [{ messageId: 'noEchoedTarget' }],
    },
    // TS-9: pragma present with the `--` marker but a whitespace-only (effectively empty) reason.
    {
      code: `// eslint-disable-next-line ${RULE_ID} --   \nawait insertCoordinationRow(supabase, { target_session: row.target_session });`,
      errors: [{ messageId: 'pragmaMissingReason' }],
    },
  ],
});
