'use strict';
// SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-1)
//
// Write-time-terminal feedback categories: rows in any of these are closure
// witnesses, aggregates, or informational notes -- never actionable work. Every
// reader that excludes category='harness_backlog' to build an "actionable" or
// "untriaged" view must also exclude these, or fresh terminal-category rows
// re-form the exact sink-noise problem FR-2 exists to fix (found by VALIDATION at
// PLAN_VERIFICATION: scripts/fleet-dashboard.cjs's printFeedback and
// lib/quality/assist-engine.js's splitEnhancementsExcludingHarnessBacklog both used
// a harness_backlog-only exclusion and would have let completion_flag_witness rows
// leak back into the coordinator board and /leo assist Phase 2).

const TERMINAL_CATEGORIES = Object.freeze(['completion_flag_witness', 'telemetry_aggregate', 'informational_note']);

function isTerminalCategory(category) {
  return TERMINAL_CATEGORIES.includes(category);
}

module.exports = { TERMINAL_CATEGORIES, isTerminalCategory };
