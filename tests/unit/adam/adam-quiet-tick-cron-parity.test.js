/**
 * QF-20260830-590: the required-loops predicate previously ran ONLY at startup
 * (adam-startup-check.mjs's renderLoops()), so a cron lost mid-session (7-day harness
 * expiry, CronDelete, restart) was silent until the next /adam. computeCronParityMissing()
 * reuses the SAME predicate (ADAM_LOOPS/loopStatus) so the tick can run it continuously.
 */
import { describe, it, expect } from 'vitest';
import { computeCronParityMissing } from '../../../scripts/adam-quiet-tick.mjs';

const LOOPS = [
  { key: 'quiet-tick', prompt: 'p1', script: 's1.mjs' },
  { key: 'triangulation-audit', prompt: 'p2', script: null },
  { key: 'folded-example', prompt: 'p3', script: 's3.mjs', folded: true },
];

describe('computeCronParityMissing (QF-20260830-590)', () => {
  it('removing one required key from the armed set flips the line: it is reported missing', () => {
    const armed = { provided: true, set: new Set(['triangulation-audit']) }; // quiet-tick absent
    expect(computeCronParityMissing(armed, LOOPS)).toEqual(['quiet-tick']);
  });

  it('all required keys armed -> empty (no missing)', () => {
    const armed = { provided: true, set: new Set(['quiet-tick', 'triangulation-audit']) };
    expect(computeCronParityMissing(armed, LOOPS)).toEqual([]);
  });

  it('folded loops are excluded even when absent from the armed set (never armed standalone)', () => {
    const armed = { provided: true, set: new Set(['quiet-tick', 'triangulation-audit']) };
    expect(computeCronParityMissing(armed, LOOPS)).not.toContain('folded-example');
  });

  it('matches by prompt or script basename too, not only key (mirrors loopStatus)', () => {
    const armedByPrompt = { provided: true, set: new Set(['p1', 'triangulation-audit']) };
    expect(computeCronParityMissing(armedByPrompt, LOOPS)).toEqual([]);
    const armedByScript = { provided: true, set: new Set(['s1.mjs', 'triangulation-audit']) };
    expect(computeCronParityMissing(armedByScript, LOOPS)).toEqual([]);
  });
});
