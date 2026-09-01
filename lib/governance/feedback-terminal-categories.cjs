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
//
// SD-LEO-INFRA-HARNESS-BACKLOG-PER-001 (FR-1): 'completion_flag_finding' added,
// mirroring the completion_flag_witness precedent above. capture-completion-flags.js's
// routeFlag() now writes every REAL per-flag finding (harness/quirk/friction/
// tied_to_sd/default) to this category instead of 'harness_backlog', so it too is a
// write-time-terminal category any actionable-view reader must exclude. Purely
// additive -- no existing category removed or renamed.

const TERMINAL_CATEGORIES = Object.freeze(['completion_flag_witness', 'telemetry_aggregate', 'informational_note', 'completion_flag_finding']);

function isTerminalCategory(category) {
  return TERMINAL_CATEGORIES.includes(category);
}

module.exports = { TERMINAL_CATEGORIES, isTerminalCategory };
