/**
 * QF-20260911-553 — encodes the coordinator ruling on directed-assignment ordering
 * (Solomon Friday Foundation Audit #2 item 10, feedback 89b3be6a; session_coordination row
 * 8f2e7ed7, correlation 0296599f) into docs/protocol/fleet-worker-loop-directive.md: a
 * directed WORK_ASSIGNMENT never preempts a live, continuously-held claim -- it queues and
 * wins at that worker's next release, ahead of any belt self-claim tier.
 *
 * This is a drift-guard: it asserts the ACTUAL ladder in lib/checkin/steps/index.cjs still
 * upholds the two relative-order invariants the directive now documents, and that the
 * directive text and this ladder both name the same step files -- so a future reorder of
 * the ladder is caught here rather than silently drifting from the documented ruling.
 * Deliberately keyed on step NAMES, never numeric positions (the ladder's own docblock
 * shows those numbers have already shifted multiple times as steps were inserted).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const steps = require_('../../../lib/checkin/steps/index.cjs');
const stepNames = steps.map((s) => s.name);
const DIRECTIVE = readFileSync(join(__dirname, '../../../docs/protocol/fleet-worker-loop-directive.md'), 'utf8');

function indexOfStep(name) {
  const i = stepNames.indexOf(name);
  expect(i, `step '${name}' not found in lib/checkin/steps/index.cjs`).toBeGreaterThanOrEqual(0);
  return i;
}

describe('directed-assignment ordering ruling (QF-20260911-553) — ladder matches the documented order', () => {
  it('resume runs before directed-assignment (a continuously-held claim is looked at first, never bypassed)', () => {
    expect(indexOfStep('resume')).toBeLessThan(indexOfStep('directed-assignment'));
  });

  it('resume-yield-fallback runs immediately after directed-assignment (restores a rediscovered claim if the directed attempt failed, never falls through to self-claim)', () => {
    expect(indexOfStep('resume-yield-fallback')).toBe(indexOfStep('directed-assignment') + 1);
  });

  it('directed-assignment runs before every belt self-claim tier (queues and wins ahead of self-claim, never behind it)', () => {
    const directedIdx = indexOfStep('directed-assignment');
    for (const selfClaimTier of ['self-claim-gates', 'critical-qf-jump', 'merged-pool-self-claim', 'self-claim-qf']) {
      expect(directedIdx, `directed-assignment must precede ${selfClaimTier}`).toBeLessThan(indexOfStep(selfClaimTier));
    }
  });

  it('the directive documents the ruling and names the same step files the ladder actually runs', () => {
    expect(DIRECTIVE).toMatch(/a directed `WORK_ASSIGNMENT` never preempts a LIVE, continuously-held claim/);
    expect(DIRECTIVE).toContain('lib/checkin/steps/index.cjs');
    for (const name of ['resume-yield-fallback.cjs', 'self-claim-gates', 'critical-qf-jump', 'merged-pool-self-claim', 'self-claim-qf']) {
      expect(DIRECTIVE).toContain(name);
    }
  });

  it('the directive names the superseded SD and both corollaries', () => {
    expect(DIRECTIVE).toContain('SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001');
    expect(DIRECTIVE).toContain('QF-20260911-529');
    expect(DIRECTIVE).toMatch(/explicitly supersede/i);
    expect(DIRECTIVE).toMatch(/resume_final/);
  });
});
