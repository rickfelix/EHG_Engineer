/**
 * SD-PAT-FIX-STUBBED-WRITER-BLINDNESS-001 — tests for eslint-rules/no-mocked-sut-import.js.
 *
 * STRUCTURAL REQUIREMENT, NOT A STYLE CHOICE: the can-fire proof (TS-1, TS-8) and the
 * must-not-fire proofs (TS-2, TS-3, TS-4) live in ONE RuleTester.run() call. Split apart, a
 * "no findings here" assertion is indistinguishable from a rule that never fires at all — every
 * negative control would pass against `create() { return {}; }`. For an SD whose whole subject is
 * suites that cannot fail, shipping that shape would be self-refuting. Co-locating them means the
 * same run that proves silence also proves capability.
 *
 * The two REAL fixtures are read off disk rather than hand-copied, so they cannot drift from the
 * files the PRD names.
 */

import { describe, it, expect } from 'vitest';
import { RuleTester, Linter } from 'eslint';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rule from '../../../eslint-rules/no-mocked-sut-import.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readFixture = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** TS-1 — the real known-positive named by the PRD. */
const KNOWN_POSITIVE = 'tests/unit/value-authenticity/panel-assembly.test.js';
/** TS-4 — the canonical witness. Stubs by DI, contains zero vi.mock; the rule is blind to it BY DESIGN. */
const CANONICAL_WITNESS = 'tests/unit/coordinator/reconcile-late-verdicts.test.js';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-mocked-sut-import', rule, {
  valid: [
    {
      name: 'TS-2 negative control: a BARE-PACKAGE boundary mock, imported from the identical specifier',
      // Structurally identical to the positive except the specifier is a package rather than
      // relative — so this exercises the actual relative-vs-bare discriminator rather than merely
      // being a case where no mock/import pairing exists at all.
      code: [
        "import { createClient } from '@supabase/supabase-js';",
        "vi.mock('@supabase/supabase-js');",
        'export const c = createClient;',
      ].join('\n'),
    },
    {
      name: 'TS-3 negative control: a relative module is mocked but NOTHING is imported from it',
      code: [
        "vi.mock('../../../lib/governance/emit-feedback.js', () => ({ emitFeedback: (...a) => hoisted(...a) }));",
        'export const x = 1;',
      ].join('\n'),
    },
    {
      name: 'TS-4 residual gap, ASSERTED not assumed: the canonical witness stubs by DEPENDENCY INJECTION, so the rule is blind to it',
      // This is the pattern's own headline incident. The rule provably does not catch it, and that
      // limit is pinned here so nobody later describes this rule as closing the pattern. It passes
      // in the SAME run as TS-1/TS-8, which is what stops it meaning "the rule never fires".
      code: readFixture(CANONICAL_WITNESS),
    },
    {
      name: 'TS-5a escape hatch WITH a reason is honoured',
      // RuleTester registers the rule under the `rule-to-test/` plugin prefix, so an unprefixed
      // pragma makes ESLint itself emit "Definition for rule ... was not found". The rule's
      // PRAGMA_DETECT_RE accepts an optional plugin prefix, which is what makes this work in both
      // the RuleTester harness and real files where the driver registers it as `local/`.
      code: [
        "vi.mock('./writer.js', () => ({ write: () => {} }));",
        '// eslint-disable-next-line rule-to-test/no-mocked-sut-import -- collaborator isolation; real contract covered by writer-contract.test.js',
        "import { write } from './writer.js';",
        'export const w = write;',
      ].join('\n'),
    },
    {
      name: 'a side-effect-only import from a mocked relative module binds nothing and is not a finding',
      code: [
        "vi.mock('./side-effect.js', () => ({}));",
        "import './side-effect.js';",
        'export const y = 1;',
      ].join('\n'),
    },
  ],

  invalid: [
    {
      name: 'TS-1 known-positive: the REAL panel-assembly suite mocks disposition.js and imports recordDisposition from it',
      code: readFixture(KNOWN_POSITIVE),
      errors: [{ messageId: 'mockedSutImport' }],
    },
    {
      name: 'TS-8 synthetic positive: same general shape, a DIFFERENT path — defeats a rule that hardcodes the fixture path',
      // With only the real fixture as a positive, a rule that special-cased that one path string
      // would pass every test here. This is the assertion that forces a general AST check.
      code: [
        "vi.mock('./foo.js', () => ({ bar: () => {} }));",
        "import { bar } from './foo.js';",
        'export const b = bar;',
      ].join('\n'),
      errors: [{ messageId: 'mockedSutImport' }],
    },
    {
      name: 'TS-5b escape hatch with NO reason is itself reported — an unexplained suppression on this class is how a blind suite gets waved through',
      code: [
        "vi.mock('./writer.js', () => ({ write: () => {} }));",
        '// eslint-disable-next-line rule-to-test/no-mocked-sut-import',
        "import { write } from './writer.js';",
        'export const w = write;',
      ].join('\n'),
      errors: [{ messageId: 'pragmaMissingReason' }],
    },
    {
      name: 'jest.mock is treated the same as vi.mock',
      code: [
        "jest.mock('./legacy.js', () => ({ doThing: () => {} }));",
        "import { doThing } from './legacy.js';",
        'export const d = doThing;',
      ].join('\n'),
      errors: [{ messageId: 'mockedSutImport' }],
    },
  ],
});

/**
 * GUT CHECK (test-of-the-test). Everything above is a RuleTester contract; this asserts the property
 * that makes the negative controls meaningful in the first place — that a no-op rule would FAIL the
 * positive cases. Without it, "the negatives pass" carries no information.
 */
describe('no-mocked-sut-import — the suite cannot pass against a gutted rule', () => {
  const CONFIG = (r) => ({
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    plugins: { local: { rules: { 'no-mocked-sut-import': r } } },
    rules: { 'local/no-mocked-sut-import': 'error' },
  });
  const GUTTED = { meta: { type: 'problem', messages: {}, schema: [] }, create() { return {}; } };
  const positive = readFixture(KNOWN_POSITIVE);

  it('the real rule fires exactly once on the known-positive fixture', () => {
    const msgs = new Linter().verify(positive, CONFIG(rule), { filename: KNOWN_POSITIVE });
    expect(msgs.filter((m) => m.ruleId?.includes('no-mocked-sut-import'))).toHaveLength(1);
  });

  it('a gutted no-op rule finds NOTHING on that same fixture — which is why silence alone proves nothing', () => {
    const msgs = new Linter().verify(positive, CONFIG(GUTTED), { filename: KNOWN_POSITIVE });
    expect(msgs.filter((m) => m.ruleId?.includes('no-mocked-sut-import'))).toHaveLength(0);
  });

  it('the canonical witness is silent under the REAL rule — the documented DI blind spot, not a broken rule', () => {
    const msgs = new Linter().verify(readFixture(CANONICAL_WITNESS), CONFIG(rule), { filename: CANONICAL_WITNESS });
    expect(msgs.filter((m) => m.ruleId?.includes('no-mocked-sut-import'))).toHaveLength(0);
  });
});
