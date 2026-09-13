'use strict';
/**
 * QF-20260912-514 (FIX SHAPE c): tallies the trailing-window SENDER framing behavior --
 * stamped instrument / stamped pick / unclassified -- so the router's retirement rule
 * (fw3-framing-router.cjs docblock, ratification a236d122) has a number to read.
 *
 * PURE, classifying each row via routeFraming() -- independent of what (if anything) the
 * drain persisted downstream. Instrument-classified rows are never durably written by the
 * drain (tests/unit/adam-advisory-framing-class.test.js TS-2: "zero flag writes"), so
 * re-deriving the classification directly from the row's own payload is the only way to
 * measure what senders actually declared, not just what the router routed.
 */
const { routeFraming } = require('./fw3-framing-router.cjs');

/** @param {Array<{payload?: {oracle?: boolean, framing_class?: string}}>} rows */
function tallyFramingYield(rows) {
  const counts = { instrument: 0, pick: 0, unclassified: 0 };
  for (const row of (rows || [])) {
    const routed = routeFraming(row);
    if (routed.reason === 'instrument') counts.instrument += 1;
    else if (routed.reason === 'pick-class') counts.pick += 1;
    else if (routed.reason === 'unproven') counts.unclassified += 1;
    // 'not-a-framing' (non-oracle rows) are out of domain -- not tallied.
  }
  return counts;
}

function formatFramingYieldLine(counts, { days = 7 } = {}) {
  return `[framing-router-yield] trailing ${days}d: stamped instrument ${counts.instrument} / stamped pick ${counts.pick} / unclassified ${counts.unclassified}`;
}

module.exports = { tallyFramingYield, formatFramingYieldLine };
