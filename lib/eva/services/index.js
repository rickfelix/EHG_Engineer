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
