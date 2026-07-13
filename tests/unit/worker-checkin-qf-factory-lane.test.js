/**
 * SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001 (TS-6/TS-7): isAutoStartableQF() must exclude
 * factory_lane=true quick_fixes from worker self-claim.
 *
 * Live incident: QF-20260712-481 was marked "FACTORY-LANE: routes through the venture machine,
 * coordinator-dispatched" ONLY as free text inside quick_fixes.description -- invisible to this
 * predicate, which self-claimed it anyway. quick_fixes.factory_lane (a new structured column,
 * database/migrations/20260713_quick_fixes_factory_lane.sql) replaces that free-text convention.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isAutoStartableQF } = require('../../scripts/worker-checkin.cjs');

const NOW = Date.parse('2026-07-13T12:00:00Z');

function qf(overrides = {}) {
  return {
    id: 'QF-X',
    status: 'open',
    pr_url: null,
    commit_sha: null,
    created_at: '2026-07-12T00:00:00Z',
    routing_tier: null,
    title: 'x',
    severity: 'medium',
    not_before: null,
    factory_lane: false,
    ...overrides,
  };
}

describe('isAutoStartableQF — factory_lane structured marker', () => {
  it('TS-6: excludes a QF with factory_lane=true even though every other condition is satisfiable', () => {
    expect(isAutoStartableQF(qf({ factory_lane: true }), NOW)).toBe(false);
  });

  it('reproduces the QF-20260712-481 live bug fixed: factory_lane=true, routing_tier=1, benign title', () => {
    const liveShape = qf({
      title: 'V10: venture-2 approval stamped pre-isfixture-merge never got a chairman_decisions row',
      routing_tier: 1,
      factory_lane: true,
    });
    expect(isAutoStartableQF(liveShape, NOW)).toBe(false);
  });

  it('TS-7: includes a QF with factory_lane=false (the default) -- byte-identical to pre-fix behavior', () => {
    expect(isAutoStartableQF(qf({ factory_lane: false }), NOW)).toBe(true);
  });

  it('includes a QF with factory_lane absent (undefined) -- fail-open only in the falsy direction, matches column default', () => {
    const row = qf();
    delete row.factory_lane;
    expect(isAutoStartableQF(row, NOW)).toBe(true);
  });
});
