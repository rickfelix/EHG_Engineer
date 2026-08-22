/**
 * SD-FDBK-ENH-578-SCRIPTS-ONE-001 -- eslint-rules/require-main-guard-in-one-off.js
 *
 * Positive cases feed source the rule must REJECT (unconditional entrypoint call, no guard);
 * negative controls feed source it must ACCEPT (guarded, or no entrypoint call at all). Both
 * accepted guard shapes are tested directly AND via the variable-indirection pattern actually
 * used in scripts/one-off/backfill-solomon-ledger-decision-by.mjs -- this incident's own fix --
 * since a naive "is the call directly inside an if-test matching shape X" check would miss it.
 */
import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import rule from '../../../eslint-rules/require-main-guard-in-one-off.js';

const RULE_NAME = 'require-main-guard-in-one-off';
const linter = new Linter({ configType: 'flat' });

function lint(code) {
  return linter.verify(code, {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { local: { rules: { [RULE_NAME]: rule } } },
    rules: { [`local/${RULE_NAME}`]: 'error' },
  });
}
const violations = (code) => lint(code).filter((m) => m.ruleId === `local/${RULE_NAME}`).length;

describe('require-main-guard-in-one-off', () => {
  describe('flags an unconditional top-level entrypoint call with no guard', () => {
    it('bare main() call', () => {
      expect(violations('function main() {}\nmain();')).toBe(1);
    });

    it('bare run() call', () => {
      expect(violations('function run() {}\nrun();')).toBe(1);
    });

    it('main().catch(...) chained, and the message names the actual function (not "undefined")', () => {
      const messages = lint('function main() {}\nmain().catch((e) => { console.error(e); process.exit(1); });')
        .filter((m) => m.ruleId === `local/${RULE_NAME}`);
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain('main()');
      expect(messages[0].message).not.toContain('undefined()');
    });

    it('run().catch(...) chained names "run", not "main"', () => {
      const messages = lint('function run() {}\nrun().catch((e) => { console.error(e); });')
        .filter((m) => m.ruleId === `local/${RULE_NAME}`);
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain('run()');
    });

    it('bare top-level await main()', () => {
      expect(violations('function main() {}\nawait main();')).toBe(1);
    });

    it('main().then(...).catch(...) chained -- a chain LONGER than one link', () => {
      expect(violations('function main() {}\nmain().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });')).toBe(1);
    });

    it('top-level `const data = await main();` -- a VariableDeclaration, not an ExpressionStatement', () => {
      expect(violations('async function main() { return 1; }\nconst data = await main();')).toBe(1);
    });
  });

  describe('does NOT flag a file with a recognized guard', () => {
    it('isMainModule() guard, direct if-test', () => {
      const code = [
        'import { isMainModule } from "../../lib/utils/is-main-module.js";',
        'function main() {}',
        'if (isMainModule(import.meta.url)) { main().catch((e) => { console.error(e); }); }',
      ].join('\n');
      expect(violations(code)).toBe(0);
    });

    it('fileURLToPath(import.meta.url)===process.argv[1] guard, direct if-test', () => {
      const code = [
        'import { fileURLToPath } from "node:url";',
        'function main() {}',
        'if (fileURLToPath(import.meta.url) === process.argv[1]) { main().catch((e) => { console.error(e); }); }',
      ].join('\n');
      expect(violations(code)).toBe(0);
    });

    it('fileURLToPath guard via variable indirection -- the exact shape used in backfill-solomon-ledger-decision-by.mjs', () => {
      const code = [
        'import { fileURLToPath } from "node:url";',
        'function main() {}',
        'const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];',
        'if (isDirectRun) {',
        '  main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(1); });',
        '}',
      ].join('\n');
      expect(violations(code)).toBe(0);
    });

    it('isMainModule() guard via variable indirection', () => {
      const code = [
        'import { isMainModule } from "../../lib/utils/is-main-module.js";',
        'function main() {}',
        'const shouldRun = isMainModule(import.meta.url);',
        'if (shouldRun) { main(); }',
      ].join('\n');
      expect(violations(code)).toBe(0);
    });
  });

  describe('does NOT flag a file with no top-level entrypoint call', () => {
    it('pure exports, no main()/run() at all', () => {
      const code = [
        'export function normalize(value) { return value.trim(); }',
        'export const DEFAULT_PAGE_SIZE = 100;',
      ].join('\n');
      expect(violations(code)).toBe(0);
    });

    it('main() defined but never called (unusual, but nothing to guard)', () => {
      expect(violations('function main() { return 1; }')).toBe(0);
    });
  });

  describe('deliberately narrow: any top-level conditional wrapping the call passes, guard condition unverified', () => {
    it('main() wrapped in an arbitrary (non-recognized) condition still passes -- this rule only catches UNCONDITIONAL calls', () => {
      // Documents the design boundary from the rule's own header comment: verifying the guard
      // condition is a *correct* one is a separate, narrower concern (out of this rule's scope).
      const code = 'function main() {}\nif (process.env.RUN_MAIN === "1") { main(); }';
      expect(violations(code)).toBe(0);
    });
  });

  describe('unrelated identifiers named main/run in nested scope are not confused with the top-level entrypoint', () => {
    it('a main() call inside a function body (not Program-level) is not flagged', () => {
      const code = [
        'function main() {}',
        'function wrapper() { main(); }',
        'export { wrapper };',
      ].join('\n');
      expect(violations(code)).toBe(0);
    });
  });
});
