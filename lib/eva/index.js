/**
 * Eva Module - CLI Venture Lifecycle Infrastructure
 *
 * Central entry point for all Eva-related functionality.
 * Part of SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001
 */

export { VentureContextManager, createVentureContextManager } from './venture-context-manager.js';
export { ChairmanPreferenceStore, createChairmanPreferenceStore } from './chairman-preference-store.js';
export { processStage, run } from './eva-orchestrator.js';
export { getDevilsAdvocateReview, isDevilsAdvocateGate, buildArtifactRecord } from './devils-advocate.js';
export { convertSprintToSDs, buildBridgeArtifactRecord } from './lifecycle-sd-bridge.js';
export { detectConstraintDrift, buildFilterEnginePayload } from './constraint-drift-detector.js';

// CLI-compatible ports of frontend venture services (SD-LEO-FEAT-SERVICE-PORTS-001)
export {
  verifyBackendConnection,
  createResearchSession,
  getResearchSession,
  listResearchSessions,
  pollResearchSession,
  runResearch,
  getLatestResearchSession,
  createMockResearchSession,
  CompetitiveIntelligenceService,
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
} from './services/index.js';
