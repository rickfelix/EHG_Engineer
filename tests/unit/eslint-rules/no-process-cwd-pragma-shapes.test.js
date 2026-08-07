// The pragma shapes that the EXISTING 82-test suite structurally cannot reach.
// SD-LEO-INFRA-ONE-GENUINELY-DEAD-001.
//
// WHY A SEPARATE FILE RATHER THAN MORE RuleTester CASES. The existing suite uses RuleTester, whose
// NATIVE suppression fires before this rule's own fallback is ever consulted, and it registers the
// rule under a PREFIXED id so every valid fixture writes a prefixed pragma. Both of the defects
// this SD fixes live precisely in the gap that leaves:
//
//   D1 — the two live pragmas in this repo are BARE (unprefixed). Native suppression cannot match
//        them under prefixed registration, so only the rule's own fallback can suppress them.
//   D2 — the fallback asked for comments before the CallExpression, which returns nothing when the
//        call is nested. Both live sites are nested.
//
// So the old suite validates a pragma form no source file uses. These tests drive the real Linter
// with the real registration and the shapes production actually contains.
//
// EVERY CASE IS TWO-SIDED. A suppression test that only asserts "no finding" passes against a rule
// that reports nothing at all — which is exactly what happened to me while building this: a probe
// with a wrong filename returned zero for every case INCLUDING its negative controls, and looked
// like success. The paired without-pragma case is what distinguishes a working guard from a silent
// one.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { Linter } from 'eslint';
import rule from '../../../eslint-rules/no-process-cwd-in-sub-agents.js';

const NS = 'sub-agents';
const RULE_NAME = 'no-process-cwd-in-sub-agents';
const RULE_ID = `${NS}/${RULE_NAME}`;

const CONFIG = {
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { process: 'readonly' } },
  plugins: { [NS]: { rules: { [RULE_NAME]: rule } } },
  rules: { [RULE_ID]: 'error' },
};

// A REAL path under cwd. A fabricated absolute path makes flat config match nothing, and ESLint
// then returns a single ruleId:null "No matching configuration found" message while the rule
// reports zero — indistinguishable from correct suppression unless you check the controls.
const toPosix = (p) => p.split(path.sep).join('/');
const IN_SCOPE = `${toPosix(process.cwd())}/lib/sub-agents/fixture.js`;
const OUT_OF_SCOPE = `${toPosix(process.cwd())}/lib/other/fixture.js`;

const linter = new Linter({ configType: 'flat' });
const count = (code, file = IN_SCOPE) =>
  linter.verify(code, CONFIG, file).filter((m) => m.ruleId === RULE_ID).length;

const BARE = `// eslint-disable-next-line ${RULE_NAME} -- measured reason`;
const PREFIXED = `// eslint-disable-next-line ${RULE_ID} -- measured reason`;

describe('the guard fires at all (controls — without these, every suppression test is vacuous)', () => {
  it('reports a bare expression statement', () => {
    expect(count('process.cwd();')).toBe(1);
  });

  it('reports a nested call in a const initialiser', () => {
    expect(count('const c = process.cwd();')).toBe(1);
  });

  it('reports a nested call in a MULTI-LINE object literal', () => {
    expect(count('const o = {\n  a: 1,\n  b: process.cwd(),\n};')).toBe(1);
  });

  it('reports nothing outside lib/sub-agents — the rule is path-gated', () => {
    expect(count('process.cwd();', OUT_OF_SCOPE)).toBe(0);
  });
});

describe('D2 — a pragma must suppress a NESTED call, which is every live site in this repo', () => {
  it('suppresses in a const initialiser', () => {
    expect(count(`${BARE}\nconst c = process.cwd();`)).toBe(0);
  });

  it('suppresses on a property of a MULTI-LINE object literal', () => {
    // THE SHAPE THAT BROKE MY FIRST FIX. lib/sub-agents/resolve-repo.js is exactly this: the
    // pragma sits above the PROPERTY, while the enclosing statement began many lines earlier.
    // My first attempt anchored at the statement and missed it — and a SINGLE-LINE object fixture
    // hid the bug, because there the property and the statement share a line.
    expect(count(`const o = {\n  a: 1,\n  ${BARE}\n  b: process.cwd(),\n};`)).toBe(0);
  });

  it('suppresses in a ternary branch', () => {
    expect(count(`${BARE}\nconst t = cond ? other : process.cwd();`)).toBe(0);
  });

  it('still reports the same nested shapes when the pragma is REMOVED', () => {
    // The other arm of all three above. Without it, a rule that suppressed unconditionally would
    // pass every test in this block.
    expect(count('const c = process.cwd();')).toBe(1);
    expect(count('const o = {\n  a: 1,\n  b: process.cwd(),\n};')).toBe(1);
    expect(count('const t = cond ? other : process.cwd();')).toBe(1);
  });
});

describe('D1 — BARE vs PREFIXED pragmas must behave identically', () => {
  it('a BARE pragma suppresses (only the rule fallback can do this)', () => {
    // Native ESLint suppression CANNOT match a bare id under prefixed registration, so a pass here
    // is the rule's own path working. This is the form both live files use.
    expect(count(`${BARE}\nconst c = process.cwd();`)).toBe(0);
  });

  it('a PREFIXED pragma also suppresses (handled natively — proves nothing about the fallback)', () => {
    expect(count(`${PREFIXED}\nconst c = process.cwd();`)).toBe(0);
  });

  it('a pragma for a DIFFERENT rule does not suppress this one', () => {
    // Guards against a fallback that treats any disable comment as blanket permission.
    expect(count('// eslint-disable-next-line some-other-rule -- unrelated\nconst c = process.cwd();')).toBe(1);
  });
});
