/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C (FR-1/FR-4) — fail-closed pick-vs-instrument
 * routing matrix + lane-analog mapping. The predicate is PURE (no IO); this pins the
 * complete matrix so no future edit can open an auto-sourcing path for unproven framings.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { routeFraming, FRAMING_ROUTES, LANE_ANALOG } = require('../../../lib/governance/fw3-framing-router.cjs');
const { FRAMING_CLASSES } = require('../../../lib/fleet/worker-status.cjs');
const { LANE } = require('../../../lib/sourcing-engine/lane.js');

describe('fw3-framing-router: fail-closed matrix', () => {
  it('instrument -> adam_sourcing with belt-ready analog', () => {
    const r = routeFraming({ payload: { oracle: true, framing_class: FRAMING_CLASSES.INSTRUMENT } });
    expect(r.route).toBe(FRAMING_ROUTES.ADAM_SOURCING);
    expect(r.reason).toBe('instrument');
    expect(r.laneAnalog).toBe(LANE.BELT_READY);
  });

  it('pick -> chairman_escalation with chairman-gated analog', () => {
    const r = routeFraming({ payload: { oracle: true, framing_class: FRAMING_CLASSES.PICK } });
    expect(r.route).toBe(FRAMING_ROUTES.CHAIRMAN_ESCALATION);
    expect(r.reason).toBe('pick-class');
    expect(r.laneAnalog).toBe(LANE.CHAIRMAN_GATED);
  });

  it('FAIL-CLOSED: oracle row with missing framing_class escalates as unproven', () => {
    const r = routeFraming({ payload: { oracle: true } });
    expect(r.route).toBe(FRAMING_ROUTES.CHAIRMAN_ESCALATION);
    expect(r.reason).toBe('unproven');
  });

  it('FAIL-CLOSED: unrecognized framing_class never reaches adam_sourcing', () => {
    for (const bogus of ['garbage', '', 'INSTRUMENT', 'Pick', 0, null, {}]) {
      const r = routeFraming({ payload: { oracle: true, framing_class: bogus } });
      expect(r.route, `framing_class=${JSON.stringify(bogus)}`).toBe(FRAMING_ROUTES.CHAIRMAN_ESCALATION);
    }
  });

  it('non-oracle rows are OUT OF DOMAIN (route null) regardless of framing_class', () => {
    expect(routeFraming({ payload: { framing_class: 'pick' } }).route).toBeNull();
    expect(routeFraming({ payload: { oracle: false, framing_class: 'instrument' } }).route).toBeNull();
    expect(routeFraming({ payload: {} }).route).toBeNull();
    expect(routeFraming({}).route).toBeNull();
    expect(routeFraming(null).route).toBeNull();
  });

  it('laneAnalog values come from lane.js constants (FR-4), not re-typed literals', () => {
    expect(LANE_ANALOG[FRAMING_ROUTES.CHAIRMAN_ESCALATION]).toBe(LANE.CHAIRMAN_GATED);
    expect(LANE_ANALOG[FRAMING_ROUTES.ADAM_SOURCING]).toBe(LANE.BELT_READY);
  });
});
