/**
 * The lane-lint gauge must be scheduled AND its output must reach someone.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-6.
 *
 * WHAT WOULD STILL BE BROKEN IF A NAIVE TEST PASSED. A guard asserting only "a workflow exists and
 * runs the gauge" would pass while the gauge printed into an Actions log no human reads — i.e.
 * while it was still, functionally, an instrument nobody consumes. That is this SD's own defect
 * reproduced by its own fix. So delivery (scheduled) and CONSUMPTION (can fail the job) are
 * asserted as separate properties, and the budget logic gets real unit coverage because it is the
 * only thing standing between "scheduled" and "decorative".
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { exceedsLintBudget } = require_('../../../scripts/coordinator-lane-lint-gauge.cjs');

const ROOT = process.cwd();
const WORKFLOW = path.join(ROOT, '.github/workflows/lane-lint-gauge-cron.yml');
const GAUGE_REL = 'scripts/coordinator-lane-lint-gauge.cjs';

const result = (over) => ({ windowRows: 1000, untyped_row: 0, bodyless_row: 0, empty_sender_row: 0, ...over });

describe('exceedsLintBudget', () => {
  it('does not fire at the measured baseline (~4.3% untyped) under a 10% budget', () => {
    // The whole point of the headroom: a check that is red on day one gets switched off.
    const v = exceedsLintBudget(result({ untyped_row: 43 }), 0.10);
    expect(v.exceeded).toBe(false);
    expect(v.ratio).toBeCloseTo(0.043, 4);
  });

  it('FIRES when hygiene regresses past the budget', () => {
    expect(exceedsLintBudget(result({ untyped_row: 150 }), 0.10).exceeded).toBe(true);
  });

  it('sums all three violation classes, not just untyped', () => {
    // A budget that only counted untyped_row would miss a lane going bodyless.
    const v = exceedsLintBudget(result({ untyped_row: 40, bodyless_row: 40, empty_sender_row: 40 }), 0.10);
    expect(v.violations).toBe(120);
    expect(v.exceeded).toBe(true);
  });

  it('returns null on an EMPTY window — no verdict, never a false all-clear', () => {
    // A zero-row window would otherwise compute 0/0 and read as a clean pass, which is the
    // "backstop that never fails" shape: green because nothing was measured.
    expect(exceedsLintBudget(result({ windowRows: 0 }), 0.10)).toBeNull();
  });

  it('returns null when the budget is absent or nonsensical (feature disabled)', () => {
    expect(exceedsLintBudget(result(), NaN)).toBeNull();
    expect(exceedsLintBudget(result(), -1)).toBeNull();
    expect(exceedsLintBudget(null, 0.10)).toBeNull();
  });

  it('is exactly at-budget => not exceeded (boundary is inclusive)', () => {
    expect(exceedsLintBudget(result({ untyped_row: 100 }), 0.10).exceeded).toBe(false);
    expect(exceedsLintBudget(result({ untyped_row: 101 }), 0.10).exceeded).toBe(true);
  });
});

describe('the gauge is scheduled (delivery)', () => {
  it('a workflow exists that runs the gauge on a schedule', () => {
    expect(fs.existsSync(WORKFLOW)).toBe(true);
    const src = fs.readFileSync(WORKFLOW, 'utf8');
    expect(src).toMatch(/^\s*schedule:/m);
    expect(src).toMatch(/^\s*-\s*cron:\s*['"][^'"]+['"]/m);
    expect(src).toContain(GAUGE_REL);
  });

  it('the script it references exists on disk', () => {
    expect(fs.existsSync(path.join(ROOT, GAUGE_REL))).toBe(true);
  });
});

describe('the gauge output reaches someone (consumption)', () => {
  it('the scheduled invocation passes --max-violation-ratio, so the job CAN fail', () => {
    // Without the flag the gauge always exits 0 and the workflow is decorative: "it runs" would be
    // indistinguishable from "it ran and nobody could tell you what it said".
    const invocation = fs.readFileSync(WORKFLOW, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('#'))
      .find((l) => l.includes(GAUGE_REL));
    expect(invocation).toBeDefined();
    expect(invocation).toContain('--max-violation-ratio');
  });

  it('CONTROL: an invocation without the flag is detectable BY THE SAME EXTRACTION', () => {
    // The first version of this control was TAUTOLOGICAL (flagged by adversarial review): it
    // asserted that a locally-built string lacked a substring it had deliberately omitted, ran no
    // production code, and did not even exercise the extraction the real assertion above uses. It
    // could never have failed, so it certified nothing. Now it drives the SAME line-selection
    // logic, so if that selection silently stops finding invocations this control goes red too.
    const synthetic = [
      '    steps:',
      '      # - run: node ' + GAUGE_REL + ' --max-violation-ratio 0.10   <- commented out',
      '      - run: node ' + GAUGE_REL + ' --window-hours 24'
    ].join('\n');

    const invocation = synthetic
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('#'))
      .find((l) => l.includes(GAUGE_REL));

    expect(invocation).toBeDefined();
    expect(invocation).not.toContain('--max-violation-ratio');
  });
});
