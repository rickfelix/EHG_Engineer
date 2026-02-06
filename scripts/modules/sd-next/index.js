/**
 * SD-Next Module Index
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 *
 * This module provides the SD-Next intelligent strategic directive selection system,
 * broken down into focused modules for maintainability.
 *
 * Action Semantics (PAT-AUTO-PROCEED-002):
 * runSDNext() returns { action, sd_id, reason } for programmatic consumers.
 * Actions: 'start' | 'continue' | 'verify' | 'none'
 */

// Main orchestrator class
export { SDNextSelector, runSDNext } from './SDNextSelector.js';

// Colors and display utilities
export { colors, trackColors } from './colors.js';

// Status helpers
export { getPhaseAwareStatus, isActionableForLead } from './status-helpers.js';

// Dependency resolution
export {
  parseDependencies,
  checkDependenciesResolved,
  getUnresolvedDependencies
} from './dependency-resolver.js';

// Data loaders
export {
  loadActiveBaseline,
  loadRecentActivity,
  loadConflicts,
  loadPendingProposals,
  loadSDHierarchy,
  loadOKRScorecard,
  countActionableBaselineItems
} from './data-loaders.js';

// Display modules
export {
  displayOKRScorecard,
  displayProposals,
  displayTrackSection,
  displayMultiRepoWarning,
  displayRecommendations,
  displayActiveSessions,
  displaySessionContext,
  displayParallelOpportunities,
  showFallbackQueue,
  showExhaustedBaselineMessage,
  displayBlockedStateBanner,
  getBlockedStateIndicator,
  isOrchestratorBlocked
} from './display/index.js';

// Blocked state detection (SD-LEO-ENH-AUTO-PROCEED-001-12)
export {
  detectAllBlockedState,
  persistAllBlockedState,
  recordUserDecision
} from './blocked-state-detector.js';
