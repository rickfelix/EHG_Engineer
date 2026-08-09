/**
 * QF-20260807-118 — the class guard must see through a normalization suffix.
 *
 * THE DEFECT: the rule matched `import.meta.url === \`file://${process.argv[1]}\`` but NOT the
 * same comparison with `.replace(/\\/g,'/')` appended, because the suffix makes the right-hand
 * node a CallExpression rather than a TemplateLiteral. That exclusion was DELIBERATE and
 * DOCUMENTED — the rule called wrapped variants "unproven-instance shapes out of scope" — and it
 * was falsified by three live instances, one of which (scripts/drive-report-produce.mjs) silently
 * no-opped the only writer of drive_reports on every non-Linux seat.
 *
 * The `.replace()` is an ATTEMPT to fix the Windows backslash problem, which is exactly why a
 * careful author reaches for it. It does not work — it normalizes the separators but not the
 * `file://` vs `file:///` prefix — so THE MORE SOPHISTICATED-LOOKING FORM IS THE MORE BROKEN ONE,
 * and it was precisely the form the guard could not see.
 *
 * WHY THESE ASSERTIONS ARE POSITIVE. A test that only asserted "the current tree is clean" would
 * PASS AGAINST THE BROKEN RULE, because the broken rule calls everything clean. That is the trap
 * this entire defect class sets. So every case below feeds the rule source it must REJECT, and the
 * negative controls feed it source it must ACCEPT — proving the widening did not become a blanket.
 */
import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import rule from '../../../eslint-rules/no-raw-ismainmodule-comparison.js';

const RULE_NAME = 'no-raw-ismainmodule-comparison';
const linter = new Linter({ configType: 'flat' });

function lint(code) {
  return linter.verify(code, {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { local: { rules: { [RULE_NAME]: rule } } },
    rules: { [`local/${RULE_NAME}`]: 'error' },
  });
}
const violations = (code) => lint(code).filter((m) => m.ruleId === `local/${RULE_NAME}`).length;

describe('QF-20260807-118 — suffixed and chained variants are caught', () => {
  it('CATCHES the exact live form that shipped in three files', () => {
    // Verbatim shape from scripts/drive-report-produce.mjs, drive-report-sweep.mjs and
    // drive-report-sms-sweep.mjs before this fix.
    const code = 'if (import.meta.url === `file://${process.argv[1]}`.replace(/\\\\/g, "/")) { run(); }';
    expect(violations(code), 'the suffixed form is the one that shipped broken').toBe(1);
  });

  it('CATCHES a CHAIN of suffixes, not just one', () => {
    // A single unwrap would pass this — which would be the same bug one link further out,
    // reintroduced inside its own fix.
    const code = 'if (import.meta.url === `file://${process.argv[1]}`.replace(/a/g,"b").toLowerCase()) { run(); }';
    expect(violations(code)).toBe(1);
  });

  it('CATCHES the concat form with a suffix, and either operand order', () => {
    expect(violations('if (import.meta.url === ("file://" + process.argv[1]).replace(/a/g,"b")) { run(); }')).toBe(1);
    expect(violations('if (("file://" + process.argv[1]).replace(/a/g,"b") === import.meta.url) { run(); }')).toBe(1);
  });

  it('still CATCHES the bare form — the original contract must not regress', () => {
    expect(violations('if (import.meta.url === `file://${process.argv[1]}`) { run(); }')).toBe(1);
    expect(violations('if (import.meta.url === "file://" + process.argv[1]) { run(); }')).toBe(1);
  });

  // NEGATIVE CONTROLS — the widening must not become a blanket. The original rule's narrowness
  // existed to avoid false positives, and that concern is still valid; only the proven-instance
  // exclusion was lifted.
  it('does NOT flag the correct helper', () => {
    expect(violations('import { isMainModule } from "../lib/utils/is-main-module.js";\nif (isMainModule(import.meta.url)) { run(); }')).toBe(0);
  });

  it('does NOT flag new URL(process.argv[1]) — a different shape with a legitimate reading', () => {
    expect(violations('if (import.meta.url === new URL(process.argv[1], "file:").href) { run(); }')).toBe(0);
  });

  it('does NOT flag an unrelated argv comparison or an unrelated .replace chain', () => {
    expect(violations('if (process.argv[1] === somePath.replace(/a/g,"b")) { run(); }')).toBe(0);
    expect(violations('if (import.meta.url === `https://${process.argv[1]}`.replace(/a/g,"b")) { run(); }')).toBe(0);
    expect(violations('if (import.meta.url === `file://${process.argv[2]}`.replace(/a/g,"b")) { run(); }')).toBe(0);
  });

  // PRAGMA SEMANTICS ARE DELIBERATELY NOT RE-TESTED HERE. The existing RuleTester suite
  // (tests/unit/eslint-rules/no-raw-ismainmodule-comparison.test.js) owns them, and it can:
  // RuleTester registers the rule under its bare name, so ESLint's NATIVE eslint-disable-next-line
  // processing matches and suppresses. This suite registers it as `local/…` for flat config, so a
  // bare-name pragma cannot match natively — my first draft asserted suppression here and failed,
  // testing the harness rather than the rule. That existing suite is run alongside this one in CI
  // and is what proves the widening did not disturb pragma handling.
});
