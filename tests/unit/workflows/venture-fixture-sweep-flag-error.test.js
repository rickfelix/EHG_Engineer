/**
 * The fixture-sweep feature-flag gate must fail LOUD on a query error.
 * QF-20260807-690.
 *
 * THE DEFECT. The gate destructured only `data` and threw the error away, so a broken query
 * produced `enabled=false` and the ENTIRE sweep quiet-no-opped. Measured against the live table,
 * which is what makes this a real trap rather than a style nit:
 *
 *   absent flag row  -> { data: null, error: null }
 *   bad column       -> { data: null, error: 'column ... does not exist' }
 *
 * IDENTICAL `data`. So `error` is the ONLY thing separating "the flag is off" from "I could not
 * read the flag", and discarding it collapses those two into one silent no-op — the guard cannot
 * distinguish nothing-to-do from cannot-see.
 *
 * WHY THESE ASSERTIONS ARE STRUCTURAL, NOT GREPS. "contains process.exit(1)" would pass even if
 * the exit sat on the EMPTY path, which would break the legitimate quiet no-op — the opposite
 * defect. So the test extracts the embedded script from the YAML and proves the exit lives INSIDE
 * the `if (error)` block and nowhere else.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const WORKFLOW = path.resolve(process.cwd(), '.github/workflows/venture-fixture-sweep.yml');

function gateScript() {
  const doc = yaml.load(readFileSync(WORKFLOW, 'utf8'));
  const steps = doc.jobs['fixture-sweep'].steps;
  const gate = steps.find((s) => s.id === 'gate');
  if (!gate) throw new Error('gate step not found — the workflow shape changed');
  const m = gate.run.match(/<<'EOF'\n([\s\S]*?)\nEOF/);
  if (!m) throw new Error('embedded heredoc script not found in the gate step');
  return m[1];
}

describe('QF-20260807-690: the flag gate distinguishes "off" from "cannot read"', () => {
  it('the workflow still parses and the gate step still exists', () => {
    // Guards the extraction itself: every assertion below is vacuous if the shape moved.
    const doc = yaml.load(readFileSync(WORKFLOW, 'utf8'));
    expect(doc.jobs['fixture-sweep']).toBeTruthy();
    expect(doc.jobs['fixture-sweep'].steps.some((s) => s.id === 'gate')).toBe(true);
  });

  it('destructures error from the flag query rather than discarding it', () => {
    expect(gateScript()).toMatch(/const\s*\{\s*data\s*,\s*error\s*\}\s*=\s*await\s+sb/);
  });

  it('exits non-zero on a query error, naming the underlying message', () => {
    const src = gateScript();
    expect(src).toMatch(/if\s*\(error\)\s*\{/);
    expect(src).toMatch(/error\.message/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it('the exit lives ONLY inside the error branch — an empty result must stay a quiet no-op', () => {
    // THE two-sided arm. Failing loud on a legitimately-absent flag row would be the mirror-image
    // defect: a sweep that cannot be disabled. Locate the if(error) block by brace matching and
    // prove every process.exit sits within it.
    const src = gateScript();
    const start = src.indexOf('if (error) {');
    expect(start, 'no if (error) block to bound').toBeGreaterThan(-1);

    let depth = 0;
    let end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    expect(end, 'unbalanced braces in the error branch').toBeGreaterThan(start);

    const exits = [...src.matchAll(/process\.exit\(/g)].map((m) => m.index);
    expect(exits.length, 'expected at least one exit').toBeGreaterThan(0);
    for (const at of exits) {
      expect(at > start && at < end, `a process.exit at ${at} sits OUTSIDE the error branch`).toBe(true);
    }
  });

  it('CONTROL: the enabled computation still treats an absent row as simply disabled', () => {
    // Absent row is {data:null, error:null} — it must fall through to enabled=false, not throw.
    expect(gateScript()).toMatch(/const\s+enabled\s*=\s*data\?\.is_enabled\s*===\s*true/);
  });
});
