// Shared marker constant between scripts/stale-session-sweep.cjs (writer)
// and scripts/modules/sd-quality-scoring.js (reader/gate), so the two never
// drift out of sync on the literal string that distinguishes a
// plan_content-sourced enrichment from a filename-search-sourced one.
// SD-FDBK-INFRA-QUALITY-GATE-COUPLED-001.
module.exports = {
  PLAN_CONTENT_MARKER: 'plan_content',
};
