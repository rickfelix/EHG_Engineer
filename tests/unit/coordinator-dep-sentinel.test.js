/**
 * SD-LEO-INFRA-FORECASTER-DEP-SENTINEL-BELTDEPTH-001
 * Network-free regression tests for the 'no dependencies' sentinel handling shared by the
 * capacity forecaster (scripts/coordinator-capacity-forecast.mjs) and the backlog ranker
 * (scripts/coordinator-backlog-rank.mjs). Both now resolve dependency keys via the canonical
 * parseSdDependencies (lib/utils/parse-sd-dependencies.cjs) instead of a hand-rolled `depId`
 * that returned the literal 'none' for {sd_key:'none'} / bare-string 'none' and mis-counted it
 * as an UNMET dependency — making a freshly-sourced SD invisible to belt depth and emitting a
 * false DEFICIT-URGENT + spurious Adam reach-out. These tests pin that the sentinel resolves to
 * zero real blockers while genuine SD-key deps are preserved, and that the forecaster's and
 * ranker's belt predicates therefore agree.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseSdDependencies } = require('../../lib/utils/parse-sd-dependencies.cjs');

// Mirror of the forecaster's belt predicate (scripts/coordinator-capacity-forecast.mjs):
//   unmet = parseSdDependencies(d.dependencies).filter(k => depStatus[k] !== 'completed')
//   claimable when unmet.length === 0
function forecasterUnmet(d, depStatus = {}) {
  return parseSdDependencies(d.dependencies).filter((k) => depStatus[k] !== 'completed');
}
// Mirror of the ranker's claimable-leaf predicate (scripts/coordinator-backlog-rank.mjs):
//   unmet = parseSdDependencies(d.dependencies)
//     .filter(k => byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed')
function rankerUnmet(d, byKey = new Map(), depStatus = {}) {
  return parseSdDependencies(d.dependencies).filter((k) =>
    byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed'
  );
}

describe('coordinator dep-sentinel — parseSdDependencies drops the no-dependencies sentinel', () => {
  it('returns zero blockers for the sentinel in every live shape', () => {
    expect(parseSdDependencies([{ sd_key: 'none' }])).toEqual([]);
    expect(parseSdDependencies([{ sd_id: 'none' }])).toEqual([]);
    expect(parseSdDependencies([{ id: 'none' }])).toEqual([]);
    expect(parseSdDependencies(['none'])).toEqual([]);
    expect(parseSdDependencies(['NONE'])).toEqual([]); // not an /^SD-/ key, so resolves to no blocker
    expect(parseSdDependencies([{ dependency: 'none', status: 'available' }])).toEqual([]);
    expect(
      parseSdDependencies([{ type: 'note', dependency: 'No blocking dependencies identified' }])
    ).toEqual([]);
  });

  it('preserves a genuine SD-key dependency (string and object shapes)', () => {
    expect(parseSdDependencies(['SD-LEO-INFRA-REAL-001'])).toEqual(['SD-LEO-INFRA-REAL-001']);
    expect(parseSdDependencies([{ sd_key: 'SD-LEO-INFRA-REAL-001' }])).toEqual([
      'SD-LEO-INFRA-REAL-001',
    ]);
    expect(parseSdDependencies([{ sd_id: 'SD-LEO-INFRA-REAL-001' }])).toEqual([
      'SD-LEO-INFRA-REAL-001',
    ]);
  });

  it('a mixed array resolves to exactly the real SD-keys, dropping the sentinel', () => {
    expect(parseSdDependencies([{ sd_key: 'none' }, { sd_id: 'SD-REAL-001' }])).toEqual([
      'SD-REAL-001',
    ]);
  });
});

describe('coordinator dep-sentinel — forecaster + ranker agree the sentinel is claimable belt', () => {
  it('forecaster: a none-sentinel SD has zero unmet deps (counted in belt)', () => {
    const d = { sd_key: 'SD-FRESH-001', dependencies: [{ sd_key: 'none' }] };
    expect(forecasterUnmet(d)).toEqual([]);
  });

  it('ranker: the same none-sentinel SD is a claimable leaf (deps met)', () => {
    const d = { sd_key: 'SD-FRESH-001', dependencies: [{ sd_key: 'none' }] };
    expect(rankerUnmet(d)).toEqual([]);
  });

  it('a genuine UNMET SD-key dep is still blocking in both consumers (no false-claimable)', () => {
    const d = { sd_key: 'SD-CHILD-001', dependencies: [{ sd_key: 'SD-PARENT-001' }] };
    const depStatus = { 'SD-PARENT-001': 'draft' };
    const byKey = new Map([['SD-PARENT-001', { sd_key: 'SD-PARENT-001', status: 'draft' }]]);
    expect(forecasterUnmet(d, depStatus)).toEqual(['SD-PARENT-001']);
    expect(rankerUnmet(d, byKey, depStatus)).toEqual(['SD-PARENT-001']);
  });

  it('a completed SD-key dep is met in both consumers', () => {
    const d = { sd_key: 'SD-CHILD-001', dependencies: [{ sd_key: 'SD-PARENT-001' }] };
    const depStatus = { 'SD-PARENT-001': 'completed' };
    const byKey = new Map([['SD-PARENT-001', { sd_key: 'SD-PARENT-001', status: 'completed' }]]);
    expect(forecasterUnmet(d, depStatus)).toEqual([]);
    expect(rankerUnmet(d, byKey, depStatus)).toEqual([]);
  });
});
