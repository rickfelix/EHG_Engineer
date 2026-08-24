/**
 * The comms lane TTL expired-unread stamp must be SCHEDULED, and scheduled in DRY-RUN.
 * SD-LEO-INFRA-COMMS-LANE-TTLS-001 / FR-2.
 *
 * Mirrors tests/static-guards/dead-letter-drain-scheduled-safely.test.js's shape exactly --
 * a VALIDATION sub-agent at PLAN_VERIFICATION found the stamp script existed but was invoked
 * by nothing (evidence f9ce429f), the precise "instrument nobody invokes" defect the sibling
 * SD's own drain guard already names as a recurring failure mode in this codebase. This
 * asserts DELIVERY (a scheduled caller of the real script exists) and SAFETY (writes are
 * gated) as separate things, with a two-sided control proving the safety check can fail.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const WORKFLOW = path.join(ROOT, '.github/workflows/comms-lane-ttl-stamp-cron.yml');
const STAMP_SCRIPT_REL = 'scripts/stamp-comms-lane-ttl-expired.mjs';

/** Lines that actually invoke the stamp script, ignoring comments and prose. */
function invocationLines(source) {
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('#'))
    .filter((l) => l.includes(STAMP_SCRIPT_REL));
}

describe('comms lane TTL stamp is scheduled (delivery)', () => {
  it('a workflow exists that invokes the stamp script', () => {
    expect(fs.existsSync(WORKFLOW)).toBe(true);
    expect(invocationLines(fs.readFileSync(WORKFLOW, 'utf8')).length).toBeGreaterThan(0);
  });

  it('it runs on a schedule, not only on manual dispatch', () => {
    // Without this, the workflow is "present" but nothing invokes the stamp periodically --
    // precisely the defect state, wearing the costume of the fix.
    const src = fs.readFileSync(WORKFLOW, 'utf8');
    expect(src).toMatch(/^\s*schedule:/m);
    expect(src).toMatch(/^\s*-\s*cron:\s*['"][^'"]+['"]/m);
  });

  it('the script it invokes actually exists on disk', () => {
    // A typo'd path would run, fail, and leave every assertion above still green.
    expect(fs.existsSync(path.join(ROOT, STAMP_SCRIPT_REL))).toBe(true);
  });
});

describe('comms lane TTL stamp ships DRY-RUN (safety)', () => {
  it('never invokes --apply unconditionally', () => {
    const unconditional = invocationLines(fs.readFileSync(WORKFLOW, 'utf8'))
      .filter((l) => l.includes('--apply'))
      .filter((l) => !/\bif\b|\belif\b|COMMS_LANE_TTL_STAMP_APPLY|inputs\.apply/.test(l));

    const src = fs.readFileSync(WORKFLOW, 'utf8');
    const hasGate = /COMMS_LANE_TTL_STAMP_APPLY/.test(src) && /inputs\.apply/.test(src);

    expect(
      unconditional.length === 0 || hasGate,
      'The scheduled run must be dry-run. Gate --apply behind COMMS_LANE_TTL_STAMP_APPLY (repo '
      + 'variable) and inputs.apply (manual dispatch) so enabling writes is an audited config change.'
    ).toBe(true);
    expect(hasGate).toBe(true);
  });

  it('defaults the manual-dispatch apply input to false', () => {
    const src = fs.readFileSync(WORKFLOW, 'utf8');
    expect(src).toMatch(/apply:[\s\S]{0,200}?default:\s*false/);
  });

  it('CONTROL: an unconditional --apply workflow is detectable (guard can fail)', () => {
    // Without this arm, a filter that silently stopped matching would leave the suite green
    // while a cron wrote to the table on every tick.
    const synthetic = ['jobs:', '  x:', '    steps:', `      - run: node ${STAMP_SCRIPT_REL} --apply`].join('\n');
    const offenders = invocationLines(synthetic)
      .filter((l) => l.includes('--apply'))
      .filter((l) => !/\bif\b|\belif\b|COMMS_LANE_TTL_STAMP_APPLY|inputs\.apply/.test(l));
    expect(offenders).toHaveLength(1);
    expect(/COMMS_LANE_TTL_STAMP_APPLY/.test(synthetic)).toBe(false);
  });

  it('CONTROL: a comment mentioning --apply does not count as an invocation', () => {
    const synthetic = `# do not hardcode ${STAMP_SCRIPT_REL} --apply here`;
    expect(invocationLines(synthetic)).toHaveLength(0);
  });
});
