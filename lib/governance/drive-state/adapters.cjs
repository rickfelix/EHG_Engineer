/**
 * THE ADAPTER REGISTRY — SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-1.
 *
 * The one place the six axes are bound to the six implementations. Kept separate from index.cjs so
 * the composer stays free of require() edges and can be unit-tested against fakes.
 *
 * THIS FILE IS DELIBERATELY MECHANICAL. It contains no defaults, no fallbacks and no conditional
 * registration, because every one of those would be a way for an axis to go missing while the
 * verdict still rendered. computeDriveState iterates the FROZEN axis list and throws on a gap, so
 * the only thing this file must do is not lie about what it registers.
 *
 * The assertion at the bottom runs at require() time. A missing or misnamed axis fails the import
 * rather than the report — the difference between a build error and a five-axis verdict that looks
 * complete.
 */

'use strict';

const { AXES } = require('./contract.cjs');

const chairmanDecisions = require('./axes/chairman-decisions.cjs');
const coordinatorPerformance = require('./axes/coordinator-performance.cjs');
const roadmapMotion = require('./axes/roadmap-motion.cjs');
const ventureStageMotion = require('./axes/venture-stage-motion.cjs');
const fleetHealth = require('./axes/fleet-health.cjs');
const learningConversion = require('./axes/learning-conversion.cjs');

/** Keyed by the axis's OWN exported AXIS constant, never by a string retyped here — a typo would
 *  otherwise register an adapter under a name no axis claims, and the composer would throw about a
 *  missing axis while the real cause sat one line above. */
const ADAPTERS = Object.freeze({
  [chairmanDecisions.AXIS]: chairmanDecisions,
  [coordinatorPerformance.AXIS]: coordinatorPerformance,
  [roadmapMotion.AXIS]: roadmapMotion,
  [ventureStageMotion.AXIS]: ventureStageMotion,
  [fleetHealth.AXIS]: fleetHealth,
  [learningConversion.AXIS]: learningConversion
});

// LOAD-TIME COMPLETENESS CHECK, both directions.
const registered = Object.keys(ADAPTERS);
const missing = AXES.filter((a) => !registered.includes(a));
const extra = registered.filter((a) => !AXES.includes(a));
if (missing.length || extra.length) {
  throw new Error(
    'drive-state adapters: registry does not match the frozen axis list' +
    (missing.length ? ` — MISSING: ${missing.join(', ')}` : '') +
    (extra.length ? ` — UNKNOWN: ${extra.join(', ')}` : '')
  );
}

module.exports = { ADAPTERS };
