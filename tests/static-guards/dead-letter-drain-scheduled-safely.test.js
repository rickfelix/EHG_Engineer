/**
 * The dead-letter drain must be SCHEDULED, and scheduled in DRY-RUN.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-2, AC-1, AC-11.
 *
 * WHAT WOULD STILL BE BROKEN IF A NAIVE GUARD PASSED — this SD has taught the same lesson three
 * times, so it is worth stating the reasoning rather than just the assertions. A guard that only
 * checked "the workflow does not say --apply" would pass while:
 *   - the workflow had no schedule at all, so nothing ever ran it (the exact "instrument nobody
 *     invokes" defect this SD exists to fix, reintroduced by the fix for it);
 *   - the workflow pointed at a script path that does not exist, so every run failed silently
 *     green from the guard's point of view;
 *   - --apply appeared unconditionally somewhere the naive substring check did not look.
 * So this asserts DELIVERY (a scheduled caller of the real script exists) and SAFETY (writes are
 * gated) as separate things, and carries a two-sided control proving the safety check can fail.
 *
 * AC-1 is the delivery half: before this SD, the drain's complete caller list was its own CLI
 * wrapper plus one unit test. A test that cannot tell "scheduled" from "present" could never have
 * shown that changed.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const WORKFLOW = path.join(ROOT, '.github/workflows/dead-letter-drain-cron.yml');
const DRAIN_SCRIPT_REL = 'scripts/drain-dead-letter-coordination.mjs';

/** Lines that actually invoke the drain, ignoring comments and prose. */
function invocationLines(source) {
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('#'))
    .filter((l) => l.includes(DRAIN_SCRIPT_REL));
}

describe('dead-letter drain is scheduled (AC-1 delivery)', () => {
  it('a workflow exists that invokes the drain', () => {
    expect(fs.existsSync(WORKFLOW)).toBe(true);
    expect(invocationLines(fs.readFileSync(WORKFLOW, 'utf8')).length).toBeGreaterThan(0);
  });

  it('it runs on a schedule, not only on manual dispatch', () => {
    // Without this, the workflow is "present" but still nothing invokes the drain periodically —
    // which is precisely the defect state, wearing the costume of the fix.
    const src = fs.readFileSync(WORKFLOW, 'utf8');
    expect(src).toMatch(/^\s*schedule:/m);
    expect(src).toMatch(/^\s*-\s*cron:\s*['"][^'"]+['"]/m);
  });

  it('the script it invokes actually exists on disk', () => {
    // A typo'd path would run, fail, and leave every assertion above still green.
    expect(fs.existsSync(path.join(ROOT, DRAIN_SCRIPT_REL))).toBe(true);
  });
});

describe('dead-letter drain ships DRY-RUN (AC-11 safety)', () => {
  it('never invokes --apply unconditionally', () => {
    // Scheduling is the irreversible act: the drain's own post-checks read the lane only AFTER it
    // has written, so a wrong write is validated by an instrument that already accepted it.
    const unconditional = invocationLines(fs.readFileSync(WORKFLOW, 'utf8'))
      .filter((l) => l.includes('--apply'))
      .filter((l) => !/\bif\b|\belif\b|DEAD_LETTER_DRAIN_APPLY|inputs\.apply/.test(l));

    // The gate may sit on an enclosing `if` line rather than the invocation line itself, so an
    // --apply invocation is only acceptable when the file gates it somewhere.
    const src = fs.readFileSync(WORKFLOW, 'utf8');
    const hasGate = /DEAD_LETTER_DRAIN_APPLY/.test(src) && /inputs\.apply/.test(src);

    expect(
      unconditional.length === 0 || hasGate,
      'The scheduled run must be dry-run. Gate --apply behind DEAD_LETTER_DRAIN_APPLY (repo variable) '
      + 'and inputs.apply (manual dispatch) so enabling writes is an audited config change.'
    ).toBe(true);
    expect(hasGate).toBe(true);
  });

  it('defaults the manual-dispatch apply input to false', () => {
    const src = fs.readFileSync(WORKFLOW, 'utf8');
    expect(src).toMatch(/apply:[\s\S]{0,200}?default:\s*false/);
  });

  it('CONTROL: an unconditional --apply workflow is detectable (guard can fail)', () => {
    // Without this arm, a filter that silently stopped matching would leave the suite green while
    // a cron wrote to the lane on every tick.
    const synthetic = ['jobs:', '  x:', '    steps:', `      - run: node ${DRAIN_SCRIPT_REL} --apply`].join('\n');
    const offenders = invocationLines(synthetic)
      .filter((l) => l.includes('--apply'))
      .filter((l) => !/\bif\b|\belif\b|DEAD_LETTER_DRAIN_APPLY|inputs\.apply/.test(l));
    expect(offenders).toHaveLength(1);
    expect(/DEAD_LETTER_DRAIN_APPLY/.test(synthetic)).toBe(false);
  });

  it('CONTROL: a comment mentioning --apply does not count as an invocation', () => {
    const synthetic = `# do not hardcode ${DRAIN_SCRIPT_REL} --apply here`;
    expect(invocationLines(synthetic)).toHaveLength(0);
  });
});
