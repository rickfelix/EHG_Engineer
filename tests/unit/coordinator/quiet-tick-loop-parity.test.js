/**
 * Loop-parity guard for the quiet-tick cutover
 * (SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001, FR-1 "no monitoring loop silently dropped").
 *
 * The quiet-tick aggregators compose existing coordinator/Adam cron loops. When the
 * operator cuts over (removes the folded separate crons from STANDARD_LOOPS/ADAM_LOOPS),
 * every folded core MUST still be accounted for — either composed by a quiet-tick or
 * intentionally delta-gated. This test pins that accounting so a cutover cannot silently
 * drop a monitoring loop.
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_LOOPS } from '../../../scripts/coordinator-startup-check.mjs';
import { ADAM_LOOPS } from '../../../scripts/adam-startup-check.mjs';
import { COMPOSED_CORES as COORD_CORES, buildCores as buildCoordCores } from '../../../scripts/coordinator-quiet-tick.mjs';
import { COMPOSED_CORES as ADAM_CORES, DELTA_GATED_LOOPS } from '../../../scripts/adam-quiet-tick.mjs';

describe('coordinator quiet-tick — folded-core accounting', () => {
  it('every composed core maps to a real STANDARD_LOOPS script (nothing invented)', () => {
    const loopScripts = new Set(STANDARD_LOOPS.map((l) => l.script));
    for (const core of COORD_CORES) {
      expect(loopScripts.has(core.script), `composed core ${core.key} -> ${core.script} not in STANDARD_LOOPS`).toBe(true);
    }
  });

  it('expensive cores are quiescent-skipped; safety + backlog-rank always run', () => {
    const byKey = Object.fromEntries(COORD_CORES.map((c) => [c.key, c]));
    // Claim-reaping + inbox arrival must never be suppressed by quiescence.
    expect(byKey.sweep.quiescentSkip).toBe(false);
    expect(byKey.inbox.quiescentSkip).toBe(false);
    // backlog-rank (SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A): cheap, and exactly the
    // state where a fresh draft SD needs a rank before the next worker self-claims — must not
    // be quiescent-skipped like the genuinely expensive predictive/audit cores below.
    expect(byKey['backlog-rank'].quiescentSkip).toBe(false);
    // Expensive predictive/audit cores skip when nothing is moving.
    expect(byKey['charter-audit'].quiescentSkip).toBe(true);
    expect(byKey['capacity-forecast'].quiescentSkip).toBe(true);
    expect(byKey.audit.quiescentSkip).toBe(true);
  });

  it('buildCores(quiescent=true) skips the expensive cores but keeps backlog-rank running', () => {
    const cores = buildCoordCores(true);
    const skipped = cores.filter((c) => c.skip).map((c) => c.key).sort();
    expect(skipped).toEqual(['audit', 'capacity-forecast', 'charter-audit']);
    expect(cores.find((c) => c.key === 'backlog-rank').skip).toBe(false);
  });

  it('buildCores(quiescent=false) runs the full set (no skips)', () => {
    expect(buildCoordCores(false).every((c) => !c.skip)).toBe(true);
  });
});

describe('adam quiet-tick — folded-loop accounting', () => {
  it('inbox-monitor core maps to a real ADAM_LOOPS script', () => {
    const adamScripts = new Set(ADAM_LOOPS.map((l) => l.script).filter(Boolean));
    for (const core of ADAM_CORES) {
      expect(adamScripts.has(core.script), `adam core ${core.key} -> ${core.script} not in ADAM_LOOPS`).toBe(true);
    }
  });

  it('belt-countdown + offer-help are explicitly delta-gated, not dropped', () => {
    const adamKeys = new Set(ADAM_LOOPS.map((l) => l.key));
    for (const k of DELTA_GATED_LOOPS) {
      expect(adamKeys.has(k), `delta-gated loop ${k} no longer exists in ADAM_LOOPS`).toBe(true);
    }
  });
});
