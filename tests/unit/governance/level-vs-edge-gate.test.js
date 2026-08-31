/**
 * QF-20260831-127: the shared level-vs-edge gate rule.
 *
 * A metric row marks a TRANSITION or a discrete UNIT OF WORK, never the continued truth of a
 * standing level. Three measured instances (WAVE_LINKAGE_STARVATION 164 rows/7 weeks,
 * eva_scheduler_metrics's per-venture-per-poll suppression condition, Hotel-3's
 * bypass_detection re-log) re-asserted a level every evaluation cycle as a new event.
 */
import { describe, it, expect } from 'vitest';
import { shouldEmitLevelRow } from '../../../lib/governance/level-vs-edge-gate.js';

describe('shouldEmitLevelRow', () => {
  it('emits on the FIRST observation (no prior state recorded) -- establishes the current-state row', () => {
    expect(shouldEmitLevelRow({ previousLevel: null, currentLevel: false })).toBe(true);
    expect(shouldEmitLevelRow({ previousLevel: undefined, currentLevel: true })).toBe(true);
  });

  it('THE FIX: does NOT emit when the level is UNCHANGED (the per-evaluation re-assertion this QF exists to stop)', () => {
    expect(shouldEmitLevelRow({ previousLevel: true, currentLevel: true })).toBe(false);
    expect(shouldEmitLevelRow({ previousLevel: false, currentLevel: false })).toBe(false);
  });

  it('emits on a genuine TRANSITION (newly true / newly false)', () => {
    expect(shouldEmitLevelRow({ previousLevel: false, currentLevel: true })).toBe(true);
    expect(shouldEmitLevelRow({ previousLevel: true, currentLevel: false })).toBe(true);
  });

  it('works for non-boolean levels too (e.g. a named condition string, not just true/false)', () => {
    expect(shouldEmitLevelRow({ previousLevel: 'starved', currentLevel: 'starved' })).toBe(false);
    expect(shouldEmitLevelRow({ previousLevel: 'starved', currentLevel: 'healthy' })).toBe(true);
  });

  it('ADVERSARIAL-REVIEW FIX: an unchanged NaN level does NOT spuriously re-emit forever (Object.is, not strict !==)', () => {
    expect(shouldEmitLevelRow({ previousLevel: NaN, currentLevel: NaN })).toBe(false);
    expect(shouldEmitLevelRow({ previousLevel: NaN, currentLevel: 1 })).toBe(true);
  });

  it('DOCUMENTED CALLER TRAP: two structurally-identical but distinct object references still count as a transition -- callers must pass stable primitives, not freshly built objects', () => {
    expect(shouldEmitLevelRow({ previousLevel: { starved: true }, currentLevel: { starved: true } })).toBe(true);
  });
});
