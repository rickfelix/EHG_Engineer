'use strict';
/**
 * FW-3 fail-closed pick-vs-instrument framing router.
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C (FR-1, FR-4).
 *
 * PURE predicate over the framing_class wire contract established by sibling -B
 * (lib/fleet/worker-status.cjs FRAMING_CLASSES): for a row on the oracle
 * systemic-finding leg (payload.oracle === true),
 *   instrument            -> adam_sourcing
 *   pick                  -> chairman_escalation (CMV/portfolio-altitude)
 *   missing/unrecognized  -> chairman_escalation (FAIL-CLOSED: a framing that
 *                            cannot PROVE it is instrument-class escalates)
 * Non-oracle rows are OUT OF DOMAIN (route: null) — they are plain advisories,
 * not framings. This domain bound is the flood-guard that makes fail-closed
 * safe against legacy rows (TR-2).
 *
 * laneAnalog reuses the sourcing-engine lane vocabulary (lib/sourcing-engine/
 * lane.js) so downstream FW-3 consumers persist consistently — imported, not
 * re-typed (FR-4). require-of-ESM: Node >= 22.12 loads a synchronous ESM module
 * from CJS; lane.js is pure and TLA-free (same pattern as lib/fleet/tier-claimable.cjs).
 */
const { FRAMING_CLASSES } = require('../fleet/worker-status.cjs');
const { LANE } = require('../sourcing-engine/lane.js');

/** Routing destinations. Frozen. */
const FRAMING_ROUTES = Object.freeze({
  ADAM_SOURCING: 'adam_sourcing',
  CHAIRMAN_ESCALATION: 'chairman_escalation',
});

/** Sourcing-engine lane analogs per route (FR-4) — values from lane.js, not literals. */
const LANE_ANALOG = Object.freeze({
  [FRAMING_ROUTES.ADAM_SOURCING]: LANE.BELT_READY,
  [FRAMING_ROUTES.CHAIRMAN_ESCALATION]: LANE.CHAIRMAN_GATED,
});

/**
 * Route a session_coordination row's framing. PURE — no IO.
 * @param {{payload?: {oracle?: boolean, framing_class?: string}}} row
 * @returns {{route: string|null, reason: string, laneAnalog: string|null}}
 */
function routeFraming(row) {
  const payload = (row && row.payload) || {};
  if (payload.oracle !== true) {
    return { route: null, reason: 'not-a-framing', laneAnalog: null };
  }
  const fc = payload.framing_class;
  if (fc === FRAMING_CLASSES.INSTRUMENT) {
    return { route: FRAMING_ROUTES.ADAM_SOURCING, reason: 'instrument', laneAnalog: LANE_ANALOG[FRAMING_ROUTES.ADAM_SOURCING] };
  }
  if (fc === FRAMING_CLASSES.PICK) {
    return { route: FRAMING_ROUTES.CHAIRMAN_ESCALATION, reason: 'pick-class', laneAnalog: LANE_ANALOG[FRAMING_ROUTES.CHAIRMAN_ESCALATION] };
  }
  // FAIL-CLOSED: absent or unrecognized framing_class on the oracle leg escalates.
  return { route: FRAMING_ROUTES.CHAIRMAN_ESCALATION, reason: 'unproven', laneAnalog: LANE_ANALOG[FRAMING_ROUTES.CHAIRMAN_ESCALATION] };
}

module.exports = { routeFraming, FRAMING_ROUTES, LANE_ANALOG };
