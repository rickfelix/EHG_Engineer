/**
 * Pure formatters for fleet-panel.js (SD-LEO-INFRA-LEO-APP-RENDERED-001-A).
 *
 * Kept dependency-free and framework-free (matches the rest of /fleet-ui): plain functions with
 * no DOM access, so they can be unit-tested directly under Node (tests/unit/server/
 * fleet-panel-format.test.js) AND loaded unmodified in the browser via a plain <script> tag
 * (fleet-panel.html loads this before fleet-panel.js). UMD-lite export: CommonJS when `module`
 * exists (Node/vitest), else attaches to `window.FleetPanelFormat` (browser).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.FleetPanelFormat = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const BADGE_STYLES = {
    'WORKING': 'fp-badge--working',
    'AWAITING INPUT': 'fp-badge--awaiting-input',
    'DEEP WORK': 'fp-badge--deep-work',
    'IDLE': 'fp-badge--idle',
    'MECHANICAL': 'fp-badge--mechanical',
    'PILOT WK1': 'fp-badge--pilot-wk1',
    'OFF': 'fp-badge--off',
  };

  /** CSS class for a session badge string; unknown/missing values fall back to OFF's class. */
  function badgeClassFor(badge) {
    return BADGE_STYLES[badge] || 'fp-badge--off';
  }

  /** 'wk 42% used' or 'wk --% used' when wkPct is null/undefined/not-a-number. */
  function formatChipPct(wkPct) {
    return typeof wkPct === 'number' && Number.isFinite(wkPct) ? `wk ${wkPct}% used` : 'wk --% used';
  }

  /** Em-dash fallback for any nullish/empty table-cell value; never renders 'null'/'undefined'. */
  function fallbackText(value) {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  return { BADGE_STYLES, badgeClassFor, formatChipPct, fallbackText };
});
