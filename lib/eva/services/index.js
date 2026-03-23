/**
 * Eva Services - CLI-compatible ports of frontend venture services
 *
 * SD-LEO-FEAT-SERVICE-PORTS-001
 * Barrel export for all ported services.
 *
 * @module lib/eva/services
 */

export {
  verifyBackendConnection,
  createResearchSession,
  getResearchSession,
  listResearchSessions,
  pollResearchSession,
  runResearch,
  getLatestResearchSession,
  createMockResearchSession,
} from './venture-research.js';

export { CompetitiveIntelligenceService } from './competitive-intelligence.js';

export {
  getBrandGenomesByVenture,
  getBrandGenomeList,
  getBrandGenome,
  getActiveBrandGenomes,
  getLatestBrandGenome,
  createBrandGenome,
  updateBrandGenome,
  updateBrandData,
  submitBrandGenome,
  approveBrandGenome,
  archiveBrandGenome,
  deleteBrandGenome,
  getBrandGenomesByStatus,
  getBrandCompletenessStats,
  getCompletenessScore,
  meetsCompletenessThreshold,
  getRequiredFieldsMissing,
} from './brand-genome.js';

// Shared-services-based services (createService factory pattern)
export { marketSizingService } from './market-sizing.js';
export { painPointAnalyzerService } from './pain-point-analyzer.js';
export { strategicFitEvaluatorService } from './strategic-fit-evaluator.js';
export { riskAssessmentService } from './risk-assessment.js';
export { financialModelingService } from './financial-modeling.js';
export { dependencyResolutionService } from './dependency-resolution.js';

// SRIP services (SD-LEO-INFRA-SRIP-CORE-PIPELINE-001)
export {
  createSiteDna,
  getSiteDna,
  listSiteDna,
  updateSiteDna,
  getLatestCompletedDna,
} from './srip-site-dna.js';

export {
  createBrandInterview,
  getBrandInterview,
  listBrandInterviews,
  updateBrandInterview,
  getLatestCompletedInterview,
} from './srip-brand-interview.js';

export {
  createSynthesisPrompt,
  getSynthesisPrompt,
  listSynthesisPrompts,
  updateSynthesisPrompt,
  getActiveSynthesisPrompt,
  activatePrompt,
} from './srip-synthesis.js';

// SRIP business logic
export {
  generateInterviewDefaults,
  getInterviewQuestions,
  INTERVIEW_QUESTIONS,
} from './srip-interview-engine.js';

export { buildSynthesisPrompt } from './srip-prompt-builder.js';

// SRIP Artifact Synthesizer (SD-MAN-INFRA-SRIP-AUTO-SYNTHESIZER-001)
export { synthesizeFromArtifacts } from './srip-artifact-synthesizer.js';

// SRIP Quality Check services (SD-LEO-INFRA-SRIP-QUALITY-SCORING-001)
export {
  createQualityCheck,
  getQualityCheck,
  listQualityChecks,
  getLatestQualityCheck,
  checkPassed,
  gatePromptActivation,
  QUALITY_DOMAINS,
} from './srip-quality-check.js';

// Operations Revenue Monitoring (SD-LEO-INFRA-OPERATIONS-REVENUE-MONITORING-001)
export {
  computeRevenueMetrics,
  storeRevenueSnapshot,
  collectRevenueMetrics,
  getLatestRevenueMetrics,
  listRevenueMetrics,
} from './ops-revenue-collector.js';

export {
  computeSeverity,
  checkMetricDeviation,
  checkAllDeviations,
  listRevenueAlerts,
  updateAlertStatus,
} from './ops-revenue-alerts.js';

// Operations Customer Health (SD-LEO-INFRA-OPERATIONS-CUSTOMER-HEALTH-001)
export {
  createHealthScore,
  getLatestHealthScore,
  listHealthScores,
  getHealthScoreHistory,
  detectAtRiskCustomers,
  createBehavioralFeedEntry,
  listBehavioralFeed,
  HEALTH_DIMENSIONS,
  DEFAULT_AT_RISK_THRESHOLD,
} from './ops-customer-health.js';

// Operations Cost Governance (SD-LEO-INFRA-OPERATIONS-COST-GOVERNANCE-001)
export {
  upsertBudget,
  getBudget,
  recordCostEvent,
  getCurrentSpend,
  checkThreshold,
  checkAllThresholds,
  recordOverride,
  calculateMargin,
  COST_CATEGORIES,
  THRESHOLDS,
} from './ops-cost-governance.js';
