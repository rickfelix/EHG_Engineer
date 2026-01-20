/**
 * SD-Next Module Index
 * Re-exports all SD-Next functionality for easy importing
 */

export { colors } from './colors.js';
export { getPhaseAwareStatus, isActionableForLead } from './status-helpers.js';
export { parseDependencies, checkDependenciesResolved, checkDependenciesResolvedSync } from './dependency-utils.js';

export {
  supabase,
  loadActiveBaseline,
  countActionableBaselineItems,
  loadRecentActivity,
  loadConflicts,
  loadMultiRepoStatus,
  getSDRepos,
  loadPendingProposals,
  loadSDHierarchy,
  loadOKRScorecard
} from './data-loaders.js';

export {
  displayActiveSessions,
  displayMultiRepoWarning,
  displayOKRScorecard,
  displayProposals,
  displayTrackSection,
  displaySDItem,
  displaySDItemSimple,
  displayRecommendations,
  displaySessionContext
} from './display.js';
