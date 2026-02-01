/**
 * UAT Module Index
 *
 * Purpose: Export all UAT-related functions for /uat command
 * SD: SD-UAT-QA-001
 * SD: SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001 (route-aware enhancements)
 *
 * Usage:
 *   import { generateScenarios, startSession, routeDefect } from './lib/uat/index.js';
 *   // Route-aware imports:
 *   import { enhanceScenarios, processFailureWithPatterns } from './lib/uat/index.js';
 */

// Scenario Generator
export {
  generateScenarios,
  checkUATReadiness,
  default as scenarioGenerator
} from './scenario-generator.js';

// Result Recorder
export {
  startSession,
  recordResult,
  completeSession,
  getSessionStatus,
  getLatestSession,
  captureVisualDefect,
  verifySelector,
  shouldCaptureDom,
  default as resultRecorder
} from './result-recorder.js';

// DOM Capture (SD-LEO-ENH-UAT-DOM-CAPTURE-001)
export {
  captureVisualDefect as domCapture,
  verifySelector as verifySelectorCapture,
  shouldCaptureDom as shouldOfferDomCapture
} from './dom-capture.js';

// Screenshot Annotator (SD-LEO-ENH-UAT-DOM-CAPTURE-001)
export {
  addBoundingBoxOverlay,
  createComparisonView
} from './screenshot-annotator.js';

// Selector Drift Recovery (SD-LEO-ENH-UAT-DOM-CAPTURE-001)
export {
  recoverFromDrift,
  calculateDriftScore,
  logDriftRecovery
} from './selector-drift-recovery.js';

// Risk Router
export {
  assessRisk,
  routeDefect,
  getRoutingOptions,
  checkFileRisk,
  default as riskRouter
} from './risk-router.js';

// SD Type Validation (re-export for convenience)
export { getUATRequirement } from '../utils/sd-type-validation.js';

// Intelligent Feedback System (SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001)
export {
  FeedbackAnalyzer,
  feedbackAnalyzer,
  FEEDBACK_MODES,
  MODE_KEYWORDS
} from './feedback-analyzer.js';

export {
  ConsensusEngine,
  consensusEngine,
  THRESHOLDS as CONSENSUS_THRESHOLDS,
  DIMENSION_WEIGHTS
} from './consensus-engine.js';

export {
  FollowUpGenerator,
  followUpGenerator
} from './follow-up-generator.js';

export {
  ActionRouter,
  actionRouter,
  ACTIONS,
  ROUTING_CONFIG
} from './action-router.js';

// Route Context Resolver (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
export {
  fetchRoutes,
  fetchNavPreferences,
  applyPreferencesFilter,
  getRouteContext,
  annotateWithRouteContext,
  getRouteDevelopmentSummary,
  prioritizeByRouteMaturity,
  MATURITY_PRIORITY,
  default as routeContextResolver
} from './route-context-resolver.js';

// Issue Pattern Matcher (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
export {
  searchPatterns,
  matchFailure,
  classifySeverity,
  getRCATriggerRecommendation,
  recordPatternOccurrence,
  getPatternStatistics,
  SEVERITY_CONFIG,
  FAILURE_TYPE_SEVERITY,
  default as issuePatternMatcher
} from './issue-pattern-matcher.js';

// Route-Aware Reporter (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
export {
  generateRouteAwareHeader,
  processFailureWithPatterns,
  generateRouteAwareSummary,
  enhanceScenarios,
  getTestingRecommendations,
  default as routeAwareReporter
} from './route-aware-reporter.js';

/**
 * Intelligent Feedback Processing Pipeline
 *
 * High-level orchestrator for the full feedback analysis flow:
 * 1. Parse batch feedback into issues
 * 2. Triangulate with GPT + Gemini
 * 3. Generate follow-up questions for low-confidence items
 * 4. Route to actions (quick-fix, SD, backlog)
 *
 * @param {string} rawFeedback - Raw batch feedback text
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processed feedback results
 */
export async function processIntelligentFeedback(rawFeedback, options = {}) {
  const { sdId } = options;

  // Step 1: Parse batch feedback into issues
  const issues = await feedbackAnalyzer.parseBatchFeedback(rawFeedback, { sdId });

  // Step 2: Triangulate with both models
  const triangulatedIssues = await feedbackAnalyzer.triangulateIssues(issues);

  // Step 3: Evaluate consensus and determine follow-ups needed
  const evaluatedIssues = consensusEngine.evaluateBatch(triangulatedIssues);

  // Step 4: Generate follow-up questions for low-confidence items
  const followUps = followUpGenerator.generateBatch(evaluatedIssues);

  // Step 5: Route all issues (high-confidence ones can be auto-routed)
  const routingDecisions = actionRouter.routeBatch(evaluatedIssues);

  return {
    totalIssues: issues.length,
    issues: evaluatedIssues,
    followUpsNeeded: followUps,
    routingDecisions,
    summary: {
      highConfidence: evaluatedIssues.filter(i => i.consensus?.confidenceLevel === 'high').length,
      needsFollowUp: followUps.length,
      quickFixes: routingDecisions.filter(d => d.action === 'quick-fix').length,
      newSDs: routingDecisions.filter(d => d.action === 'create-sd').length,
      backlog: routingDecisions.filter(d => d.action === 'backlog').length
    }
  };
}
