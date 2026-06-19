/**
 * SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001 (FR-2, FR-3, FR-4)
 * Registry shape/count invariants + cron-coherence vs the LIVE workflow .yml.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  LOOP_CONTRACTS,
  list,
  get,
  assertContractsValid,
} from '../../../lib/loops/loop-contract-registry.js';
import { validateLoopContract, BOUNDARY_KIND } from '../../../lib/loops/loop-contract.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Extract the first `cron: '...'` schedule from a workflow yml. */
function cronFromWorkflow(relPath) {
  const text = readFileSync(resolve(repoRoot, relPath), 'utf8');
  const m = text.match(/cron:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

describe('registry shape + invariants', () => {
  it('LOOP_CONTRACTS is frozen', () => {
    expect(Object.isFrozen(LOOP_CONTRACTS)).toBe(true);
  });

  it('declares the 2 exemplars and every entry validates', () => {
    expect(LOOP_CONTRACTS).toHaveLength(2);
    for (const c of LOOP_CONTRACTS) {
      expect(validateLoopContract(c)).toEqual({ valid: true, errors: [] });
    }
  });

  it('every exemplar declares at least one MAY and one MAY_NOT boundary', () => {
    for (const c of LOOP_CONTRACTS) {
      expect(c.boundaries.some((b) => b.kind === BOUNDARY_KIND.MAY)).toBe(true);
      expect(c.boundaries.some((b) => b.kind === BOUNDARY_KIND.MAY_NOT)).toBe(true);
    }
  });

  it('list() returns id+name+cadence summaries', () => {
    const summaries = list();
    expect(summaries).toHaveLength(2);
    for (const s of summaries) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.cadence).toBe('string');
    }
  });

  it('get() returns the full contract for a known id, undefined otherwise', () => {
    expect(get('LOOP-CI-AUTOTRIAGE-001')).toBeTruthy();
    expect(get('LOOP-CI-AUTOTRIAGE-001').id).toBe('LOOP-CI-AUTOTRIAGE-001');
    expect(get('LOOP-NOPE-999')).toBeUndefined();
  });

  it('assertContractsValid() does not throw (all declared valid)', () => {
    expect(() => assertContractsValid()).not.toThrow();
    expect(assertContractsValid()).toBe(true);
  });
});

describe('cron-coherence: declared cadence matches the LIVE workflow .yml (anti-drift)', () => {
  const cases = [
    ['LOOP-CI-AUTOTRIAGE-001', '.github/workflows/clockwork-ci-autotriage-loop.yml'],
    ['LOOP-ADAM-OPPORTUNITY-SCAN-001', '.github/workflows/adam-opportunity-scan-cron.yml'],
  ];
  for (const [loopId, yml] of cases) {
    it(`${loopId} declared cadence === cron in ${yml}`, () => {
      const declared = get(loopId).timeline.cadence;
      const live = cronFromWorkflow(yml);
      expect(live, `no cron found in ${yml}`).toBeTruthy();
      expect(declared).toBe(live);
    });
  }
});
