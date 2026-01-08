/**
 * Capability Ledger Module
 * SD: SD-CAP-LEDGER-001
 *
 * Unified exports for the Automated Capability Ledger with Plane 1 integration.
 */

// Taxonomy definitions
export {
  CAPABILITY_CATEGORIES,
  CAPABILITY_TYPES,
  getCapabilityTypeCodes,
  getCapabilityType,
  getTypesByCategory,
  calculatePlane1Score,
  isValidCapabilityType,
  getMaturityDescription,
  getExtractionDescription,
  CAPABILITY_TYPE_ENUM,
} from './capability-taxonomy.js';

// Plane 1 scoring
export {
  PLANE1_CONFIG,
  calculateVenturePlane1Score,
  calculateSDPlane1Score,
  calculateVentureAggregatedPlane1,
  calculatePlane1FromLedger,
  formatPlane1Score,
} from './plane1-scoring.js';

// Reuse tracking
export {
  REUSE_CONFIG,
  calculateEcosystemLift,
  calculateCompoundingFactor,
  generateReuseReport,
  recordReuseEvent,
  getReusesuggestions,
  formatReuseReport,
} from './capability-reuse-tracker.js';
