/**
 * SD-LEO-INFRA-WRITER-SUB-AGENT-001 — FR-4 / FR-4a / FR-7.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO: assert "none of M1..Mn mutates". That would be a RECEIPT
 * FOR THE LIST — it passes forever while writer #15 lands unfenced, which is the exact defect this
 * SD exists to fix, reproduced in its own anti-recurrence device. The load-bearing case here
 * ("catches a mutator that appears in no enumeration") uses a shape invented for the test.
 *
 * AND THIS SUITE IS NOT THE ACCEPTANCE. A unit test proves the rule's LOGIC; it cannot prove the
 * rule ever RUNS. The precedent this SD was told to copy has 82 green unit tests and has never
 * inspected a real file. Reachability is asserted by .github/workflows/no-unfenced-verdict-mutation-lint.yml,
 * which injects a violating file and requires the driver to exit non-zero before trusting a pass.
 */
import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import rule from '../../../eslint-rules/no-unfenced-verdict-mutation.js';

const RULE_ID = 'verdict-chain/no-unfenced-verdict-mutation';
const CONFIG = {
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: { 'verdict-chain': { rules: { 'no-unfenced-verdict-mutation': rule } } },
  rules: { [RULE_ID]: 'error' }
};

const linter = new Linter({ configType: 'flat' });
const lint = (code, filename = 'lib/sub-agents/some-agent.js') =>
  linter.verify(code, CONFIG, { filename }).filter((m) => m.ruleId === RULE_ID);

describe('no-unfenced-verdict-mutation — the load-bearing case', () => {
  it('CATCHES A MUTATOR THAT APPEARS IN NO ENUMERATION (read-modify-write shape)', () => {
    // Invented here. Not M1..M14. Not in any list. This is the whole point of the rule.
    const found = lint(`
      export function somethingNobodyListed(results) {
        if (results.verdict === 'FAIL') {
          results.verdict = 'PASS';
        }
        return results;
      }
    `);
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/recordVerdictMutation/);
  });

  it('CATCHES AN UNENUMERATED DEFAULT (object-literal shape, invisible to assignment predicates)', () => {
    const found = lint(`
      export function build(result) {
        return { sub_agent_code: 'X', verdict: result.verdict || 'WARNING' };
      }
    `);
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/silently promotes a missing verdict/);
  });
});

describe('FR-4a: the provenance predicate must not fire on AUTHORS', () => {
  // Measured during PLAN over 98 files / 142 assignments: the parameter-received predicate ALONE
  // gives 86% false positives, because a helper that authors a verdict looks identical to one that
  // rewrites a caller's. A rule that cries wolf gets deleted — that is how the precedent died.
  it('does NOT flag a sub-agent authoring its own local results object', () => {
    expect(lint(`
      export function analyse(findings) {
        const results = { verdict: 'PASS', findings };
        if (findings.length > 0) { results.verdict = 'FAIL'; }
        return results;
      }
    `)).toHaveLength(0);
  });

  it('does NOT flag a parameter-received overwrite whose conditional never reads .verdict', () => {
    // P2 absent => not a read-modify-write => not the mutation signature. This is a deliberate
    // narrowing with a KNOWN cost: lib/sub-agents/performance.js:239 is a real instance the rule
    // misses. Recorded in the driver's KNOWN-MISSED output rather than papered over.
    expect(lint(`
      export function apply(results, ctx) {
        if (ctx.newBarrels > 0) { results.verdict = 'BLOCKED'; }
        return results;
      }
    `)).toHaveLength(0);
  });

  it('does NOT flag `verdict: x ?? null` — defaulting to UNKNOWN preserves absence', () => {
    // Same syntax as the laundering shape, opposite meaning: null stays unknown, 'WARNING' would
    // manufacture acceptance. Without this narrowing the rule flagged the evidence GATE's own
    // read-only reporting struct (subagent-evidence-gate.js:395).
    expect(lint(`
      const details = { verdict: latest.get(k)?.verdict ?? null };
    `)).toHaveLength(0);
  });

  it('does NOT flag the seam itself — verdict-chain.js assigns verdict BY DESIGN', () => {
    expect(lint(`
      export function recordVerdictMutation(results, newVerdict) {
        if (results.verdict !== newVerdict) { results.verdict = newVerdict; }
        return results;
      }
    `, 'lib/sub-agents/verdict-chain.js')).toHaveLength(0);
  });
});

describe('TS-13 adversarial shape matrix — CAUGHT vs KNOWN-MISSED, stated openly', () => {
  // The deeper risk with TS-3 is that the same author writes both rule and fixture, so the fixture
  // is shaped to match the rule's mental model. This matrix publishes what the predicate does NOT
  // see, so "0 findings" is never read as "0 mutators".
  const SHAPES = [
    { name: 'read-modify-write on a param', caught: true, code: 'function f(results){ if(results.verdict===\'FAIL\'){ results.verdict=\'PASS\'; } }' },
    { name: 'object-literal string default', caught: true, code: 'const o = { verdict: r.verdict || \'WARNING\' };' },
    { name: 'object-literal ?? string default', caught: true, code: 'const o = { verdict: r.verdict ?? \'PASS\' };' },
    { name: 'ternary remap in a literal', caught: false, code: 'const o = { verdict: r.blocked ? \'FAIL\' : \'PASS\' };' },
    { name: 'spread-rebuild (new object, nothing overwritten)', caught: false, code: 'function f(results){ return { ...results, verdict: \'PASS\' }; }' },
    { name: 'helper-indirected (overwrite lives in another file)', caught: false, code: 'function f(results){ applyElsewhere(results); return results; }' },
    { name: 'condition tests something other than .verdict', caught: false, code: 'function f(results, c){ if(c.x){ results.verdict=\'BLOCKED\'; } }' },
  ];

  for (const shape of SHAPES) {
    it(`${shape.caught ? 'CAUGHT' : 'KNOWN-MISSED'}: ${shape.name}`, () => {
      const n = lint(shape.code).length;
      if (shape.caught) expect(n).toBeGreaterThan(0);
      else expect(n).toBe(0); // pinned as DEBT, not as correctness
    });
  }

  it('the known-missed set is non-empty — an honest fence states its blind spots', () => {
    expect(SHAPES.filter((s) => !s.caught).length).toBeGreaterThan(0);
  });
});
