/**
 * Feature Flags Module
 * SD-LEO-SELF-IMPROVE-001D - Phase 1.5: Feature Flag Foundation
 *
 * Provides comprehensive feature flag management for the LEO Protocol:
 * - CRUD operations for flags and policies
 * - Runtime evaluation with deterministic rollout
 * - CONST-009 kill switch for emergency rollback
 * - Audit logging for all operations
 *
 * @module lib/feature-flags
 */

// Registry - CRUD operations
export {
  createFlag,
  getFlag,
  listFlags,
  updateFlag,
  deleteFlag,
  setPolicy,
  getPolicy,
  getKillSwitch,
  activateKillSwitch,
  deactivateKillSwitch,
  isFeatureFlagKillSwitchActive
} from './registry.js';

// Evaluator - Runtime flag evaluation
export {
  evaluateFlag,
  evaluateFlags,
  isEnabled,
  isKillSwitchActive,
  getEnabledFlags,
  clearCache
} from './evaluator.js';

// Combined default export
import registry from './registry.js';
import evaluator from './evaluator.js';

export default {
  ...registry,
  ...evaluator
};
