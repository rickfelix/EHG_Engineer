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
import { validateLoopContract, BOUNDARY_KIND, GOAL_TYPE } from '../../../lib/loops/loop-contract.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Extract ALL active (non-commented) `cron: '...'` schedules from a workflow yml. */
function activeCronsFromWorkflow(relPath) {
  const text = readFileSync(resolve(repoRoot, relPath), 'utf8');
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line)) // drop full-line comments so a commented cron can't match
    .map((line) => {
      const m = line.match(/cron:\s*['"]([^'"]+)['"]/);
      return m ? m[1] : null;
    })
    .filter(Boolean);
}

describe('registry shape + invariants', () => {
  it('LOOP_CONTRACTS is frozen', () => {
    expect(Object.isFrozen(LOOP_CONTRACTS)).toBe(true);
  });

  it('declares the registered contracts and every entry validates', () => {
    // SD-LEO-INFRA-UNIT-TEST-DEBT-TRIAGE-001: a 3rd contract (LOOP-PROD-ERROR-SWEEP-001) was added.
    expect(LOOP_CONTRACTS).toHaveLength(3);
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
    expect(summaries).toHaveLength(3); // SD-LEO-INFRA-UNIT-TEST-DEBT-TRIAGE-001: 3rd contract added
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

// SD-LEO-INFRA-LOOP-CONTRACT-GOAL-TYPE-BUDGET-001 (FR-3): exemplars migrated to typed goals.
describe('exemplar goals are typed (FR-3)', () => {
  it('every exemplar goal is a typed object with a valid GOAL_TYPE (no bare strings remain)', () => {
    const validTypes = new Set(Object.values(GOAL_TYPE));
    // SD-LEO-INFRA-UNIT-TEST-DEBT-TRIAGE-001: LOOP-PROD-ERROR-SWEEP-001 DELIBERATELY keeps bare-string
    // goals for now — the typed-goal migration is deferred until the loop runner accepts goal_type
    // (see the in-source comment on PROD_ERROR_SWEEP_CONTRACT). Exempt it until that SD lands.
    const TYPED_GOAL_DEFERRED = new Set(['LOOP-PROD-ERROR-SWEEP-001']);
    for (const c of LOOP_CONTRACTS) {
      if (TYPED_GOAL_DEFERRED.has(c.id)) continue;
      for (const g of c.goals) {
        expect(typeof g, `${c.id} goal should be an object`).toBe('object');
        expect(validTypes.has(g.type), `${c.id} goal type ${g.type}`).toBe(true);
      }
    }
  });

  it('CI-AUTOTRIAGE goals are all verifiable and carry a metric', () => {
    for (const g of get('LOOP-CI-AUTOTRIAGE-001').goals) {
      expect(g.type).toBe(GOAL_TYPE.VERIFIABLE);
      expect(typeof g.metric).toBe('string');
      expect(g.metric.length).toBeGreaterThan(0);
    }
  });

  it('the ADAM rationale-bar goal is llm_as_judge and names its rubric_ref', () => {
    const judged = get('LOOP-ADAM-OPPORTUNITY-SCAN-001').goals.filter((g) => g.type === GOAL_TYPE.LLM_AS_JUDGE);
    expect(judged).toHaveLength(1);
    expect(judged[0].rubric_ref).toBe('lib/adam/rationale-bar.js');
  });

  it('every declared budget (when present) passes validation', () => {
    for (const c of LOOP_CONTRACTS) {
      if (c.budget !== undefined) expect(validateLoopContract(c).valid).toBe(true);
    }
  });
});

describe('cron-coherence: declared cadence matches the LIVE workflow .yml (anti-drift)', () => {
  const cases = [
    ['LOOP-CI-AUTOTRIAGE-001', '.github/workflows/clockwork-ci-autotriage-loop.yml'],
    ['LOOP-ADAM-OPPORTUNITY-SCAN-001', '.github/workflows/adam-opportunity-scan-cron.yml'],
  ];
  for (const [loopId, yml] of cases) {
    it(`${loopId} declared cadence is among the active crons in ${yml}`, () => {
      const declared = get(loopId).timeline.cadence;
      const liveCrons = activeCronsFromWorkflow(yml);
      expect(liveCrons.length, `no active cron found in ${yml}`).toBeGreaterThan(0);
      expect(liveCrons).toContain(declared);
    });
  }
});
